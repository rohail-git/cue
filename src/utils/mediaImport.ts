import type {
  CueStoreState,
  GameItem,
  Movie,
  ReadItem,
  Show,
} from '../types';
import { lookupKnownGameChapters } from './gameChapters';

export type ImportSourceType =
  | 'imdb-ratings'
  | 'imdb-account-export'
  | 'imdb-watchlist'
  | 'imdb-list'
  | 'letterboxd'
  | 'goodreads'
  | 'trakt-tvtime-json'
  | 'cue-backup'
  | 'unknown';

export type ImportConflictPolicy = 'skip_existing' | 'merge_missing';

export interface ResolvedImdbTitle {
  id: string;
  title: string;
  qid?: string;
  q?: string;
  year?: number;
  posterUrl?: string;
  cast?: string;
}

export interface ImportCandidate {
  tempId: string;
  kind: 'show' | 'movie' | 'read' | 'game';
  domain: 'watch' | 'read' | 'play';
  mediaType: 'tv' | 'anime' | 'movie' | 'novel' | 'manga' | 'comic' | 'game';
  title: string;
  year: number;
  externalConst?: string;
  url?: string;
  posterUrl?: string;
  genres: string[];
  creator?: string;
  runtime?: number;
  communityRating?: number;
  userRating?: number; // 1..5 scale
  completed: boolean;
  readStatus?: 'reading' | 'want_to_read' | 'finished';
  totalUnits?: number;
  dateStr?: string;
  overview?: string;
  needsResolution?: boolean;
  rowNumber?: number;
  existingId?: string;
  existingTitle?: string;
}

export interface SkippedImportRow {
  rowNumber: number;
  title: string;
  reason: string;
}

export interface ParsedImportBatch {
  source: ImportSourceType;
  sourceLabel: string;
  candidates: ImportCandidate[];
  skipped: SkippedImportRow[];
  needsIdResolution?: boolean;
  cueBackupState?: CueStoreState;
  error?: string;
}

export interface PreparedImportEntry {
  candidate: ImportCandidate;
  selected: boolean;
  show?: Show;
  movie?: Movie;
  read?: ReadItem;
  game?: GameItem;
}

export function normalizeImportTitle(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[:\-–—_.,!?'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugifyImportId(prefix: string, title: string, externalId?: string): string {
  if (externalId) {
    const cleanExt = externalId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (cleanExt) return `${prefix}-${cleanExt}`;
  }
  const base = normalizeImportTitle(title).replace(/\s+/g, '-').slice(0, 48) || 'item';
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  }
  return `${prefix}-${base}-${hash.toString(36).slice(0, 5)}`;
}

