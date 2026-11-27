import type {
  AtomicReadRecord,
  ComicIssueMeta,
  CueStoreState,
  ReadItem,
  ReadProgress,
} from '../types';
import { applyAutoRating, getReadUnitsAverage } from './ratings';

export type ComicWikiSlug =
  | 'marvel'
  | 'dc'
  | 'imagecomics'
  | 'darkhorse'
  | 'idw'
  | 'boom'
  | 'comicvine';

/** Builds a canonical cross-container ID for an individual comic issue atom. */
export function makeComicAtomicId(wiki: ComicWikiSlug, pageTitle: string): string {
  const norm = pageTitle
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `comic:${wiki}:${norm}`;
}

/** Extracts the parent series name from a Fandom issue or volume page title. */
export function extractSeriesTitleFromPageTitle(pageTitle?: string): string | undefined {
  if (!pageTitle) return undefined;
  const m = pageTitle.match(/^(.+?)\s+Vol\s+\d+(?:\s|$)/i);
  const raw = m?.[1]?.trim();
  if (!raw) return undefined;
  return /^amazing spider-man$/i.test(raw) ? `The ${raw}` : raw;
}

/** Resolves the canonical atomic ID for a comic issue metadata slot if identifiable. */
export function getComicIssueAtomicId(meta?: ComicIssueMeta): string | undefined {
  if (!meta) return undefined;
  if (meta.atomicId) return meta.atomicId;
  if (meta.wiki && meta.pageTitle) {
    return makeComicAtomicId(meta.wiki, meta.pageTitle);
  }
  return undefined;
}

/** Extracts an ISBN-10/13 identifier from a ReadItem's fields or overview text. */
export function extractReadItemIsbn(
  item: Pick<ReadItem, 'id' | 'isbn' | 'overview'>
): string | undefined {
  if (item.isbn) {
    const clean = item.isbn.replace(/[^0-9Xx]/g, '').toUpperCase();
    if (/^(?:\d{10}|\d{9}X|\d{13})$/.test(clean)) return clean;
  }
  const idMatch = item.id.match(/^isbn-(\d{10,13})$/i);
  if (idMatch?.[1]) return idMatch[1];
  const ovMatch = item.overview?.match(/ISBN[:\s]*([\d-]{10,17}[Xx]?)/i);
  if (ovMatch?.[1]) {
    const clean = ovMatch[1].replace(/[^0-9Xx]/g, '').toUpperCase();
    if (/^(?:\d{10}|\d{9}X|\d{13})$/.test(clean)) return clean;
  }
  return undefined;
}

/** Returns true if a ReadItem represents a collected comic edition (Omnibus, TPB, HC, ISBN, etc.). */
export function isCollectedComicItem(
  item: Pick<ReadItem, 'format' | 'comicKind' | 'id' | 'isbn' | 'overview' | 'title'>
): boolean {
  if (item.format !== 'comic') return false;
  if (item.comicKind === 'collection') return true;
  if (extractReadItemIsbn(item)) return true;
  return /\b(?:omnibus|compendium|complete collection|epic collection|tpb|trade paperback|hardcover|deluxe edition|absolute|box set|collected)\b/i.test(
    item.title
  );
}

export interface AtomicDelta {
  atomicId: string;
  completed: boolean;
  seriesTitle?: string;
  issueLabel?: string;
}

export interface AtomicRatingDelta {
  atomicId: string;
  rating: number | undefined;
}

export interface AtomicDateDelta {
  atomicId: string;
  readAt: string | undefined;
}

export interface SyncedContainerSummary {
  readId: string;
  title: string;
  beforeRead: number;
  afterRead: number;
  total: number;
  newlyCompleted: boolean;
}

function getActiveCompletedSlots(item: ReadItem, prog?: ReadProgress): number[] {
  const total = Math.max(1, item.totalUnits);
  if (Array.isArray(prog?.completedUnits)) {
    return [...new Set(prog.completedUnits.filter((n) => Number.isFinite(n) && n >= 1 && n <= total))].sort(
      (a, b) => a - b
    );
  }
  const cur = Math.min(total, Math.max(0, prog?.currentUnit || 0));
  const out: number[] = [];
  for (let i = 1; i <= cur; i += 1) out.push(i);
  return out;
}

