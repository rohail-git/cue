import { useEffect, useRef, useState } from 'react';
import {
  Bookmark,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  ListPlus,
  Maximize2,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { CoverLightbox } from '../components/CoverLightbox';
import { DetailModeToggle } from '../components/DetailModeToggle';
import { MediaImage } from '../components/MediaImage';
import { PersonalNotesSection } from '../components/PersonalNotesSection';
import { RatingControl, SuggestedRatingBanner } from '../components/RatingControl';
import { fetchComicEditionMetadata, formatDisplayTitle } from '../services/mediaApi';
import { useCueStore } from '../store/useCueStore';
import type { DetailCardMode } from '../types';
import {
  evaluateBookSeriesProgress,
  findBookSeries,
} from '../utils/containers';
import {
  getComicEditionLabel,
  getCuratedComicEditionRecords,
  getKnownComicEditionCovers,
  resolveComicEditionCover,
} from '../utils/editions';
import { formatRating, getReadUnitsAverage } from '../utils/ratings';
import { getCompletedReadUnits, getReadStats } from '../utils/stats';

const sessionDetailModeByReadId = new Map<string, DetailCardMode>();

export function ReadDetailView({ readId }: { readId: string }) {
  const {
    state,
    goBack,
    pushRoute,
    advanceReadProgress,
    setReadProgress,
    toggleReadUnit,
    markReadFinished,
    incrementReread,
    toggleReadBookmark,
    rateReadUnit,
    rateReadItem,
    rateCollection,
    setReadMood,
    updateReadEditionCovers,
    updateReadTotalUnits,
    resetReadProgress,
    toggleItemInList,
    createCustomList,
  } = useCueStore();

  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [listPickerOpen, setListPickerOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [editingTotal, setEditingTotal] = useState(false);
  const [totalDraft, setTotalDraft] = useState('');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<number>(1);
  const [unitPageStart, setUnitPageStart] = useState<number>(1);
  const [detailMode, setDetailMode] = useState<DetailCardMode>(
    () => sessionDetailModeByReadId.get(readId) || state.settings.detailMode || 'simple'
  );
  const fetchedCoversRef = useRef<Set<string>>(new Set());

  const handleDetailModeChange = (nextMode: DetailCardMode) => {
    sessionDetailModeByReadId.set(readId, nextMode);
    setDetailMode(nextMode);
  };

  const item = state.readItems[readId];
  const progress = state.readProgress[readId];

  useEffect(() => {
    if (!item || item.format !== 'comic') return;
    if (fetchedCoversRef.current.has(item.id)) return;
    const uniqueCoverCount = item.editionCovers ? new Set(Object.values(item.editionCovers)).size : 0;
    const needsCounts = !item.editionIssueCounts;
    const formattedTitle = formatDisplayTitle(item.title);
    const needsTitleFix = formattedTitle !== item.title;
    const curatedCovers = getKnownComicEditionCovers(item.title);
    const missingCuratedCover = curatedCovers
      ? Object.entries(curatedCovers).some(([ed, url]) => item.editionCovers?.[ed as keyof typeof curatedCovers] !== url)
      : false;
    if (uniqueCoverCount > 1 && !needsCounts && !needsTitleFix && !missingCuratedCover) return;

    let cancelled = false;
    fetchComicEditionMetadata(item.title, item.creator).then(({ covers, issueCounts, variants }) => {
      if (cancelled) return;
      fetchedCoversRef.current.add(item.id);
      if (
        Object.keys(covers).length > 0 ||
        Object.keys(issueCounts).length > 0 ||
        Object.keys(variants).length > 0 ||
        needsTitleFix
      ) {
        updateReadEditionCovers(
          item.id,
          covers,
          needsTitleFix ? formattedTitle : undefined,
          issueCounts,
          variants
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [item, updateReadEditionCovers]);

  if (!item) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6 text-center">
        <p className="text-lg font-semibold text-ink">Title not found</p>
        <button
          type="button"
          onClick={goBack}
          className="mt-4 px-5 py-2.5 rounded-full bg-surface-raised text-sm text-ink"
        >
          Go back
        </button>
      </div>
    );
  }

  const stats = getReadStats(item, progress);
  const unitAvg = getReadUnitsAverage(progress);
  const completedList = getCompletedReadUnits(item, progress);
  const completedSet = new Set(completedList);
  const editionRecords =
    item.format === 'comic' ? getCuratedComicEditionRecords(item) : [];
  const bookSeries = item.format === 'novel' ? findBookSeries(item.title) : null;
  const evalBookSeries = bookSeries ? evaluateBookSeriesProgress(bookSeries, state) : null;
  const seriesRatingKey = bookSeries ? `book-series:${bookSeries.id}` : '';
  const storedSeriesRating = seriesRatingKey ? state.collectionRatings?.[seriesRatingKey] : undefined;

  const safeSelectedUnit = Math.min(stats.total, Math.max(1, selectedUnit));
  const UNIT_PAGE_SIZE = 48;
  const maxPageStart = Math.max(1, stats.total - UNIT_PAGE_SIZE + 1);
  const pageStart = stats.total > UNIT_PAGE_SIZE ? Math.min(unitPageStart, maxPageStart) : 1;
  const pageEnd = Math.min(stats.total, pageStart + UNIT_PAGE_SIZE - 1);
  const visibleUnitNumbers: number[] = [];
  for (let n = pageStart; n <= pageEnd; n += 1) visibleUnitNumbers.push(n);

  const formatLabel =
    item.format === 'manga' ? 'Manga' : item.format === 'comic' ? 'Comic' : 'Novel';
  const activeCover = resolveComicEditionCover(item, progress?.edition, progress);
  const editionLabel =
    item.format === 'comic' ? getComicEditionLabel(progress?.edition, item, progress) : '';

  return (
    <div className="min-h-dvh pb-20 bg-background">
      {/* Flat Dark Hero (no gradient) */}
      <div className="relative h-[300px] sm:h-[360px] w-full overflow-hidden border-b border-white/[0.06]">
        <MediaImage
          src={activeCover || item.backdropUrl || item.coverUrl}
          alt={item.title}
          className="w-full h-full object-cover object-center blur-[3px] scale-105 opacity-30"
        />
        <div className="absolute inset-0 bg-[#131519]/65" />

        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className="md:hidden glass-btn fixed top-4 left-4 z-30 h-10 w-10 rounded-full flex items-center justify-center text-ink"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="fixed top-4 md:top-20 right-4 md:right-8 z-30">
          <div className="glass-pill rounded-full px-1.5 py-1 flex items-center gap-1">
            <button
              type="button"
              onClick={() => toggleReadBookmark(item.id)}
              aria-label="Bookmark"
              className={`h-8 w-8 rounded-full flex items-center justify-center transition-colors ${
                progress?.bookmarked ? 'text-watched' : 'text-ink'
              }`}
            >
              <Bookmark className="w-4 h-4" fill={progress?.bookmarked ? 'currentColor' : 'none'} />
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="More options"
              className="h-8 w-8 rounded-full flex items-center justify-center text-ink hover:bg-white/10"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-52 rounded-2xl bg-surface-raised border border-white/12 p-1.5 shadow-2xl animate-sheet-up">
              <button
                type="button"
                onClick={() => {
                  incrementReread(item.id, 1);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-ink hover:bg-white/8 text-left"
              >
                <Plus className="w-4 h-4 text-watched" />
                <span>Log reread (+1)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setListPickerOpen(true);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-ink hover:bg-white/8 text-left"
              >
                <ListPlus className="w-4 h-4 text-brand" />
                <span>Add to custom list</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  resetReadProgress(item.id);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-red-300 hover:bg-red-500/10 text-left"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset reading progress</span>
              </button>
            </div>
          )}
        </div>

        <div className="absolute bottom-5 inset-x-0 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto flex items-end gap-4">
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            aria-label="View cover fullscreen"
            className="group relative w-24 sm:w-28 aspect-[2/3] rounded-2xl overflow-hidden border border-white/15 shadow-2xl shrink-0 bg-surface cursor-zoom-in"
          >
            <MediaImage src={activeCover} alt={item.title} className="w-full h-full object-cover" />
            <span className="absolute bottom-1.5 right-1.5 h-6 w-6 rounded-full bg-black/70 border border-white/15 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
              <Maximize2 className="w-3 h-3" />
            </span>
          </button>
          <div className="min-w-0 pb-1">
            <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
              <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-brand/20 text-brand">
                {formatLabel}
              </span>
              {editionLabel && (
                <span className="inline-block text-[10px] font-semibold tracking-wide px-2.5 py-0.5 rounded-full bg-surface-raised border border-white/10 text-ink-dim">
                  {editionLabel}
                </span>
              )}
            </div>
            <h1 className="font-display font-extrabold text-2xl sm:text-4xl text-ink tracking-tight leading-tight">
              {item.title}
            </h1>
            <p className="text-sm text-ink-dim mt-1">
              {item.creator} · {item.year}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 pt-4">
        {/* Action Bar */}
        <div className="flex items-center gap-3 mb-4">
          <button
            type="button"
            onClick={() => toggleReadBookmark(item.id)}
            aria-label="Toggle library bookmark"
            className={`h-12 w-12 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
              progress?.bookmarked
                ? 'border-watched text-watched bg-watched/10'
                : 'border-white/20 text-ink-dim hover:border-white/40'
            }`}
          >
            <Bookmark className="w-5 h-5" fill={progress?.bookmarked ? 'currentColor' : 'none'} />
          </button>

          {stats.isFinished ? (
            <button
              type="button"
              onClick={() => incrementReread(item.id, 1)}
              className="flex-1 h-12 rounded-full border-2 border-watched text-ink font-semibold text-[15px] flex items-center justify-center gap-2 bg-watched/[0.08] hover:bg-watched/15 transition-colors"
            >
              <Check className="w-5 h-5 text-watched" strokeWidth={2.5} />
              <span>Finished</span>
              {stats.rereadCount > 1 && (
                <span className="text-watched font-bold text-sm ml-1">· x{stats.rereadCount}</span>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => advanceReadProgress(item.id, 1)}
              className="flex-1 h-12 rounded-full bg-brand text-brand-ink font-semibold text-[15px] flex items-center justify-center gap-2 hover:opacity-95 transition-opacity"
            >
              <Plus className="w-5 h-5" strokeWidth={2.5} />
              <span>Log +1 {stats.unitSingular}</span>
            </button>
          )}

          {!stats.isFinished && (
            <button
              type="button"
              onClick={() => markReadFinished(item.id)}
              className="h-12 px-4 rounded-full bg-surface-raised border border-white/12 text-sm font-semibold text-watched hover:bg-white/10"
            >
              Finish
            </button>
          )}
        </div>

        <DetailModeToggle mode={detailMode} onChange={handleDetailModeChange} />

        <div key={detailMode} data-detail-mode={detailMode} className="animate-detail-flip">
          {detailMode === 'simple' ? (
            <section className="rounded-[22px] bg-surface border border-white/[0.06] p-4 mb-5">
              <div className="flex items-center justify-between gap-3 mb-2.5">
                <span className="text-sm font-semibold text-ink">
                  {item.format === 'comic' ? 'Issue run progress' : 'Reading progress'}
                </span>
                <span className="text-sm font-bold text-watched tabular-nums">
                  {stats.current} / {stats.total} {stats.unitLabel} ({Math.round(stats.ratio * 100)}%)
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden mb-3">
                <div
                  className="h-full bg-watched transition-all duration-300"
                  style={{ width: `${Math.round(stats.ratio * 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setReadProgress(item.id, stats.current - 1)}
                    className="h-9 px-3 rounded-full bg-white/8 text-xs font-semibold text-ink hover:bg-white/12 flex items-center gap-1"
                  >
                    <Minus className="w-3.5 h-3.5" />1 {stats.unitSingular}
                  </button>
                  <button
                    type="button"
                    onClick={() => advanceReadProgress(item.id, 1)}
                    className="h-9 px-3 rounded-full bg-watched/15 text-xs font-semibold text-watched hover:bg-watched/25 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />1 {stats.unitSingular}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleDetailModeChange('advanced')}
                  className="text-xs font-medium text-ink-dim hover:text-brand transition-colors"
                >
                  Edit total, rereads & notes →
                </button>
              </div>
            </section>
          ) : (
            <section className="rounded-[22px] bg-surface border border-white/[0.06] p-4 mb-5">
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <span className="text-sm font-semibold text-ink">
                  {item.format === 'comic' ? 'Issue run progress' : 'Chapter progress'}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-watched tabular-nums">
                    {stats.current} / {stats.total} {stats.unitLabel} ({Math.round(stats.ratio * 100)}%)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setTotalDraft(String(item.totalUnits));
                      setEditingTotal((v) => !v);
                    }}
                    aria-label="Edit total count"
                    className="p-1 rounded-full bg-white/8 text-ink-dim hover:text-ink"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {editingTotal && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const val = Number(totalDraft);
                    if (val > 0) updateReadTotalUnits(item.id, val);
                    setEditingTotal(false);
                  }}
                  className="flex items-center gap-2 mb-3"
                >
                  <input
                    type="number"
                    min={1}
                    value={totalDraft}
                    onChange={(e) => setTotalDraft(e.target.value)}
                    className="w-28 rounded-xl bg-background border border-white/12 px-3 py-1.5 text-xs text-ink outline-none focus:border-brand"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-xl bg-brand text-brand-ink text-xs font-semibold"
                  >
                    Set total {stats.unitLabel}
                  </button>
                </form>
              )}

              <input
                type="range"
                min={0}
                max={stats.total}
                value={stats.current}
                onChange={(e) => setReadProgress(item.id, Number(e.target.value))}
                aria-label="Reading progress slider"
                className="w-full accent-[#DFB062] cursor-pointer mb-3"
              />

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setReadProgress(item.id, stats.current - 1)}
                    className="h-9 px-3 rounded-full bg-white/8 text-xs font-semibold text-ink hover:bg-white/12 flex items-center gap-1"
                  >
                    <Minus className="w-3.5 h-3.5" />1 {stats.unitSingular}
                  </button>
                  <button
                    type="button"
                    onClick={() => advanceReadProgress(item.id, 1)}
                    className="h-9 px-3 rounded-full bg-watched/15 text-xs font-semibold text-watched hover:bg-watched/25 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />1 {stats.unitSingular}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-dim">Rereads:</span>
                  <button
                    type="button"
                    onClick={() => incrementReread(item.id, -1)}
                    className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center text-ink-dim"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-sm font-bold text-watched tabular-nums min-w-[1.5rem] text-center">
                    x{stats.rereadCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => incrementReread(item.id, 1)}
                    className="w-7 h-7 rounded-full bg-watched/20 flex items-center justify-center text-watched"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Advanced Compact Comic Edition Entry -> Separate Editions Page */}
          {detailMode === 'advanced' && item.format === 'comic' && (
            <section className="rounded-[22px] bg-surface border border-white/[0.06] p-4 mb-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-read shrink-0" />
                  <h2 className="text-sm font-semibold text-ink">Comic Edition</h2>
                </div>
                <span className="text-[11px] font-medium text-ink-dim tabular-nums">
                  {editionRecords.length} {editionRecords.length === 1 ? 'edition' : 'editions'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => pushRoute({ view: 'read-editions', readId: item.id })}
                className="w-full rounded-2xl p-3 border border-white/[0.08] bg-background/50 hover:bg-surface-raised/70 flex items-center justify-between gap-3 text-left transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 aspect-[2/3] rounded-lg overflow-hidden border border-white/10 shrink-0 bg-surface-raised">
                    <MediaImage src={activeCover} alt={item.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">
                      {editionLabel || 'Digital / Issues'}
                    </p>
                    <p className="text-xs text-ink-dim tabular-nums mt-0.5">
                      {stats.total} {stats.unitLabel} · {completedList.length} logged
                    </p>
                    <p className="text-[11px] text-ink-faint truncate mt-0.5">
                      Browse covers, printings & collected issues
                    </p>
                  </div>
                </div>
                <span className="px-3 py-1.5 rounded-full bg-surface-raised border border-white/10 text-xs font-semibold text-ink inline-flex items-center gap-1 shrink-0">
                  <span>Browse editions</span>
                  <ChevronRight className="w-3.5 h-3.5 text-read" />
                </span>
              </button>
            </section>
          )}

          {/* Advanced Smart Container: Book Series */}
          {detailMode === 'advanced' && evalBookSeries && (
            <section className="rounded-[22px] bg-surface border border-white/[0.06] p-4 mb-5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-read flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Book Series Container</span>
                  </p>
                  <h2 className="font-display font-bold text-base text-ink mt-0.5">
                    {evalBookSeries.series.name}
                  </h2>
                </div>
                <span className="text-xs font-bold text-watched tabular-nums px-2.5 py-1 rounded-full bg-watched/15">
                  {evalBookSeries.finishedCount}/{evalBookSeries.totalCount} books
                </span>
              </div>

              <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-watched transition-all duration-300"
                  style={{ width: `${Math.round(evalBookSeries.ratio * 100)}%` }}
                />
              </div>

              <div className="divide-y divide-white/[0.06]">
                {evalBookSeries.entries.map((entry) => (
                  <div
                    key={entry.title}
                    role={entry.readId ? 'button' : undefined}
                    tabIndex={entry.readId ? 0 : undefined}
                    onClick={() => {
                      if (entry.readId && entry.readId !== item.id) {
                        pushRoute({ view: 'read-detail', readId: entry.readId });
                      }
                    }}
                    className={`py-2 flex items-center justify-between gap-3 ${
                      entry.readId && entry.readId !== item.id
                        ? 'cursor-pointer hover:bg-white/[0.02] -mx-2 px-2 rounded-xl'
                        : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`h-5 w-5 rounded-full flex items-center justify-center border shrink-0 ${
                          entry.finished
                            ? 'bg-watched/20 border-watched text-watched'
                            : 'border-white/15 text-ink-faint'
                        }`}
                      >
                        {entry.finished && <Check className="w-3 h-3" strokeWidth={2.5} />}
                      </span>
                      <span className="text-sm text-ink truncate">
                        {entry.title}
                        {entry.readId === item.id ? ' (this book)' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-xs text-ink-dim tabular-nums">
                      {typeof entry.userRating === 'number' && entry.userRating > 0 && (
                        <span className="text-brand font-semibold">★ {entry.userRating}</span>
                      )}
                      {entry.total > 0 && (
                        <span>
                          {entry.current}/{entry.total} ch
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {evalBookSeries.calculatedAvg !== null && evalBookSeries.ratedCount > 0 ? (
                <SuggestedRatingBanner
                  compact
                  label={evalBookSeries.series.name}
                  calculatedAvg={evalBookSeries.calculatedAvg}
                  ratedCount={evalBookSeries.ratedCount}
                  unitWord="books"
                  currentRating={storedSeriesRating?.rating}
                  ratingSource={storedSeriesRating?.source}
                  onAcceptAvg={(avg) => rateCollection(seriesRatingKey, avg, 'auto')}
                  onManualRate={(r) => rateCollection(seriesRatingKey, r, 'manual')}
                />
              ) : (
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.06]">
                  <span className="text-xs text-ink-dim">Rate {evalBookSeries.series.name}</span>
                  <RatingControl
                    size="sm"
                    value={storedSeriesRating?.rating}
                    onChange={(r) => rateCollection(seriesRatingKey, r, 'manual')}
                    labelPrefix={`Rate ${evalBookSeries.series.name}`}
                    allowClear
                  />
                </div>
              )}
            </section>
          )}

          {/* Advanced Issue / Chapter Checklist & Unit Ratings */}
          {detailMode === 'advanced' && (
            <section className="rounded-[22px] bg-surface border border-white/[0.06] p-4 mb-5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-sm font-semibold text-ink">
                  {item.unit === 'issues' ? 'Issue checklist & ratings' : 'Chapter checklist & ratings'}
                </h2>
                {stats.total > UNIT_PAGE_SIZE && (
                  <div className="flex items-center gap-1.5 text-xs text-ink-dim tabular-nums">
                    <button
                      type="button"
                      onClick={() => setUnitPageStart(Math.max(1, pageStart - UNIT_PAGE_SIZE))}
                      disabled={pageStart <= 1}
                      aria-label="Previous unit page"
                      className="h-6 w-6 rounded-full bg-white/8 flex items-center justify-center disabled:opacity-35"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span>
                      {pageStart}–{pageEnd} / {stats.total}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setUnitPageStart(Math.min(maxPageStart, pageStart + UNIT_PAGE_SIZE))
                      }
                      disabled={pageEnd >= stats.total}
                      aria-label="Next unit page"
                      className="h-6 w-6 rounded-full bg-white/8 flex items-center justify-center disabled:opacity-35"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5">
                {visibleUnitNumbers.map((u) => {
                  const done = completedSet.has(u);
                  const uRating = progress?.unitRatings?.[u];
                  const selected = safeSelectedUnit === u;
                  return (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setSelectedUnit(u)}
                      className={`h-9 rounded-xl border text-xs font-semibold tabular-nums flex flex-col items-center justify-center leading-none transition-colors ${
                        selected
                          ? 'border-white/55 ring-1 ring-white/30 ' +
                            (done ? 'bg-watched/25 text-watched' : 'bg-surface-raised text-ink')
                          : done
                            ? 'border-watched/45 bg-watched/15 text-watched'
                            : 'border-white/8 bg-background/60 text-ink-dim hover:text-ink'
                      }`}
                    >
                      <span>{item.unit === 'issues' ? `#${u}` : u}</span>
                      {typeof uRating === 'number' && uRating > 0 && (
                        <span className="text-[9px] text-brand mt-0.5 leading-none">
                          ★{formatRating(uRating)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="rounded-2xl bg-background/70 border border-white/[0.06] px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-semibold text-ink tabular-nums">
                    {item.unit === 'issues' ? `Issue #${safeSelectedUnit}` : `Chapter ${safeSelectedUnit}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleReadUnit(item.id, safeSelectedUnit)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                      completedSet.has(safeSelectedUnit)
                        ? 'border-watched/60 bg-watched/15 text-watched'
                        : 'border-white/15 bg-surface text-ink-dim hover:text-ink'
                    }`}
                  >
                    {completedSet.has(safeSelectedUnit) ? '✓ Read' : 'Mark read'}
                  </button>
                </div>

                <RatingControl
                  size="sm"
                  value={progress?.unitRatings?.[safeSelectedUnit]}
                  onChange={(r) => rateReadUnit(item.id, safeSelectedUnit, r)}
                  labelPrefix={`Rate ${item.unit === 'issues' ? `Issue #${safeSelectedUnit}` : `Chapter ${safeSelectedUnit}`}`}
                  allowClear
                />
              </div>
            </section>
          )}

          {/* Info & Star Rating */}
          <section className="pb-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold text-[16px] text-ink">About</h2>
                <p className="text-[13.5px] text-ink-dim mt-0.5">
                  {item.genres.join(' · ')} · {item.totalUnits} {stats.unitLabel}
                </p>
              </div>
              <RatingControl
                value={progress?.rating}
                onChange={(r) => rateReadItem(item.id, r, 'manual')}
                labelPrefix="Rate title"
                allowClear
              />
            </div>

            {unitAvg &&
              unitAvg.count > 0 &&
              (detailMode === 'advanced' || (stats.isFinished && !progress?.rating)) && (
                <div className="mt-3">
                  <SuggestedRatingBanner
                    compact
                    label={item.title}
                    calculatedAvg={unitAvg.avg}
                    ratedCount={unitAvg.count}
                    unitWord={stats.unitLabel}
                    currentRating={progress?.rating}
                    ratingSource={progress?.ratingSource}
                    onAcceptAvg={(avg) => rateReadItem(item.id, avg, 'auto')}
                    onManualRate={(r) => rateReadItem(item.id, r, 'manual')}
                  />
                </div>
              )}

            <p className={`text-[13.5px] text-ink-dim leading-relaxed mt-2.5 ${expanded ? '' : 'line-clamp-3'}`}>
              {item.overview}
            </p>
            <div className="flex items-center justify-between gap-2 mt-1">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-xs font-medium text-brand"
              >
                {expanded ? 'Show less' : 'More'}
              </button>
              {detailMode === 'simple' && (
                <button
                  type="button"
                  onClick={() => setDetailMode('advanced')}
                  className="text-xs font-medium text-ink-dim hover:text-brand transition-colors"
                >
                  Editions, checklist, ratings & notes →
                </button>
              )}
            </div>
          </section>

          {detailMode === 'advanced' && (
            <PersonalNotesSection
              domain="read"
              mediaKind={item.format}
              mediaId={item.id}
              mediaTitle={item.title}
              mediaPoster={activeCover}
              defaultContext={stats.current > 0 ? stats.unitShort : undefined}
              currentRating={progress?.rating}
              currentMood={progress?.mood}
              onSelectMood={(mood) => setReadMood(item.id, mood)}
            />
          )}
        </div>
      </div>

      <CoverLightbox
        open={lightboxOpen}
        src={activeCover}
        title={item.title}
        subtitle={editionLabel || `${item.creator} · ${item.year}`}
        onClose={() => setLightboxOpen(false)}
      />

      {listPickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/65 backdrop-blur-sm p-0 md:p-4"
          onClick={() => setListPickerOpen(false)}
        >
          <div
            className="w-full md:max-w-md bg-surface border border-white/10 rounded-t-[26px] md:rounded-[24px] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display font-bold text-lg text-ink mb-3">Add to custom list</h3>
            <div className="space-y-2 mb-4 max-h-56 overflow-y-auto">
              {state.lists.map((list) => {
                const included = list.items.some((x) => x.kind === 'read' && x.id === item.id);
                return (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => toggleItemInList(list.id, 'read', item.id)}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-background border border-white/8 text-left"
                  >
                    <div>
                      <p className="text-sm font-semibold text-ink">{list.name}</p>
                      <p className="text-xs text-ink-dim">{list.items.length} titles</p>
                    </div>
                    {included && <Check className="w-4 h-4 text-watched" />}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <input
                placeholder="New list name..."
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                className="flex-1 rounded-xl bg-background border border-white/10 px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={() => {
                  if (!newListName.trim()) return;
                  createCustomList(newListName, '', { kind: 'read', id: item.id });
                  setNewListName('');
                }}
                className="px-4 py-2 rounded-xl bg-brand text-brand-ink text-sm font-semibold"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