/** RFC-4180 compliant CSV parser handling UTF-8 BOM, quoted commas, escaped quotes, and CRLF/LF. */
export function parseCsvRows(input: string): string[][] {
  const clean = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];

    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field.trim());
      field = '';
    } else if (ch === '\r') {
      if (clean[i + 1] === '\n') i += 1;
      row.push(field.trim());
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\n') {
      row.push(field.trim());
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  row.push(field.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

function buildHeaderIndex(headerRow: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headerRow.forEach((h, idx) => {
    const key = h.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (key && map[key] === undefined) {
      map[key] = idx;
    }
  });
  return map;
}

function cell(row: string[], headers: Record<string, number>, ...keys: string[]): string {
  for (const k of keys) {
    const norm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    const idx = headers[norm];
    if (idx !== undefined && idx < row.length) {
      return row[idx].trim();
    }
  }
  return '';
}

function parseYear(raw: string, fallback = 2024): number {
  const m = raw.match(/\b(19\d\d|20\d\d)\b/);
  return m ? Number(m[1]) : fallback;
}

function parseRatingTenToFive(raw: string): number | undefined {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return Math.max(1, Math.min(5, Math.round(num / 2)));
}

function parseStarRatingFive(raw: string): number | undefined {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return Math.max(1, Math.min(5, Math.round(num)));
}

const KNOWN_ANIME_HINTS = [
  'anime',
  'attack on titan',
  'demon slayer',
  'one punch man',
  'one-punch man',
  'jujutsu kaisen',
  'chainsaw man',
  'death note',
  'vinland saga',
  'solo leveling',
  'cowboy bebop',
  'fullmetal alchemist',
  'hunter x hunter',
  'mob psycho',
  'naruto',
  'one piece',
  'bleach',
  'frieren',
  'dandadan',
  'steins;gate',
  'neon genesis evangelion',
  'ramparts of ice',
  'spy x family',
  'dragon ball',
];

export function classifyImdbRow(
  rawTitleType: string,
  title: string,
  genres: string[]
): { kind: ImportCandidate['kind']; mediaType: ImportCandidate['mediaType'] } | { skipReason: string } {
  const t = rawTitleType.toLowerCase().replace(/[^a-z]/g, '');
  if (t === 'tvepisode' || t === 'podcastepisode' || t === 'episode') {
    return { skipReason: 'Individual episode row — import parent series instead' };
  }
  if (t === 'podcastseries') {
    return { skipReason: 'Podcast series is not currently tracked' };
  }
  if (t === 'videogame' || t === 'game') {
    return { kind: 'game', mediaType: 'game' };
  }
  if (t === 'tvseries' || t === 'tvminiseries' || t === 'miniseries' || t === 'tvshort' || t === 'tvanimation') {
    const hay = `${title} ${genres.join(' ')}`.toLowerCase();
    const hasAnim = genres.length === 0 || genres.some((g) => g.toLowerCase() === 'animation');
    const looksAnime =
      genres.some((g) => g.toLowerCase() === 'anime') ||
      (hasAnim && KNOWN_ANIME_HINTS.some((kw) => hay.includes(kw)));
    return { kind: 'show', mediaType: looksAnime ? 'anime' : 'tv' };
  }
  if (
    !t ||
    t === 'movie' ||
    t === 'feature' ||
    t === 'tvmovie' ||
    t === 'short' ||
    t === 'video' ||
    t === 'tvspecial'
  ) {
    return { kind: 'movie', mediaType: 'movie' };
  }
  return { skipReason: `Unsupported IMDb title type (${rawTitleType})` };
}

function parseImdbAccountExportCsv(
  rows: string[][],
  headers: Record<string, number>,
  fileName = ''
): ParsedImportBatch {
  const skipped: SkippedImportRow[] = [];
  const byId = new Map<string, ImportCandidate>();
  const hasRatingCol = headers['rating'] !== undefined || headers['yourrating'] !== undefined;
  const isWatchlist = fileName.toLowerCase().includes('watchlist');

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rawId = cell(r, headers, 'Title ID', 'Const').toLowerCase();
    if (!rawId) continue;

    if (!/^tt\d{5,12}$/.test(rawId)) {
      skipped.push({
        rowNumber: i + 1,
        title: rawId,
        reason: 'Not a valid IMDb title ID (expected tt...)',
      });
      continue;
    }

    const ratingRaw = cell(r, headers, 'Rating', 'Your Rating');
    const userRating = parseRatingTenToFive(ratingRaw);
    const dateStr = cell(r, headers, 'Last Modified Date', 'Date Rated', 'Created') || undefined;

    const existing = byId.get(rawId);
    if (existing) {
      const existingDate = existing.dateStr || '';
      const nextDate = dateStr || '';
      if (nextDate > existingDate || (!existing.userRating && userRating)) {
        byId.set(rawId, {
          ...existing,
          userRating: userRating ?? existing.userRating,
          dateStr: nextDate || existing.dateStr,
        });
      }
      continue;
    }

    byId.set(rawId, {
      tempId: `imdb-${rawId}`,
      kind: 'movie',
      domain: 'watch',
      mediaType: 'movie',
      title: rawId,
      year: parseYear(dateStr || '', 2024),
      externalConst: rawId,
      url: `https://www.imdb.com/title/${rawId}/`,
      genres: [],
      userRating,
      completed: isWatchlist ? false : Boolean(userRating || hasRatingCol),
      dateStr,
      needsResolution: true,
      rowNumber: i + 1,
    });
  }

  const candidates = Array.from(byId.values()).sort((a, b) =>
    (b.dateStr || '').localeCompare(a.dateStr || '')
  );

  if (candidates.length === 0 && skipped.length === 0) {
    return {
      source: 'unknown',
      sourceLabel: 'IMDb Account Export',
      candidates: [],
      skipped: [],
      error: 'No IMDb Title IDs (tt...) found in this CSV.',
    };
  }

  return {
    source: 'imdb-account-export',
    sourceLabel: 'IMDb Account Export (IDs)',
    candidates,
    skipped,
    needsIdResolution: candidates.length > 0,
  };
}

export function applyResolvedImdbBatch(
  batch: ParsedImportBatch,
  resolvedMap: Record<string, ResolvedImdbTitle | null>
): ParsedImportBatch {
  const nextCandidates: ImportCandidate[] = [];
  const nextSkipped = [...batch.skipped];

  for (const c of batch.candidates) {
    if (!c.needsResolution || !c.externalConst) {
      nextCandidates.push(c);
      continue;
    }

    const id = c.externalConst.toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(resolvedMap, id)) {
      nextCandidates.push(c);
      continue;
    }

    const info = resolvedMap[id];
    if (!info || !info.title) {
      nextSkipped.push({
        rowNumber: c.rowNumber || 0,
        title: id,
        reason: 'Title ID not found on IMDb',
      });
      continue;
    }

    const classified = classifyImdbRow(info.qid || info.q || '', info.title, []);
    if ('skipReason' in classified) {
      nextSkipped.push({
        rowNumber: c.rowNumber || 0,
        title: `${info.title} (${id})`,
        reason: classified.skipReason,
      });
      continue;
    }

    nextCandidates.push({
      ...c,
      title: info.title,
      year: info.year || c.year,
      kind: classified.kind,
      domain: classified.kind === 'game' ? 'play' : 'watch',
      mediaType: classified.mediaType,
      posterUrl: info.posterUrl || '',
      creator: info.cast || c.creator,
      genres: [
        classified.mediaType === 'anime'
          ? 'Anime'
          : classified.kind === 'game'
            ? 'Video Game'
            : classified.kind === 'show'
              ? 'Series'
              : 'Feature Film',
      ],
      needsResolution: false,
    });
  }

  const stillPending = nextCandidates.some((c) => Boolean(c.needsResolution));
  return {
    ...batch,
    sourceLabel: stillPending ? 'IMDb Account Export (IDs)' : 'IMDb Account Export',
    candidates: nextCandidates,
    skipped: nextSkipped,
    needsIdResolution: stillPending,
  };
}

