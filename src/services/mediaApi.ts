import type { CastMember, GameItem, Movie, ReadItem, Season, Show } from '../types';

export interface LiveSearchResult {
  domain: 'watch' | 'read' | 'play';
  kind: 'show' | 'movie' | 'read' | 'game';
  id: string;
  source: 'tvmaze' | 'itunes' | 'tmdb' | 'openlibrary' | 'anilist' | 'cheapshark' | 'wikipedia';
  externalId: number | string;
  title: string;
  subtitle?: string;
  year: number;
  mediaType: 'tv' | 'anime' | 'movie' | 'book' | 'manga' | 'comic' | 'game';
  genres: string[];
  rating: number;
  posterUrl: string;
  backdropUrl: string;
  overview: string;
  director?: string;
  runtime?: number;
  totalUnits?: number;
  steamAppId?: number;
}

const stripHtml = (html?: string | null): string =>
  html ? html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';

export async function searchLiveMedia(
  query: string,
  domainFilter: 'all' | 'watch' | 'read' | 'play',
  tmdbApiKey?: string
): Promise<LiveSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const tasks: Promise<LiveSearchResult[]>[] = [];

  if (domainFilter === 'all' || domainFilter === 'watch') {
    if (tmdbApiKey && tmdbApiKey.trim().length > 8) {
      tasks.push(
        searchTmdbMulti(trimmed, tmdbApiKey.trim()).catch(async () => [
          ...(await searchTvMaze(trimmed)),
          ...(await searchItunesMovies(trimmed)),
        ])
      );
    } else {
      tasks.push(searchTvMaze(trimmed));
      tasks.push(searchItunesMovies(trimmed));
    }
  }

  if (domainFilter === 'all' || domainFilter === 'read') {
    tasks.push(searchOpenLibrary(trimmed));
    tasks.push(searchAniListManga(trimmed));
  }

  if (domainFilter === 'all' || domainFilter === 'play') {
    tasks.push(searchGames(trimmed));
  }

  const settled = await Promise.allSettled(tasks);
  const combined: LiveSearchResult[] = [];
  for (const res of settled) {
    if (res.status === 'fulfilled') combined.push(...res.value);
  }
  return combined;
}

async function searchTvMaze(query: string): Promise<LiveSearchResult[]> {
  const res = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const data = (await res.json()) as Array<{
    show: {
      id: number;
      name: string;
      premiered?: string;
      genres?: string[];
      type?: string;
      language?: string;
      rating?: { average?: number };
      image?: { original?: string; medium?: string };
      summary?: string;
      averageRuntime?: number;
    };
  }>;

  return data.slice(0, 8).map((item) => {
    const s = item.show;
    const isAnime =
      s.genres?.includes('Anime') || (s.type === 'Animation' && s.language === 'Japanese');
    const mediaType: 'tv' | 'anime' = isAnime ? 'anime' : 'tv';
    const poster = s.image?.medium || s.image?.original || '';
    return {
      domain: 'watch',
      kind: 'show',
      id: `tvmaze-${s.id}`,
      source: 'tvmaze',
      externalId: s.id,
      title: s.name,
      year: s.premiered ? Number(s.premiered.slice(0, 4)) : 2024,
      mediaType,
      genres: s.genres?.length ? s.genres : ['Drama'],
      rating: s.rating?.average || 7.8,
      posterUrl: poster,
      backdropUrl: s.image?.original || poster,
      overview: stripHtml(s.summary) || `${s.name} series.`,
      runtime: s.averageRuntime || 45,
    };
  });
}

