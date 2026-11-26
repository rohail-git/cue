export interface IgdbGameItem {
  id: string;
  igdbId: number;
  title: string;
  year: number;
  rating: number;
  posterUrl: string;
  backdropUrl: string;
  overview: string;
  developer: string;
  platforms: string[];
  genres: string[];
  franchise?: string;
  subtitle: string;
  popularityScore: number;
}

export interface IgdbProxyResponse {
  status: number;
  body: Record<string, unknown>;
  cacheControl: string;
}

interface RawIgdbGame {
  id: number;
  name?: string;
  summary?: string;
  first_release_date?: number;
  total_rating?: number;
  total_rating_count?: number;
  rating?: number;
  hypes?: number;
  follows?: number;
  cover?: { image_id?: string };
  artworks?: Array<{ image_id?: string }>;
  screenshots?: Array<{ image_id?: string }>;
  platforms?: Array<{ name?: string; abbreviation?: string }>;
  genres?: Array<{ name?: string }>;
  themes?: Array<{ name?: string }>;
  involved_companies?: Array<{ developer?: boolean; company?: { name?: string } }>;
  franchises?: Array<{ name?: string }>;
}

const IGDB_FIELDS =
  'fields name,summary,first_release_date,total_rating,total_rating_count,rating,hypes,follows,cover.image_id,artworks.image_id,screenshots.image_id,platforms.name,platforms.abbreviation,genres.name,themes.name,involved_companies.developer,involved_companies.company.name,franchises.name; where cover != null & version_parent = null';

let cachedToken: {
  accessToken: string;
  expiresAt: number;
  clientId: string;
} | null = null;

export function resolveIgdbCredentials(env?: Record<string, string | undefined>): {
  clientId: string;
  clientSecret: string;
} {
  const clientId = (
    env?.TWITCH_CLIENT_ID ||
    env?.IGDB_CLIENT_ID ||
    process.env.TWITCH_CLIENT_ID ||
    process.env.IGDB_CLIENT_ID ||
    ''
  ).trim();
  const clientSecret = (
    env?.TWITCH_CLIENT_SECRET ||
    env?.IGDB_CLIENT_SECRET ||
    process.env.TWITCH_CLIENT_SECRET ||
    process.env.IGDB_CLIENT_SECRET ||
    ''
  ).trim();
  return { clientId, clientSecret };
}

export async function getTwitchAppToken(
  clientId: string,
  clientSecret: string
): Promise<string | null> {
  if (!clientId || !clientSecret) return null;
  if (
    cachedToken &&
    cachedToken.clientId === clientId &&
    cachedToken.expiresAt > Date.now() + 5 * 60 * 1000
  ) {
    return cachedToken.accessToken;
  }

  try {
    const tokenUrl = `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(
      clientId
    )}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`;
    const res = await fetch(tokenUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return null;
    const ttlMs = Math.max(60, (json.expires_in || 3600) - 300) * 1000;
    cachedToken = {
      accessToken: json.access_token,
      expiresAt: Date.now() + ttlMs,
      clientId,
    };
    return json.access_token;
  } catch {
    return null;
  }
}

function normalizeIgdbPlatforms(raw?: Array<{ name?: string; abbreviation?: string }>): string[] {
  const out: string[] = [];
  const push = (label: string) => {
    if (label && !out.includes(label)) out.push(label);
  };
  for (const p of raw || []) {
    const hay = `${p.abbreviation || ''} ${p.name || ''}`.toLowerCase();
    if (hay.includes('playstation 5') || hay.includes('ps5')) push('PS5');
    else if (hay.includes('switch')) push('Switch');
    else if (hay.includes('pc') || hay.includes('windows') || hay.includes('linux')) push('PC');
    else if (hay.includes('xbox series') || hay.includes('xbox one') || hay.includes('xbox')) {
      push('Xbox');
    } else if (hay.includes('playstation 4') || hay.includes('ps4')) push('PS4');
    else if (p.abbreviation) push(p.abbreviation);
    else if (p.name) push(p.name);
  }
  return out.length > 0 ? out.slice(0, 5) : ['Console / PC'];
}

function mapIgdbGame(g: RawIgdbGame): IgdbGameItem | null {
  const title = (g.name || '').trim();
  const coverId = g.cover?.image_id;
  if (!title || !coverId) return null;

  const posterUrl = `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${coverId}.jpg`;
  const bgId = g.artworks?.[0]?.image_id || g.screenshots?.[0]?.image_id;
  const backdropUrl = bgId
    ? `https://images.igdb.com/igdb/image/upload/t_1080p/${bgId}.jpg`
    : posterUrl;

  const year = g.first_release_date
    ? new Date(g.first_release_date * 1000).getUTCFullYear()
    : new Date().getUTCFullYear();

  const rawScore = g.total_rating ?? g.rating;
  const rating = rawScore
    ? Number(Math.max(2.5, Math.min(5.0, rawScore / 20)).toFixed(1))
    : 4.4;

  const devEntry =
    g.involved_companies?.find((c) => c.developer && c.company?.name) ||
    g.involved_companies?.find((c) => c.company?.name);
  const developer = devEntry?.company?.name || 'Studio';

  const platforms = normalizeIgdbPlatforms(g.platforms);
  const genreNames: string[] = [];
  for (const item of [...(g.genres || []), ...(g.themes || [])]) {
    if (item.name && !genreNames.includes(item.name)) {
      genreNames.push(item.name);
    }
    if (genreNames.length >= 4) break;
  }
  if (genreNames.length === 0) genreNames.push('Video Game');

  const franchise = g.franchises?.[0]?.name;
  const popSignal =
    (g.total_rating_count || 0) * 1.4 + (g.follows || 0) * 0.8 + (g.hypes || 0) * 2.5;
  const popularityScore = Math.max(
    48,
    Math.min(98, Math.round(45 + Math.log10(Math.max(1, popSignal + 1)) * 15))
  );

  return {
    id: `igdb-${g.id}`,
    igdbId: g.id,
    title,
    year,
    rating,
    posterUrl,
    backdropUrl,
    overview: (g.summary || '').trim() || `${title} — tracked in your Play log.`,
    developer,
    platforms,
    genres: genreNames,
    franchise,
    subtitle: [developer, platforms.slice(0, 2).join(' · ')].filter(Boolean).join(' · '),
    popularityScore,
  };
}

async function queryIgdbGames(
  clientId: string,
  accessToken: string,
  apicalypseBody: string
): Promise<IgdbGameItem[]> {
  try {
    const res = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'text/plain',
      },
      body: apicalypseBody,
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return [];
    const list = (await res.json()) as RawIgdbGame[];
    if (!Array.isArray(list)) return [];
    return list.map(mapIgdbGame).filter((g): g is IgdbGameItem => Boolean(g));
  } catch {
    return [];
  }
}

