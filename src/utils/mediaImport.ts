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

const MANGA_PUBLISHERS = [
  'viz',
  'shueisha',
  '集英社',
  'kodansha',
  '講談社',
  'shogakukan',
  '小学館',
  'yen press',
  'seven seas',
  'square enix',
  'tokyopop',
  'del rey manga',
  'dark horse manga',
  'panini manga',
  'sublime',
  'denpa',
  'udon',
  'hakusensha',
  '白泉社',
  'kadokawa',
  '角川',
  'akita shoten',
  '秋田書店',
  'futabasha',
  'one peace books',
  'ghost ship',
  'vertical comics',
  'glenat',
  'kurokawa',
];

const MANGA_SERIES_AND_CREATORS = [
  'dragon ball',
  'one piece',
  'naruto',
  'boruto',
  'bleach',
  'berserk',
  'vagabond',
  'vinland saga',
  'chainsaw man',
  'jujutsu kaisen',
  'demon slayer',
  'attack on titan',
  'my hero academia',
  'death note',
  'hunter x hunter',
  'fullmetal alchemist',
  'tokyo ghoul',
  '20th century boys',
  'akira',
  'one-punch man',
  'one punch man',
  'frieren',
  'dandadan',
  'spy x family',
  'solo leveling',
  'slam dunk',
  'haikyu',
  'blue lock',
  'sakamoto days',
  'kagurabachi',
  'jojo',
  'mob psycho',
  'neon genesis evangelion',
  'sailor moon',
  'akira toriyama',
  'eiichiro oda',
  'kentaro miura',
  'naoki urasawa',
  'takehiko inoue',
  'tatsuki fujimoto',
  'gege akutami',
  'hajime isayama',
  'masashi kishimoto',
  'tite kubo',
  'hiromu arakawa',
  'junji ito',
  'katsuhiro otomo',
  'kohei horikoshi',
  'koyoharu gotouge',
  'toyotaro',
];

const COMIC_PUBLISHERS = [
  'marvel',
  'dc comics',
  'dc black label',
  'vertigo',
  'wildstorm',
  'image comics',
  'dark horse',
  'idw',
  'boom! studios',
  'boom studios',
  'valiant',
  'dynamite',
  'oni press',
  'archie',
  'titan comics',
  'top cow',
  'skybound',
  'aftershock',
  'fantagraphics',
  'drawn & quarterly',
  'first second',
  'humanoids',
  'zenescope',
  'panini',
  '2000 ad',
  'rebellion',
  'black mask',
  'awa studios',
  'dstlry',
  'mad cave',
  'ghost machine',
  'icon comics',
  'max comics',
  'milestone',
  'young animal',
  'avatar press',
  'crossgen',
  'vault comics',
  'scout comics',
  'bad idea',
  'magnetic press',
  'abrams comicarts',
];