async function searchItunesMovies(query: string): Promise<LiveSearchResult[]> {
  const qLower = query.trim().toLowerCase();
  const itunesResults: LiveSearchResult[] = [];
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&limit=30`
    );
    if (res.ok) {
      const data = (await res.json()) as {
        results?: Array<{
          kind?: string;
          trackId: number;
          trackName: string;
          artistName?: string;
          releaseDate?: string;
          primaryGenreName?: string;
          trackTimeMillis?: number;
          artworkUrl100?: string;
          longDescription?: string;
          shortDescription?: string;
        }>;
      };

      const matched = (data.results || [])
        .filter((r) => r.kind === 'feature-movie' && r.trackName?.toLowerCase().includes(qLower))
        .slice(0, 6);

      for (const m of matched) {
        const poster = m.artworkUrl100 ? m.artworkUrl100.replace('100x100bb', '600x900bb') : '';
        itunesResults.push({
          domain: 'watch',
          kind: 'movie',
          id: `itunes-${m.trackId}`,
          source: 'itunes',
          externalId: m.trackId,
          title: m.trackName,
          subtitle: m.artistName,
          year: m.releaseDate ? Number(m.releaseDate.slice(0, 4)) : 2024,
          mediaType: 'movie',
          genres: m.primaryGenreName ? [m.primaryGenreName] : ['Feature Film'],
          rating: 7.9,
          posterUrl: poster,
          backdropUrl: poster,
          overview:
            m.longDescription ||
            m.shortDescription ||
            `${m.trackName}, directed by ${m.artistName || 'Unknown'}.`,
          director: m.artistName || 'Unknown',
          runtime: m.trackTimeMillis ? Math.round(m.trackTimeMillis / 60000) : 120,
        });
      }
    }
  } catch {
    // ignore
  }

  const wikiHit = await searchWikipediaSummary(query, 'film');
  if (wikiHit && !itunesResults.some((r) => r.title.toLowerCase() === wikiHit.title.toLowerCase())) {
    itunesResults.unshift(wikiHit);
  }
  return itunesResults;
}

async function searchOpenLibrary(query: string): Promise<LiveSearchResult[]> {
  try {
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=8`
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      docs?: Array<{
        key: string;
        title: string;
        author_name?: string[];
        first_publish_year?: number;
        cover_i?: number;
        number_of_pages_median?: number;
        subject?: string[];
      }>;
    };

    return (data.docs || [])
      .filter((d) => d.title && d.cover_i)
      .slice(0, 6)
      .map((d) => {
        const isComic = (d.subject || []).some((s) =>
          s.toLowerCase().includes('comic') || s.toLowerCase().includes('graphic novel')
        );
        const cover = `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`;
        const cleanKey = d.key.replace('/works/', '');
        return {
          domain: 'read' as const,
          kind: 'read' as const,
          id: `ol-${cleanKey}`,
          source: 'openlibrary' as const,
          externalId: cleanKey,
          title: d.title,
          subtitle: d.author_name?.[0] || 'Author',
          year: d.first_publish_year || 2020,
          mediaType: isComic ? ('comic' as const) : ('book' as const),
          genres: (d.subject || []).slice(0, 2).length ? (d.subject || []).slice(0, 2) : ['Literature'],
          rating: 4.4,
          posterUrl: cover,
          backdropUrl: cover,
          overview: `${d.title} by ${d.author_name?.[0] || 'Unknown author'}.`,
          director: d.author_name?.[0] || 'Unknown',
          totalUnits: d.number_of_pages_median || (isComic ? 12 : 340),
        };
      });
  } catch {
    return [];
  }
}

async function searchAniListManga(query: string): Promise<LiveSearchResult[]> {
  try {
    const gql = `query($s:String){Page(perPage:6){media(search:$s,type:MANGA,sort:POPULARITY_DESC){id title{english romaji} coverImage{extraLarge large} bannerImage chapters startDate{year} genres averageScore description(asHtml:false) staff(perPage:1){nodes{name{full}}}}}}`;
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: gql, variables: { s: query } }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: {
        Page?: {
          media?: Array<{
            id: number;
            title?: { english?: string; romaji?: string };
            coverImage?: { extraLarge?: string; large?: string };
            bannerImage?: string;
            chapters?: number;
            startDate?: { year?: number };
            genres?: string[];
            averageScore?: number;
            description?: string;
            staff?: { nodes?: Array<{ name?: { full?: string } }> };
          }>;
        };
      };
    };

    return (json.data?.Page?.media || []).map((m) => {
      const title = m.title?.english || m.title?.romaji || 'Manga';
      const cover = m.coverImage?.extraLarge || m.coverImage?.large || '';
      const author = m.staff?.nodes?.[0]?.name?.full || 'Mangaka';
      return {
        domain: 'read' as const,
        kind: 'read' as const,
        id: `al-manga-${m.id}`,
        source: 'anilist' as const,
        externalId: m.id,
        title,
        subtitle: author,
        year: m.startDate?.year || 2020,
        mediaType: 'manga' as const,
        genres: m.genres?.length ? m.genres.slice(0, 2) : ['Manga'],
        rating: m.averageScore ? Number((m.averageScore / 20).toFixed(1)) : 4.5,
        posterUrl: cover,
        backdropUrl: m.bannerImage || cover,
        overview: stripHtml(m.description) || `${title} manga series.`,
        director: author,
        totalUnits: m.chapters || 100,
      };
    });
  } catch {
    return [];
  }
}

