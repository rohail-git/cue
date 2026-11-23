import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { BingersMediaRow } from '../components/BingersMediaRow';
import { FilterSortSheet } from '../components/FilterSortSheet';
import { MediaImage } from '../components/MediaImage';
import { MobileDomainBar, ScrollUpHistoryFeed } from '../components/ScrollUpHistoryFeed';
import { useCueStore } from '../store/useCueStore';
import type { ReadFilter, ReadItem } from '../types';
import { getComicEditionLabel } from '../utils/editions';
import { getReadStats } from '../utils/stats';

export function ReadView({ calendarMode = false }: { calendarMode?: boolean }) {
  const {
    state,
    pushRoute,
    toggleCalendarMode,
    setFilterSheetOpen,
    updateSettings,
    advanceReadProgress,
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

  const { allBookmarked, readingList, wantToReadList, finishedList } = useMemo(() => {
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
      allBookmarked: sortedAll,
      readingList: reading,
      wantToReadList: want,
      finishedList: done,
    };
  }, [state.readOrder, state.readItems, state.readProgress, state.settings.sortBy, filter]);

  const novelSection = useMemo(
    () => allBookmarked.filter((i) => i.format === 'novel'),
    [allBookmarked]
  );
  const mangaSection = useMemo(
    () => allBookmarked.filter((i) => i.format === 'manga'),
    [allBookmarked]
  );
  const comicSection = useMemo(
    () => allBookmarked.filter((i) => i.format === 'comic'),
    [allBookmarked]
  );

  const upcomingReads = useMemo(
    () => state.upcoming.filter((u) => u.domain === 'read'),
    [state.upcoming]
  );

  const isPosterLayout = state.settings.readLayout === 'posters';

  const formatBadge = (fmt: ReadItem['format']) =>
    fmt === 'manga' ? 'Manga' : fmt === 'comic' ? 'Comic' : 'Novel';

  const renderReadCard = (item: ReadItem) => {
    const prog = state.readProgress[item.id];
    const stats = getReadStats(item, prog);
    const flash = Boolean(justBumped[item.id]);
    const displayCover = (prog?.edition && item.editionCovers?.[prog.edition]) || item.coverUrl;
    const editionLabel =
      item.format === 'comic' ? getComicEditionLabel(prog?.edition, item) : '';

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
            : `${stats.unitShort} · ${stats.current}/${stats.total} ${stats.unitLabel}`
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
              {upcomingReads.map((u) => (
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
              ))}
            </div>
          </div>
        ) : filter === 'all' ? (
          <div className="animate-fade-in space-y-8">
            {novelSection.length > 0 && (
              <section>
                <div className="flex items-baseline justify-between mb-3.5">
                  <h2 className="font-display font-bold text-[22px] text-ink">Novels</h2>
                  <span className="text-xs text-ink-dim">Chapters</span>
                </div>
                <div className={listClass}>{novelSection.map(renderReadCard)}</div>
              </section>
            )}

            {mangaSection.length > 0 && (
              <section>
                <div className="flex items-baseline justify-between mb-3.5">
                  <h2 className="font-display font-bold text-[22px] text-ink">Manga</h2>
                  <span className="text-xs text-ink-dim">Chapters</span>
                </div>
                <div className={listClass}>{mangaSection.map(renderReadCard)}</div>
              </section>
            )}

            {comicSection.length > 0 && (
              <section>
                <div className="flex items-baseline justify-between mb-3.5">
                  <h2 className="font-display font-bold text-[22px] text-ink">Comics</h2>
                  <span className="text-xs text-ink-dim">Issues</span>
                </div>
                <div className={listClass}>{comicSection.map(renderReadCard)}</div>
              </section>
            )}
          </div>
        ) : (
          <div className="animate-fade-in">
            {readingList.length > 0 && (
              <section className="mb-8">
                <h2 className="font-display font-bold text-[22px] text-ink mb-3.5">Reading now</h2>
                <div className={listClass}>{readingList.map(renderReadCard)}</div>
              </section>
            )}

            {wantToReadList.length > 0 && (
              <section className="mb-8">
                <h2 className="font-display font-bold text-[22px] text-ink mb-3.5">Want to read</h2>
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
