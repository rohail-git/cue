export type ComicWikiSlug = 'marvel' | 'dc' | 'imagecomics';

export interface ComicSeriesSearchItem {
  id: string;
  wiki: ComicWikiSlug;
  volTitle: string;
  volNumber: number;
  title: string;
  publisher: string;
  startYear: number;
  endYear?: number;
  isOngoing: boolean;
  runLabel: string;
  issueCount: number;
  coverUrl: string;
  creator: string;
  genres: string[];
  overview: string;
}

export interface ComicSeriesIssueItem {
  number: number;
  issueLabel: string;
  title?: string;
  releaseDate?: string;
  releaseDateIso?: string;
  coverUrl?: string;
  synopsis?: string;
  writers?: string;
  artists?: string;
  wiki?: ComicWikiSlug;
  pageTitle?: string;
}

const UA_HEADER = 'CueMediaTracker/1.0 (+https://cue-three-theta.vercel.app)';

const WIKI_PUBLISHER: Record<ComicWikiSlug, string> = {
  marvel: 'Marvel Comics',
  dc: 'DC Comics',
  imagecomics: 'Image Comics',
};

const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/^the\s+/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanWikitext(raw?: string): string {
  if (!raw) return '';
  return raw
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<ref[^/]*\/>/gi, '')
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[\[([^\]]+)/g, '$1')
    .replace(/\]\]/g, '')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/'{2,3}/g, '')
    .replace(/;/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractWikitextField(wikitext: string, fieldPattern: string): string | undefined {
  const m = wikitext.match(new RegExp(`\\|\\s*(?:${fieldPattern})\\s*=[^\\S\\r\\n]*([^\\n]+)`, 'i'));
  if (!m?.[1]) return undefined;
  const cleaned = cleanWikitext(m[1]).replace(/,\s*$/, '').trim();
  return cleaned.length >= 2 && !/^\|/.test(cleaned) ? cleaned : undefined;
}

function extractIssueSynopsis(wikitext: string): string | undefined {
  if (!wikitext) return undefined;
  let raw = '';
  const fieldMatch = wikitext.match(
    /\|\s*(?:Solicit|Synopsis1?)\s*=[^\S\r\n]*([\s\S]*?)(?=\n\s*\||\n\s*\}\})/i
  );
  if (fieldMatch?.[1]) {
    raw = fieldMatch[1];
  } else {
    const secMatch = wikitext.match(
      /==+\s*(?:Solicit|Synopsis[^=]*)\s*==+\s*\n([\s\S]*?)(?=\n==|$)/i
    );
    if (secMatch?.[1]) raw = secMatch[1];
  }
  const cleaned = cleanWikitext(raw);
  if (!cleaned || cleaned.length < 25 || /^no synopsis/i.test(cleaned)) return undefined;
  if (cleaned.length <= 420) return cleaned;
  const slice = cleaned.slice(0, 420);
  const lastSpace = slice.lastIndexOf(' ');
  return `${(lastSpace > 260 ? slice.slice(0, lastSpace) : slice).trim()}…`;
}

function parseQueryAndYear(rawQuery: string): { baseQuery: string; targetYear?: number } {
  const trimmed = rawQuery.replace(/\s+/g, ' ').trim();
  const yearMatches = [...trimmed.matchAll(/\b(19\d{2}|20\d{2})\b/g)];
  if (yearMatches.length > 0) {
    const last = yearMatches[yearMatches.length - 1];
    const without = trimmed.replace(last[0], '').replace(/\s+/g, ' ').trim();
    if (without.length >= 2) {
      return { baseQuery: without, targetYear: Number(last[1]) };
    }
  }
  return { baseQuery: trimmed };
}

function upscaleFandomThumb(url?: string): string {
  if (!url) return '';
  return url.replace(/\/scale-to-width-down\/\d+/i, '/scale-to-width-down/480');
}

