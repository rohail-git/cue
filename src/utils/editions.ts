import type { ComicEditionId, GeneralizedComicEditionId, ReadItem } from '../types';

export interface ComicEditionOption {
  id: GeneralizedComicEditionId;
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
    subtitle: 'Paperbacks, Black Label & softcovers',
  },
  {
    id: 'compact',
    label: 'Compact TPB',
    dcLabel: 'DC Compact TPB',
    subtitle: 'Pocket & digest softcovers',
  },
  {
    id: 'hardcover',
    label: 'Hardcover / Collector',
    subtitle: 'Deluxe HC, Absolute & Omnibus',
  },
];

export function normalizeComicEditionId(
  edition?: ComicEditionId
): GeneralizedComicEditionId | undefined {
  if (!edition) return undefined;
  if (edition === 'absolute') return 'hardcover';
  return edition;
}

export interface ClassifiedRawComicEdition {
  edition: GeneralizedComicEditionId;
  variantTag?: string;
}

/** Classifies any raw comic printing/binding string into one of 4 generalized formats + a short variant label. */
export function classifyRawComicEdition(
  rawTitle: string,
  physicalFormat?: string,
  pubYear?: number,
  earliestYear?: number,
  allowCompactYearFallback = false
): ClassifiedRawComicEdition {
  const titleLower = rawTitle.toLowerCase();
  const fmtLower = (physicalFormat || '').toLowerCase();
  const hay = `${titleLower} ${fmtLower}`.trim();

  if (/\bcompact\b|\bdigest\b|premier collection/.test(hay)) {
    return {
      edition: 'compact',
      variantTag: hay.includes('dc compact') ? 'DC Compact' : 'Compact TPB',
    };
  }

  if (/\babsolute\b/.test(hay)) {
    return { edition: 'hardcover', variantTag: 'Absolute HC' };
  }
  if (/\bomnibus\b/.test(hay)) {
    return { edition: 'hardcover', variantTag: 'Omnibus' };
  }
  if (/\bcompendium\b/.test(hay)) {
    return { edition: 'hardcover', variantTag: 'Compendium' };
  }
  if (/\bdeluxe\b/.test(hay)) {
    return { edition: 'hardcover', variantTag: 'Deluxe HC' };
  }
  if (/\bslipcase\b|\bnoir\b|\bgallery edition\b|\bartist(?:'s)? edition\b/.test(hay)) {
    return { edition: 'hardcover', variantTag: 'Collector HC' };
  }
  if (
    /\bhardcover\b|\bhc\b|capa dura|tapa dura|relie/.test(hay) &&
    !/paperback|softcover|\btpb\b/.test(fmtLower)
  ) {
    const volMatch = /\b(vol\.?|volume)\s*\d+/i.test(rawTitle);
    return {
      edition: 'hardcover',
      variantTag: volMatch ? 'Multi-Vol HC' : 'Standard HC',
    };
  }

  if (/\bblack label\b/.test(hay)) {
    return { edition: 'tpb', variantTag: 'Black Label TPB' };
  }
  if (
    /\b(tpb|tp|trade paperback|paperback|softcover|book\s*\d+|vol\.?|volume)\b/.test(hay)
  ) {
    const volMatch = /\b(vol\.?|volume)\s*\d+/i.test(rawTitle);
    return {
      edition: 'tpb',
      variantTag: volMatch ? 'Volume TPB' : 'Standard TPB',
    };
  }

  if (allowCompactYearFallback && pubYear && earliestYear && pubYear >= 2024 && pubYear - earliestYear >= 10) {
    return { edition: 'compact', variantTag: 'Compact Reprint' };
  }

  if (/issue\s*#?\d+|single issue|digital|kindle|comixology/.test(hay)) {
    return { edition: 'digital', variantTag: 'Single Issues' };
  }

  return { edition: 'digital' };
}

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
  availableEditions: GeneralizedComicEditionId[];
  counts: Partial<Record<GeneralizedComicEditionId, number>>;
  covers?: Partial<Record<GeneralizedComicEditionId, string>>;
  collapsedSummary?: Partial<Record<GeneralizedComicEditionId, string>>;
}

