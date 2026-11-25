export interface TrendingSteamGameItem {
  appId: number;
  title: string;
  year: number;
  releasedAt: number;
  rating: number;
  posterUrl: string;
  backdropUrl: string;
  overview: string;
  isFree?: boolean;
}

interface SteamSearchJson {
  items?: Array<{
    name?: string;
    logo?: string;
  }>;
}

interface SteamTopReleasesJson {
  response?: {
    pages?: Array<{
      name?: string;
      item_ids?: Array<{ appid?: number }>;
    }>;
  };
}

interface SteamBrowseItemsJson {
  response?: {
    store_items?: Array<{
      appid?: number;
      type?: number;
      name?: string;
      is_free?: boolean;
      basic_info?: {
        short_description?: string;
      };
      release?: {
        steam_release_date?: number;
        is_coming_soon?: boolean;
      };
      assets?: {
        asset_url_format?: string;
        library_capsule?: string;
        library_capsule_2x?: string;
        header?: string;
      };
      reviews?: {
        summary_filtered?: {
          percent_positive?: number;
          review_count?: number;
        };
      };
    }>;
  };
}

const UA_HEADER = 'CueMediaTracker/1.0 (+https://cue-three-theta.vercel.app)';

function buildSteamAssetUrl(format: string | undefined, filename: string | undefined): string {
  if (!format || !filename) return '';
  return `https://shared.fastly.steamstatic.com/store_item_assets/${format.replace('${FILENAME}', filename)}`;
}

async function collectCandidateAppIds(): Promise<number[]> {
  const orderedIds: number[] = [];
  const seen = new Set<number>();
  const pushId = (id: number) => {
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) return;
    seen.add(id);
    orderedIds.push(id);
  };

  const [popNewRes, topRes, releasesRes] = await Promise.allSettled([
    fetch(
      'https://store.steampowered.com/search/results/?query&start=0&count=50&category1=998&filter=popularnew&json=1',
      { headers: { 'User-Agent': UA_HEADER }, signal: AbortSignal.timeout(5000) }
    ),
    fetch(
      'https://store.steampowered.com/search/results/?query&start=0&count=50&category1=998&filter=topsellers&json=1',
      { headers: { 'User-Agent': UA_HEADER }, signal: AbortSignal.timeout(5000) }
    ),
    fetch('https://api.steampowered.com/ISteamChartsService/GetTopReleasesPages/v1/', {
      headers: { 'User-Agent': UA_HEADER },
      signal: AbortSignal.timeout(5000),
    }),
  ]);

  const extractFromSearch = async (resPromise: PromiseSettledResult<Response>) => {
    if (resPromise.status !== 'fulfilled' || !resPromise.value.ok) return;
    try {
      const json = (await resPromise.value.json()) as SteamSearchJson;
      for (const entry of json.items || []) {
        const m = (entry.logo || '').match(/\/apps\/(\d+)\//);
        if (m) pushId(Number(m[1]));
      }
    } catch {
      // ignore parse errors
    }
  };

  // Prioritize popular new releases first, then top sellers
  await extractFromSearch(popNewRes);
  await extractFromSearch(topRes);

  if (releasesRes.status === 'fulfilled' && releasesRes.value.ok) {
    try {
      const json = (await releasesRes.value.json()) as SteamTopReleasesJson;
      for (const page of (json.response?.pages || []).slice(0, 3)) {
        for (const item of page.item_ids || []) {
          if (item.appid) pushId(Number(item.appid));
        }
      }
    } catch {
      // ignore
    }
  }

  return orderedIds.slice(0, 90);
}