function buildUpdatedProgressForSlots(
  item: ReadItem,
  prev: ReadProgress | undefined,
  activeSlots: number[],
  nextUnitRatings: Record<number, number> | undefined,
  nextUnitFinishedAt: Record<number, string> | undefined,
  nowIso: string
): ReadProgress {
  const total = Math.max(1, item.totalUnits);
  const highSlots = (prev?.completedUnits || []).filter((n) => n > total);
  const cleanActive = [...new Set(activeSlots.filter((n) => n >= 1 && n <= total))].sort(
    (a, b) => a - b
  );
  const combined = [...new Set([...cleanActive, ...highSlots])].sort((a, b) => a - b);
  const activeCount = cleanActive.length;
  const finished = activeCount >= total;
  const prevMax = prev?.maxCompletedUnit ?? prev?.currentUnit ?? 0;

  return {
    ...(prev || {}),
    status: finished ? 'finished' : activeCount > 0 ? 'reading' : 'want_to_read',
    currentUnit: activeCount,
    completedUnits: combined,
    maxCompletedUnit: Math.max(activeCount, prevMax),
    rereadCount: finished ? Math.max(1, prev?.rereadCount || 0) : prev?.rereadCount || 0,
    bookmarked: prev?.bookmarked ?? true,
    lastReadAt: activeCount > 0 ? nowIso : prev?.lastReadAt,
    finishedAt: finished ? prev?.finishedAt || nowIso : undefined,
    ...(nextUnitRatings ? { unitRatings: nextUnitRatings } : {}),
    ...(nextUnitFinishedAt ? { unitFinishedAt: nextUnitFinishedAt } : {}),
  };
}

