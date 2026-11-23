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
    label: 'Deluxe Hardcover',
    subtitle: 'Oversized hardcover',
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
  'dc comics',
  'dc compact',
  'grant morrison',
  'frank miller',
  'alan moore',
];

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
