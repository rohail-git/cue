import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, ChevronDown, ChevronRight, Plus, Search, Upload } from 'lucide-react';
import { BingersMediaRow } from '../components/BingersMediaRow';
import { FilterSortSheet } from '../components/FilterSortSheet';
import { MediaImage } from '../components/MediaImage';
import { MobileDomainBar, ScrollUpHistoryFeed } from '../components/ScrollUpHistoryFeed';
import { useCueStore } from '../store/useCueStore';
import type { ReadFilter, ReadItem } from '../types';
import { getComicEditionLabel, resolveComicEditionCover } from '../utils/editions';
import { classifyReadFormat } from '../utils/mediaImport';
import { getReadStats } from '../utils/stats';

export function ReadView({ calendarMode = false }: { calendarMode?: boolean }) {
  const {
    state,
    pushRoute,
    switchTab,
    toggleCalendarMode,
    setFilterSheetOpen,
    setImportModalOpen,
    updateSettings,
    advanceReadProgress,
    autoClassifyReadLibrary,
  } = useCueStore();

  const [justBumped, setJustBumped] = useState<Record<string, boolean>>({});
  const [showFinished, setShowFinished] = useState(false);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      for (const id of timersRef.current) window.clearTimeout(id);
    };
  }, []);

  const filter = state.settings.readFilter;

  const handleQuickAdvance = (e: React.MouseEvent, readId: string) => {
    e.stopPropagation();
    if (justBumped[readId]) return;
    setJustBumped((p) => ({ ...p, [readId]: true }));
    const tCommit = window.setTimeout(() => {
      advanceReadProgress(readId, 1);
    }, 250);
    const tClear = window.setTimeout(() => {
      setJustBumped((p) => {
        const copy = { ...p };
        delete copy[readId];
        return copy;
      });
    }, 640);
    timersRef.current.push(tCommit, tClear);
  };

  const readHistory = useMemo(
    () => (state.history || []).filter((h) => h.domain === 'read'),
    [state.history]
  );

  const { readingList, wantToReadList, finishedList } = useMemo(() => {
    const sortMode = state.settings.sortBy;
    const all = state.readOrder
      .map((id) => state.readItems[id])
      .filter((r): r is ReadItem => Boolean(r) && Boolean(state.readProgress[r.id]?.bookmarked))
      .filter((r) => (filter === 'all' ? true : r.format === filter));

    const sortItems = (list: ReadItem[]) =>
      [...list].sort((a, b) => {
        if (sortMode === 'alpha') return a.title.localeCompare(b.title);
        if (sortMode === 'rating') {
          return (
            (state.readProgress[b.id]?.rating || b.rating) -
            (state.readProgress[a.id]?.rating || a.rating)
          );
        }
        if (sortMode === 'progress') {
          return (
            getReadStats(b, state.readProgress[b.id]).ratio -
            getReadStats(a, state.readProgress[a.id]).ratio
          );
        }
        const statusRank = (id: string) => {
          const st = getReadStats(state.readItems[id], state.readProgress[id]);
          if (st.isFinished) return 2;
          if (st.current > 0) return 0;
          return 1;
        };
        const rankDiff = statusRank(a.id) - statusRank(b.id);
        if (rankDiff !== 0) return rankDiff;
        const ta = state.readProgress[a.id]?.lastReadAt || '';
        const tb = state.readProgress[b.id]?.lastReadAt || '';
        return tb.localeCompare(ta);
      });

    const sortedAll = sortItems(all);
    const reading: ReadItem[] = [];
    const want: ReadItem[] = [];
    const done: ReadItem[] = [];

    for (const item of sortedAll) {
      const st = getReadStats(item, state.readProgress[item.id]);
      if (st.isFinished) done.push(item);
      else if (st.current > 0) reading.push(item);
      else want.push(item);
    }

    return {
      readingList: reading,
      wantToReadList: want,
      finishedList: done,
    };
  }, [state.readOrder, state.readItems, state.readProgress, state.settings.sortBy, filter]);

  const upcomingReads = useMemo(
    () => state.upcoming.filter((u) => u.domain === 'read'),
    [state.upcoming]
  );

  const misclassifiedSummary = useMemo(() => {
    let comics = 0;
    let manga = 0;
    for (const id of state.readOrder) {
      const item = state.readItems[id];
      const prog = state.readProgress[id];
      if (!item || !prog?.bookmarked || item.format !== 'novel') continue;
      const detected = classifyReadFormat({
        title: item.title,
        author: item.creator,
        genres: item.genres,
      });
      if (detected === 'comic') comics += 1;
      else if (detected === 'manga') manga += 1;
    }
    return { comics, manga, total: comics + manga };
  }, [state.readOrder, state.readItems, state.readProgress]);

  const isPosterLayout = state.settings.readLayout === 'posters';

  const formatBadge = (fmt: ReadItem['format']) =>
    fmt === 'manga' ? 'Manga' : fmt === 'comic' ? 'Comic' : 'Novel';

  const renderReadCard = (item: ReadItem) => {
    const prog = state.readProgress[item.id];
    const stats = getReadStats(item, prog);
    const flash = Boolean(justBumped[item.id]);
    const displayCover = resolveComicEditionCover(item, prog?.edition, prog);
    const editionLabel =
      item.format === 'comic' ? getComicEditionLabel(prog?.edition, item, prog) : '';

    if (isPosterLayout) {
      return (
        <div
          key={item.id}
          role="button"
          tabIndex={0}
          onClick={() => pushRoute({ view: 'read-detail', readId: item.id })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') pushRoute({ view: 'read-detail', readId: item.id });
          }}
          className="group cursor-pointer text-left"
        >
          <div className="relative aspect-[2/3] rounded-[16px] overflow-hidden bg-surface border border-white/8">
            <MediaImage
              src={displayCover}
              alt={item.title}
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            />
            {!stats.isFinished && (
              <button
                type="button"
                onClick={(e) => handleQuickAdvance(e, item.id)}
                aria-label={`Advance ${item.title} by 1 ${stats.unitSingular}`}
                className={`absolute top-2 right-2 h-8 px-2.5 rounded-full backdrop-blur-md flex items-center justify-center border text-xs font-bold transition-all ${
                  flash
                    ? 'bg-watched/25 border-watched text-watched animate-check-pop'
                    : 'bg-black/65 border-white/20 text-white hover:border-watched hover:text-watched'
                }`}
              >
                +1
              </button>
            )}
            {state.settings.showPosterProgress && stats.current > 0 && (
              <div className="absolute bottom-0 inset-x-0 h-1 bg-black/50">
                <div
                  className="h-full bg-watched transition-all duration-300"
                  style={{ width: `${Math.round(stats.ratio * 100)}%` }}
                />
              </div>
            )}
          </div>
          <p className="mt-2 text-sm font-semibold text-ink truncate">{item.title}</p>
          <p className="text-xs text-ink-dim tabular-nums">
            {stats.isFinished
              ? `Finished${stats.rereadCount > 1 ? ` · x${stats.rereadCount}` : ''}`
              : `${stats.current}/${stats.total} ${stats.unitLabel}`}
          </p>
        </div>
      );
    }

    return (
      <BingersMediaRow
        key={item.id}
        title={item.title}
        badgeLabel={formatBadge(item.format)}
        badgeClassName="bg-read/15 text-read"
        posterUrl={displayCover}
        primaryLine={
          stats.isFinished
            ? `${stats.total}/${stats.total} ${stats.unitLabel}`
            : `${stats.nextUnitShort} · ${stats.current}/${stats.total} ${stats.unitLabel}`
        }
        secondaryLine={editionLabel ? `${item.creator} · ${editionLabel}` : item.creator}
        progressRatio={stats.ratio}
        showProgress={state.settings.showPosterProgress && stats.current > 0}
        isFlashing={flash}
        flashLabel="Read"
        actionContent={
          stats.isFinished ? (
            stats.rereadCount > 1 ? (
              `x${stats.rereadCount}`
            ) : (
              <Check className="w-[17px] h-[17px]" strokeWidth={2.4} />
            )
          ) : (
            <span className="inline-flex items-center text-xs font-bold tabular-nums px-0.5">
              <Plus className="w-3 h-3 mr-0.5" />1
            </span>
          )
        }
        actionAriaLabel={`Advance ${item.title} by 1 ${stats.unitSingular}`}
        actionDisabled={stats.isFinished}
        actionActive={stats.isFinished}
        onAction={!stats.isFinished ? (e) => handleQuickAdvance(e, item.id) : undefined}
        onOpen={() => pushRoute({ view: 'read-detail', readId: item.id })}
      />
    );
  };

  const filterTabs: { id: ReadFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'novel', label: 'Novels' },
    { id: 'manga', label: 'Manga' },
    { id: 'comic', label: 'Comics' },
  ];

  const listClass = isPosterLayout
    ? 'grid grid-cols-3 sm:grid-cols-4 gap-3.5'
    : 'space-y-3';

  return (
    <>
      <ScrollUpHistoryFeed
        historyItems={calendarMode ? [] : readHistory}
        onOpenHistoryItem={(entry) => pushRoute({ view: 'read-detail', readId: entry.mediaId })}
        resetAnchorKey={calendarMode ? 'calendar' : 'feed'}
        stickyHeader={
          <MobileDomainBar
            title="Upcoming reads"
            domainLabel="Read"
            calendarMode={calendarMode}
            onOpenFilter={() => setFilterSheetOpen(true)}
            onToggleCalendar={toggleCalendarMode}
            filterAriaLabel="Filter and sort reading list"
            calendarAriaLabel="Toggle upcoming reads calendar"
          />
        }
      >
        {!calendarMode && (
          <div className="flex items-center gap-2 mb-5 overflow-x-auto no-scrollbar">
            {filterTabs.map((t) => {
              const active = filter === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => updateSettings({ readFilter: t.id })}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold border shrink-0 transition-colors ${
                    active
                      ? 'bg-brand border-brand text-brand-ink'
                      : 'bg-surface border-white/10 text-ink-dim hover:text-ink'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        )}

        {calendarMode ? (
          <div className="animate-fade-in">
            <h2 className="font-display font-bold text-[22px] text-ink mb-3.5">
              Upcoming chapters & issues
            </h2>
            <div className="space-y-3">
              {upcomingReads.length === 0 ? (
                <div className="rounded-[22px] bg-surface border border-white/[0.06] p-8 text-center">
                  <BookOpen className="w-7 h-7 text-read mx-auto mb-2.5 opacity-80" />
                  <p className="font-display font-bold text-lg text-ink">
                    No upcoming chapters or issues yet
                  </p>
                  <p className="text-xs text-ink-dim mt-1">
                    Track novels, manga, or comics from Search to build your reading calendar.
                  </p>
                </div>
              ) : (
                upcomingReads.map((u) => (
                  <BingersMediaRow
                    key={u.id}
                    title={u.title}
                    posterUrl={u.artworkUrl}
                    primaryLine={u.subtitle}
                    actionDisabled
                    actionContent={
                      <span className="flex flex-col items-center px-1">
                        <span className="text-[17px] font-display font-bold text-ink tabular-nums leading-none">
                          {u.daysUntil}
                        </span>
                        <span className="text-[10px] text-ink-dim mt-0.5">days</span>
                      </span>
                    }
                    onOpen={() => pushRoute({ view: 'read-detail', readId: u.mediaId })}
                  />
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="animate-fade-in">
            {misclassifiedSummary.total > 0 && (filter === 'all' || filter === 'novel') && (
              <div className="mb-5 rounded-[20px] bg-surface border border-read/25 p-3.5 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-ink">
                    Found{' '}
                    {[
                      misclassifiedSummary.comics > 0
                        ? `${misclassifiedSummary.comics} ${misclassifiedSummary.comics === 1 ? 'comic' : 'comics'}`
                        : '',
                      misclassifiedSummary.manga > 0
                        ? `${misclassifiedSummary.manga} manga`
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' & ')}{' '}
                    filed under Novels
                  </p>
                  <p className="text-[11px] text-ink-dim mt-0.5">
                    Move them to their dedicated Comics &amp; Manga tabs (Undo anytime)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => autoClassifyReadLibrary()}
                  className="px-3.5 py-1.5 rounded-full bg-read text-[#1E1608] text-xs font-semibold hover:opacity-95 transition-opacity shrink-0"
                >
                  Move to Comics &amp; Manga
                </button>
              </div>
            )}

            {readingList.length === 0 &&
              wantToReadList.length === 0 &&
              finishedList.length === 0 && (
                <div className="rounded-[22px] bg-surface border border-white/[0.06] p-8 text-center my-4">
                  <BookOpen className="w-8 h-8 text-read mx-auto mb-3 opacity-85" />
                  <h2 className="font-display font-bold text-[20px] text-ink">
                    Nothing in Read yet
                  </h2>
                  <p className="text-sm text-ink-dim mt-1 max-w-sm mx-auto">
                    Search for novels, manga, or comic editions to track chapters and issues.
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-2.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => switchTab('search')}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-brand text-brand-ink text-sm font-semibold hover:opacity-95 transition-opacity"
                    >
                      <Search className="w-4 h-4" />
                      <span>Search Read</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportModalOpen(true)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-surface-raised border border-white/10 text-ink text-sm font-semibold hover:bg-white/10 transition-colors"
                    >
                      <Upload className="w-4 h-4 text-read" />
                      <span>Import Goodreads / CSV</span>
                    </button>
                  </div>
                </div>
              )}

            {readingList.length > 0 && (
              <section className="mb-8">
                <h2 className="font-display font-bold text-[22px] text-ink mb-3.5">
                  Currently reading
                </h2>
                <div className={listClass}>{readingList.map(renderReadCard)}</div>
              </section>
            )}

            {wantToReadList.length > 0 && (
              <section className="mb-8">
                <h2 className="font-display font-bold text-[22px] text-ink mb-3.5">
                  Collecting dust
                </h2>
                <div className={listClass}>{wantToReadList.map(renderReadCard)}</div>
              </section>
            )}

            {finishedList.length > 0 && (
              <section>
                <button
                  type="button"
                  onClick={() => setShowFinished((v) => !v)}
                  className="flex items-center gap-2 font-display font-bold text-[19px] text-ink-dim hover:text-ink mb-3.5 transition-colors"
                >
                  <span>Finished ({finishedList.length})</span>
                  {showFinished ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
                {showFinished && <div className={listClass}>{finishedList.map(renderReadCard)}</div>}
              </section>
            )}
          </div>
        )}
      </ScrollUpHistoryFeed>

      <FilterSortSheet domain="read" />
    </>
  );
}
