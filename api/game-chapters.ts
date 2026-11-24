type ChapterUnit = 'chapters' | 'acts' | 'missions';

const KNOWN_GAME_CHAPTERS: Record<
  string,
  { totalChapters: number; unit: ChapterUnit; note?: string }
> = {
  'onimusha way of the sword': {
    totalChapters: 23,
    unit: 'chapters',
    note: '23 main story chapters',
  },
  'onimusha 3 demon siege': { totalChapters: 11, unit: 'chapters' },
  'onimusha dawn of dreams': { totalChapters: 17, unit: 'chapters', note: '17 story stages' },
  'resident evil 4': { totalChapters: 16, unit: 'chapters', note: '16 remake chapters' },
  'resident evil 4 remake': { totalChapters: 16, unit: 'chapters', note: '16 main chapters' },
  'resident evil 5': { totalChapters: 16, unit: 'chapters' },
  'resident evil 6': { totalChapters: 20, unit: 'chapters' },
  'resident evil requiem': { totalChapters: 16, unit: 'chapters' },
  'final fantasy vii remake': { totalChapters: 18, unit: 'chapters', note: '18 chapters' },
  'final fantasy 7 remake': { totalChapters: 18, unit: 'chapters', note: '18 chapters' },
  'final fantasy vii rebirth': { totalChapters: 14, unit: 'chapters', note: '14 chapters' },
  'final fantasy 7 rebirth': { totalChapters: 14, unit: 'chapters', note: '14 chapters' },
  'final fantasy xvi': { totalChapters: 16, unit: 'chapters' },
  'alan wake 2': { totalChapters: 19, unit: 'chapters', note: '10 Return + 9 Initiation chapters' },
  'alan wake ii': { totalChapters: 19, unit: 'chapters' },
  'devil may cry 5': { totalChapters: 20, unit: 'missions', note: '20 missions' },
  'uncharted 4 a thiefs end': { totalChapters: 22, unit: 'chapters', note: '22 chapters' },
  'uncharted 4': { totalChapters: 22, unit: 'chapters', note: '22 chapters' },
  'uncharted 2 among thieves': { totalChapters: 26, unit: 'chapters' },
  'uncharted 3 drakes deception': { totalChapters: 22, unit: 'chapters' },
  'the last of us': { totalChapters: 12, unit: 'chapters', note: '12 story chapters' },
  'the last of us part i': { totalChapters: 12, unit: 'chapters', note: '12 story chapters' },
  'the last of us part ii': { totalChapters: 11, unit: 'chapters', note: '11 major story chapters' },
  'dead space': { totalChapters: 12, unit: 'chapters', note: '12 chapters' },
  'dead space 2': { totalChapters: 15, unit: 'chapters' },
  'black myth wukong': { totalChapters: 6, unit: 'chapters', note: '6 major chapters' },
  'god of war ragnarok': { totalChapters: 18, unit: 'chapters', note: '18 Path quests' },
  'baldurs gate 3': { totalChapters: 3, unit: 'acts', note: '3 major story acts' },
  'baldurs gate iii': { totalChapters: 3, unit: 'acts', note: '3 major story acts' },
  'clair obscur expedition 33': { totalChapters: 3, unit: 'acts', note: 'Prologue & 3 acts' },
  'lies of p': { totalChapters: 11, unit: 'chapters', note: '11 chapters' },
  'stellar blade': { totalChapters: 11, unit: 'chapters' },
  'doom the dark ages': { totalChapters: 22, unit: 'chapters', note: '22 campaign chapters' },
  'doom eternal': { totalChapters: 13, unit: 'missions', note: '13 campaign missions' },
  'silent hill 2': { totalChapters: 8, unit: 'chapters' },
  'death stranding': { totalChapters: 15, unit: 'chapters', note: '15 story episodes' },
  'death stranding 2': { totalChapters: 16, unit: 'chapters' },
  'death stranding 2 on the beach': { totalChapters: 16, unit: 'chapters' },
  'cyberpunk 2077': { totalChapters: 3, unit: 'acts', note: 'Prologue + 3 acts' },
  'ghost of tsushima': { totalChapters: 3, unit: 'acts', note: '3 story acts' },
  'ghost of yotei': { totalChapters: 3, unit: 'acts' },
  'red dead redemption 2': { totalChapters: 8, unit: 'chapters', note: '6 chapters + 2 epilogue parts' },
  'yakuza like a dragon': { totalChapters: 15, unit: 'chapters' },
  'like a dragon infinite wealth': { totalChapters: 14, unit: 'chapters' },
  'yakuza 0': { totalChapters: 17, unit: 'chapters' },
  'persona 5 royal': { totalChapters: 9, unit: 'chapters', note: '9 Palaces / arcs' },
  'metaphor refantazio': { totalChapters: 6, unit: 'acts', note: '6 major story months' },
  'the witcher 3 wild hunt': { totalChapters: 3, unit: 'acts', note: 'Prologue + 3 acts' },
  'it takes two': { totalChapters: 7, unit: 'chapters', note: '7 main chapters' },
  'split fiction': { totalChapters: 8, unit: 'chapters', note: '8 story chapters' },
  'mafia the old country': { totalChapters: 15, unit: 'chapters' },
  bayonetta: { totalChapters: 17, unit: 'chapters', note: '17 total chapters' },
  'a plague tale innocence': { totalChapters: 17, unit: 'chapters' },
  'a plague tale requiem': { totalChapters: 17, unit: 'chapters' },
  'xenoblade chronicles 3': { totalChapters: 7, unit: 'chapters' },
  celeste: { totalChapters: 9, unit: 'chapters' },
  'life is strange': { totalChapters: 5, unit: 'chapters', note: '5 episodes' },
  'hi fi rush': { totalChapters: 12, unit: 'missions', note: '12 tracks' },
};