async function searchGames(query: string): Promise<LiveSearchResult[]> {
  const results: LiveSearchResult[] = [];
  try {
    const res = await fetch(
      `https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(query)}&limit=10`
    );
    if (res.ok) {
      const data = (await res.json()) as Array<{
        gameID: string;
        steamAppID?: string | null;
        external: string;
        thumb: string;
      }>;
      const seen = new Set<string>();
      for (const g of data) {
        if (!g.steamAppID || seen.has(g.steamAppID)) continue;
        seen.add(g.steamAppID);
        const appId = Number(g.steamAppID);
        const cover = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900_2x.jpg`;
        const header = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;
        results.push({
          domain: 'play',
          kind: 'game',
          id: `steam-${appId}`,
          source: 'cheapshark',
          externalId: appId,
          steamAppId: appId,
          title: g.external,
          subtitle: 'PC · Steam',
          year: 2023,
          mediaType: 'game',
          genres: ['Video Game'],
          rating: 4.5,
          posterUrl: cover,
          backdropUrl: header,
          overview: `${g.external} — tracked in your Play log.`,
        });
        if (results.length >= 6) break;
      }
    }
  } catch {
    // ignore
  }

  const wikiGame = await searchWikipediaSummary(query, 'game');
  if (wikiGame && !results.some((r) => r.title.toLowerCase() === wikiGame.title.toLowerCase())) {
    results.unshift(wikiGame);
  }

  return results;
}

async function searchWikipediaSummary(
  query: string,
  target: 'film' | 'game'
): Promise<LiveSearchResult | null> {
  const titleCased = query
    .trim()
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : ''))
    .join('_');

  const suffixes = target === 'film' ? [`${titleCased}_(film)`, titleCased] : [`${titleCased}_(video_game)`, titleCased];
  for (const slug of suffixes) {
    try {
      const res = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`
      );
      if (!res.ok) continue;
      const data = (await res.json()) as {
        pageid?: number;
        title?: string;
        description?: string;
        extract?: string;
        thumbnail?: { source?: string };
        originalimage?: { source?: string };
      };
      const desc = (data.description || '').toLowerCase();
      if (target === 'film' && !desc.includes('film') && !desc.includes('movie')) continue;
      if (target === 'game' && !desc.includes('video game') && !desc.includes('game')) continue;

      const yearMatch = (data.description || data.extract || '').match(/\b(19\d\d|20\d\d)\b/);
      const poster = data.originalimage?.source || data.thumbnail?.source || '';
      if (!poster) continue;

      if (target === 'game') {
        return {
          domain: 'play',
          kind: 'game',
          id: `wiki-game-${data.pageid || slug}`,
          source: 'wikipedia',
          externalId: data.pageid || Date.now(),
          title: (data.title || query).replace(/\s*\([^)]*video game\)$/i, ''),
          subtitle: data.description || 'Video Game',
          year: yearMatch ? Number(yearMatch[1]) : 2023,
          mediaType: 'game',
          genres: ['Video Game'],
          rating: 4.6,
          posterUrl: poster,
          backdropUrl: poster,
          overview: data.extract || data.description || '',
        };
      }

      return {
        domain: 'watch',
        kind: 'movie',
        id: `wiki-${data.pageid || slug}`,
        source: 'itunes',
        externalId: data.pageid || Date.now(),
        title: (data.title || query).replace(/\s*\([^)]*film\)$/i, ''),
        year: yearMatch ? Number(yearMatch[1]) : 2024,
        mediaType: 'movie',
        genres: ['Feature Film'],
        rating: 8.2,
        posterUrl: poster,
        backdropUrl: poster,
        overview: data.extract || data.description || '',
        director: data.description || 'Feature Film',
        runtime: 135,
      };
    } catch {
      // try next
    }
  }
  return null;
}

