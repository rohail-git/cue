import type { ComicEditionId, ReadItem } from '../types';

export interface ComicEditionOption {
  id: ComicEditionId;
  label: string;
  dcLabel?: string;
  subtitle: string;
}

export const COMIC_EDITIONS: ComicEditionOption[] = [
  {
    id: 'digital',
    label: 'Digital / Issues',
    subtitle: 'Single issues or digital reader',
  },
  {
    id: 'tpb',
    label: 'Standard TPB',
    subtitle: 'Trade paperback collection',
  },
  {
    id: 'compact',
    label: 'Compact Edition TPB',
    dcLabel: 'DC Compact TPB',
    subtitle: 'Pocket-sized softcover',
  },
  {
    id: 'hardcover',
    label: 'Hardcover',
    subtitle: 'Hardcover collection',
  },
  {
    id: 'absolute',
    label: 'Absolute / Omnibus',
    subtitle: 'Collector slipcase or omnibus',
  },
];

const DC_KEYWORDS = [
  'superman',
  'batman',
  'watchmen',
  'wonder woman',
  'justice league',
  'flash',
  'green lantern',
  'sandman',
  'aquaman',
  'teen titans',
  'supergirl',
  'catwoman',
  'far sector',
  'kingdom come',
  'dceased',
  'dc comics',
  'dc compact',
  'grant morrison',
  'geoff johns',
  'joshua williamson',
  'frank miller',
  'alan moore',
];

export interface KnownComicEditionSpec {
  availableEditions: ComicEditionId[];
  counts: Partial<Record<ComicEditionId, number>>;
  covers?: Partial<Record<ComicEditionId, string>>;
}

export const KNOWN_COMIC_EDITIONS: Record<string, KnownComicEditionSpec> = {
  'the flash rebirth': {
    availableEditions: ['digital', 'tpb', 'hardcover', 'compact'],
    counts: { digital: 6, tpb: 6, hardcover: 6, compact: 13 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781799507697',
      tpb: 'https://images.penguinrandomhouse.com/cover/9781401230012',
      hardcover: 'https://images.penguinrandomhouse.com/cover/9781401225681',
    },
  },
  'flash rebirth': {
    availableEditions: ['digital', 'tpb', 'hardcover', 'compact'],
    counts: { digital: 6, tpb: 6, hardcover: 6, compact: 13 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781799507697',
      tpb: 'https://images.penguinrandomhouse.com/cover/9781401230012',
      hardcover: 'https://images.penguinrandomhouse.com/cover/9781401225681',
    },
  },
  'all star superman': {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover', 'absolute'],
    counts: { digital: 12, tpb: 12, compact: 12, hardcover: 12, absolute: 12 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781779527257',
    },
  },
  watchmen: {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover', 'absolute'],
    counts: { digital: 12, tpb: 12, compact: 12, hardcover: 12, absolute: 12 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781779527325',
    },
  },
  'batman year one': {
    availableEditions: ['digital', 'tpb', 'hardcover', 'absolute'],
    counts: { digital: 4, tpb: 4, hardcover: 4, absolute: 4 },
  },
  'batman hush': {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover', 'absolute'],
    counts: { digital: 12, tpb: 12, compact: 12, hardcover: 12, absolute: 15 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781779527264',
    },
  },
  'batman the court of owls': {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover', 'absolute'],
    counts: { digital: 11, tpb: 7, compact: 11, hardcover: 11, absolute: 11 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781779527271',
    },
  },
  'batman the long halloween': {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover', 'absolute'],
    counts: { digital: 13, tpb: 13, compact: 13, hardcover: 13, absolute: 13 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781799502883',
    },
  },
  'kingdom come': {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover', 'absolute'],
    counts: { digital: 4, tpb: 4, compact: 4, hardcover: 4, absolute: 4 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781799501299',
    },
  },
  'supergirl woman of tomorrow': {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover'],
    counts: { digital: 8, tpb: 8, compact: 8, hardcover: 8 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781799506904',
    },
  },
  'superman birthright': {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover'],
    counts: { digital: 12, tpb: 12, compact: 12, hardcover: 12 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781799501916',
    },
  },
  'far sector': {
    availableEditions: ['digital', 'tpb', 'compact'],
    counts: { digital: 12, tpb: 12, compact: 12 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781779527295',
    },
  },
  dceased: {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover', 'absolute'],
    counts: { digital: 6, tpb: 6, compact: 8, hardcover: 6, absolute: 14 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781799501633',
    },
  },
  'american vampire': {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover', 'absolute'],
    counts: { digital: 11, tpb: 5, compact: 11, hardcover: 11, absolute: 34 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781779527349',
    },
  },
  'wonder woman earth one': {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover'],
    counts: { digital: 3, tpb: 3, compact: 9, hardcover: 9 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781779527332',
    },
  },
  'catwoman trail of the catwoman': {
    availableEditions: ['digital', 'tpb', 'compact'],
    counts: { digital: 9, tpb: 9, compact: 11 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781779527288',
    },
  },
  saga: {
    availableEditions: ['digital', 'tpb', 'hardcover', 'absolute'],
    counts: { digital: 72, tpb: 6, hardcover: 18, absolute: 54 },
  },
  invincible: {
    availableEditions: ['digital', 'tpb', 'hardcover', 'absolute'],
    counts: { digital: 144, tpb: 6, hardcover: 13, absolute: 47 },
  },
};

function normalizeEditionLookupKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[:\-–—_.,!?'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getKnownComicEditionSpec(title: string): KnownComicEditionSpec | undefined {
  const norm = normalizeEditionLookupKey(title);
  if (!norm) return undefined;
  if (KNOWN_COMIC_EDITIONS[norm]) {
    return KNOWN_COMIC_EDITIONS[norm];
  }
  const matchedKey = Object.keys(KNOWN_COMIC_EDITIONS).find(
    (k) => norm === k || norm.startsWith(`${k} `)
  );
  return matchedKey ? KNOWN_COMIC_EDITIONS[matchedKey] : undefined;
}

export function getKnownComicEditionCounts(
  title: string
): Partial<Record<ComicEditionId, number>> | undefined {
  const spec = getKnownComicEditionSpec(title);
  return spec ? { ...spec.counts } : undefined;
}

export function getKnownComicEditionCovers(
  title: string
): Partial<Record<ComicEditionId, string>> | undefined {
  const spec = getKnownComicEditionSpec(title);
  return spec?.covers ? { ...spec.covers } : undefined;
}

export function getAvailableComicEditions(
  item: Pick<ReadItem, 'title' | 'editionCovers' | 'editionIssueCounts'>,
  activeEdition?: ComicEditionId
): ComicEditionOption[] {
  const spec = getKnownComicEditionSpec(item.title);
  if (spec) {
    const allowed = new Set<ComicEditionId>(spec.availableEditions);
    return COMIC_EDITIONS.filter((opt) => allowed.has(opt.id));
  }

  return COMIC_EDITIONS.filter((opt) => {
    if (opt.id === 'digital' || opt.id === 'tpb') return true;
    if (activeEdition === opt.id) return true;
    return Boolean(item.editionCovers?.[opt.id] || item.editionIssueCounts?.[opt.id]);
  });
}

export function resolveComicEditionCover(
  item: Pick<ReadItem, 'title' | 'coverUrl' | 'editionCovers'>,
  edition?: ComicEditionId
): string {
  if (!edition) return item.coverUrl;
  const curatedCover = getKnownComicEditionCovers(item.title)?.[edition];
  if (curatedCover) return curatedCover;
  return item.editionCovers?.[edition] || item.coverUrl;
}

export function resolveComicEditionTotal(
  item: Pick<ReadItem, 'title' | 'totalUnits' | 'baseTotalUnits' | 'editionIssueCounts'>,
  edition?: ComicEditionId
): number {
  if (!edition) return item.totalUnits;
  const spec = getKnownComicEditionSpec(item.title);
  if (spec) {
    const curatedForEd = spec.counts[edition];
    if (typeof curatedForEd === 'number' && curatedForEd > 0) return curatedForEd;
  }
  const fromItem = item.editionIssueCounts?.[edition];
  if (typeof fromItem === 'number' && fromItem > 0) return fromItem;
  return item.baseTotalUnits ?? item.totalUnits;
}

export function isDcComic(item?: Pick<ReadItem, 'title' | 'creator' | 'genres'>): boolean {
  if (!item) return false;
  const hay = `${item.title} ${item.creator} ${item.genres.join(' ')}`.toLowerCase();
  return DC_KEYWORDS.some((kw) => hay.includes(kw));
}

export function getComicEditionLabel(
  edition: ComicEditionId | undefined,
  item?: Pick<ReadItem, 'title' | 'creator' | 'genres'>
): string {
  if (!edition) return '';
  const opt = COMIC_EDITIONS.find((e) => e.id === edition);
  if (!opt) return '';
  if (opt.dcLabel && isDcComic(item)) return opt.dcLabel;
  return opt.label;
}