function parseImdbCsv(rows: string[][], headers: Record<string, number>, fileName = ''): ParsedImportBatch {
  const hasYourRating = headers['yourrating'] !== undefined || headers['daterated'] !== undefined;
  const isWatchlistFile = fileName.toLowerCase().includes('watchlist');
  const hasPosition = headers['position'] !== undefined;
  const source: ImportSourceType = hasYourRating
    ? 'imdb-ratings'
    : isWatchlistFile
      ? 'imdb-watchlist'
      : hasPosition
        ? 'imdb-list'
        : 'imdb-watchlist';
  const sourceLabel =
    source === 'imdb-ratings'
      ? 'IMDb Ratings CSV'
      : source === 'imdb-list'
        ? 'IMDb List CSV'
        : 'IMDb Watchlist CSV';

  const candidates: ImportCandidate[] = [];
  const skipped: SkippedImportRow[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const title = cell(r, headers, 'Title', 'Original Title');
    if (!title) continue;

    const rawType = cell(r, headers, 'Title Type');
    const genresRaw = cell(r, headers, 'Genres');
    const genres = genresRaw
      ? genresRaw.split(',').map((g) => g.trim()).filter(Boolean)
      : [];

    const classified = classifyImdbRow(rawType, title, genres);
    if ('skipReason' in classified) {
      skipped.push({ rowNumber: i + 1, title, reason: classified.skipReason });
      continue;
    }

    const imdbId = cell(r, headers, 'Const');
    const dedupeKey = imdbId || `${classified.kind}:${normalizeImportTitle(title)}`;
    if (seen.has(dedupeKey)) {
      skipped.push({ rowNumber: i + 1, title, reason: 'Duplicate row inside CSV' });
      continue;
    }
    seen.add(dedupeKey);

    const yourRating = parseRatingTenToFive(cell(r, headers, 'Your Rating'));
    const dateRated = cell(r, headers, 'Date Rated');
    const imdbRating = Number(cell(r, headers, 'IMDb Rating')) || undefined;
    const runtime = Number(cell(r, headers, 'Runtime (mins)')) || undefined;
    const year = parseYear(cell(r, headers, 'Year', 'Release Date'));
    const directors = cell(r, headers, 'Directors');
    const desc = cell(r, headers, 'Description');

    const completed = Boolean(yourRating || dateRated || (hasYourRating && !isWatchlistFile));
    const domain = classified.kind === 'game' ? 'play' : 'watch';

    candidates.push({
      tempId: imdbId ? `imdb-${imdbId}` : `imp-${i}-${normalizeImportTitle(title).slice(0, 16)}`,
      kind: classified.kind,
      domain,
      mediaType: classified.mediaType,
      title,
      year,
      externalConst: imdbId || undefined,
      url: cell(r, headers, 'URL') || undefined,
      genres: genres.length > 0 ? genres.slice(0, 3) : [classified.kind === 'game' ? 'Video Game' : 'Drama'],
      creator: directors || undefined,
      runtime,
      communityRating: imdbRating,
      userRating: yourRating,
      completed,
      dateStr: dateRated || cell(r, headers, 'Release Date', 'Created') || undefined,
      overview: desc || undefined,
    });
  }

  return { source, sourceLabel, candidates, skipped };
}