function normalizeGameTitleKey(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(remastered|remake|definitive edition|complete edition|goty|game of the year)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lookupKnownGameChapters(title: string) {
  const norm = normalizeGameTitleKey(title);
  if (!norm) return null;

  const rawWithRemake = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const exact = KNOWN_GAME_CHAPTERS[rawWithRemake] || KNOWN_GAME_CHAPTERS[norm];
  const candidate =
    exact ||
    Object.entries(KNOWN_GAME_CHAPTERS).find(([k]) => {
      const checkSuffix = (str: string) =>
        str.startsWith(`${k} `) &&
        !/^(?:\d+|ii|iii|iv|v|vi|x|part|rebirth)\b/i.test(str.slice(k.length + 1));
      return checkSuffix(rawWithRemake) || checkSuffix(norm);
    })?.[1];

  if (!candidate) return null;
  return {
    totalChapters: candidate.totalChapters,
    unit: candidate.unit,
    source: 'catalog' as const,
    note: candidate.note,
  };
}

const NUMBER_WORDS: Record<string, number> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  'twenty-one': 21,
  'twenty-two': 22,
  'twenty-three': 23,
  'twenty-four': 24,
  'twenty-five': 25,
  thirty: 30,
};

function normalizeChapterUnit(raw: string): ChapterUnit {
  const lower = raw.toLowerCase();
  if (lower.startsWith('act')) return 'acts';
  if (lower.startsWith('mission') || lower.startsWith('stage') || lower.startsWith('level')) {
    return 'missions';
  }
  return 'chapters';
}

function parseChapterCountFromText(
  text: string
): { totalChapters: number; unit: ChapterUnit } | null {
  if (!text) return null;

  const counts = new Map<string, number>();
  const recordHit = (num: number, rawUnit: string, weight: number) => {
    if (!Number.isFinite(num) || num < 2 || num > 80) return;
    const unit = normalizeChapterUnit(rawUnit);
    const key = `${num}:${unit}`;
    counts.set(key, (counts.get(key) || 0) + weight);
  };

  const digitRegex =
    /(?:\b(?:are|has|have|with|features?|includes?|contains?|consists?\s+of|divided\s+into|split\s+into|spanning|total\s+of|all)\s+)?\b(\d{1,2})\s+(?:main\s+|story\s+|campaign\s+|playable\s+|total\s+|separate\s+|unique\s+)?(chapters|acts|missions)\b/gi;
  for (const m of text.matchAll(digitRegex)) {
    const val = Number(m[1]);
    const weight = m[0].trim().length > m[1].length + m[2].length + 2 ? 4 : 2;
    recordHit(val, m[2], weight);
  }

  const wordKeys = Object.keys(NUMBER_WORDS).join('|');
  const wordRegex = new RegExp(
    `\\b(${wordKeys})\\s+(?:main\\s+|story\\s+|campaign\\s+)?(chapters|acts|missions)\\b`,
    'gi'
  );
  for (const m of text.matchAll(wordRegex)) {
    const val = NUMBER_WORDS[m[1].toLowerCase()];
    if (val) recordHit(val, m[2], 3);
  }

  const chapterHeadings = [...text.matchAll(/\b(?:chapter|mission|act)\s+(\d{1,2})\b/gi)]
    .map((m) => ({ val: Number(m[1]), unit: normalizeChapterUnit(m[0]) }))
    .filter((x) => x.val >= 1 && x.val <= 60);
  const distinctHeadings = new Set(chapterHeadings.map((h) => h.val));
  if (distinctHeadings.size >= 3) {
    const maxHeading = chapterHeadings.reduce((best, cur) => (cur.val > best.val ? cur : best));
    if (maxHeading.val >= 3) {
      recordHit(maxHeading.val, maxHeading.unit, 2);
    }
  }

  if (counts.size === 0) return null;

  const sorted = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return Number(b[0].split(':')[0]) - Number(a[0].split(':')[0]);
  });

  const [bestKey] = sorted[0];
  const [numStr, unitStr] = bestKey.split(':');
  return {
    totalChapters: Number(numStr),
    unit: unitStr as ChapterUnit,
  };
}

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
      query?: { search?: Array<{ pageid: number; title: string }> };
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