const COMIC_FRANCHISE_KEYWORDS = [
  'avengers',
  'x-men',
  'uncanny x',
  'astonishing x',
  'new x-men',
  'all-new x',
  'house of x',
  'powers of x',
  'x-force',
  'x-factor',
  'wolverine',
  'spider-man',
  'spiderman',
  'spider-gwen',
  'spider-verse',
  'venom',
  'carnage',
  'daredevil',
  'punisher',
  'hawkeye',
  'hulk',
  'she-hulk',
  'skaar',
  'iron man',
  'captain america',
  'thor:',
  'the mighty thor',
  'loki:',
  'fantastic four',
  'silver surfer',
  'doctor strange',
  'black panther',
  'black widow',
  'moon knight',
  'deadpool',
  'ant-man',
  'guardians of the galaxy',
  'ms. marvel',
  'captain marvel',
  'jessica jones',
  'luke cage',
  'iron fist',
  'ghost rider',
  'scarlet witch',
  'eternals',
  'inhumans',
  'runaways',
  'young avengers',
  'thunderbolts',
  'secret wars',
  'civil war',
  'infinity gauntlet',
  'infinity war',
  'dark reign',
  'annihilation',
  'house of m',
  'planet hulk',
  'world war hulk',
  'old man logan',
  'patsy walker',
  'hellcat',
  'gwenpool',
  'miles morales',
  'batman',
  'superman',
  'wonder woman',
  'justice league',
  'green lantern',
  'the flash',
  'flash:',
  'aquaman',
  'nightwing',
  'batgirl',
  'batwoman',
  'supergirl',
  'teen titans',
  'suicide squad',
  'harley quinn',
  'joker',
  'catwoman',
  'green arrow',
  'hellblazer',
  'swamp thing',
  'watchmen',
  'injustice',
  'kingdom come',
  'crisis on infinite earths',
  'final crisis',
  'infinite crisis',
  'dark nights',
  'flashpoint',
  'blackest night',
  'all-star superman',
  'doom patrol',
  'transmetropolitan',
  'preacher',
  'fables',
  'y: the last man',
  'invincible',
  'walking dead',
  'monstress',
  'spawn',
  'hellboy',
  'sin city',
  'scott pilgrim',
  'east of west',
  'descender',
  'paper girls',
  'black science',
  'deadly class',
  'something is killing the children',
  'power rangers',
  'mighty morphin',
  'teenage mutant ninja turtles',
  'tmnt',
  'grimm fairy tales',
  'hack/slash',
  'kick-ass',
  'the boys',
  'umbrella academy',
  'locke & key',
  'dark phoenix',
  'days of future past',
  'winter soldier',
  'galactus',
  'thanos',
  'ultron',
  'doctor doom',
  'magneto',
  'elektra',
  'ultimates',
  'ultimate spider',
  'ultimate x-men',
  'marvels',
  'marvel 1602',
  'marvel zombies',
];

const COMIC_CREATORS = [
  'jonathan hickman',
  'matt fraction',
  'brian michael bendis',
  'ed brubaker',
  'chris claremont',
  'al ewing',
  'mark millar',
  'jeph loeb',
  'tom king',
  'tom taylor',
  'peter j. tomasi',
  'greg pak',
  'jeff parker',
  'paul jenkins',
  'jed mackay',
  'kathryn immonen',
  'stuart immonen',
  'marjorie m. liu',
  'marjorie liu',
  'tini howard',
  'kyle higgins',
  'melissa flores',
  'joe brusha',
  'geoff johns',
  'grant morrison',
  'scott snyder',
  'alan moore',
  'frank miller',
  'robert kirkman',
  'brian k. vaughan',
  'chip zdarsky',
  'donny cates',
  'garth ennis',
  'warren ellis',
  'mark waid',
  'jason aaron',
  'kieron gillen',
  'kelly thompson',
  'dan slott',
  'stan lee',
  'jack kirby',
  'jim starlin',
  'walt simonson',
  'peter david',
  'kurt busiek',
  'alex ross',
  'jim lee',
  'todd mcfarlane',
  'mike mignola',
  'jeff lemire',
  'rick remender',
  'joshua williamson',
  'james tynion',
  'ram v',
  'gail simone',
  'kelly sue deconnick',
  'g. willow wilson',
  'saladin ahmed',
  'charles soule',
  'nick spencer',
  'gerry duggan',
  'benjamin percy',
  'ryan north',
  'daniel warren johnson',
  'sean murphy',
  'greg rucka',
  'paul dini',
  "dennis o'neil",
  'marv wolfman',
  'george perez',
  'john byrne',
  'roy thomas',
  'roger stern',
  'j.m. dematteis',
  'david michelinie',
  'fabian nicieza',
  'joe kelly',
  'zeb wells',
  'christopher priest',
  'cullen bunn',
  'dennis hopeless',
  'eve l. ewing',
  'declan shalvey',
  'si spurrier',
  'mike carey',
  'craig kyle',
  'christopher yost',
  'darwyn cooke',
  'tim sale',
  'david aja',
  'steve mcniven',
  'esad ribic',
  'pepe larraz',
  'ryan stegman',
];