/** Handles `/api/igdb` requests cleanly with Twitch OAuth token caching and fallback state. */
export async function handleIgdbProxyRequest(
  params: URLSearchParams,
  env?: Record<string, string | undefined>
): Promise<IgdbProxyResponse> {
  const action = (params.get('action') || 'status').trim().toLowerCase();
  const { clientId, clientSecret } = resolveIgdbCredentials(env);
  const configured = Boolean(clientId && clientSecret);

  if (action === 'status') {
    return {
      status: 200,
      body: { configured },
      cacheControl: 'public, s-maxage=60, stale-while-revalidate=300',
    };
  }

  if (!configured) {
    return {
      status: 200,
      body: { configured: false, items: [] },
      cacheControl: 'public, s-maxage=60, stale-while-revalidate=300',
    };
  }

  const token = await getTwitchAppToken(clientId, clientSecret);
  if (!token) {
    return {
      status: 200,
      body: { configured: false, items: [], error: 'Twitch OAuth unavailable' },
      cacheControl: 'no-store',
    };
  }

  if (action === 'search') {
    const qRaw = (params.get('q') || '').replace(/["\\;\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (qRaw.length < 2) {
      return { status: 400, body: { configured: true, items: [] }, cacheControl: 'no-store' };
    }
    const items = await queryIgdbGames(
      clientId,
      token,
      `search "${qRaw}"; ${IGDB_FIELDS}; limit 16;`
    );
    return {
      status: 200,
      body: { configured: true, items },
      cacheControl: 'public, s-maxage=900, stale-while-revalidate=7200',
    };
  }

  if (action === 'discover') {
    const mode = (params.get('mode') || 'trending').trim().toLowerCase();
    const limit = Math.max(8, Math.min(30, Number(params.get('limit') || '20') || 20));
    const nowSec = Math.floor(Date.now() / 1000);
    const cutoffSec = nowSec - 210 * 86400;

    let query = `${IGDB_FIELDS} & first_release_date >= ${cutoffSec} & first_release_date <= ${nowSec} & (total_rating_count >= 5 | hypes >= 10); sort total_rating_count desc; limit ${limit};`;
    if (mode === 'anticipated') {
      query = `${IGDB_FIELDS} & first_release_date > ${nowSec} & hypes >= 5; sort hypes desc; limit ${limit};`;
    } else if (mode === 'popular') {
      query = `${IGDB_FIELDS} & total_rating >= 84 & total_rating_count >= 150; sort total_rating_count desc; limit ${limit};`;
    }

    const items = await queryIgdbGames(clientId, token, query);
    return {
      status: 200,
      body: { configured: true, mode, items },
      cacheControl: 'public, s-maxage=1800, stale-while-revalidate=21600',
    };
  }

  return {
    status: 400,
    body: { configured, error: 'Unsupported action', items: [] },
    cacheControl: 'no-store',
  };
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
    const out = await handleIgdbProxyRequest(url.searchParams);
    return new Response(JSON.stringify(out.body), {
      status: out.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': out.cacheControl,
      },
    });
  } catch {
    return new Response(JSON.stringify({ configured: false, items: [] }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    });
  }
}