function parseLetterboxdCsv(rows: string[][], headers: Record<string, number>, fileName = ''): ParsedImportBatch {
  const isWatchlist = fileName.toLowerCase().includes('watchlist');
  const candidates: ImportCandidate[] = [];
  const skipped: SkippedImportRow[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const title = cell(r, headers, 'Name', 'Title');
    if (!title) continue;
    const year = parseYear(cell(r, headers, 'Year'));
    const key = `${normalizeImportTitle(title)}::${year}`;
    if (seen.has(key)) {
      skipped.push({ rowNumber: i + 1, title, reason: 'Duplicate row inside CSV' });
      continue;
    }
    seen.add(key);

    const rating = parseStarRatingFive(cell(r, headers, 'Rating'));
    const watchedDate = cell(r, headers, 'Watched Date', 'Date');
    const completed = !isWatchlist && (Boolean(rating || watchedDate) || !fileName.toLowerCase().includes('watchlist'));

    candidates.push({
      tempId: `lb-${i}-${normalizeImportTitle(title).slice(0, 16)}`,
      kind: 'movie',
      domain: 'watch',
      mediaType: 'movie',
      title,
      year,
      url: cell(r, headers, 'Letterboxd URI', 'URL') || undefined,
      genres: ['Feature Film'],
      userRating: rating,
      completed,
      dateStr: watchedDate || undefined,
    });
  }

  return {
    source: 'letterboxd',
    sourceLabel: 'Letterboxd CSV',
    candidates,
    skipped,
  };
}