export const KNOWN_COMIC_EDITIONS: Record<string, KnownComicEditionSpec> = {
  'the flash rebirth': {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover'],
    counts: { digital: 6, tpb: 6, compact: 13, hardcover: 6 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781799507697',
      tpb: 'https://images.penguinrandomhouse.com/cover/9781401230012',
      hardcover: 'https://images.penguinrandomhouse.com/cover/9781401225681',
    },
    collapsedSummary: {
      tpb: '1st & 2nd Printing TPB',
      compact: 'DC Compact Comics (13 issues)',
      hardcover: 'Standard Hardcover (6 issues)',
    },
  },
  'flash rebirth': {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover'],
    counts: { digital: 6, tpb: 6, compact: 13, hardcover: 6 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781799507697',
      tpb: 'https://images.penguinrandomhouse.com/cover/9781401230012',
      hardcover: 'https://images.penguinrandomhouse.com/cover/9781401225681',
    },
    collapsedSummary: {
      tpb: '1st & 2nd Printing TPB',
      compact: 'DC Compact Comics (13 issues)',
      hardcover: 'Standard Hardcover (6 issues)',
    },
  },
  'all star superman': {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover'],
    counts: { digital: 12, tpb: 12, compact: 12, hardcover: 12 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781779527257',
    },
    collapsedSummary: {
      digital: '#1–12 Issues & Digital',
      tpb: 'Standard, Black Label & Vol. 1–2 TPB',
      compact: 'DC Compact Comics Edition',
      hardcover: 'Deluxe HC, Absolute & Vol. 1–2 HC',
    },
  },
  watchmen: {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover'],
    counts: { digital: 12, tpb: 12, compact: 12, hardcover: 12 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781779527325',
    },
    collapsedSummary: {
      tpb: 'Standard & Modern TPB',
      compact: 'DC Compact Comics Edition',
      hardcover: 'Deluxe, Absolute & Noir HC',
    },
  },
  'batman year one': {
    availableEditions: ['digital', 'tpb', 'hardcover'],
    counts: { digital: 4, tpb: 4, hardcover: 4 },
    collapsedSummary: {
      tpb: 'Standard & Black Label TPB',
      hardcover: 'Deluxe & Absolute HC',
    },
  },
  'batman hush': {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover'],
    counts: { digital: 12, tpb: 12, compact: 12, hardcover: 15 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781779527264',
    },
    collapsedSummary: {
      compact: 'DC Compact Comics Edition',
      hardcover: 'Deluxe, Anniversary & Absolute HC',
    },
  },
  'batman the court of owls': {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover'],
    counts: { digital: 11, tpb: 7, compact: 11, hardcover: 11 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781779527271',
    },
    collapsedSummary: {
      compact: 'DC Compact Saga Edition',
      hardcover: 'Collector HC & Omnibus',
    },
  },
  'batman the long halloween': {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover'],
    counts: { digital: 13, tpb: 13, compact: 13, hardcover: 13 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781799502883',
    },
    collapsedSummary: {
      compact: 'DC Compact Comics Edition',
      hardcover: 'Deluxe, Noir & Absolute HC',
    },
  },
  'kingdom come': {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover'],
    counts: { digital: 4, tpb: 4, compact: 4, hardcover: 4 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781799501299',
    },
    collapsedSummary: {
      compact: 'DC Compact Comics Edition',
      hardcover: 'Deluxe & Absolute HC',
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
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover'],
    counts: { digital: 6, tpb: 6, compact: 8, hardcover: 14 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781799501633',
    },
    collapsedSummary: {
      hardcover: 'Standard HC & Omnibus',
    },
  },
  'american vampire': {
    availableEditions: ['digital', 'tpb', 'compact', 'hardcover'],
    counts: { digital: 11, tpb: 5, compact: 11, hardcover: 34 },
    covers: {
      compact: 'https://images.penguinrandomhouse.com/cover/9781779527349',
    },
    collapsedSummary: {
      hardcover: 'Hardcover & Omnibus (34 issues)',
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
    availableEditions: ['digital', 'tpb', 'hardcover'],
    counts: { digital: 72, tpb: 6, hardcover: 18 },
    collapsedSummary: {
      hardcover: 'Deluxe HC Books & Compendium',
    },
  },
  invincible: {
    availableEditions: ['digital', 'tpb', 'hardcover'],
    counts: { digital: 144, tpb: 6, hardcover: 47 },
    collapsedSummary: {
      hardcover: 'Ultimate Collection & Compendium HC',
    },
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
): Partial<Record<GeneralizedComicEditionId, number>> | undefined {
  const spec = getKnownComicEditionSpec(title);
  return spec ? { ...spec.counts } : undefined;
}

export function getKnownComicEditionCovers(
  title: string
): Partial<Record<GeneralizedComicEditionId, string>> | undefined {
  const spec = getKnownComicEditionSpec(title);
  return spec?.covers ? { ...spec.covers } : undefined;
}

export function getAvailableComicEditions(
  item: Pick<ReadItem, 'title' | 'editionCovers' | 'editionIssueCounts'>,
  activeEdition?: ComicEditionId
): ComicEditionOption[] {
  const normalizedActive = normalizeComicEditionId(activeEdition);
  const spec = getKnownComicEditionSpec(item.title);
  if (spec) {
    const allowed = new Set<GeneralizedComicEditionId>(spec.availableEditions);
    return COMIC_EDITIONS.filter((opt) => allowed.has(opt.id));
  }

  return COMIC_EDITIONS.filter((opt) => {
    if (opt.id === 'digital' || opt.id === 'tpb') return true;
    if (normalizedActive === opt.id) return true;
    if (opt.id === 'hardcover') {
      return Boolean(
        item.editionCovers?.hardcover ||
          item.editionIssueCounts?.hardcover ||
          item.editionCovers?.absolute ||
          item.editionIssueCounts?.absolute
      );
    }
    return Boolean(item.editionCovers?.[opt.id] || item.editionIssueCounts?.[opt.id]);
  });
}

export function resolveComicEditionCover(
  item: Pick<ReadItem, 'title' | 'coverUrl' | 'editionCovers'>,
  edition?: ComicEditionId
): string {
  const normalized = normalizeComicEditionId(edition);
  if (!normalized) return item.coverUrl;
  const curatedCover = getKnownComicEditionCovers(item.title)?.[normalized];
  if (curatedCover) return curatedCover;
  if (normalized === 'hardcover') {
    return item.editionCovers?.hardcover || item.editionCovers?.absolute || item.coverUrl;
  }
  return item.editionCovers?.[normalized] || item.coverUrl;
}

export function resolveComicEditionTotal(
  item: Pick<ReadItem, 'title' | 'totalUnits' | 'baseTotalUnits' | 'editionIssueCounts'>,
  edition?: ComicEditionId
): number {
  const normalized = normalizeComicEditionId(edition);
  if (!normalized) return item.totalUnits;
  const spec = getKnownComicEditionSpec(item.title);
  if (spec) {
    const curatedForEd = spec.counts[normalized];
    if (typeof curatedForEd === 'number' && curatedForEd > 0) return curatedForEd;
  }
  const fromItem =
    item.editionIssueCounts?.[normalized] ??
    (normalized === 'hardcover' ? item.editionIssueCounts?.absolute : undefined);
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
  const normalized = normalizeComicEditionId(edition);
  if (!normalized) return '';
  const opt = COMIC_EDITIONS.find((e) => e.id === normalized);
  if (!opt) return '';
  if (opt.dcLabel && isDcComic(item)) return opt.dcLabel;
  return opt.label;
}

export function getComicEditionSummary(
  item: Pick<ReadItem, 'title' | 'editionVariants'>,
  editionId: GeneralizedComicEditionId
): string {
  const curated = getKnownComicEditionSpec(item.title)?.collapsedSummary?.[editionId];
  if (curated) return curated;
  const variants = item.editionVariants?.[editionId];
  if (variants && variants.length > 0) {
    return variants.slice(0, 3).join(' · ');
  }
  return COMIC_EDITIONS.find((o) => o.id === editionId)?.subtitle || '';
}
