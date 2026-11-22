import { useMemo, useState } from 'react';
import { Calendar, Check, ChevronDown, ChevronRight, ListFilter, Plus } from 'lucide-react';
import { FilterSortSheet } from '../components/FilterSortSheet';
import { MediaImage } from '../components/MediaImage';
import { useCueStore } from '../store/useCueStore';
import type { ReadFilter, ReadItem } from '../types';
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

  const filter = state.settings.readFilter;

  const handleQuickAdvance = (e: React.MouseEvent, readId: string) => {
    e.stopPropagation();
    setJustBumped((p) => ({ ...p, [readId]: true }));
    advanceReadProgress(readId);
    setTimeout(() => {
      setJustBumped((p) => {
        const copy = { ...p };
        delete copy[readId];
        return copy;
      });
    }, 320);
  };

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
        const ta = state.readProgress[a.id]?.lastReadAt || '';
        const tb = state.readProgress[b.id]?.lastReadAt || '';
        return tb.localeCompare(ta);
      });

    const reading: ReadItem[] = [];
    const want: ReadItem[] = [];
    const done: ReadItem[] = [];

    for (const item of all) {
      const st = getReadStats(item, state.readProgress[item.id]);
      if (st.isFinished) done.push(item);
      else if (st.current > 0) reading.push(item);
      else want.push(item);
    }

    return {
      readingList: sortItems(reading),
      wantToReadList: sortItems(want),
      finishedList: sortItems(done),
    };
  }, [state.readOrder, state.readItems, state.readProgress, state.settings.sortBy, filter]);

  const upcomingReads = useMemo(
    () => state.upcoming.filter((u) => u.domain === 'read'),
    [state.upcoming]
  );

  const isPosterLayout = state.settings.readLayout === 'posters';

  const formatBadge = (fmt: ReadItem['format']) =>
    fmt === 'manga' ? 'Manga' : fmt === 'comic' ? 'Comic' : 'Book';

  const renderReadCard = (item: ReadItem) => {
    const prog = state.readProgress[item.id];
    const stats = getReadStats(item, prog);
    const flash = Boolean(justBumped[item.id]);

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
          <div className="relative aspect-[2/3] rounded-[18px] overflow-hidden bg-surface border border-white/8">
            <MediaImage
              src={item.coverUrl}
              alt={item.title}
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            />
            {!stats.isFinished && (
              <button
                type="button"
                onClick={(e) => handleQuickAdvance(e, item.id)}
                aria-label={`Advance ${item.title}`}
                className={`absolute top-2 right-2 h-8 px-2.5 rounded-full backdrop-blur-md flex items-center justify-center border text-xs font-bold transition-all ${
                  flash
                    ? 'bg-watched/25 border-watched text-watched animate-check-pop'
                    : 'bg-black/65 border-white/20 text-white hover:border-watched hover:text-watched'
                }`}
              >
                +{stats.stepAmount}
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
              : `${stats.current}/${stats.total} ${item.unit}`}
          </p>
        </div>
      );
    }

    return (
      <div
        key={item.id}
        role="button"
        tabIndex={0}
        onClick={() => pushRoute({ view: 'read-detail', readId: item.id })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') pushRoute({ view: 'read-detail', readId: item.id });
        }}
        className="group relative rounded-[20px] bg-surface hover:bg-[#1e1b1b] border border-white/[0.04] overflow-hidden flex items-center cursor-pointer transition-colors"
      >
        <div className="w-[68px] sm:w-[74px] h-[100px] shrink-0 overflow-hidden bg-[#121010] relative">
          <MediaImage
            src={item.coverUrl}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
          />
          {state.settings.showPosterProgress && stats.current > 0 && (
            <div className="absolute bottom-0 inset-x-0 h-[3px] bg-black/45">
              <div
                className="h-full bg-watched transition-all duration-300"
                style={{ width: `${Math.round(stats.ratio * 100)}%` }}
              />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 px-3.5 py-2">
          <div className="flex items-center gap-1.5">
            <h3 className="text-[15.5px] font-semibold text-ink truncate leading-tight">
              {item.title}
            </h3>
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-white/8 text-ink-dim shrink-0">
              {formatBadge(item.format)}
            </span>
          </div>
          <p className="text-[13.5px] text-ink-dim tabular-nums mt-0.5">
            {stats.isFinished
              ? `${stats.total}/${stats.total} ${item.unit}`
              : `${stats.unitShort} · ${stats.current}/${stats.total} ${item.unit}`}
          </p>
          <p className="text-[13px] text-ink-faint truncate mt-0.5">{item.creator}</p>
        </div>

        <div className="pr-3.5 shrink-0">
          {!stats.isFinished ? (
            <button
              type="button"
              onClick={(e) => handleQuickAdvance(e, item.id)}
              aria-label={`Advance ${item.title} by ${stats.stepAmount}`}
              className={`h-[40px] min-w-[40px] px-2.5 rounded-full border flex items-center justify-center text-xs font-bold tabular-nums transition-all active:scale-90 ${
                flash
                  ? 'border-watched/70 bg-watched/15 text-watched animate-check-pop'
                  : 'border-white/15 bg-white/[0.02] text-ink-dim hover:border-watched/60 hover:text-watched'
              }`}
            >
              <Plus className="w-3 h-3 mr-0.5" />
              {stats.stepAmount}
              {item.unit === 'pages' ? 'p' : ''}
            </button>
          ) : (
            <span className="text-sm font-bold text-watched tabular-nums px-1.5 flex items-center gap-1">
              {stats.rereadCount > 1 ? `x${stats.rereadCount}` : <Check className="w-4 h-4" />}
            </span>
          )}
        </div>
      </div>
    );
  };

  const filterTabs: { id: ReadFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'book', label: 'Books' },
    { id: 'manga', label: 'Manga' },
    { id: 'comic', label: 'Comics' },
  ];

  return (
    <div className="min-h-dvh pb-28 md:pb-14 pt-4 md:pt-24 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => setFilterSheetOpen(true)}
          aria-label="Filter and sort reading list"
          className="glass-btn h-10 w-10 rounded-full flex items-center justify-center text-ink"
        >
          <ListFilter className="w-4 h-4" />
        </button>

        <h1 className="font-display font-bold text-[19px] text-ink tracking-tight">
          {calendarMode ? 'Upcoming reads' : 'Read'}
        </h1>

        <button
          type="button"
          onClick={toggleCalendarMode}
          aria-label="Toggle upcoming reads calendar"
          className={`glass-btn h-10 w-10 rounded-full flex items-center justify-center transition-colors ${
            calendarMode ? 'text-brand border-brand/50 bg-brand/15' : 'text-ink'
          }`}
        >
          <Calendar className="w-4 h-4" />
        </button>
      </div>

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
                    ? 'bg-brand border-brand text-white'
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {upcomingReads.map((u) => (
              <div
                key={u.id}
                role="button"
                tabIndex={0}
                onClick={() => pushRoute({ view: 'read-detail', readId: u.mediaId })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') pushRoute({ view: 'read-detail', readId: u.mediaId });
                }}
                className="rounded-[20px] bg-surface hover:bg-[#1e1b1b] border border-white/[0.04] overflow-hidden flex items-center cursor-pointer transition-colors"
              >
                <div className="w-[68px] h-[94px] shrink-0 overflow-hidden bg-[#121010]">
                  <MediaImage src={u.artworkUrl} alt={u.title} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0 px-3.5 py-2">
                  <h3 className="text-[15.5px] font-semibold text-ink truncate">{u.title}</h3>
                  <p className="text-[13px] text-ink-dim mt-0.5">{u.subtitle}</p>
                </div>
                <div className="pr-4 text-center">
                  <span className="text-[19px] font-display font-bold text-ink tabular-nums block leading-none">
                    {u.daysUntil}
                  </span>
                  <span className="text-[11px] text-ink-dim">days</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="animate-fade-in">
          {readingList.length > 0 && (
            <section className="mb-8">
              <h2 className="font-display font-bold text-[22px] text-ink mb-3.5">Reading now</h2>
              <div
                className={
                  isPosterLayout
                    ? 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3.5'
                    : 'grid grid-cols-1 md:grid-cols-2 gap-3'
                }
              >
                {readingList.map(renderReadCard)}
              </div>
            </section>
          )}

          {wantToReadList.length > 0 && (
            <section className="mb-8">
              <h2 className="font-display font-bold text-[22px] text-ink mb-3.5">Want to read</h2>
              <div
                className={
                  isPosterLayout
                    ? 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3.5'
                    : 'grid grid-cols-1 md:grid-cols-2 gap-3'
                }
              >
                {wantToReadList.map(renderReadCard)}
              </div>
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
              {showFinished && (
                <div
                  className={
                    isPosterLayout
                      ? 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3.5'
                      : 'grid grid-cols-1 md:grid-cols-2 gap-3'
                  }
                >
                  {finishedList.map(renderReadCard)}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      <FilterSortSheet domain="read" />
    </div>
  );
}