async function searchTmdbMulti(query: string, apiKey: string): Promise<LiveSearchResult[]> {
  const res = await fetch(
    `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(query)}&api_key=${encodeURIComponent(apiKey)}`
  );
  if (!res.ok) throw new Error('TMDB search failed');
  const data = (await res.json()) as {
    results?: Array<{
      id: number;
      media_type: string;
      title?: string;
      name?: string;
      release_date?: string;
      first_air_date?: string;
      poster_path?: string;
      backdrop_path?: string;
      overview?: string;
      vote_average?: number;
      original_language?: string;
      genre_ids?: number[];
    }>;
  };

  return (data.results || [])
    .filter((r) => r.media_type === 'tv' || r.media_type === 'movie')
    .slice(0, 10)
    .map((r) => {
      const isMovie = r.media_type === 'movie';
      const isAnime = !isMovie && r.genre_ids?.includes(16) && r.original_language === 'ja';
      const poster = r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : '';
      const backdrop = r.backdrop_path
        ? `https://image.tmdb.org/t/p/w1280${r.backdrop_path}`
        : poster;
      const dateStr = r.release_date || r.first_air_date || '';
      return {
        domain: 'watch' as const,
        kind: isMovie ? ('movie' as const) : ('show' as const),
        id: `tmdb-${r.media_type}-${r.id}`,
        source: 'tmdb' as const,
        externalId: r.id,
        title: r.title || r.name || 'Untitled',
        year: dateStr ? Number(dateStr.slice(0, 4)) : 2024,
        mediaType: isMovie ? ('movie' as const) : isAnime ? ('anime' as const) : ('tv' as const),
        genres: isAnime ? ['Anime'] : isMovie ? ['Feature Film'] : ['Series'],
        rating: r.vote_average ? Number(r.vote_average.toFixed(1)) : 7.8,
        posterUrl: poster,
        backdropUrl: backdrop,
        overview: r.overview || '',
      };
    });
}

export async function testTmdbConnection(apiKey: string): Promise<boolean> {
  const res = await fetch(
    `https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(apiKey.trim())}`
  );
  return res.ok;
}

export async function hydrateLiveShow(item: LiveSearchResult, tmdbApiKey?: string): Promise<Show> {
  if (item.source === 'tmdb' && tmdbApiKey) {
    return hydrateTmdbShow(item, tmdbApiKey);
  }
  return hydrateTvMazeShow(item);
}

