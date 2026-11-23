import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Plus, Trophy } from 'lucide-react';
import { BingersMediaRow } from '../components/BingersMediaRow';
import { FilterSortSheet } from '../components/FilterSortSheet';
import { MediaImage } from '../components/MediaImage';
import { MobileDomainBar, ScrollUpHistoryFeed } from '../components/ScrollUpHistoryFeed';
import { useCueStore } from '../store/useCueStore';
import type { GameItem, PlayFilter } from '../types';

export function PlayView({ calendarMode = false }: { calendarMode?: boolean }) {
  const {
    state,
    pushRoute,
    toggleCalendarMode,
    setFilterSheetOpen,
    updateSettings,
    logGameSession,
  } = useCueStore();

  const [justLogged, setJustLogged] = useState<Record<string, boolean>>({});
  const [showCompleted, setShowCompleted] = useState(false);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      for (const id of timersRef.current) window.clearTimeout(id);
    };
  }, []);

  const filter = state.settings.playFilter;

  const handleQuickHour = (e: React.MouseEvent, gameId: string) => {
    e.stopPropagation();
    if (justLogged[gameId]) return;
    setJustLogged((p) => ({ ...p, [gameId]: true }));
    const tCommit = window.setTimeout(() => {
      logGameSession(gameId, 1);
    }, 250);
    const tClear = window.setTimeout(() => {
      setJustLogged((p) => {
        const copy = { ...p };
        delete copy[gameId];
        return copy;
      });
    }, 640);
    timersRef.current.push(tCommit, tClear);
  };

  const playHistory = useMemo(
    () => (state.history || []).filter((h) => h.domain === 'play'),
    [state.history]
  );

  const { playingList, backlogList, completedList } = useMemo(() => {
    const sortMode = state.settings.sortBy;
    const all = state.gameOrder
      .map((id) => state.games[id])
      .filter((g): g is GameItem => Boolean(g) && Boolean(state.gameProgress[g.id]?.bookmarked))
      .filter((g) => {
        if (filter === 'all') return true;
        return state.gameProgress[g.id]?.status === filter;
      });

    const sortGames = (list: GameItem[]) =>
      [...list].sort((a, b) => {
        if (sortMode === 'alpha') return a.title.localeCompare(b.title);
        if (sortMode === 'rating') {
          return (
            (state.gameProgress[b.id]?.rating || b.rating) -
            (state.gameProgress[a.id]?.rating || a.rating)
          );
        }
        if (sortMode === 'progress') {
          return (
            (state.gameProgress[b.id]?.completionPct || 0) -
            (state.gameProgress[a.id]?.completionPct || 0)
          );
        }
        const ta = state.gameProgress[a.id]?.lastPlayedAt || '';
        const tb = state.gameProgress[b.id]?.lastPlayedAt || '';
        return tb.localeCompare(ta);
      });

    return {
      playingList: sortGames(all.filter((g) => state.gameProgress[g.id]?.status === 'playing')),
      backlogList: sortGames(all.filter((g) => state.gameProgress[g.id]?.status === 'backlog')),
      completedList: sortGames(all.filter((g) => state.gameProgress[g.id]?.status === 'completed')),
    };
  }, [state.gameOrder, state.games, state.gameProgress, state.settings.sortBy, filter]);

  const upcomingGames = useMemo(
    () => state.upcoming.filter((u) => u.domain === 'play'),
    [state.upcoming]
  );

  const isPosterLayout = state.settings.playLayout === 'posters';

  const renderGameCard = (game: GameItem) => {
    const prog = state.gameProgress[game.id];
    const isCompleted = prog?.status === 'completed';
    const flash = Boolean(justLogged[game.id]);

    if (isPosterLayout) {
      return (
        <div
          key={game.id}
          role="button"
          tabIndex={0}
          onClick={() => pushRoute({ view: 'game-detail', gameId: game.id })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') pushRoute({ view: 'game-detail', gameId: game.id });
          }}
          className="group cursor-pointer text-left"
        >
          <div className="relative aspect-[2/3] rounded-[16px] overflow-hidden bg-surface border border-white/8">
            <MediaImage
              src={game.coverUrl}
              alt={game.title}
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            />
            {!isCompleted && (
              <button
                type="button"
                onClick={(e) => handleQuickHour(e, game.id)}
                aria-label={`Log 1h on ${game.title}`}
                className={`absolute top-2 right-2 h-8 px-2.5 rounded-full backdrop-blur-md flex items-center justify-center border text-xs font-bold transition-all ${
                  flash
                    ? 'bg-watched/25 border-watched text-watched animate-check-pop'
                    : 'bg-black/65 border-white/20 text-white hover:border-watched hover:text-watched'
                }`}
              >
                +1h
              </button>
            )}
            {state.settings.showPosterProgress && (prog?.completionPct || 0) > 0 && (
              <div className="absolute bottom-0 inset-x-0 h-1 bg-black/50">
                <div
                  className="h-full bg-watched transition-all duration-300"
                  style={{ width: `${prog?.completionPct || 0}%` }}
                />
              </div>
            )}
          </div>
          <p className="mt-2 text-sm font-semibold text-ink truncate">{game.title}</p>
          <p className="text-xs text-ink-dim tabular-nums">
            {prog?.hoursPlayed || 0}h · {prog?.platform || game.platforms[0]}
          </p>
        </div>
      );
    }

    return (
      <BingersMediaRow
        key={game.id}
        title={game.title}
        badgeLabel={prog?.platinum ? 'Platinum' : undefined}
        badgeClassName="bg-play/15 text-play"
        posterUrl={game.coverUrl}
        primaryLine={`${prog?.hoursPlayed || 0}h played · ${prog?.completionPct || 0}%`}
        secondaryLine={`${prog?.platform || game.platforms[0]} · ${game.developer}`}
        progressRatio={(prog?.completionPct || 0) / 100}
        showProgress={state.settings.showPosterProgress && (prog?.completionPct || 0) > 0}
        isFlashing={flash}
        flashLabel="Logged +1h"
        actionContent={
          isCompleted ? (
            (prog?.playthroughCount || 1) > 1 ? (
              `x${prog?.playthroughCount}`
            ) : (
              <span className="inline-flex items-center gap-1">
                {prog?.platinum && <Trophy className="w-3.5 h-3.5 text-brand" />}
                <Check className="w-[17px] h-[17px]" strokeWidth={2.4} />
              </span>
            )
          ) : (
            <span className="inline-flex items-center text-xs font-bold tabular-nums px-0.5">
              <Plus className="w-3 h-3 mr-0.5" />1h
            </span>
          )
        }
        actionAriaLabel={`Log +1 hour on ${game.title}`}
        actionDisabled={isCompleted}
        actionActive={isCompleted}
        onAction={!isCompleted ? (e) => handleQuickHour(e, game.id) : undefined}
        onOpen={() => pushRoute({ view: 'game-detail', gameId: game.id })}
      />
    );
  };

  const filterTabs: { id: PlayFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'playing', label: 'Playing' },
    { id: 'backlog', label: 'Backlog' },
    { id: 'completed', label: 'Completed' },
  ];

  const listClass = isPosterLayout
    ? 'grid grid-cols-3 sm:grid-cols-4 gap-3.5'
    : 'space-y-3';

  return (
    <>
      <ScrollUpHistoryFeed
        historyItems={calendarMode ? [] : playHistory}
        onOpenHistoryItem={(entry) => pushRoute({ view: 'game-detail', gameId: entry.mediaId })}
        resetAnchorKey={calendarMode ? 'calendar' : 'feed'}
        stickyHeader={
          <MobileDomainBar
            title="Game updates"
            calendarMode={calendarMode}
            onOpenFilter={() => setFilterSheetOpen(true)}
            onToggleCalendar={toggleCalendarMode}
            filterAriaLabel="Filter and sort games"
            calendarAriaLabel="Toggle game releases calendar"
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
                  onClick={() => updateSettings({ playFilter: t.id })}
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
              Upcoming patches & releases
            </h2>
            <div className="space-y-3">
              {upcomingGames.map((u) => {
                const game = state.games[u.mediaId];
                return (
                  <BingersMediaRow
                    key={u.id}
                    title={u.title}
                    posterUrl={game?.coverUrl || u.artworkUrl}
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
                    onOpen={() => pushRoute({ view: 'game-detail', gameId: u.mediaId })}
                  />
                );
              })}
            </div>
          </div>
        ) : (
          <div className="animate-fade-in">
            {playingList.length > 0 && (
              <section className="mb-8">
                <h2 className="font-display font-bold text-[22px] text-ink mb-3.5">Playing now</h2>
                <div className={listClass}>{playingList.map(renderGameCard)}</div>
              </section>
            )}

            {backlogList.length > 0 && (
              <section className="mb-8">
                <h2 className="font-display font-bold text-[22px] text-ink mb-3.5">
                  Collecting dust
                </h2>
                <div className={listClass}>{backlogList.map(renderGameCard)}</div>
              </section>
            )}

            {completedList.length > 0 && (
              <section>
                <button
                  type="button"
                  onClick={() => setShowCompleted((v) => !v)}
                  className="flex items-center gap-2 font-display font-bold text-[19px] text-ink-dim hover:text-ink mb-3.5 transition-colors"
                >
                  <span>Completed ({completedList.length})</span>
                  {showCompleted ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
                {showCompleted && (
                  <div className={listClass}>{completedList.map(renderGameCard)}</div>
                )}
              </section>
            )}
          </div>
        )}
      </ScrollUpHistoryFeed>

      <FilterSortSheet domain="play" />
    </>
  );
}