function parseGoodreadsCsv(rows: string[][], headers: Record<string, number>): ParsedImportBatch {
  const candidates: ImportCandidate[] = [];
  const skipped: SkippedImportRow[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rawTitle = cell(r, headers, 'Title');
    if (!rawTitle) continue;
    const cleanTitle = rawTitle.replace(/\s*\([^)]*#\d+[^)]*\)\s*$/, '').trim() || rawTitle;
    const key = normalizeImportTitle(cleanTitle);
    if (seen.has(key)) {
      skipped.push({ rowNumber: i + 1, title: cleanTitle, reason: 'Duplicate row inside CSV' });
      continue;
    }
    seen.add(key);

    const author = cell(r, headers, 'Author', 'Author l-f');
    const shelf = cell(r, headers, 'Exclusive Shelf', 'Bookshelves').toLowerCase();
    const binding = cell(r, headers, 'Binding').toLowerCase();
    const pages = Number(cell(r, headers, 'Number of Pages')) || 320;
    const year = parseYear(cell(r, headers, 'Original Publication Year', 'Year Published'));
    const myRating = parseStarRatingFive(cell(r, headers, 'My Rating'));
    const readStatus: ImportCandidate['readStatus'] = shelf.includes('currently')
      ? 'reading'
      : shelf === 'read'
        ? 'finished'
        : 'want_to_read';

    const looksManga = shelf.includes('manga') || binding.includes('manga');
    const looksComic =
      shelf.includes('comic') || shelf.includes('graphic') || binding.includes('graphic novel');
    const mediaType: ImportCandidate['mediaType'] = looksManga
      ? 'manga'
      : looksComic
        ? 'comic'
        : 'novel';

    const totalUnits =
      mediaType === 'comic'
        ? Math.max(4, Math.min(80, Math.round(pages / 24)))
        : Math.max(8, Math.min(120, Math.round(pages / 14)));

    candidates.push({
      tempId: `gr-${i}-${key.slice(0, 16)}`,
      kind: 'read',
      domain: 'read',
      mediaType,
      title: cleanTitle,
      year,
      genres: [mediaType === 'comic' ? 'Comics' : mediaType === 'manga' ? 'Manga' : 'Fiction'],
      creator: author || 'Author',
      userRating: myRating,
      completed: readStatus === 'finished',
      readStatus,
      totalUnits,
      dateStr: cell(r, headers, 'Date Read', 'Date Added') || undefined,
    });
  }

  return {
    source: 'goodreads',
    sourceLabel: 'Goodreads Library CSV',
    candidates,
    skipped,
  };
}

function parseJsonImport(rawText: string): ParsedImportBatch {
  const parsed = JSON.parse(rawText);

  if (parsed?.app === 'cue' && parsed?.state?.shows && parsed?.state?.readItems) {
    const s = parsed.state as CueStoreState;
    const preview: ImportCandidate[] = [
      ...(s.showOrder || []).slice(0, 50).map((id) => ({
        tempId: `bak-s-${id}`,
        kind: 'show' as const,
        domain: 'watch' as const,
        mediaType: s.shows[id]?.mediaType || ('tv' as const),
        title: s.shows[id]?.title || id,
        year: s.shows[id]?.year || 2024,
        genres: s.shows[id]?.genres || [],
        completed: s.showProgress[id]?.status === 'finished',
      })),
    ];
    return {
      source: 'cue-backup',
      sourceLabel: 'Cue Backup JSON',
      candidates: preview,
      skipped: [],
      cueBackupState: s,
    };
  }

  const candidates: ImportCandidate[] = [];
  const skipped: SkippedImportRow[] = [];
  const seen = new Set<string>();

  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;

    const showObj =
      obj.show && typeof obj.show === 'object' ? (obj.show as Record<string, unknown>) : null;
    const movieObj =
      obj.movie && typeof obj.movie === 'object' ? (obj.movie as Record<string, unknown>) : null;

    const showTitle =
      (typeof obj.series_name === 'string' && obj.series_name) ||
      (typeof obj.show_title === 'string' && obj.show_title) ||
      (showObj && typeof showObj.title === 'string' ? showObj.title : '');
    const movieTitle =
      (typeof obj.movie_title === 'string' && obj.movie_title) ||
      (movieObj && typeof movieObj.title === 'string' ? movieObj.title : '');

    if (showTitle) {
      const k = `show:${normalizeImportTitle(showTitle)}`;
      if (!seen.has(k)) {
        seen.add(k);
        const yearVal = Number(showObj?.year || obj.year) || 2024;
        candidates.push({
          tempId: `json-s-${candidates.length}`,
          kind: 'show',
          domain: 'watch',
          mediaType: 'tv',
          title: showTitle,
          year: yearVal,
          genres: ['Series'],
          userRating: parseRatingTenToFive(String(obj.rating || '')),
          completed: Boolean(obj.completed || obj.last_watched_at),
        });
      }
      return;
    }

    if (movieTitle) {
      const k = `movie:${normalizeImportTitle(movieTitle)}`;
      if (!seen.has(k)) {
        seen.add(k);
        const yearVal = Number(movieObj?.year || obj.year) || 2024;
        candidates.push({
          tempId: `json-m-${candidates.length}`,
          kind: 'movie',
          domain: 'watch',
          mediaType: 'movie',
          title: movieTitle,
          year: yearVal,
          genres: ['Feature Film'],
          userRating: parseRatingTenToFive(String(obj.rating || '')),
          completed: Boolean(obj.watched_at || obj.plays),
        });
      }
      return;
    }

    if (typeof obj.title === 'string' && obj.title.trim()) {
      const k = `movie:${normalizeImportTitle(obj.title)}`;
      if (!seen.has(k)) {
        seen.add(k);
        const isShow = String(obj.type || obj.media_type || '').toLowerCase().includes('show');
        candidates.push({
          tempId: `json-g-${candidates.length}`,
          kind: isShow ? 'show' : 'movie',
          domain: 'watch',
          mediaType: isShow ? 'tv' : 'movie',
          title: obj.title.trim(),
          year: Number(obj.year) || 2024,
          genres: [isShow ? 'Series' : 'Feature Film'],
          userRating: parseRatingTenToFive(String(obj.rating || '')),
          completed: Boolean(obj.watched || obj.watched_at),
        });
      }
      return;
    }

    Object.values(obj).forEach(visit);
  };

  visit(parsed);

  if (candidates.length === 0) {
    return {
      source: 'unknown',
      sourceLabel: 'JSON Archive',
      candidates: [],
      skipped,
      error: 'No recognizable show, movie, or Cue backup entries found in this JSON file.',
    };
  }

  return {
    source: 'trakt-tvtime-json',
    sourceLabel: 'Trakt / TV Time JSON',
    candidates,
    skipped,
  };
}