function parseWikiMonth(raw?: string): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const numMonth = Number(trimmed);
  if (Number.isInteger(numMonth) && numMonth >= 1 && numMonth <= 12) {
    return numMonth;
  }
  const cleanMo = trimmed.replace(/[^a-zA-Z]/g, '').toLowerCase();
  if (cleanMo.length < 3) return null;
  const idx = MONTH_ABBR.findIndex(
    (m) => cleanMo.startsWith(m.toLowerCase()) || m.toLowerCase() === cleanMo.slice(0, 3)
  );
  return idx >= 0 ? idx + 1 : null;
}

function formatUtcDateParts(
  year: number,
  zeroBasedMonth: number,
  day: number
): { releaseDate: string; releaseDateIso: string } {
  const dt = new Date(Date.UTC(year, zeroBasedMonth, day));
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth();
  const d = dt.getUTCDate();
  return {
    releaseDate: `${MONTH_ABBR[m]} ${d}, ${y}`,
    releaseDateIso: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
  };
}

function extractIssueReleaseDate(
  rawWikitext: string,
  wiki: ComicWikiSlug,
  categories?: Array<{ title?: string }>
): { releaseDate?: string; releaseDateIso?: string } {
  const relDirect = rawWikitext.match(/\|\s*ReleaseDate\s*=\s*([^\n|]+)/i)?.[1]?.trim();
  if (relDirect) {
    const cleanRel = cleanWikitext(relDirect);
    const isoM = cleanRel.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoM) {
      return formatUtcDateParts(Number(isoM[1]), Number(isoM[2]) - 1, Number(isoM[3]));
    }
    const mdyM = cleanRel.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
    if (mdyM) {
      const m1 = parseWikiMonth(mdyM[1]);
      if (m1) return formatUtcDateParts(Number(mdyM[3]), m1 - 1, Number(mdyM[2]));
    }
    const dmyM = cleanRel.match(/^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})/);
    if (dmyM) {
      const m1 = parseWikiMonth(dmyM[2]);
      if (m1) return formatUtcDateParts(Number(dmyM[3]), m1 - 1, Number(dmyM[1]));
    }
    const moYrM = cleanRel.match(/^([A-Za-z]+),?\s+(\d{4})$/);
    if (moYrM) {
      const m1 = parseWikiMonth(moYrM[1]);
      if (m1) return { releaseDate: `${MONTH_ABBR[m1 - 1]} ${moYrM[2]}` };
    }
  }

  for (const cat of categories || []) {
    const t = cat.title || '';
    const pubFull = t.match(/^Category:\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s*\(Publication\)$/i);
    if (pubFull) {
      const m1 = parseWikiMonth(pubFull[1]);
      if (m1) return formatUtcDateParts(Number(pubFull[3]), m1 - 1, Number(pubFull[2]));
    }
  }

  const dayRaw = rawWikitext.match(/\|\s*Day\s*=\s*(\d{1,2})/i)?.[1]?.trim();
  const dayNum = dayRaw ? Number(dayRaw) : 0;

  for (const cat of categories || []) {
    const t = cat.title || '';
    const pubMo = t.match(/^Category:\s*(\d{4}),\s*([A-Za-z]+)\s*\(Publication\)$/i);
    if (pubMo) {
      const m1 = parseWikiMonth(pubMo[2]);
      if (m1 && dayNum >= 1 && dayNum <= 31) {
        return formatUtcDateParts(Number(pubMo[1]), m1 - 1, dayNum);
      }
      if (m1) {
        return { releaseDate: `${MONTH_ABBR[m1 - 1]} ${pubMo[1]}` };
      }
    }
  }

  const moRaw = rawWikitext.match(/\|\s*(?:Month|PubMonth)\s*=\s*([^\n|]+)/i)?.[1]?.trim();
  const yrRaw = rawWikitext.match(/\|\s*Year\s*=\s*(\d{4})/i)?.[1]?.trim();
  if (!yrRaw) return {};
  const yrNum = Number(yrRaw);
  const m1 = parseWikiMonth(moRaw);

  if (m1 && dayNum >= 1 && dayNum <= 31) {
    // DC wiki templates store Month/Year as the cover date (~2 months after on-sale date).
    const zeroBasedMonth = wiki === 'dc' ? m1 - 3 : m1 - 1;
    return formatUtcDateParts(yrNum, zeroBasedMonth, dayNum);
  }
  if (m1) {
    if (wiki === 'dc') {
      const dt = new Date(Date.UTC(yrNum, m1 - 3, 1));
      return { releaseDate: `${MONTH_ABBR[dt.getUTCMonth()]} ${dt.getUTCFullYear()}` };
    }
    return { releaseDate: `${MONTH_ABBR[m1 - 1]} ${yrRaw}` };
  }
  return { releaseDate: yrRaw };
}