/** Synchronizes atomic comic read statuses, ratings, and finish dates across all overlapping Smart Containers. */
export function syncAtomicReadUnitsAcrossState(
  prev: CueStoreState,
  sourceReadId: string,
  unitDeltas: AtomicDelta[],
  ratingDeltas: AtomicRatingDelta[] = [],
  nowIso: string = new Date().toISOString(),
  dateDeltas: AtomicDateDelta[] = []
): {
  atomicReadUnits: Record<string, AtomicReadRecord>;
  readProgress: Record<string, ReadProgress>;
  syncedContainers: SyncedContainerSummary[];
} {
  const nextAtoms: Record<string, AtomicReadRecord> = { ...(prev.atomicReadUnits || {}) };
  const statusMap = new Map<string, boolean>();
  for (const d of unitDeltas) {
    if (!d.atomicId) continue;
    statusMap.set(d.atomicId, d.completed);
    const cur = nextAtoms[d.atomicId];
    if (d.completed) {
      nextAtoms[d.atomicId] = {
        ...(cur || {}),
        readAt: cur?.readAt || nowIso,
        count: Math.max(1, cur?.count || 0),
        seriesTitle: d.seriesTitle || cur?.seriesTitle,
        issueLabel: d.issueLabel || cur?.issueLabel,
      };
    } else if (cur?.rating) {
      nextAtoms[d.atomicId] = {
        ...cur,
        count: 0,
        readAt: undefined,
      };
    } else {
      delete nextAtoms[d.atomicId];
    }
  }

  const dateMap = new Map<string, string | undefined>();
  for (const d of dateDeltas) {
    if (!d.atomicId) continue;
    dateMap.set(d.atomicId, d.readAt);
    const cur = nextAtoms[d.atomicId];
    if (d.readAt) {
      nextAtoms[d.atomicId] = {
        ...(cur || { count: 1 }),
        readAt: d.readAt,
      };
    } else if (cur) {
      const copy = { ...cur };
      delete copy.readAt;
      if (copy.count > 0 || (typeof copy.rating === 'number' && copy.rating > 0)) {
        nextAtoms[d.atomicId] = copy;
      } else {
        delete nextAtoms[d.atomicId];
      }
    }
  }

  const ratingMap = new Map<string, number | undefined>();
  for (const r of ratingDeltas) {
    if (!r.atomicId) continue;
    ratingMap.set(r.atomicId, r.rating);
    const cur = nextAtoms[r.atomicId];
    if (typeof r.rating === 'number' && r.rating > 0) {
      nextAtoms[r.atomicId] = {
        ...(cur || { count: 0 }),
        rating: r.rating,
      };
    } else if (cur) {
      if (cur.count > 0) {
        const copy = { ...cur };
        delete copy.rating;
        nextAtoms[r.atomicId] = copy;
      } else {
        delete nextAtoms[r.atomicId];
      }
    }
  }

  const nextReadProgress: Record<string, ReadProgress> = { ...prev.readProgress };
  const syncedContainers: SyncedContainerSummary[] = [];

  if (statusMap.size === 0 && ratingMap.size === 0 && dateMap.size === 0) {
    return {
      atomicReadUnits: nextAtoms,
      readProgress: nextReadProgress,
      syncedContainers,
    };
  }

  for (const otherId of prev.readOrder) {
    if (otherId === sourceReadId) continue;
    const otherItem = prev.readItems[otherId];
    if (!otherItem || otherItem.format !== 'comic' || !otherItem.issueDetails) continue;

    const otherPrevProg = prev.readProgress[otherId];
    const beforeSlots = getActiveCompletedSlots(otherItem, otherPrevProg);
    const slotSet = new Set(beforeSlots);
    let slotsChanged = false;
    let ratingsChanged = false;
    let datesChanged = false;

    const nextRatings = otherPrevProg?.unitRatings ? { ...otherPrevProg.unitRatings } : undefined;
    const nextDates = otherPrevProg?.unitFinishedAt ? { ...otherPrevProg.unitFinishedAt } : undefined;

    const total = Math.max(1, otherItem.totalUnits);
    for (let u = 1; u <= total; u += 1) {
      const atomId = getComicIssueAtomicId(otherItem.issueDetails[u]);
      if (!atomId) continue;

      if (statusMap.has(atomId)) {
        const shouldComplete = Boolean(statusMap.get(atomId));
        if (shouldComplete && !slotSet.has(u)) {
          slotSet.add(u);
          slotsChanged = true;
          if (!nextDates?.[u] && nextAtoms[atomId]?.readAt) {
            datesChanged = true;
          }
        } else if (!shouldComplete && slotSet.has(u)) {
          slotSet.delete(u);
          slotsChanged = true;
          if (nextDates?.[u]) {
            datesChanged = true;
          }
        }
      }

      if (dateMap.has(atomId)) {
        const targetDate = dateMap.get(atomId);
        if (nextDates?.[u] !== targetDate) {
          datesChanged = true;
        }
      }

      if (ratingMap.has(atomId)) {
        const targetRating = ratingMap.get(atomId);
        const curRating = nextRatings?.[u];
        if (targetRating !== curRating) {
          ratingsChanged = true;
        }
      }
    }

    if (!slotsChanged && !ratingsChanged && !datesChanged) continue;

    let finalRatings = otherPrevProg?.unitRatings ? { ...otherPrevProg.unitRatings } : undefined;
    if (ratingsChanged) {
      if (!finalRatings) finalRatings = {};
      for (let u = 1; u <= total; u += 1) {
        const atomId = getComicIssueAtomicId(otherItem.issueDetails[u]);
        if (!atomId || !ratingMap.has(atomId)) continue;
        const targetRating = ratingMap.get(atomId);
        if (typeof targetRating === 'number' && targetRating > 0) {
          finalRatings[u] = targetRating;
        } else {
          delete finalRatings[u];
        }
      }
    }

    let finalDates = otherPrevProg?.unitFinishedAt ? { ...otherPrevProg.unitFinishedAt } : undefined;
    if (datesChanged) {
      if (!finalDates) finalDates = {};
      for (let u = 1; u <= total; u += 1) {
        const atomId = getComicIssueAtomicId(otherItem.issueDetails[u]);
        if (!atomId) continue;
        if (dateMap.has(atomId)) {
          const targetDate = dateMap.get(atomId);
          if (targetDate) {
            finalDates[u] = targetDate;
          } else {
            delete finalDates[u];
          }
        } else if (statusMap.has(atomId)) {
          if (statusMap.get(atomId)) {
            if (!finalDates[u] && nextAtoms[atomId]?.readAt) {
              finalDates[u] = nextAtoms[atomId].readAt;
            }
          } else {
            delete finalDates[u];
          }
        }
      }
    }

    const updatedActive = [...slotSet].sort((a, b) => a - b);
    let updatedProg = buildUpdatedProgressForSlots(
      otherItem,
      otherPrevProg,
      updatedActive,
      finalRatings,
      finalDates,
      nowIso
    );
    if (ratingsChanged) {
      const avg = getReadUnitsAverage(updatedProg);
      const auto = applyAutoRating(updatedProg.rating, updatedProg.ratingSource, avg?.avg ?? null);
      updatedProg = {
        ...updatedProg,
        rating: auto.rating,
        ratingSource: auto.source,
      };
    }
    nextReadProgress[otherId] = updatedProg;

    if (slotsChanged) {
      syncedContainers.push({
        readId: otherId,
        title: otherItem.title,
        beforeRead: beforeSlots.length,
        afterRead: updatedActive.length,
        total,
        newlyCompleted: beforeSlots.length < total && updatedActive.length >= total,
      });
    }
  }

  return {
    atomicReadUnits: nextAtoms,
    readProgress: nextReadProgress,
    syncedContainers,
  };
}

