import { useEffect, useMemo, useState } from 'react';
import { Check, Flame, Globe2, Loader2, Plus, Search, Sparkles, Star, X } from 'lucide-react';
import { MediaImage } from '../components/MediaImage';
import {
  canonicalReadWorkKey,
  hydrateLiveGameItem,
  hydrateLiveMovie,
  hydrateLiveReadItem,
  hydrateLiveShow,
  normalizeTitleKey,
  searchLiveMedia,
  type LiveSearchResult,
  type SearchMediaFilter,
} from '../services/mediaApi';
import { useCueStore } from '../store/useCueStore';
import { resolveComicEditionCover } from '../utils/editions';
import { computeAllMediaStats } from '../utils/stats';

interface FilterPillConfig {
  id: SearchMediaFilter;
  label: string;
  activeClass: string;
  idleClass: string;
}

const SEARCH_FILTER_PILLS: FilterPillConfig[] = [
  {
    id: 'all',
    label: 'All',
    activeClass: 'bg-white border-white text-[#131519]',
    idleClass: 'bg-surface border-white/25 text-ink hover:border-white/45',
  },
  {
    id: 'tv',
    label: 'TV',
    activeClass: 'bg-watch border-watch text-[#0E1A1E]',
    idleClass: 'bg-watch/10 border-watch/30 text-watch hover:bg-watch/18',
  },
  {
    id: 'movie',
    label: 'Movies',
    activeClass: 'bg-watch border-watch text-[#0E1A1E]',
    idleClass: 'bg-watch/10 border-watch/30 text-watch hover:bg-watch/18',
  },
  {
    id: 'anime',
    label: 'Anime',
    activeClass: 'bg-watch border-watch text-[#0E1A1E]',
    idleClass: 'bg-watch/10 border-watch/30 text-watch hover:bg-watch/18',
  },
  {
    id: 'manga',
    label: 'Manga',
    activeClass: 'bg-read border-read text-[#1D160A]',
    idleClass: 'bg-read/10 border-read/30 text-read hover:bg-read/18',
  },
  {
    id: 'comic',
    label: 'Comics',
    activeClass: 'bg-read border-read text-[#1D160A]',
    idleClass: 'bg-read/10 border-read/30 text-read hover:bg-read/18',
  },
  {
    id: 'novel',
    label: 'Novels',
    activeClass: 'bg-read border-read text-[#1D160A]',
    idleClass: 'bg-read/10 border-read/30 text-read hover:bg-read/18',
  },
  {
    id: 'game',
    label: 'Games',
    activeClass: 'bg-play border-play text-[#161124]',
    idleClass: 'bg-play/10 border-play/30 text-play hover:bg-play/18',
  },
];