export function parseImportFile(rawText: string, fileName = ''): ParsedImportBatch {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return {
      source: 'unknown',
      sourceLabel: 'Empty Input',
      candidates: [],
      skipped: [],
      error: 'Select a CSV/JSON export or paste CSV text to preview.',
    };
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return parseJsonImport(trimmed);
    } catch {
      return {
        source: 'unknown',
        sourceLabel: 'Invalid JSON',
        candidates: [],
        skipped: [],
        error: 'Malformed JSON file or pasted text.',
      };
    }
  }

  const rows = parseCsvRows(trimmed);
  if (rows.length < 2) {
    return {
      source: 'unknown',
      sourceLabel: 'CSV File',
      candidates: [],
      skipped: [],
      error: 'CSV needs a header row and at least one media row.',
    };
  }

  const headers = buildHeaderIndex(rows[0]);

  if (
    headers['const'] !== undefined ||
    headers['titletype'] !== undefined ||
    headers['imdbrating'] !== undefined ||
    headers['yourrating'] !== undefined
  ) {
    return parseImdbCsv(rows, headers, fileName);
  }

  if (headers['titleid'] !== undefined) {
    if (headers['prompttype'] !== undefined || headers['dismissaldate'] !== undefined) {
      return {
        source: 'unknown',
        sourceLabel: 'IMDb Dismissals Log',
        candidates: [],
        skipped: [],
        error:
          'This looks like an IMDb recommendation dismissals log (IMDbPersonalization.Dismissals.csv). Upload IMDbRatings.UserRatings.csv or a Watchlist/List export instead.',
      };
    }
    return parseImdbAccountExportCsv(rows, headers, fileName);
  }

  if (
    headers['letterboxduri'] !== undefined ||
    (headers['name'] !== undefined && headers['year'] !== undefined)
  ) {
    return parseLetterboxdCsv(rows, headers, fileName);
  }

  if (headers['exclusiveshelf'] !== undefined || headers['authorlf'] !== undefined || headers['bookid'] !== undefined) {
    return parseGoodreadsCsv(rows, headers);
  }

  // Generic Title + Type fallback CSV
  if (headers['title'] !== undefined) {
    return parseImdbCsv(rows, headers, fileName);
  }

  return {
    source: 'unknown',
    sourceLabel: 'Unrecognized CSV',
    candidates: [],
    skipped: [],
    error: 'Unrecognized CSV headers. Supported formats: IMDb CSV, Letterboxd CSV, Goodreads CSV, and JSON backups.',
  };
}