function cleanStoryTitle(raw: string, seriesNorm: string): string | undefined {
  let s = cleanWikitext(raw);
  s = s.replace(/^["'“”]+|["'“”]+$/g, '').trim();
  if (!s || s.length < 2) return undefined;
  if (normTitle(s) === seriesNorm) return undefined;
  return s;
}

interface MediaWikiQueryPage {
  pageid?: number;
  title?: string;
  missing?: string;
  thumbnail?: { source?: string };
  categories?: Array<{ title?: string }>;
  categoryinfo?: { pages?: number };
  revisions?: Array<{ '*'?: string }>;
  imageinfo?: Array<{ url?: string; thumburl?: string }>;
}

function extractPrimaryCoverFilename(wikitext: string, fallbackPageTitle: string): string {
  const m = wikitext.match(/\|\s*Image1?\s*=\s*([^\n|]+)/i);
  if (m && m[1]) {
    const cleaned = m[1]
      .replace(/\[\[(?:File|Image):/i, '')
      .replace(/\]\]/g, '')
      .replace(/^(?:File|Image):/i, '')
      .split('|')[0]
      ?.trim();
    if (cleaned && /\.(?:jpe?g|png|webp|gif)$/i.test(cleaned)) {
      return cleaned;
    }
  }
  return `${fallbackPageTitle}.jpg`;
}

async function resolveWikiFileUrls(
  wiki: ComicWikiSlug,
  filenames: string[],
  width: number,
  corsOrigin = false
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = Array.from(new Set(filenames.filter(Boolean)));
  if (unique.length === 0) return out;

  const chunkSize = 40;
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += chunkSize) {
    chunks.push(unique.slice(i, i + chunkSize));
  }

  const originParam = corsOrigin ? '&origin=*' : '';
  await Promise.allSettled(
    chunks.map(async (chunk) => {
      const res = await fetch(
        `https://${wiki}.fandom.com/api.php?action=query&titles=${encodeURIComponent(
          chunk.map((f) => `File:${f}`).join('|')
        )}&prop=imageinfo&iiprop=url&iiurlwidth=${width}&redirects=1&format=json${originParam}`,
        { headers: { 'User-Agent': UA_HEADER }, signal: AbortSignal.timeout(5500) }
      );
      if (!res.ok) return;
      const json = (await res.json()) as {
        query?: {
          normalized?: Array<{ from: string; to: string }>;
          redirects?: Array<{ from: string; to: string }>;
          pages?: Record<string, MediaWikiQueryPage>;
        };
      };

      const normMap = new Map<string, string>();
      for (const n of json.query?.normalized || []) normMap.set(n.from.toLowerCase(), n.to);
      const redirMap = new Map<string, string>();
      for (const r of json.query?.redirects || []) redirMap.set(r.from.toLowerCase(), r.to);

      const urlByTitle = new Map<string, string>();
      for (const p of Object.values(json.query?.pages || {})) {
        if (!p.title || p.missing !== undefined) continue;
        const url = p.imageinfo?.[0]?.thumburl || p.imageinfo?.[0]?.url;
        if (url) urlByTitle.set(p.title.toLowerCase(), url);
      }

      for (const rawName of chunk) {
        let cur = `File:${rawName}`;
        const n1 = normMap.get(cur.toLowerCase());
        if (n1) cur = n1;
        const r1 = redirMap.get(cur.toLowerCase());
        if (r1) cur = r1;
        const resolved = urlByTitle.get(cur.toLowerCase()) || urlByTitle.get(`file:${rawName.toLowerCase()}`);
        if (resolved) out.set(rawName.toLowerCase(), resolved);
      }
    })
  );

  return out;
}

async function queryWikiComicVolumes(
  wiki: ComicWikiSlug,
  baseQuery: string
): Promise<ComicSeriesSearchItem[]> {
  const clean = baseQuery.replace(/^the\s+/i, '').trim();
  if (clean.length < 2) return [];
  const targetNorm = normTitle(clean);
  const queryWords = targetNorm.split(' ').filter(Boolean);

  try {
    const [prefixRes, searchRes] = await Promise.allSettled([
      fetch(
        `https://${wiki}.fandom.com/api.php?action=query&list=prefixsearch&pssearch=${encodeURIComponent(
          `${clean} Vol `
        )}&pslimit=25&format=json`,
        { headers: { 'User-Agent': UA_HEADER }, signal: AbortSignal.timeout(5000) }
      ),
      fetch(
        `https://${wiki}.fandom.com/api.php?action=query&list=search&srsearch=${encodeURIComponent(
          `"${clean}" Vol`
        )}&srlimit=12&format=json`,
        { headers: { 'User-Agent': UA_HEADER }, signal: AbortSignal.timeout(5000) }
      ),
    ]);

    const candidateTitles: string[] = [];
    const seenTitle = new Set<string>();
    const addCandidate = (t?: string) => {
      if (!t) return;
      const m = t.match(/^(.+?)\s+Vol\s+(\d+)$/i);
      if (!m) return;
      if (/\b(?:epic collection|marvel masterworks|omnibus|compendium|treasury edition|facsimile|worldwide)\b/i.test(m[1])) {
        return;
      }
      const baseNorm = normTitle(m[1]);
      if (
        baseNorm !== targetNorm &&
        !queryWords.every((w) => baseNorm.includes(w))
      ) {
        return;
      }
      if (!seenTitle.has(t)) {
        seenTitle.add(t);
        candidateTitles.push(t);
      }
    };

    if (prefixRes.status === 'fulfilled' && prefixRes.value.ok) {
      const json = (await prefixRes.value.json()) as {
        query?: { prefixsearch?: Array<{ title?: string }> };
      };
      for (const hit of json.query?.prefixsearch || []) addCandidate(hit.title);
    }
    if (searchRes.status === 'fulfilled' && searchRes.value.ok) {
      const json = (await searchRes.value.json()) as {
        query?: { search?: Array<{ title?: string }> };
      };
      for (const hit of json.query?.search || []) addCandidate(hit.title);
    }

    if (candidateTitles.length === 0) return [];

    // Prioritize exact base-title volumes first, newest volume number first
    candidateTitles.sort((a, b) => {
      const ma = a.match(/^(.+?)\s+Vol\s+(\d+)$/i)!;
      const mb = b.match(/^(.+?)\s+Vol\s+(\d+)$/i)!;
      const exactA = normTitle(ma[1]) === targetNorm ? 1 : 0;
      const exactB = normTitle(mb[1]) === targetNorm ? 1 : 0;
      if (exactB !== exactA) return exactB - exactA;
      return Number(mb[2]) - Number(ma[2]);
    });

    const picked = candidateTitles.slice(0, 10);
    const volBatchUrl = `https://${wiki}.fandom.com/api.php?action=query&titles=${encodeURIComponent(
      picked.join('|')
    )}&prop=categories|pageimages|revisions&rvprop=content&cllimit=500&pithumbsize=500&format=json`;
    const issue1BatchUrl = `https://${wiki}.fandom.com/api.php?action=query&titles=${encodeURIComponent(
      picked.map((v) => `${v} 1`).join('|')
    )}&prop=revisions|pageimages&rvprop=content&pithumbsize=500&format=json`;
    const catInfoUrl = `https://${wiki}.fandom.com/api.php?action=query&titles=${encodeURIComponent(
      picked.map((v) => `Category:${v}`).join('|')
    )}&prop=categoryinfo&format=json`;

    const [volRes, issueRes, catRes] = await Promise.allSettled([
      fetch(volBatchUrl, { headers: { 'User-Agent': UA_HEADER }, signal: AbortSignal.timeout(5500) }),
      fetch(issue1BatchUrl, { headers: { 'User-Agent': UA_HEADER }, signal: AbortSignal.timeout(5500) }),
      fetch(catInfoUrl, { headers: { 'User-Agent': UA_HEADER }, signal: AbortSignal.timeout(5500) }),
    ]);

    const volMap = new Map<string, MediaWikiQueryPage>();
    if (volRes.status === 'fulfilled' && volRes.value.ok) {
      const json = (await volRes.value.json()) as {
        query?: { pages?: Record<string, MediaWikiQueryPage> };
      };
      for (const p of Object.values(json.query?.pages || {})) {
        if (p.title && p.missing === undefined) volMap.set(p.title, p);
      }
    }

    const issue1Map = new Map<string, MediaWikiQueryPage>();
    if (issueRes.status === 'fulfilled' && issueRes.value.ok) {
      const json = (await issueRes.value.json()) as {
        query?: { pages?: Record<string, MediaWikiQueryPage> };
      };
      for (const p of Object.values(json.query?.pages || {})) {
        if (p.title && p.missing === undefined) issue1Map.set(p.title, p);
      }
    }

    const catCountMap = new Map<string, number>();
    if (catRes.status === 'fulfilled' && catRes.value.ok) {
      const json = (await catRes.value.json()) as {
        query?: { pages?: Record<string, MediaWikiQueryPage> };
      };
      for (const p of Object.values(json.query?.pages || {})) {
        if (p.title && typeof p.categoryinfo?.pages === 'number') {
          catCountMap.set(p.title.replace(/^Category:/i, ''), p.categoryinfo.pages);
        }
      }
    }

    const coverFilenames = picked.map((v) => {
      const i1 = issue1Map.get(`${v} 1`);
      const txt = i1?.revisions?.[0]?.['*'] || '';
      return extractPrimaryCoverFilename(txt, `${v} 1`);
    });
    const coverAUrlMap = await resolveWikiFileUrls(wiki, coverFilenames, 480);

    const results: ComicSeriesSearchItem[] = [];
    for (let vIdx = 0; vIdx < picked.length; vIdx += 1) {
      const volTitle = picked[vIdx];
      const volPage = volMap.get(volTitle);
      if (!volPage) continue;
      const issue1 = issue1Map.get(`${volTitle} 1`);
      const volText = volPage.revisions?.[0]?.['*'] || '';
      const issue1Text = issue1?.revisions?.[0]?.['*'] || '';
      const cats = (volPage.categories || []).map((c) => c.title || '');
      const coverAFile = coverFilenames[vIdx];

      const m = volTitle.match(/^(.+?)\s+Vol\s+(\d+)$/i);
      if (!m) continue;
      const rawSeriesName = m[1].trim();
      const volNumber = Number(m[2]);

      const debutCat = cats.find((c) => /(?:Volume Debuts|Comic Debuts)$/i.test(c));
      const debutCatYear = debutCat ? Number(debutCat.match(/\b(19\d{2}|20\d{2})\b/)?.[1]) : 0;
      const startYearField = Number(volText.match(/\|\s*StartYear\s*=\s*(\d{4})/i)?.[1] || 0);
      const issue1YearField = Number(issue1Text.match(/\|\s*Year\s*=\s*(\d{4})/i)?.[1] || 0);
      const partYearMatch = Number(
        volText.match(/\(\s*(19\d{2}|20\d{2})(?:\s*[-–—]\s*(?:19\d{2}|20\d{2}))?\s*\)/)?.[1] || 0
      );
      const startYear = startYearField || debutCatYear || issue1YearField || partYearMatch;
      if (!startYear) continue;

      const endCat = cats.find((c) => /(?:Volume Ends|Last Issues)$/i.test(c));
      const endCatYear = endCat ? Number(endCat.match(/\b(19\d{2}|20\d{2})\b/)?.[1]) : 0;
      const endYearField = Number(volText.match(/\|\s*EndYear\s*=\s*(\d{4})/i)?.[1] || 0);
      const endYear = endYearField || endCatYear || undefined;
      const isFinishedCat = cats.some((c) => /Finished Volumes$/i.test(c));
      const isOngoing = !endYear && !isFinishedCat;

      const totalIssuesField = Number(volText.match(/\|\s*TotalIssues\s*=\s*(\d+)/i)?.[1] || 0);
      const catCount = catCountMap.get(volTitle) || 0;
      const issueCount = Math.max(1, catCount || totalIssuesField || 12);

      const coverUrl =
        coverAUrlMap.get(coverAFile.toLowerCase()) ||
        upscaleFandomThumb(issue1?.thumbnail?.source) ||
        upscaleFandomThumb(volPage.thumbnail?.source) ||
        '';
      if (!coverUrl) continue;

      const publisher = WIKI_PUBLISHER[wiki];
      const creatorRaw =
        volText.match(/\|\s*Creators?\s*=\s*([^\n|]+)/i)?.[1] ||
        issue1Text.match(/\|\s*Writers?\d*\s*=\s*([^\n|]+)/i)?.[1] ||
        '';
      const creatorCleaned = cleanWikitext(creatorRaw).split(',')[0]?.trim();
      const creator = creatorCleaned || publisher;

      const genresRaw = cleanWikitext(volText.match(/\|\s*genres?\s*=\s*([^\n|]+)/i)?.[1]);
      const genres = genresRaw
        ? genresRaw
            .split(',')
            .map((g) => g.trim())
            .filter(Boolean)
            .slice(0, 3)
        : ['Superhero'];

      const displayTitle = /^amazing spider-man$/i.test(rawSeriesName)
        ? `The ${rawSeriesName}`
        : rawSeriesName;
      const runLabel = isOngoing
        ? `${startYear} – Present`
        : endYear && endYear !== startYear
          ? `${startYear} – ${endYear}`
          : String(startYear);

      results.push({
        id: `comic-series-${wiki}-${volTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        wiki,
        volTitle,
        volNumber,
        title: displayTitle,
        publisher,
        startYear,
        endYear,
        isOngoing,
        runLabel,
        issueCount,
        coverUrl,
        creator,
        genres,
        overview: `${displayTitle} (Vol. ${volNumber} · ${runLabel}) published by ${publisher}. Tracking ${issueCount} ${
          issueCount === 1 ? 'issue' : 'issues'
        }.`,
      });
    }

    return results;
  } catch {
    return [];
  }
}

/** Searches ongoing & completed comic series runs across Marvel, DC, and Image Fandom wikis. */
export async function searchComicSeriesPayload(
  rawQuery: string
): Promise<{ items: ComicSeriesSearchItem[] }> {
  const { baseQuery, targetYear } = parseQueryAndYear(rawQuery);
  if (baseQuery.length < 2) return { items: [] };

  const targetNorm = normTitle(baseQuery);
  const settled = await Promise.allSettled([
    queryWikiComicVolumes('marvel', baseQuery),
    queryWikiComicVolumes('dc', baseQuery),
    queryWikiComicVolumes('imagecomics', baseQuery),
  ]);

  const combined: ComicSeriesSearchItem[] = [];
  for (const res of settled) {
    if (res.status === 'fulfilled') combined.push(...res.value);
  }

  combined.sort((a, b) => {
    if (targetYear) {
      const aExactY = a.startYear === targetYear ? 2 : a.startYear <= targetYear && (a.isOngoing || (a.endYear || 0) >= targetYear) ? 1 : 0;
      const bExactY = b.startYear === targetYear ? 2 : b.startYear <= targetYear && (b.isOngoing || (b.endYear || 0) >= targetYear) ? 1 : 0;
      if (bExactY !== aExactY) return bExactY - aExactY;
    }
    const aExactTitle = normTitle(a.title) === targetNorm ? 1 : 0;
    const bExactTitle = normTitle(b.title) === targetNorm ? 1 : 0;
    if (bExactTitle !== aExactTitle) return bExactTitle - aExactTitle;
    if (b.startYear !== a.startYear) return b.startYear - a.startYear;
    return b.volNumber - a.volNumber;
  });

  return { items: combined.slice(0, 14) };
}

/** Fetches ordered single issues (including legacy renumbering jumps) & covers for a specific Fandom volume. */
export async function fetchComicSeriesIssuesPayload(
  wiki: ComicWikiSlug,
  volTitle: string,
  limit = 60
): Promise<{ totalIssues: number; issues: Record<number, ComicSeriesIssueItem> }> {
  const capped = Math.max(1, Math.min(75, Math.round(limit)));
  const baseVol = volTitle.trim();
  const seriesNorm = normTitle(baseVol.replace(/\s+Vol\s+\d+$/i, ''));
  const strictIssueRegex = new RegExp(`^${escapeRegex(baseVol)}\\s+(\\d+(?:\\.\\d+)?)$`, 'i');

  const rawIssuePages: Array<{ pageTitle: string; rawNum: string; sortNum: number }> = [];
  const seenNum = new Set<string>();

  try {
    const catRes = await fetch(
      `https://${wiki}.fandom.com/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent(
        `Category:${baseVol}`
      )}&cmnamespace=0&cmlimit=150&format=json`,
      { headers: { 'User-Agent': UA_HEADER }, signal: AbortSignal.timeout(5500) }
    );
    if (catRes.ok) {
      const json = (await catRes.json()) as {
        query?: { categorymembers?: Array<{ title?: string }> };
      };
      for (const m of json.query?.categorymembers || []) {
        const match = (m.title || '').match(strictIssueRegex);
        if (!match) continue;
        const rawNum = match[1];
        if (seenNum.has(rawNum)) continue;
        seenNum.add(rawNum);
        rawIssuePages.push({
          pageTitle: m.title!,
          rawNum,
          sortNum: Number(rawNum),
        });
      }
    }

    if (rawIssuePages.length === 0) {
      const psRes = await fetch(
        `https://${wiki}.fandom.com/api.php?action=query&list=prefixsearch&pssearch=${encodeURIComponent(
          `${baseVol} `
        )}&pslimit=100&format=json`,
        { headers: { 'User-Agent': UA_HEADER }, signal: AbortSignal.timeout(5500) }
      );
      if (psRes.ok) {
        const json = (await psRes.json()) as {
          query?: { prefixsearch?: Array<{ title?: string }> };
        };
        for (const hit of json.query?.prefixsearch || []) {
          const match = (hit.title || '').match(strictIssueRegex);
          if (!match) continue;
          const rawNum = match[1];
          if (seenNum.has(rawNum)) continue;
          seenNum.add(rawNum);
          rawIssuePages.push({
            pageTitle: hit.title!,
            rawNum,
            sortNum: Number(rawNum),
          });
        }
      }
    }
  } catch {
    return { totalIssues: 0, issues: {} };
  }

  rawIssuePages.sort((a, b) => a.sortNum - b.sortNum);
  const totalIssues = rawIssuePages.length;
  const sliced = rawIssuePages.slice(0, capped);
  const issues: Record<number, ComicSeriesIssueItem> = {};

  const chunkSize = 20;
  for (let i = 0; i < sliced.length; i += chunkSize) {
    const chunk = sliced.slice(i, i + chunkSize);
    try {
      const res = await fetch(
        `https://${wiki}.fandom.com/api.php?action=query&titles=${encodeURIComponent(
          chunk.map((c) => c.pageTitle).join('|')
        )}&prop=pageimages|revisions|categories&rvprop=content&cllimit=max&pithumbsize=320&format=json`,
        { headers: { 'User-Agent': UA_HEADER }, signal: AbortSignal.timeout(5500) }
      );
      if (!res.ok) continue;
      const json = (await res.json()) as {
        query?: {
          normalized?: Array<{ from: string; to: string }>;
          pages?: Record<string, MediaWikiQueryPage>;
        };
      };
      const normMap = new Map<string, string>();
      for (const n of json.query?.normalized || []) normMap.set(n.from, n.to);

      const pageByTitle = new Map<string, MediaWikiQueryPage>();
      for (const p of Object.values(json.query?.pages || {})) {
        if (p.title) pageByTitle.set(p.title.toLowerCase(), p);
      }

      const chunkMeta = chunk.map((spec, idx) => {
        const slot = i + idx + 1;
        const resolvedTitle = (normMap.get(spec.pageTitle) || spec.pageTitle).toLowerCase();
        const page = pageByTitle.get(resolvedTitle);
        const wikitext = page?.revisions?.[0]?.['*'] || '';
        const coverFilename = extractPrimaryCoverFilename(wikitext, spec.pageTitle);
        return { spec, slot, page, wikitext, coverFilename };
      });

      const coverAMap = await resolveWikiFileUrls(
        wiki,
        chunkMeta.map((m) => m.coverFilename),
        320
      );

      for (const { spec, slot, page, wikitext, coverFilename } of chunkMeta) {
        const storyMatch =
          wikitext.match(/\|\s*StoryTitle1\s*=[^\S\r\n]*([^\n]+)/i)?.[1] ||
          wikitext.match(/\|\s*Name\s*=[^\S\r\n]*([^\n]+)/i)?.[1] ||
          '';
        const title = cleanStoryTitle(storyMatch, seriesNorm);
        const { releaseDate, releaseDateIso } = extractIssueReleaseDate(
          wikitext,
          wiki,
          page?.categories
        );
        const coverUrl =
          coverAMap.get(coverFilename.toLowerCase()) || page?.thumbnail?.source;
        const writers = extractWikitextField(wikitext, 'Writers?1|Writers');
        const artists = extractWikitextField(wikitext, 'Pencillers?1|Pencillers?|Artists?1|Artists');
        const synopsis = extractIssueSynopsis(wikitext);
        issues[slot] = {
          number: slot,
          issueLabel: `#${spec.rawNum}`,
          title,
          releaseDate,
          ...(releaseDateIso ? { releaseDateIso } : {}),
          coverUrl,
          synopsis,
          writers,
          artists,
          wiki,
          pageTitle: spec.pageTitle,
        };
      }
    } catch {
      // keep existing fetched chunks
    }
  }

  return { totalIssues, issues };
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
    const wikiParam = url.searchParams.get('wiki') as ComicWikiSlug | null;
    const volParam = url.searchParams.get('vol');

    if (
      wikiParam &&
      (wikiParam === 'marvel' || wikiParam === 'dc' || wikiParam === 'imagecomics') &&
      volParam
    ) {
      const limit = Number(url.searchParams.get('limit') || '60');
      const payload = await fetchComicSeriesIssuesPayload(
        wikiParam,
        volParam,
        Number.isFinite(limit) ? limit : 60
      );
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=21600',
        },
      });
    }

    const q = (url.searchParams.get('q') || '').trim();
    const payload = await searchComicSeriesPayload(q);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=21600',
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