async function hydrateTvMazeShow(item: LiveSearchResult): Promise<Show> {
  const res = await fetch(
    `https://api.tvmaze.com/shows/${item.externalId}?embed[]=episodes&embed[]=cast`
  );
  if (!res.ok) return fallbackShowFromSearch(item);
  const data = await res.json();
  let backdropUrl = item.backdropUrl || item.posterUrl;
  try {
    const imgsRes = await fetch(`https://api.tvmaze.com/shows/${item.externalId}/images`);
    if (imgsRes.ok) {
      const imgs = (await imgsRes.json()) as Array<{
        type: string;
        resolutions?: { original?: { url?: string } };
      }>;
      const bg = imgs.find((i) => i.type === 'background') || imgs.find((i) => i.type === 'banner');
      if (bg?.resolutions?.original?.url) backdropUrl = bg.resolutions.original.url;
    }
  } catch {
    // ignore
  }

  const rawEps = (data._embedded?.episodes || []) as Array<{
    season: number;
    number: number;
    name?: string;
    airdate?: string;
    runtime?: number;
    image?: { medium?: string; original?: string };
    summary?: string;
  }>;

  const seasonMap = new Map<number, Season>();
  for (const ep of rawEps) {
    if (!ep.season || !ep.number) continue;
    if (!seasonMap.has(ep.season)) seasonMap.set(ep.season, { number: ep.season, episodes: [] });
    seasonMap.get(ep.season)!.episodes.push({
      id: `${item.id}-s${ep.season}e${ep.number}`,
      season: ep.season,
      number: ep.number,
      title: ep.name || `Episode ${ep.number}`,
      airdate: ep.airdate || '',
      runtime: ep.runtime || data.averageRuntime || 45,
      stillUrl: ep.image?.medium || ep.image?.original || backdropUrl || item.posterUrl,
      overview: stripHtml(ep.summary),
    });
  }

  const seasons = Array.from(seasonMap.values()).sort((a, b) => a.number - b.number);
  const cast: CastMember[] = ((data._embedded?.cast || []) as Array<{
    person?: { id?: number; name?: string; image?: { medium?: string } };
    character?: { id?: number; name?: string; image?: { medium?: string } };
  }>)
    .slice(0, 8)
    .map((c, idx) => ({
      id: String(c.character?.id || c.person?.id || idx),
      actor: c.person?.name || 'Cast',
      character: c.character?.name || 'Character',
      avatarUrl: c.character?.image?.medium || c.person?.image?.medium || '',
    }));

  return {
    id: item.id,
    tvmazeId: Number(item.externalId),
    title: data.name || item.title,
    year: data.premiered ? Number(data.premiered.slice(0, 4)) : item.year,
    genres: data.genres?.length ? data.genres : item.genres,
    rating: data.rating?.average || item.rating,
    mediaType: item.mediaType === 'anime' ? 'anime' : 'tv',
    posterUrl: data.image?.original || data.image?.medium || item.posterUrl,
    backdropUrl,
    overview: stripHtml(data.summary) || item.overview,
    runtimeAvg: data.averageRuntime || 45,
    network: data.webChannel?.name || data.network?.name || 'Streaming',
    totalEpisodes: rawEps.length || 1,
    seasons: seasons.length > 0 ? seasons : fallbackShowFromSearch(item).seasons,
    cast,
  };
}