export function annotateImportDuplicates(
  candidates: ImportCandidate[],
  state: CueStoreState
): ImportCandidate[] {
  const showByTitle = new Map<string, { id: string; title: string }>();
  const showByImdb = new Map<string, { id: string; title: string }>();
  for (const id of state.showOrder) {
    const s = state.shows[id];
    if (!s) continue;
    const norm = normalizeImportTitle(s.title);
    if (norm && !showByTitle.has(norm)) showByTitle.set(norm, { id, title: s.title });
    const tt = id.match(/(tt\d{5,12})/i)?.[1]?.toLowerCase();
    if (tt) showByImdb.set(tt, { id, title: s.title });
  }

  const movieByTitle = new Map<string, Array<{ id: string; title: string; year: number }>>();
  const movieByImdb = new Map<string, { id: string; title: string }>();
  for (const id of state.movieOrder) {
    const m = state.movies[id];
    if (!m) continue;
    const norm = normalizeImportTitle(m.title);
    if (norm) {
      const list = movieByTitle.get(norm) || [];
      list.push({ id, title: m.title, year: m.year || 0 });
      movieByTitle.set(norm, list);
    }
    const tt = id.match(/(tt\d{5,12})/i)?.[1]?.toLowerCase();
    if (tt) movieByImdb.set(tt, { id, title: m.title });
  }

  const readByTitle = new Map<string, { id: string; title: string }>();
  for (const id of state.readOrder) {
    const r = state.readItems[id];
    if (!r) continue;
    const norm = normalizeImportTitle(r.title);
    if (norm && !readByTitle.has(norm)) readByTitle.set(norm, { id, title: r.title });
  }

  const gameByTitle = new Map<string, { id: string; title: string }>();
  const gameByImdb = new Map<string, { id: string; title: string }>();
  for (const id of state.gameOrder) {
    const g = state.games[id];
    if (!g) continue;
    const norm = normalizeImportTitle(g.title);
    if (norm && !gameByTitle.has(norm)) gameByTitle.set(norm, { id, title: g.title });
    const tt = id.match(/(tt\d{5,12})/i)?.[1]?.toLowerCase();
    if (tt) gameByImdb.set(tt, { id, title: g.title });
  }

  return candidates.map((c) => {
    const ext = c.externalConst?.toLowerCase();
    const cNorm = normalizeImportTitle(c.title);

    if (ext) {
      const idMatch = showByImdb.get(ext) || movieByImdb.get(ext) || gameByImdb.get(ext);
      if (idMatch) {
        return { ...c, existingId: idMatch.id, existingTitle: idMatch.title };
      }
    }

    if (c.needsResolution) return c;

    if (c.kind === 'show') {
      const match = showByTitle.get(cNorm);
      return match ? { ...c, existingId: match.id, existingTitle: match.title } : c;
    }
    if (c.kind === 'movie') {
      const list = movieByTitle.get(cNorm) || [];
      const match = list.find((m) => Math.abs((m.year || c.year) - c.year) <= 2);
      return match ? { ...c, existingId: match.id, existingTitle: match.title } : c;
    }
    if (c.kind === 'read') {
      const match = readByTitle.get(cNorm);
      return match ? { ...c, existingId: match.id, existingTitle: match.title } : c;
    }
    const match = gameByTitle.get(cNorm);
    return match ? { ...c, existingId: match.id, existingTitle: match.title } : c;
  });
}