function normalizeFoldLower(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCleanIsbn(raw: string): string {
  const cleaned = raw.replace(/[^0-9Xx]/g, '').toUpperCase();
  if (cleaned.length === 13 || cleaned.length === 10) return cleaned;
  return '';
}

export function classifyReadFormat(input: {
  title: string;
  author?: string;
  additionalAuthors?: string;
  publisher?: string;
  binding?: string;
  bookshelves?: string;
  exclusiveShelf?: string;
  genres?: string[];
}): 'comic' | 'manga' | 'novel' {
  const titleNorm = normalizeFoldLower(input.title || '');
  const titleNoParens = titleNorm.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const pubNorm = normalizeFoldLower(input.publisher || '');
  const creatorNorm = normalizeFoldLower(
    [input.author, input.additionalAuthors].filter(Boolean).join(' ')
  );
  const shelfAndBind = normalizeFoldLower(
    [input.bookshelves, input.exclusiveShelf, input.binding, ...(input.genres || [])]
      .filter(Boolean)
      .join(' ')
  );

  // 1. Explicit shelf / binding / genre tags
  if (/\b(manga|tankobon|manhwa|manhua|shonen|seinen|shojo|shoujo|webtoon)\b/.test(shelfAndBind)) {
    return 'manga';
  }
  if (
    /\b(comics?|graphic[\s-]?novels?|trade paperback|tpb|floppies|bande dessinee)\b/.test(
      shelfAndBind
    )
  ) {
    return 'comic';
  }

  // 2. Manga publishers, Japanese script titles, or known manga series/mangaka
  const hasCjk = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(
    `${input.title || ''} ${input.publisher || ''} ${input.author || ''}`
  );
  if (
    hasCjk ||
    MANGA_PUBLISHERS.some((p) => pubNorm.includes(p)) ||
    /\bmanga\b/.test(pubNorm) ||
    MANGA_SERIES_AND_CREATORS.some((k) => titleNorm.includes(k) || creatorNorm.includes(k))
  ) {
    return 'manga';
  }

  // 3. Comic publishers
  const isExactDcOrImagePub = pubNorm === 'dc' || pubNorm === 'image' || /\bdc\s+comics?\b/.test(pubNorm);
  if (
    isExactDcOrImagePub ||
    COMIC_PUBLISHERS.some((p) => pubNorm.includes(p)) ||
    /\bcomics?\b/.test(pubNorm)
  ) {
    return 'comic';
  }

  // 4. Comic single-issue numbering outside parens (e.g. "Superman: Rebirth (2016) #1")
  if (/(?:^|\s)#\d{1,4}\b/.test(titleNoParens)) {
    return 'comic';
  }

  // 5. Collected comic format keywords, comic franchises, or curated comic-only writers
  if (
    /\b(omnibus|complete collection|epic collection|masterworks|dc compact|absolute edition|trade paperback|tpb|graphic novel)\b/.test(
      titleNorm
    ) ||
    COMIC_FRANCHISE_KEYWORDS.some((kw) => titleNorm.includes(kw)) ||
    COMIC_CREATORS.some((cr) => creatorNorm.includes(cr))
  ) {
    return 'comic';
  }

  return 'novel';
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

    const author = cell(r, headers, 'Author', 'Author l-f').replace(/\s+/g, ' ').trim();
    const additionalAuthors = cell(r, headers, 'Additional Authors').replace(/\s+/g, ' ').trim();
    const publisher = cell(r, headers, 'Publisher');
    const exclusiveShelf = cell(r, headers, 'Exclusive Shelf').toLowerCase();
    const bookshelves = cell(r, headers, 'Bookshelves', 'Bookshelves with positions').toLowerCase();
    const binding = cell(r, headers, 'Binding');
    const isbn =
      extractCleanIsbn(cell(r, headers, 'ISBN13')) || extractCleanIsbn(cell(r, headers, 'ISBN'));
    const pages = Number(cell(r, headers, 'Number of Pages')) || 320;
    const year = parseYear(cell(r, headers, 'Original Publication Year', 'Year Published'));
    const myRating = parseStarRatingFive(cell(r, headers, 'My Rating'));

    const shelfState = exclusiveShelf || bookshelves;
    const readStatus: ImportCandidate['readStatus'] = shelfState.includes('currently')
      ? 'reading'
      : shelfState === 'read' || /\bread\b/.test(exclusiveShelf)
        ? 'finished'
        : 'want_to_read';

    const mediaType = classifyReadFormat({
      title: rawTitle,
      author,
      additionalAuthors,
      publisher,
      binding,
      bookshelves,
      exclusiveShelf,
    });

    const totalUnits =
      mediaType === 'comic'
        ? Math.max(4, Math.min(80, Math.round(pages / 24)))
        : mediaType === 'manga'
          ? Math.max(6, Math.min(120, Math.round(pages / 18)))
          : Math.max(8, Math.min(120, Math.round(pages / 14)));

    candidates.push({
      tempId: `gr-${i}-${key.slice(0, 16)}`,
      kind: 'read',
      domain: 'read',
      mediaType,
      title: cleanTitle,
      year,
      externalConst: isbn || undefined,
      posterUrl: isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false` : undefined,
      genres: [mediaType === 'comic' ? 'Comics' : mediaType === 'manga' ? 'Manga' : 'Fiction'],
      creator: author || 'Author',
      userRating: myRating,
      completed: readStatus === 'finished',
      readStatus,
      totalUnits,
      dateStr: cell(r, headers, 'Date Read', 'Date Added') || undefined,
      overview: publisher ? `${cleanTitle} · Published by ${publisher}.` : undefined,
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

export function canonicalImportReadKey(rawTitle: string): string {
  let s = rawTitle
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ');

  const colonIdx = s.indexOf(':');
  if (colonIdx > 4) {
    const afterColon = s.slice(colonIdx + 1);
    const volSuffix = afterColon.match(/\b(?:vol(?:ume)?\.?\s*\d+|book\s+\d+|#\d+)\b/i);
    s = volSuffix ? `${s.slice(0, colonIdx)} ${volSuffix[0]}` : s.slice(0, colonIdx);
  }

  return s
    .replace(/\b(?:volume)\b/g, 'vol')
    .replace(
      /\b(?:omnibus|compendium|complete collection|epic collection|deluxe edition|collector'?s? edition|trade paperback|tpb|hardcover|hc|paperback|box set|edition|printing)\b/g,
      ' '
    )
    .replace(/[:\-–—_.,!?'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
  const readByCanonical = new Map<string, { id: string; title: string }>();
  const readByIsbn = new Map<string, { id: string; title: string }>();
  for (const id of state.readOrder) {
    const r = state.readItems[id];
    if (!r) continue;
    const norm = normalizeImportTitle(r.title);
    if (norm && !readByTitle.has(norm)) readByTitle.set(norm, { id, title: r.title });
    const canon = canonicalImportReadKey(r.title);
    if (canon && !readByCanonical.has(canon)) readByCanonical.set(canon, { id, title: r.title });
    const isbnFromField = r.isbn ? extractCleanIsbn(r.isbn) : '';
    const isbnFromId = extractCleanIsbn(id.match(/(97[89]\d{10}|\d{9}[0-9Xx])/)?.[1] || '');
    for (const code of [isbnFromField, isbnFromId]) {
      if (code && !readByIsbn.has(code)) readByIsbn.set(code, { id, title: r.title });
    }
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
      if (c.kind === 'read') {
        const candIsbn = extractCleanIsbn(c.externalConst || '');
        const isbnMatch = candIsbn ? readByIsbn.get(candIsbn) : undefined;
        if (isbnMatch) {
          return { ...c, existingId: isbnMatch.id, existingTitle: isbnMatch.title };
        }
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
      const match =
        readByTitle.get(cNorm) || readByCanonical.get(canonicalImportReadKey(c.title));
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
  const baseGenres = c.genres.length > 0 ? [...c.genres] : [c.mediaType === 'anime' ? 'Anime' : 'Drama'];
  if (c.mediaType === 'anime' && !baseGenres.some((g) => g.toLowerCase() === 'anime')) {
    baseGenres.unshift('Anime');
  }
  return {
    id,
    title: c.title,
    year: c.year,
    genres: baseGenres,
    rating: c.communityRating || 7.8,
    mediaType: 'tv',
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
  const cleanIsbn = c.externalConst ? extractCleanIsbn(c.externalConst) : '';
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
    ...(cleanIsbn ? { isbn: cleanIsbn } : {}),
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