async function hydrateTmdbShow(item: LiveSearchResult, apiKey: string): Promise<Show> {
  const res = await fetch(
    `https://api.themoviedb.org/3/tv/${item.externalId}?api_key=${encodeURIComponent(apiKey)}&append_to_response=credits`
  );
  if (!res.ok) return fallbackShowFromSearch(item);
  const data = await res.json();
  const validSeasons = ((data.seasons || []) as Array<{ season_number: number }>)
    .filter((s) => s.season_number > 0)
    .slice(0, 5);

  const seasonResponses = await Promise.all(
    validSeasons.map((s) =>
      fetch(
        `https://api.themoviedb.org/3/tv/${item.externalId}/season/${s.season_number}?api_key=${encodeURIComponent(apiKey)}`
      ).then((r) => (r.ok ? r.json() : null))
    )
  );

  const seasons: Season[] = [];
  for (const sData of seasonResponses) {
    if (!sData || !Array.isArray(sData.episodes)) continue;
    seasons.push({
      number: sData.season_number,
      episodes: sData.episodes.map(
        (ep: {
          season_number: number;
          episode_number: number;
          name?: string;
          air_date?: string;
          runtime?: number;
          still_path?: string;
          overview?: string;
        }) => ({
          id: `${item.id}-s${ep.season_number}e${ep.episode_number}`,
          season: ep.season_number,
          number: ep.episode_number,
          title: ep.name || `Episode ${ep.episode_number}`,
          airdate: ep.air_date || '',
          runtime: ep.runtime || 45,
          stillUrl: ep.still_path
            ? `https://image.tmdb.org/t/p/w500${ep.still_path}`
            : item.backdropUrl || item.posterUrl,
          overview: ep.overview || '',
        })
      ),
    });
  }

  const cast: CastMember[] = ((data.credits?.cast || []) as Array<{
    id: number;
    name: string;
    character: string;
    profile_path?: string;
  }>)
    .slice(0, 8)
    .map((c) => ({
      id: String(c.id),
      actor: c.name,
      character: c.character || c.name,
      avatarUrl: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : '',
    }));

  return {
    id: item.id,
    tmdbId: Number(item.externalId),
    title: data.name || item.title,
    year: data.first_air_date ? Number(data.first_air_date.slice(0, 4)) : item.year,
    genres: ((data.genres || []) as Array<{ name: string }>).map((g) => g.name),
    rating: data.vote_average ? Number(data.vote_average.toFixed(1)) : item.rating,
    mediaType: item.mediaType === 'anime' ? 'anime' : 'tv',
    posterUrl: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : item.posterUrl,
    backdropUrl: data.backdrop_path
      ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}`
      : item.backdropUrl,
    overview: data.overview || item.overview,
    runtimeAvg: data.episode_run_time?.[0] || 45,
    network: data.networks?.[0]?.name || 'Streaming',
    totalEpisodes: seasons.reduce((acc, s) => acc + s.episodes.length, 0) || data.number_of_episodes || 10,
    seasons: seasons.length > 0 ? seasons : fallbackShowFromSearch(item).seasons,
    cast,
  };
}

function fallbackShowFromSearch(item: LiveSearchResult): Show {
  return {
    id: item.id,
    title: item.title,
    year: item.year,
    genres: item.genres,
    rating: item.rating,
    mediaType: item.mediaType === 'anime' ? 'anime' : 'tv',
    posterUrl: item.posterUrl,
    backdropUrl: item.backdropUrl || item.posterUrl,
    overview: item.overview,
    runtimeAvg: item.runtime || 45,
    totalEpisodes: 10,
    seasons: [
      {
        number: 1,
        episodes: Array.from({ length: 10 }, (_, idx) => ({
          id: `${item.id}-s1e${idx + 1}`,
          season: 1,
          number: idx + 1,
          title: `Episode ${idx + 1}`,
          airdate: `${item.year}-01-01`,
          runtime: item.runtime || 45,
          stillUrl: item.backdropUrl || item.posterUrl,
          overview: '',
        })),
      },
    ],
    cast: [],
  };
}

export function hydrateLiveMovie(item: LiveSearchResult): Movie {
  return {
    id: item.id,
    itunesId: item.source === 'itunes' ? Number(item.externalId) || undefined : undefined,
    tmdbId: item.source === 'tmdb' ? Number(item.externalId) || undefined : undefined,
    title: item.title,
    year: item.year,
    genres: item.genres,
    rating: item.rating,
    runtime: item.runtime || 120,
    director: item.director || 'Feature Film',
    posterUrl: item.posterUrl,
    backdropUrl: item.backdropUrl || item.posterUrl,
    overview: item.overview,
    releaseDate: `${item.year}-01-01`,
    cast: [],
  };
}

export function hydrateLiveReadItem(item: LiveSearchResult): ReadItem {
  const format =
    item.mediaType === 'manga' ? 'manga' : item.mediaType === 'comic' ? 'comic' : 'book';
  const unit = format === 'manga' ? 'chapters' : format === 'comic' ? 'issues' : 'pages';
  return {
    id: item.id,
    format,
    unit,
    title: item.title,
    creator: item.director || item.subtitle || 'Author',
    year: item.year,
    totalUnits: item.totalUnits || (format === 'book' ? 320 : format === 'manga' ? 120 : 12),
    genres: item.genres,
    rating: item.rating,
    coverUrl: item.posterUrl,
    backdropUrl: item.backdropUrl || item.posterUrl,
    overview: item.overview,
  };
}

export function hydrateLiveGameItem(item: LiveSearchResult): GameItem {
  return {
    id: item.id,
    steamAppId: item.steamAppId,
    title: item.title,
    developer: item.subtitle || 'Studio',
    year: item.year,
    genres: item.genres,
    rating: item.rating,
    platforms: item.steamAppId ? ['PC', 'Steam Deck'] : ['Switch', 'PS5', 'PC'],
    coverUrl: item.posterUrl,
    backdropUrl: item.backdropUrl || item.posterUrl,
    overview: item.overview,
  };
}