/** Builds a lookup of already-read atomic IDs, ratings, and finish dates from the central ledger and existing library items. */
export function collectKnownCompletedAtoms(
  state: CueStoreState,
  excludeReadId?: string
): {
  completedIds: Set<string>;
  ratingsByAtom: Map<string, number>;
  datesByAtom: Map<string, string>;
} {
  const completedIds = new Set<string>();
  const ratingsByAtom = new Map<string, number>();
  const datesByAtom = new Map<string, string>();

  for (const [atomId, rec] of Object.entries(state.atomicReadUnits || {})) {
    if (rec.count > 0) completedIds.add(atomId);
    if (typeof rec.rating === 'number' && rec.rating > 0) ratingsByAtom.set(atomId, rec.rating);
    if (rec.readAt) datesByAtom.set(atomId, rec.readAt);
  }

  for (const id of state.readOrder) {
    if (id === excludeReadId) continue;
    const item = state.readItems[id];
    const prog = state.readProgress[id];
    if (!item || item.format !== 'comic' || !item.issueDetails || !prog) continue;
    const active = getActiveCompletedSlots(item, prog);
    for (const u of active) {
      const atomId = getComicIssueAtomicId(item.issueDetails[u]);
      if (atomId) {
        completedIds.add(atomId);
        const unitDate = prog.unitFinishedAt?.[u];
        if (unitDate && !datesByAtom.has(atomId)) datesByAtom.set(atomId, unitDate);
      }
    }
    if (prog.unitRatings) {
      for (const [slotStr, rating] of Object.entries(prog.unitRatings)) {
        const u = Number(slotStr);
        const atomId = getComicIssueAtomicId(item.issueDetails[u]);
        if (atomId && typeof rating === 'number' && rating > 0 && !ratingsByAtom.has(atomId)) {
          ratingsByAtom.set(atomId, rating);
        }
      }
    }
  }

  return { completedIds, ratingsByAtom, datesByAtom };
}