async function fetchStoreItemsChunk(appIds: number[]) {
  if (appIds.length === 0) return [];
  const inputJson = JSON.stringify({
    ids: appIds.map((appid) => ({ appid })),
    context: { language: 'english', country_code: 'US' },
    data_request: {
      include_assets: true,
      include_release: true,
      include_basic_info: true,
      include_reviews: true,
    },
  });
  const res = await fetch(
    `https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(inputJson)}`,
    { headers: { 'User-Agent': UA_HEADER }, signal: AbortSignal.timeout(6000) }
  );
  if (!res.ok) return [];
  const data = (await res.json()) as SteamBrowseItemsJson;
  return data.response?.store_items || [];
}

/** Fetches live trending Steam games released within the last 6 months (with vertical 2:3 artwork). */
export async function fetchTrendingGamesPayload(limit = 24): Promise<{ items: TrendingSteamGameItem[] }> {
  const cappedLimit = Math.max(6, Math.min(30, limit));
  const candidateIds = await collectCandidateAppIds();
  if (candidateIds.length === 0) return { items: [] };

  const chunks: number[][] = [];
  for (let i = 0; i < candidateIds.length; i += 45) {
    chunks.push(candidateIds.slice(i, i + 45));
  }
  const chunkResults = await Promise.all(chunks.map(fetchStoreItemsChunk));
  const allItems = chunkResults.flat();

  const orderIndex = new Map<number, number>();
  candidateIds.forEach((id, idx) => orderIndex.set(id, idx));

  const nowSec = Math.floor(Date.now() / 1000);
  const sixMonthsSec = 190 * 86400;
  const nineMonthsSec = 275 * 86400;

  const normalizeItems = (maxAgeSec: number): TrendingSteamGameItem[] => {
    const out: TrendingSteamGameItem[] = [];
    const seen = new Set<number>();
    for (const item of allItems) {
      const appId = item.appid;
      if (!appId || seen.has(appId) || !item.name) continue;
      if (item.type !== undefined && item.type !== 0) continue;
      const relSec = item.release?.steam_release_date || 0;
      if (item.release?.is_coming_soon) continue;
      if (relSec <= 0 || relSec > nowSec + 86400) continue;
      if (relSec < nowSec - maxAgeSec) continue;

      const relCapsule = item.assets?.library_capsule_2x || item.assets?.library_capsule;
      const posterUrl = buildSteamAssetUrl(item.assets?.asset_url_format, relCapsule);
      if (!posterUrl) continue;

      const backdropUrl =
        buildSteamAssetUrl(item.assets?.asset_url_format, item.assets?.header) ||
        `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;

      const pctPos = item.reviews?.summary_filtered?.percent_positive;
      const rating =
        typeof pctPos === 'number' && pctPos > 0
          ? Number(Math.max(3.0, Math.min(5.0, pctPos / 20)).toFixed(1))
          : 4.5;

      seen.add(appId);
      out.push({
        appId,
        title: item.name.trim(),
        year: new Date(relSec * 1000).getUTCFullYear(),
        releasedAt: relSec,
        rating,
        posterUrl,
        backdropUrl,
        overview:
          (item.basic_info?.short_description || '').trim() ||
          `${item.name.trim()} — trending on Steam.`,
        isFree: item.is_free,
      });
    }

    return out.sort((a, b) => {
      const ia = orderIndex.get(a.appId) ?? 9999;
      const ib = orderIndex.get(b.appId) ?? 9999;
      return ia - ib;
    });
  };

  let filtered = normalizeItems(sixMonthsSec);
  if (filtered.length < cappedLimit) {
    const expanded = normalizeItems(nineMonthsSec);
    const have = new Set(filtered.map((x) => x.appId));
    for (const item of expanded) {
      if (!have.has(item.appId)) filtered.push(item);
      if (filtered.length >= cappedLimit) break;
    }
  }

  return { items: filtered.slice(0, cappedLimit) };
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get('limit') || '24');
    const limit = Number.isFinite(limitParam) ? limitParam : 24;
    const payload = await fetchTrendingGamesPayload(limit);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, s-maxage=14400, stale-while-revalidate=86400',
      },
    });
  } catch {
    return new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    });
  }
}