export function buildFallbackShow(c: ImportCandidate): Show {
  const id = slugifyImportId('imp-show', c.title, c.externalConst);
  const runtime = c.runtime || 45;
  const poster = c.posterUrl || '';
  return {
    id,
    title: c.title,
    year: c.year,
    genres: c.genres.length > 0 ? c.genres : [c.mediaType === 'anime' ? 'Anime' : 'Drama'],
    rating: c.communityRating || 7.8,
    mediaType: c.mediaType === 'anime' ? 'anime' : 'tv',
    posterUrl: poster,
    backdropUrl: poster,
    overview: c.overview || `${c.title} (${c.year}).`,
    runtimeAvg: runtime,
    network: 'Streaming',
    totalEpisodes: 1,
    seasons: [
      {
        number: 1,
        episodes: [
          {
            id: `${id}-s1e1`,
            season: 1,
            number: 1,
            title: 'Episode 1',
            airdate: `${c.year}-01-01`,
            runtime,
            stillUrl: poster,
            overview: '',
          },
        ],
      },
    ],
    cast: [],
  };
}

export function buildFallbackMovie(c: ImportCandidate): Movie {
  const id = slugifyImportId('imp-movie', c.title, c.externalConst);
  const poster = c.posterUrl || '';
  return {
    id,
    title: c.title,
    year: c.year,
    genres: c.genres.length > 0 ? c.genres : ['Feature Film'],
    rating: c.communityRating || 7.8,
    runtime: c.runtime || 120,
    director: c.creator || 'Feature Film',
    posterUrl: poster,
    backdropUrl: poster,
    overview: c.overview || `${c.title} (${c.year}).`,
    releaseDate: `${c.year}-01-01`,
    cast: [],
  };
}

export function buildFallbackReadItem(c: ImportCandidate): ReadItem {
  const id = slugifyImportId('imp-read', c.title, c.externalConst);
  const format = c.mediaType === 'manga' ? 'manga' : c.mediaType === 'comic' ? 'comic' : 'novel';
  const totalUnits = c.totalUnits || (format === 'comic' ? 12 : format === 'manga' ? 100 : 24);
  const cover = c.posterUrl || '';
  return {
    id,
    format,
    unit: format === 'comic' ? 'issues' : 'chapters',
    title: c.title,
    creator: c.creator || 'Author',
    year: c.year,
    totalUnits,
    baseTotalUnits: totalUnits,
    genres: c.genres.length > 0 ? c.genres : ['Fiction'],
    rating: c.communityRating ? Number((c.communityRating / 2).toFixed(1)) : 4.3,
    coverUrl: cover,
    backdropUrl: cover,
    overview: c.overview || `${c.title} by ${c.creator || 'Author'}.`,
  };
}

export function buildFallbackGameItem(c: ImportCandidate): GameItem {
  const id = slugifyImportId('imp-game', c.title, c.externalConst);
  const known = lookupKnownGameChapters(c.title);
  const cover = c.posterUrl || '';
  return {
    id,
    title: c.title,
    developer: c.creator || 'Studio',
    year: c.year,
    genres: c.genres.length > 0 ? c.genres : ['Video Game'],
    rating: c.communityRating ? Number((c.communityRating / 2).toFixed(1)) : 4.5,
    platforms: ['PC', 'PS5'],
    coverUrl: cover,
    backdropUrl: cover,
    overview: c.overview || `${c.title} (${c.year}).`,
    totalChapters: known?.totalChapters,
    chapterUnit: known?.unit,
    chapterSource: known?.source,
    chapterNote: known?.note,
  };
}