/** Two-way reconciles a newly hydrated comic item with existing completed atomic bricks in the store. */
export function reconcileHydratedComicItemWithAtoms(
  state: CueStoreState,
  readId: string,
  hydratedItem: ReadItem
): {
  atomicReadUnits: Record<string, AtomicReadRecord>;
  readProgress: Record<string, ReadProgress>;
} {
  const details = hydratedItem.issueDetails;
  if (!details) {
    return {
      atomicReadUnits: state.atomicReadUnits || {},
      readProgress: state.readProgress,
    };
  }

  const nowIso = new Date().toISOString();
  const prevProg = state.readProgress[readId];
  const localSlots = new Set(getActiveCompletedSlots(hydratedItem, prevProg));
  const { completedIds, ratingsByAtom, datesByAtom } = collectKnownCompletedAtoms(state, readId);
  let pulledChanges = false;
  let pulledRatings = false;

  const total = Math.max(1, hydratedItem.totalUnits);
  const deltasToPush: AtomicDelta[] = [];
  const ratingDeltasToPush: AtomicRatingDelta[] = [];
  const dateDeltasToPush: AtomicDateDelta[] = [];

  for (let u = 1; u <= total; u += 1) {
    const meta = details[u];
    const atomId = getComicIssueAtomicId(meta);
    if (!atomId) continue;

    if (localSlots.has(u)) {
      if (!completedIds.has(atomId)) {
        deltasToPush.push({
          atomicId: atomId,
          completed: true,
          seriesTitle: meta?.seriesTitle,
          issueLabel: meta?.issueLabel,
        });
      }
      const localRating = prevProg?.unitRatings?.[u];
      if (typeof localRating === 'number' && localRating > 0 && !ratingsByAtom.has(atomId)) {
        ratingDeltasToPush.push({ atomicId: atomId, rating: localRating });
      }
      const localDate = prevProg?.unitFinishedAt?.[u];
      if (localDate && !datesByAtom.has(atomId)) {
        dateDeltasToPush.push({ atomicId: atomId, readAt: localDate });
      }
    } else if (completedIds.has(atomId)) {
      localSlots.add(u);
      pulledChanges = true;
    }

    if (!prevProg?.unitRatings?.[u] && ratingsByAtom.has(atomId)) {
      pulledChanges = true;
      pulledRatings = true;
    }
    if (!prevProg?.unitFinishedAt?.[u] && datesByAtom.has(atomId)) {
      pulledChanges = true;
    }
  }

  const nextProgressMap: Record<string, ReadProgress> = { ...state.readProgress };
  if (pulledChanges && prevProg) {
    let hydratedRatings = prevProg.unitRatings ? { ...prevProg.unitRatings } : undefined;
    let hydratedDates = prevProg.unitFinishedAt ? { ...prevProg.unitFinishedAt } : undefined;
    for (let u = 1; u <= total; u += 1) {
      const atomId = getComicIssueAtomicId(details[u]);
      if (!atomId) continue;
      if (!hydratedRatings?.[u] && ratingsByAtom.has(atomId)) {
        if (!hydratedRatings) hydratedRatings = {};
        hydratedRatings[u] = ratingsByAtom.get(atomId)!;
      }
      if (!hydratedDates?.[u] && datesByAtom.has(atomId)) {
        if (!hydratedDates) hydratedDates = {};
        hydratedDates[u] = datesByAtom.get(atomId)!;
      }
    }
    let nextProg = buildUpdatedProgressForSlots(
      hydratedItem,
      prevProg,
      [...localSlots].sort((a, b) => a - b),
      hydratedRatings,
      hydratedDates,
      nowIso
    );
    if (pulledRatings) {
      const avg = getReadUnitsAverage(nextProg);
      const auto = applyAutoRating(nextProg.rating, nextProg.ratingSource, avg?.avg ?? null);
      nextProg = {
        ...nextProg,
        rating: auto.rating,
        ratingSource: auto.source,
      };
    }
    nextProgressMap[readId] = nextProg;
  }

  if (deltasToPush.length === 0 && ratingDeltasToPush.length === 0 && dateDeltasToPush.length === 0) {
    return {
      atomicReadUnits: state.atomicReadUnits || {},
      readProgress: nextProgressMap,
    };
  }

  const intermediateState: CueStoreState = {
    ...state,
    readItems: { ...state.readItems, [readId]: hydratedItem },
    readProgress: nextProgressMap,
  };
  const synced = syncAtomicReadUnitsAcrossState(
    intermediateState,
    readId,
    deltasToPush,
    ratingDeltasToPush,
    nowIso,
    dateDeltasToPush
  );
  return {
    atomicReadUnits: synced.atomicReadUnits,
    readProgress: synced.readProgress,
  };
}

/** Counts completed units for a ReadItem while deduplicating comic issues across overlapping containers by canonical atomicId. */
export function countDeduplicatedReadUnits(
  item: ReadItem,
  completedUnits: number[],
  rereadCount: number,
  isFinished: boolean,
  seenComicAtomicIds: Set<string>
): number {
  const rereadExtra =
    isFinished && rereadCount > 1 ? completedUnits.length * (rereadCount - 1) : 0;
  if (item.format !== 'comic' || item.unit !== 'issues' || !item.issueDetails) {
    return completedUnits.length + rereadExtra;
  }
  let unique = 0;
  for (const u of completedUnits) {
    const atomId = getComicIssueAtomicId(item.issueDetails[u]);
    if (!atomId) {
      unique += 1;
    } else if (!seenComicAtomicIds.has(atomId)) {
      seenComicAtomicIds.add(atomId);
      unique += 1;
    }
  }
  return unique + rereadExtra;
}

/**
 * When marking targetIndex finished, returns unfinished prior items if targetIndex
 * has neither an adjacent preceding nor adjacent following finished item.
 */
export function detectNonAdjacentPriorAtoms<T>(
  orderedItems: T[],
  targetIndex: number,
  isFinishedBefore: (item: T) => boolean
): T[] {
  if (targetIndex <= 0 || targetIndex >= orderedItems.length) return [];
  const prevDone = isFinishedBefore(orderedItems[targetIndex - 1]);
  const nextDone =
    targetIndex + 1 < orderedItems.length && isFinishedBefore(orderedItems[targetIndex + 1]);
  if (prevDone || nextDone) return [];

  const priorUnfinished: T[] = [];
  for (let i = 0; i < targetIndex; i += 1) {
    if (!isFinishedBefore(orderedItems[i])) {
      priorUnfinished.push(orderedItems[i]);
    }
  }
  return priorUnfinished;
}
