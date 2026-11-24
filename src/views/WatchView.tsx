import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Search, Tv } from 'lucide-react';
import { BingersMediaRow } from '../components/BingersMediaRow';
import { FilterSortSheet } from '../components/FilterSortSheet';
import { MediaImage } from '../components/MediaImage';
import { ReleaseAlertBanner } from '../components/ReleaseAlertBanner';
import { MobileDomainBar, ScrollUpHistoryFeed } from '../components/ScrollUpHistoryFeed';
import { useCueStore } from '../store/useCueStore';
import type { HistoryEntry, Movie, Show, UpcomingEntry, WatchFilter } from '../types';
import { formatEpisodeCode, getShowStats } from '../utils/stats';

export function WatchView({ calendarMode = false }: { calendarMode?: boolean }) {
  const {
    state,
    pushRoute,
    switchTab,
    toggleCalendarMode,
    setFilterSheetOpen,
    updateSettings,
    watchNextEpisode,
    toggleMovieWatched,
    showToast,
  } = useCueStore();

  const [justChecked, setJustChecked] = useState<Record<string, boolean>>({});
  const [showFinished, setShowFinished] = useState(false);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      for (const id of timersRef.current) window.clearTimeout(id);
    };
  }, []);

  const filter = state.settings.watchFilter;

  const triggerFlash = (id: string, commit: () => void) => {
    if (justChecked[id]) return;
    setJustChecked((prev) => ({ ...prev, [id]: true }));
    const tCommit = window.setTimeout(commit, 250);
    const tClear = window.setTimeout(() => {
      setJustChecked((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    }, 640);
    timersRef.current.push(tCommit, tClear);
  };

  const handleQuickWatchShow = (e: React.MouseEvent, showId: string) => {
    e.stopPropagation();
    triggerFlash(showId, () => watchNextEpisode(showId));
  };

  const handleQuickWatchMovie = (e: React.MouseEvent, movieId: string) => {
    e.stopPropagation();
    triggerFlash(movieId, () => toggleMovieWatched(movieId));
  };

  const watchHistory = useMemo(
    () => (state.history || []).filter((h) => h.domain === 'watch'),
    [state.history]
  );

  const openHistoryEntry = (entry: HistoryEntry) => {
    if (entry.mediaKind === 'movie') {
      pushRoute({ view: 'movie-detail', movieId: entry.mediaId });
    } else {
      pushRoute({ view: 'show-detail', showId: entry.mediaId });
    }
  };

  const { watchingShows, notStartedShows, finishedShows, watchlistMovies, watchedMovies } =
    useMemo(() => {
      const sortMode = state.settings.sortBy;

      const shows = state.showOrder
        .map((id) => state.shows[id])
        .filter((s): s is Show => Boolean(s) && Boolean(state.showProgress[s.id]?.bookmarked))
        .filter((s) => {
          if (filter === 'movie') return false;
          if (filter === 'tv') return s.mediaType === 'tv';
          if (filter === 'anime') return s.mediaType === 'anime';
          return true;
        });

      const sortShows = (list: Show[]) =>
        [...list].sort((a, b) => {
          if (sortMode === 'alpha') return a.title.localeCompare(b.title);
          if (sortMode === 'rating') {
            return (
              (state.showProgress[b.id]?.rating || b.rating) -
              (state.showProgress[a.id]?.rating || a.rating)
            );
          }
          if (sortMode === 'progress') {
            return (
              getShowStats(b, state.showProgress[b.id]).progressRatio -
              getShowStats(a, state.showProgress[a.id]).progressRatio
            );
          }
          const ta = state.showProgress[a.id]?.lastWatchedAt || '';
          const tb = state.showProgress[b.id]?.lastWatchedAt || '';
          return tb.localeCompare(ta);
        });

      const watching: Show[] = [];
      const notStarted: Show[] = [];
      const finished: Show[] = [];
      for (const s of shows) {
        const st = getShowStats(s, state.showProgress[s.id]);
        if (st.isFinished) finished.push(s);
        else if (st.watchedUnique > 0) watching.push(s);
        else notStarted.push(s);
      }

      const movies =
        filter === 'tv' || filter === 'anime'
          ? []
          : state.movieOrder
              .map((id) => state.movies[id])
              .filter((m): m is Movie => Boolean(m) && Boolean(state.movieProgress[m.id]));

      const sortMovies = (list: Movie[]) =>
        [...list].sort((a, b) => {
          if (sortMode === 'alpha') return a.title.localeCompare(b.title);
          if (sortMode === 'rating') return b.rating - a.rating;
          if (sortMode === 'progress') return a.runtime - b.runtime;
          const ta = state.movieProgress[a.id]?.watchedAt || '';
          const tb = state.movieProgress[b.id]?.watchedAt || '';
          return tb.localeCompare(ta);
        });

      const wMovies = movies.filter((m) => (state.movieProgress[m.id]?.watchCount || 0) === 0);
      const dMovies = movies.filter((m) => (state.movieProgress[m.id]?.watchCount || 0) > 0);

      return {
        watchingShows: sortShows(watching),
        notStartedShows: sortShows(notStarted),
        finishedShows: sortShows(finished),
        watchlistMovies: sortMovies(wMovies),
        watchedMovies: sortMovies(dMovies),
      };
    }, [
      state.showOrder,
      state.shows,
      state.showProgress,
      state.movieOrder,
      state.movies,
      state.movieProgress,
      state.settings.sortBy,
      filter,
    ]);

  const upcomingGroups = useMemo(() => {
    const items = state.upcoming.filter((u) => u.domain === 'watch');
    return {
      today: items.filter((u) => u.daysUntil === 0),
      thisWeek: items.filter((u) => u.daysUntil > 0 && u.daysUntil <= 6),
      later: items.filter((u) => u.daysUntil >= 7),
    };
  }, [state.upcoming]);

  const isPosterLayout = state.settings.watchLayout === 'posters';

  const renderShowCard = (show: Show) => {
    const prog = state.showProgress[show.id];
    const stats = getShowStats(show, prog);
    const next = stats.nextEpisode;
    const flash = Boolean(justChecked[show.id]);

    if (isPosterLayout) {
      return (
        <div
          key={show.id}
          role="button"
          tabIndex={0}
          onClick={() => pushRoute({ view: 'show-detail', showId: show.id })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') pushRoute({ view: 'show-detail', showId: show.id });
          }}
          className="group cursor-pointer text-left"
        >
          <div className="relative aspect-[2/3] rounded-[16px] overflow-hidden bg-surface border border-white/8">
            <MediaImage
              src={show.posterUrl}
              alt={show.title}
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            />
            {!stats.isFinished && (
              <button
                type="button"
                onClick={(e) => handleQuickWatchShow(e, show.id)}
                aria-label={`Mark ${show.title} next episode watched`}
                className={`absolute top-2 right-2 h-8 w-8 rounded-full backdrop-blur-md flex items-center justify-center border transition-all ${
                  flash
                    ? 'bg-watched/25 border-watched text-watched animate-check-pop'
                    : 'bg-black/60 border-white/20 text-white hover:border-watched hover:text-watched'
                }`}
              >
                <Check className="w-4 h-4" />
              </button>
            )}
            {state.settings.showPosterProgress && (
              <div className="absolute bottom-0 inset-x-0 h-1 bg-black/50">
                <div
                  className="h-full bg-watched transition-all duration-300"
                  style={{ width: `${Math.round(stats.progressRatio * 100)}%` }}
                />
              </div>
            )}
          </div>
          <p className="mt-2 text-sm font-semibold text-ink truncate">{show.title}</p>
          <p className="text-xs text-ink-dim tabular-nums">
            {next
              ? `${formatEpisodeCode(next.season, next.number)} · ${stats.nextOrdinal}/${stats.totalEpisodes}`
              : 'Finished'}
          </p>
        </div>
      );
    }

    return (
      <BingersMediaRow
        key={show.id}
        title={show.title}
        badgeLabel={show.mediaType === 'anime' ? 'Anime' : undefined}
        badgeClassName="bg-watch/15 text-watch"
        posterUrl={show.posterUrl}
        posterTag={next?.number === 1 ? 'PREMIERE' : undefined}
        primaryLine={
          next
            ? `${formatEpisodeCode(next.season, next.number)} · ${stats.nextOrdinal}/${stats.totalEpisodes}`
            : `Finished · ${stats.totalEpisodes}/${stats.totalEpisodes}`
        }
        secondaryLine={
          next ? next.title : `${show.year} · ${show.genres.slice(0, 2).join(' · ')}`
        }
        progressRatio={stats.progressRatio}
        showProgress={state.settings.showPosterProgress}
        isFlashing={flash}
        flashLabel="Watched"
        actionContent={<Check className="w-[17px] h-[17px]" strokeWidth={2.4} />}
        actionAriaLabel={`Mark ${show.title} next episode watched`}
        actionDisabled={stats.isFinished}
        actionActive={stats.isFinished}
        onAction={!stats.isFinished ? (e) => handleQuickWatchShow(e, show.id) : undefined}
        onOpen={() => pushRoute({ view: 'show-detail', showId: show.id })}
      />
    );
  };

  const renderMovieCard = (movie: Movie) => {
    const prog = state.movieProgress[movie.id];
    const isWatched = (prog?.watchCount || 0) > 0;
    const flash = Boolean(justChecked[movie.id]);

    if (isPosterLayout) {
      return (
        <div
          key={movie.id}
          role="button"
          tabIndex={0}
          onClick={() => pushRoute({ view: 'movie-detail', movieId: movie.id })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') pushRoute({ view: 'movie-detail', movieId: movie.id });
          }}
          className="group cursor-pointer text-left"
        >
          <div className="relative aspect-[2/3] rounded-[16px] overflow-hidden bg-surface border border-white/8">
            <MediaImage
              src={movie.posterUrl}
              alt={movie.title}
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            />
            <button
              type="button"
              onClick={(e) => handleQuickWatchMovie(e, movie.id)}
              aria-label={`Toggle ${movie.title} watched`}
              className={`absolute top-2 right-2 h-8 w-8 rounded-full backdrop-blur-md flex items-center justify-center border transition-all ${
                isWatched || flash
                  ? 'bg-watched/25 border-watched text-watched animate-check-pop'
                  : 'bg-black/60 border-white/20 text-white hover:border-watched hover:text-watched'
              }`}
            >
              <Check className="w-4 h-4" />
            </button>
          </div>
          <p className="mt-2 text-sm font-semibold text-ink truncate">{movie.title}</p>
          <p className="text-xs text-ink-dim tabular-nums">
            {movie.year} · {movie.runtime}m
          </p>
        </div>
      );
    }

    return (
      <BingersMediaRow
        key={movie.id}
        title={movie.title}
        badgeLabel="Movie"
        badgeClassName="bg-watch/15 text-watch"
        posterUrl={movie.posterUrl}
        primaryLine={`${movie.year} · ${movie.runtime}m`}
        secondaryLine={movie.director}
        progressRatio={isWatched ? 1 : 0}
        showProgress={state.settings.showPosterProgress && isWatched}
        isFlashing={flash}
        flashLabel="Watched"
        actionContent={
          isWatched && prog.watchCount > 1 ? (
            <span className="text-xs font-bold text-watched tabular-nums">x{prog.watchCount}</span>
          ) : (
            <Check className="w-[17px] h-[17px]" strokeWidth={2.4} />
          )
        }
        actionAriaLabel={`Toggle ${movie.title} watched`}
        actionActive={isWatched}
        onAction={(e) => handleQuickWatchMovie(e, movie.id)}
        onOpen={() => pushRoute({ view: 'movie-detail', movieId: movie.id })}
      />
    );
  };

  const renderUpcomingCard = (entry: UpcomingEntry) => {
    const flash = Boolean(justChecked[entry.id]);
    const show = state.shows[entry.mediaId];
    return (
      <BingersMediaRow
        key={entry.id}
        title={entry.title}
        badgeLabel={entry.groupCount && entry.groupCount > 1 ? `+${entry.groupCount}` : undefined}
        badgeClassName="bg-brand/15 text-brand"
        posterUrl={show?.posterUrl || entry.artworkUrl}
        primaryLine={entry.subtitle}
        secondaryLine={entry.episodeTitle}
        isFlashing={flash}
        flashLabel="Watched"
        actionContent={
          entry.daysUntil === 0 ? (
            <Check className="w-[17px] h-[17px]" strokeWidth={2.4} />
          ) : (
            <span className="flex flex-col items-center px-1">
              <span className="text-[17px] font-display font-bold text-ink tabular-nums leading-none">
                {entry.daysUntil}
              </span>
              <span className="text-[10px] text-ink-dim mt-0.5">
                {entry.daysUntil === 1 ? 'day' : 'days'}
              </span>
            </span>
          )
        }
        actionAriaLabel={`Mark ${entry.title} watched`}
        actionDisabled={entry.daysUntil !== 0}
        onAction={
          entry.daysUntil === 0
            ? () =>
                triggerFlash(entry.id, () => {
                  watchNextEpisode(entry.mediaId);
                  showToast(`Checked off ${entry.title} ${entry.subtitle}`);
                })
            : undefined
        }
        onOpen={() => pushRoute({ view: 'show-detail', showId: entry.mediaId })}
      />
    );
  };

  const filterTabs: { id: WatchFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'tv', label: 'Shows' },
    { id: 'movie', label: 'Movies' },
    { id: 'anime', label: 'Anime' },
  ];

  const listClass = isPosterLayout
    ? 'grid grid-cols-3 sm:grid-cols-4 gap-3.5'
    : 'space-y-3';

  return (
    <>
      <ScrollUpHistoryFeed
        historyItems={calendarMode ? [] : watchHistory}
        onOpenHistoryItem={openHistoryEntry}
        resetAnchorKey={calendarMode ? 'calendar' : 'feed'}
        stickyHeader={
          <MobileDomainBar
            title="Release dates"
            calendarMode={calendarMode}
            onOpenFilter={() => setFilterSheetOpen(true)}
            onToggleCalendar={toggleCalendarMode}
            filterAriaLabel="Filter and sort watch list"
            calendarAriaLabel="Toggle release dates calendar"
          />
        }
      >
        {/* Category Sub-Filter Pills */}
        {!calendarMode && (
          <div className="flex items-center gap-2 mb-5 overflow-x-auto no-scrollbar">
            {filterTabs.map((t) => {
              const active = filter === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => updateSettings({ watchFilter: t.id })}
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
          <div className="animate-fade-in space-y-7">
            <ReleaseAlertBanner />
            {upcomingGroups.today.length > 0 && (
              <section>
                <h2 className="font-display font-bold text-[21px] text-ink mb-3">Today</h2>
                <div className="space-y-3">{upcomingGroups.today.map(renderUpcomingCard)}</div>
              </section>
            )}
            {upcomingGroups.thisWeek.length > 0 && (
              <section>
                <h2 className="font-display font-bold text-[21px] text-ink mb-3">
                  Later this week
                </h2>
                <div className="space-y-3">{upcomingGroups.thisWeek.map(renderUpcomingCard)}</div>
              </section>
            )}
            {upcomingGroups.later.length > 0 && (
              <section>
                <h2 className="font-display font-bold text-[21px] text-ink mb-3">Later</h2>
                <div className="space-y-3">{upcomingGroups.later.map(renderUpcomingCard)}</div>
              </section>
            )}
            {upcomingGroups.today.length === 0 &&
              upcomingGroups.thisWeek.length === 0 &&
              upcomingGroups.later.length === 0 && (
                <div className="rounded-[22px] bg-surface border border-white/[0.06] p-8 text-center">
                  <Tv className="w-7 h-7 text-watch mx-auto mb-2.5 opacity-80" />
                  <p className="font-display font-bold text-lg text-ink">No upcoming releases yet</p>
                  <p className="text-xs text-ink-dim mt-1">
                    Add shows or anime in Search to see upcoming episode schedules here.
                  </p>
                </div>
              )}
          </div>
        ) : (
          <div className="animate-fade-in">
            {watchingShows.length === 0 &&
              watchlistMovies.length === 0 &&
              notStartedShows.length === 0 &&
              finishedShows.length === 0 &&
              watchedMovies.length === 0 && (
                <div className="rounded-[22px] bg-surface border border-white/[0.06] p-8 text-center my-4">
                  <Tv className="w-8 h-8 text-watch mx-auto mb-3 opacity-85" />
                  <h2 className="font-display font-bold text-[20px] text-ink">
                    Nothing in Watch yet
                  </h2>
                  <p className="text-sm text-ink-dim mt-1 max-w-sm mx-auto">
                    Search for TV shows, movies, or anime to start tracking episodes and rewatches.
                  </p>
                  <button
                    type="button"
                    onClick={() => switchTab('search')}
                    className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-brand text-brand-ink text-sm font-semibold hover:opacity-95 transition-opacity"
                  >
                    <Search className="w-4 h-4" />
                    <span>Search Watch</span>
                  </button>
                </div>
              )}

            {watchingShows.length > 0 && (
              <section className="mb-8">
                <h2 className="font-display font-bold text-[22px] text-ink mb-3.5">Watch next</h2>
                <div className={listClass}>{watchingShows.map(renderShowCard)}</div>
              </section>
            )}

            {watchlistMovies.length > 0 && (
              <section className="mb-8">
                <h2 className="font-display font-bold text-[22px] text-ink mb-3.5">
                  Movies to watch
                </h2>
                <div className={listClass}>{watchlistMovies.map(renderMovieCard)}</div>
              </section>
            )}

            {notStartedShows.length > 0 && (
              <section className="mb-8">
                <h2 className="font-display font-bold text-[22px] text-ink mb-3.5">
                  Collecting dust
                </h2>
                <div className={listClass}>{notStartedShows.map(renderShowCard)}</div>
              </section>
            )}

            {finishedShows.length + watchedMovies.length > 0 && (
              <section>
                <button
                  type="button"
                  onClick={() => setShowFinished((v) => !v)}
                  className="flex items-center gap-2 font-display font-bold text-[19px] text-ink-dim hover:text-ink mb-3.5 transition-colors"
                >
                  <span>
                    Finished & Watched ({finishedShows.length + watchedMovies.length})
                  </span>
                  {showFinished ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
                {showFinished && (
                  <div className={listClass}>
                    {finishedShows.map(renderShowCard)}
                    {watchedMovies.map(renderMovieCard)}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </ScrollUpHistoryFeed>

      <FilterSortSheet domain="watch" />
    </>
  );
}
