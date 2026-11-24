import { lookupKnownGameChapters, parseChapterCountFromText } from '../src/utils/gameChapters';

function jsonResponse(body: unknown, status = 200, maxAge = 86400): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control':
        status === 200
          ? `public, s-maxage=${maxAge}, stale-while-revalidate=604800`
          : 'no-store',
    },
  });
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function searchWikipediaChapters(title: string) {
  try {
    const searchRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        `${title} video game`
      )}&format=json&srlimit=3`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!searchRes.ok) return null;
    const searchJson = (await searchRes.json()) as {
      query?: { search?: Array<{ pageid: number; title: string; snippet?: string }> };
    };
    const hits = searchJson.query?.search || [];
    if (hits.length === 0) return null;

    const pageId = hits[0].pageid;
    const extractRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&pageids=${pageId}&format=json`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!extractRes.ok) return null;
    const extractJson = (await extractRes.json()) as {
      query?: { pages?: Record<string, { extract?: string; title?: string }> };
    };
    const page = extractJson.query?.pages?.[String(pageId)];
    const extract = page?.extract || '';
    const parsed = parseChapterCountFromText(extract);
    if (!parsed) return null;

    return {
      found: true as const,
      totalChapters: parsed.totalChapters,
      unit: parsed.unit,
      source: 'wikipedia' as const,
      note: `Detected from Wikipedia (${page?.title || hits[0].title})`,
    };
  } catch {
    return null;
  }
}

async function searchWebSnippetChapters(title: string) {
  try {
    const query = `"${title}" how many chapters`;
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'CueMediaTracker/1.0 (+https://cue-three-theta.vercel.app)',
      },
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const snippets: string[] = [];
    for (const match of html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi)) {
      snippets.push(stripTags(match[1]));
    }
    const combined = snippets.join(' · ') || stripTags(html).slice(0, 12000);
    const parsed = parseChapterCountFromText(combined);
    if (!parsed) return null;
    return {
      found: true as const,
      totalChapters: parsed.totalChapters,
      unit: parsed.unit,
      source: 'web' as const,
      note: 'Auto-detected from web game guides',
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const title = (url.searchParams.get('title') || '').trim();
  if (title.length < 2) {
    return jsonResponse({ found: false, error: 'Missing game title' }, 400);
  }

  const catalogHit = lookupKnownGameChapters(title);
  if (catalogHit) {
    return jsonResponse({
      found: true,
      totalChapters: catalogHit.totalChapters,
      unit: catalogHit.unit,
      source: 'catalog',
      note: catalogHit.note || `${catalogHit.totalChapters} ${catalogHit.unit}`,
    });
  }

  const wikiHit = await searchWikipediaChapters(title);
  if (wikiHit) {
    return jsonResponse(wikiHit);
  }

  const webHit = await searchWebSnippetChapters(title);
  if (webHit) {
    return jsonResponse(webHit);
  }

  return jsonResponse({ found: false }, 200, 3600);
}