export function SearchView() {
  const {
    state,
    pushRoute,
    addLiveShowToStore,
    addLiveMovieToStore,
    addLiveReadToStore,
    updateReadEditionCovers,
    addLiveGameToStore,
    toggleShowBookmark,
    toggleMovieWatchlist,
    toggleReadBookmark,
    toggleGameBookmark,
  } = useCueStore();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SearchMediaFilter>('all');
  const [liveResults, setLiveResults] = useState<LiveSearchResult[]>([]);
  const [loadingLive, setLoadingLive] = useState(false);
  const [hydratingId, setHydratingId] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setLiveResults([]);
      setLoadingLive(false);
      return;
    }

    let cancelled = false;
    setLoadingLive(true);
    const timer = setTimeout(async () => {
      try {
        const res = await searchLiveMedia(q, filter, state.settings.tmdbApiKey);
        if (!cancelled) setLiveResults(res);
      } catch {
        if (!cancelled) setLiveResults([]);
      } finally {
        if (!cancelled) setLoadingLive(false);
      }
    }, 320);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, filter, state.settings.tmdbApiKey]);

  const analytics = useMemo(() => computeAllMediaStats(state), [state]);
  const topGenreNames = useMemo(
    () => new Set(analytics.topGenres.slice(0, 3).map((g) => g.genre)),
    [analytics.topGenres]
  );

  const localMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const normQ = normalizeTitleKey(query);
    const matchesQ = (text: string) =>
      text.toLowerCase().includes(q) || (normQ.length > 0 && normalizeTitleKey(text).includes(normQ));
    const items: Array<{
      domain: 'watch' | 'read' | 'play';
      kind: 'show' | 'movie' | 'read' | 'game';
      mediaType: SearchMediaFilter;
      id: string;
      title: string;
      year: number;
      badge: string;
      genres: string[];
      rating: number;
      posterUrl: string;
      inLibrary: boolean;
    }> = [];

    if (filter === 'all' || filter === 'tv' || filter === 'anime') {
      for (const id of state.showOrder) {
        const s = state.shows[id];
        if (!s) continue;
        if (filter === 'tv' && s.mediaType !== 'tv') continue;
        if (filter === 'anime' && s.mediaType !== 'anime') continue;
        if (q && !matchesQ(s.title) && !s.genres.some((g) => g.toLowerCase().includes(q))) continue;
        items.push({
          domain: 'watch',
          kind: 'show',
          mediaType: s.mediaType === 'anime' ? 'anime' : 'tv',
          id: s.id,
          title: s.title,
          year: s.year,
          badge: s.mediaType === 'anime' ? 'Anime' : 'Show',
          genres: s.genres,
          rating: s.rating,
          posterUrl: s.posterUrl,
          inLibrary: Boolean(state.showProgress[s.id]?.bookmarked),
        });
      }
    }

    if (filter === 'all' || filter === 'movie') {
      for (const id of state.movieOrder) {
        const m = state.movies[id];
        if (!m) continue;
        if (q && !matchesQ(m.title) && !m.genres.some((g) => g.toLowerCase().includes(q))) continue;
        items.push({
          domain: 'watch',
          kind: 'movie',
          mediaType: 'movie',
          id: m.id,
          title: m.title,
          year: m.year,
          badge: 'Movie',
          genres: m.genres,
          rating: m.rating,
          posterUrl: m.posterUrl,
          inLibrary: Boolean(state.movieProgress[m.id]),
        });
      }
    }

    if (filter === 'all' || filter === 'manga' || filter === 'comic' || filter === 'novel') {
      for (const id of state.readOrder) {
        const r = state.readItems[id];
        if (!r) continue;
        if (filter !== 'all' && r.format !== filter) continue;
        if (
          q &&
          !matchesQ(r.title) &&
          !matchesQ(r.creator) &&
          !r.genres.some((g) => g.toLowerCase().includes(q))
        )
          continue;
        items.push({
          domain: 'read',
          kind: 'read',
          mediaType: r.format,
          id: r.id,
          title: r.title,
          year: r.year,
          badge: r.format,
          genres: r.genres,
          rating: r.rating,
          posterUrl: resolveComicEditionCover(
            r,
            state.readProgress[r.id]?.edition,
            state.readProgress[r.id]
          ),
          inLibrary: Boolean(state.readProgress[r.id]?.bookmarked),
        });
      }
    }

    if (filter === 'all' || filter === 'game') {
      for (const id of state.gameOrder) {
        const g = state.games[id];
        if (!g) continue;
        if (
          q &&
          !matchesQ(g.title) &&
          !matchesQ(g.developer) &&
          !g.genres.some((gen) => gen.toLowerCase().includes(q))
        )
          continue;
        items.push({
          domain: 'play',
          kind: 'game',
          mediaType: 'game',
          id: g.id,
          title: g.title,
          year: g.year,
          badge: 'Game',
          genres: g.genres,
          rating: g.rating,
          posterUrl: g.coverUrl,
          inLibrary: Boolean(state.gameProgress[g.id]?.bookmarked),
        });
      }
    }

    return items;
  }, [state, query, filter]);

  const dedupedLive = useMemo(() => {
    const localIds = new Set(localMatches.map((m) => m.id));
    const localWorkKeys = new Set(
      localMatches.map((m) =>
        m.domain === 'read'
          ? `read:${canonicalReadWorkKey(m.title)}`
          : m.kind === 'show'
            ? `watch:show:${normalizeTitleKey(m.title)}`
            : `${m.domain}:${m.kind}:${normalizeTitleKey(m.title)}`
      )
    );
    const seenLiveKeys = new Set<string>();
    const filtered: LiveSearchResult[] = [];

    for (const r of liveResults) {
      if (filter !== 'all' && r.mediaType !== filter) continue;
      if (localIds.has(r.id)) continue;
      const key =
        r.domain === 'read'
          ? `read:${canonicalReadWorkKey(r.title)}`
          : r.kind === 'show'
            ? `watch:show:${normalizeTitleKey(r.title)}`
            : `${r.domain}:${r.kind}:${normalizeTitleKey(r.title)}`;
      if (localWorkKeys.has(key) || seenLiveKeys.has(key)) continue;
      seenLiveKeys.add(key);
      filtered.push(r);
    }

    return filtered;
  }, [liveResults, localMatches, filter]);

  const featuredAllMedia = useMemo(() => {
    const picks: Array<{
      kind: 'show' | 'movie' | 'read' | 'game';
      id: string;
      title: string;
      subtitle: string;
      poster: string;
    }> = [];
    for (const id of state.showOrder.slice(0, 3)) {
      const s = state.shows[id];
      if (s) {
        picks.push({
          kind: 'show',
          id: s.id,
          title: s.title,
          subtitle: s.mediaType === 'anime' ? 'Anime' : 'Show',
          poster: s.posterUrl,
        });
      }
    }
    for (const id of state.readOrder.slice(0, 3)) {
      const r = state.readItems[id];
      if (r) {
        picks.push({
          kind: 'read',
          id: r.id,
          title: r.title,
          subtitle: r.format === 'manga' ? 'Manga' : r.format === 'comic' ? 'Comic' : 'Novel',
          poster: resolveComicEditionCover(
            r,
            state.readProgress[r.id]?.edition,
            state.readProgress[r.id]
          ),
        });
      }
    }
    for (const id of state.gameOrder.slice(0, 3)) {
      const g = state.games[id];
      if (g) {
        picks.push({ kind: 'game', id: g.id, title: g.title, subtitle: 'Game', poster: g.coverUrl });
      }
    }
    for (const id of state.movieOrder.slice(0, 2)) {
      const m = state.movies[id];
      if (m) {
        picks.push({ kind: 'movie', id: m.id, title: m.title, subtitle: 'Movie', poster: m.posterUrl });
      }
    }
    return picks;
  }, [state]);

  const queueSuggestions = useMemo(() => {
    const picks: Array<{
      kind: 'show' | 'movie' | 'read' | 'game';
      id: string;
      title: string;
      genres: string[];
      poster: string;
    }> = [];
    for (const id of state.readOrder) {
      const r = state.readItems[id];
      const p = state.readProgress[id];
      if (r && p?.status === 'want_to_read' && r.genres.some((g) => topGenreNames.has(g))) {
        picks.push({ kind: 'read', id: r.id, title: r.title, genres: r.genres, poster: r.coverUrl });
      }
    }
    for (const id of state.gameOrder) {
      const g = state.games[id];
      const p = state.gameProgress[id];
      if (g && p?.status === 'backlog') {
        picks.push({ kind: 'game', id: g.id, title: g.title, genres: g.genres, poster: g.coverUrl });
      }
    }
    for (const id of state.showOrder) {
      const s = state.shows[id];
      const p = state.showProgress[id];
      if (s && p?.status === 'not_started') {
        picks.push({ kind: 'show', id: s.id, title: s.title, genres: s.genres, poster: s.posterUrl });
      }
    }
    return picks.slice(0, 8);
  }, [state, topGenreNames]);

  const handleOpenLiveResult = async (item: LiveSearchResult, andAdd = false) => {
    if (item.kind === 'movie') {
      const movie = hydrateLiveMovie(item);
      if (andAdd || !state.movies[movie.id]) addLiveMovieToStore(movie, 'watchlist');
      if (!andAdd) pushRoute({ view: 'movie-detail', movieId: movie.id });
      return;
    }
    if (item.kind === 'read') {
      const readItem = hydrateLiveReadItem(item);
      if (andAdd || !state.readItems[readItem.id]) {
        addLiveReadToStore(readItem, 'want_to_read');
      } else {
        updateReadEditionCovers(
          readItem.id,
          readItem.editionCovers || {},
          readItem.title,
          readItem.editionIssueCounts,
          readItem.editionVariants
        );
      }
      if (!andAdd) pushRoute({ view: 'read-detail', readId: readItem.id });
      return;
    }
    if (item.kind === 'game') {
      const game = hydrateLiveGameItem(item);
      if (andAdd || !state.games[game.id]) addLiveGameToStore(game, 'backlog');
      if (!andAdd) pushRoute({ view: 'game-detail', gameId: game.id });
      return;
    }

    setHydratingId(item.id);
    try {
      const show = await hydrateLiveShow(item, state.settings.tmdbApiKey);
      addLiveShowToStore(show, andAdd);
      if (!andAdd) pushRoute({ view: 'show-detail', showId: show.id });
    } finally {
      setHydratingId(null);
    }
  };

  const hasActiveFilter = query.trim().length > 0 || filter !== 'all';

  return (
    <div className="min-h-dvh pb-28 md:pb-14 pt-2 md:pt-20 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto">
      {/* Sticky Search Bar + Color-Coded Filtering Pills */}
      <div className="sticky top-0 md:top-16 z-20 -mx-4 sm:-mx-6 lg:-mx-10 px-4 sm:px-6 lg:px-10 pt-2 pb-3 bg-background/95 backdrop-blur-md border-b border-white/[0.04] mb-4">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-ink-dim absolute left-4 pointer-events-none" />
          <input
            type="text"
            inputMode="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search TV, movies, anime, manga, comics, novels, or games…"
            aria-label="Search all media"
            className="w-full h-12 rounded-2xl bg-surface border border-white/10 pl-11 pr-20 text-[15px] text-ink placeholder:text-ink-faint outline-none focus:border-brand transition-colors"
          />
          <div className="absolute right-3 flex items-center gap-1.5">
            {loadingLive && <Loader2 className="w-4 h-4 text-brand animate-spin" />}
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="h-7 w-7 rounded-full bg-white/10 flex items-center justify-center text-ink-dim hover:text-ink"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 mt-3">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {SEARCH_FILTER_PILLS.map((tab) => {
              const active = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  aria-pressed={active}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border shrink-0 transition-colors ${
                    active ? tab.activeClass : tab.idleClass
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-ink-dim px-2.5 py-1 rounded-full bg-surface border border-white/8 shrink-0">
            <Globe2 className="w-3 h-3 text-watch" />
            Live Search
          </span>
        </div>
      </div>

      {hasActiveFilter ? (
        <div className="space-y-6 animate-fade-in">
          {localMatches.length > 0 && (
            <section>
              <h2 className="font-display font-bold text-lg text-ink mb-3">
                In your catalog ({localMatches.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {localMatches.map((item) => (
                  <div
                    key={`${item.kind}-${item.id}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (item.kind === 'show') pushRoute({ view: 'show-detail', showId: item.id });
                      else if (item.kind === 'movie') pushRoute({ view: 'movie-detail', movieId: item.id });
                      else if (item.kind === 'read') pushRoute({ view: 'read-detail', readId: item.id });
                      else pushRoute({ view: 'game-detail', gameId: item.id });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (item.kind === 'show') pushRoute({ view: 'show-detail', showId: item.id });
                        else if (item.kind === 'movie') pushRoute({ view: 'movie-detail', movieId: item.id });
                        else if (item.kind === 'read') pushRoute({ view: 'read-detail', readId: item.id });
                        else pushRoute({ view: 'game-detail', gameId: item.id });
                      }
                    }}
                    className="rounded-[20px] bg-surface hover:bg-surface-raised border border-white/[0.05] overflow-hidden flex items-stretch min-h-[100px] cursor-pointer transition-colors"
                  >
                    <div className="w-[70px] min-h-[100px] shrink-0 overflow-hidden bg-surface-raised self-stretch">
                      <MediaImage src={item.posterUrl} alt={item.title} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0 px-3 py-2.5 flex flex-col justify-center">
                      <h3 className="text-[15px] font-semibold text-ink leading-[1.28] line-clamp-2">
                        {item.title}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-1 min-w-0">
                        <span
                          className={`text-[9.5px] font-semibold uppercase tracking-wide px-1.5 py-[2px] rounded shrink-0 leading-none ${
                            item.domain === 'watch'
                              ? 'bg-watch/15 text-watch'
                              : item.domain === 'read'
                                ? 'bg-read/15 text-read'
                                : 'bg-play/15 text-play'
                          }`}
                        >
                          {item.badge}
                        </span>
                        <p className="text-xs text-ink-dim truncate flex items-center gap-1.5">
                          <span>{item.year}</span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-0.5 text-brand">
                            <Star className="w-3 h-3 fill-brand" />
                            {item.rating.toFixed(1)}
                          </span>
                        </p>
                      </div>
                      {item.genres.length > 0 && (
                        <p className="text-xs text-ink-faint truncate mt-1">{item.genres.join(' · ')}</p>
                      )}
                    </div>
                    <div className="pr-3 shrink-0 flex items-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (item.kind === 'show') toggleShowBookmark(item.id);
                          else if (item.kind === 'movie') toggleMovieWatchlist(item.id);
                          else if (item.kind === 'read') toggleReadBookmark(item.id);
                          else toggleGameBookmark(item.id);
                        }}
                        aria-label={item.inLibrary ? 'In library' : 'Add to library'}
                        className={`h-9 w-9 rounded-full border flex items-center justify-center transition-colors ${
                          item.inLibrary
                            ? item.domain === 'watch'
                              ? 'border-watch/60 bg-watch/15 text-watch'
                              : item.domain === 'read'
                                ? 'border-read/60 bg-read/15 text-read'
                                : 'border-play/60 bg-play/15 text-play'
                            : 'border-white/15 text-ink-dim hover:border-brand hover:text-brand'
                        }`}
                      >
                        {item.inLibrary ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {query.trim().length >= 2 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display font-bold text-lg text-ink">
                  Live results ({dedupedLive.length})
                </h2>
                {loadingLive && (
                  <span className="text-xs text-ink-dim">Searching live catalogs…</span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {dedupedLive.map((item) => {
                  const isHydrating = hydratingId === item.id;
                  const alreadyInStore = Boolean(
                    state.shows[item.id] ||
                      state.movies[item.id] ||
                      state.readItems[item.id] ||
                      state.games[item.id]
                  );
                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleOpenLiveResult(item, false)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleOpenLiveResult(item, false);
                      }}
                      className="rounded-[20px] bg-surface hover:bg-surface-raised border border-white/[0.05] overflow-hidden flex items-stretch min-h-[100px] cursor-pointer transition-colors"
                    >
                      <div className="w-[70px] min-h-[100px] shrink-0 overflow-hidden bg-surface-raised self-stretch">
                        <MediaImage
                          src={item.posterUrl}
                          fallbackSrc={item.backdropUrl}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0 px-3 py-2.5 flex flex-col justify-center">
                        <h3 className="text-[15px] font-semibold text-ink leading-[1.28] line-clamp-2">
                          {item.title}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-1 min-w-0">
                          <span
                            className={`text-[9.5px] font-semibold uppercase tracking-wide px-1.5 py-[2px] rounded shrink-0 leading-none ${
                              item.domain === 'watch'
                                ? 'bg-watch/15 text-watch'
                                : item.domain === 'read'
                                  ? 'bg-read/15 text-read'
                                  : 'bg-play/15 text-play'
                            }`}
                          >
                            {item.mediaType === 'tv' ? 'Show' : item.mediaType}
                          </span>
                          <p className="text-xs text-ink-dim truncate">
                            {item.year} · {item.subtitle || item.genres.slice(0, 2).join(' · ')}
                          </p>
                        </div>
                        {item.overview && (
                          <p className="text-xs text-ink-faint truncate mt-1">{item.overview}</p>
                        )}
                      </div>
                      <div className="pr-3 shrink-0 flex items-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenLiveResult(item, true);
                          }}
                          aria-label={`Add ${item.title}`}
                          className={`h-9 w-9 rounded-full border flex items-center justify-center transition-colors ${
                            alreadyInStore
                              ? item.domain === 'watch'
                                ? 'border-watch/60 bg-watch/15 text-watch'
                                : item.domain === 'read'
                                  ? 'border-read/60 bg-read/15 text-read'
                                  : 'border-play/60 bg-play/15 text-play'
                              : 'border-white/15 text-ink-dim hover:border-brand hover:text-brand'
                          }`}
                        >
                          {isHydrating ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : alreadyInStore ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Plus className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {!loadingLive && localMatches.length === 0 && dedupedLive.length === 0 && (
                <div className="rounded-2xl bg-surface border border-white/8 p-8 text-center">
                  <p className="font-semibold text-ink">No matches found for "{query}"</p>
                  <p className="text-xs text-ink-dim mt-1">
                    Try another title or switch filter pills above.
                  </p>
                </div>
              )}
            </section>
          )}

          {query.trim().length < 2 && localMatches.length === 0 && (
            <div className="rounded-[22px] bg-surface border border-white/[0.06] p-8 text-center">
              <Search className="w-7 h-7 text-brand mx-auto mb-2.5 opacity-85" />
              <p className="font-display font-bold text-lg text-ink">Search to add titles</p>
              <p className="text-xs text-ink-dim mt-1 max-w-sm mx-auto">
                Type at least 2 characters above to search TV, movies, anime, manga, comics, novels,
                or games.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-8 animate-fade-in">
          {featuredAllMedia.length === 0 && queueSuggestions.length === 0 && (
            <div className="rounded-[22px] bg-surface border border-white/[0.06] p-8 text-center my-2">
              <Search className="w-8 h-8 text-brand mx-auto mb-3 opacity-85" />
              <h2 className="font-display font-bold text-[20px] text-ink">
                Start building your library
              </h2>
              <p className="text-sm text-ink-dim mt-1 max-w-md mx-auto">
                Search any TV show, movie, anime, manga, comic edition, novel, or game above using the
                color-coded category pills.
              </p>
            </div>
          )}

          {/* Library Highlights Across Watch, Read & Play */}
          {featuredAllMedia.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Flame className="w-5 h-5 text-brand" />
                <h2 className="font-display font-bold text-[20px] text-ink">
                  In your library across Watch, Read & Play
                </h2>
              </div>
              <div className="flex gap-3.5 overflow-x-auto no-scrollbar pb-1">
                {featuredAllMedia.map((entry) => (
                  <button
                    key={`${entry.kind}-${entry.id}`}
                    type="button"
                    onClick={() => {
                      if (entry.kind === 'show') pushRoute({ view: 'show-detail', showId: entry.id });
                      else if (entry.kind === 'movie') pushRoute({ view: 'movie-detail', movieId: entry.id });
                      else if (entry.kind === 'read') pushRoute({ view: 'read-detail', readId: entry.id });
                      else pushRoute({ view: 'game-detail', gameId: entry.id });
                    }}
                    className="w-[126px] sm:w-[144px] shrink-0 text-left group"
                  >
                    <div className="aspect-[2/3] rounded-[18px] overflow-hidden bg-surface border border-white/8">
                      <MediaImage
                        src={entry.poster}
                        alt={entry.title}
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                      />
                    </div>
                    <p className="mt-2 text-sm font-semibold text-ink truncate">{entry.title}</p>
                    <p className="text-xs text-ink-dim">{entry.subtitle}</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Up Next in Your Personal Queue */}
          {queueSuggestions.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-brand" />
                <h2 className="font-display font-bold text-[20px] text-ink">Up next in your cue</h2>
              </div>
              <div className="flex gap-3.5 overflow-x-auto no-scrollbar pb-1">
                {queueSuggestions.map((entry) => (
                  <button
                    key={`${entry.kind}-${entry.id}`}
                    type="button"
                    onClick={() => {
                      if (entry.kind === 'show') pushRoute({ view: 'show-detail', showId: entry.id });
                      else if (entry.kind === 'movie') pushRoute({ view: 'movie-detail', movieId: entry.id });
                      else if (entry.kind === 'read') pushRoute({ view: 'read-detail', readId: entry.id });
                      else pushRoute({ view: 'game-detail', gameId: entry.id });
                    }}
                    className="w-[126px] sm:w-[144px] shrink-0 text-left group"
                  >
                    <div className="aspect-[2/3] rounded-[18px] overflow-hidden bg-surface border border-white/8">
                      <MediaImage
                        src={entry.poster}
                        alt={entry.title}
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                      />
                    </div>
                    <p className="mt-2 text-sm font-semibold text-ink truncate">{entry.title}</p>
                    <p className="text-xs text-ink-dim truncate">{entry.genres.slice(0, 2).join(' · ')}</p>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
