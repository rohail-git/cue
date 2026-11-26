import type { CueStoreState, MediaDomain } from '../types';
import { evaluateCustomListProgress } from './containers';
import { resolveComicEditionCover } from './editions';
import { cleanDisplayGenres, formatEpisodeCode, getReadStats, getShowStats } from './stats';

export type MindIntent = 'auto' | 'quick' | 'deep' | 'finish';

export interface CueMindThought {
  id: string;
  intent: Exclude<MindIntent, 'auto'>;
  tag: string;
  headline: string;
  reason: string;
  domain: MediaDomain | 'all';
  actionLabel: string;
  target?: {
    kind: 'show' | 'movie' | 'read' | 'game' | 'list';
    id: string;
    title: string;
    posterUrl?: string;
  };
  requiresHeal?: boolean;
}

export interface CueMindSnapshot {
  greeting: string;
  balanceNote: string;
  brokenCoverCount: number;
  staleComicCount: number;
  thoughts: CueMindThought[];
}

function getTimeContext(): { greeting: string; windowHint: 'morning' | 'afternoon' | 'evening' | 'night' } {
  const hr = new Date().getHours();
  if (hr >= 5 && hr < 12) return { greeting: 'Morning pulse', windowHint: 'morning' };
  if (hr >= 12 && hr < 17) return { greeting: 'Afternoon focus', windowHint: 'afternoon' };
  if (hr >= 17 && hr < 22) return { greeting: 'Evening cue', windowHint: 'evening' };
  return { greeting: 'Late-night session', windowHint: 'night' };
}

export function computeCueMind(state: CueStoreState, intent: MindIntent = 'auto'): CueMindSnapshot {
  const { greeting, windowHint } = getTimeContext();
  const candidates: CueMindThought[] = [];

  let brokenCoverCount = 0;
  let staleComicCount = 0;

  let activeWatch = 0;
  let activeRead = 0;
  let activePlay = 0;

  // Compute favorite genres from engaged titles to guide smart dusty picks
  const genreScore = new Map<string, number>();
  const bumpGenres = (genres: string[]) => {
    for (const g of cleanDisplayGenres(genres)) {
      genreScore.set(g, (genreScore.get(g) || 0) + 1);
    }
  };

  // Scan Shows
  for (const id of state.showOrder) {
    const show = state.shows[id];
    const prog = state.showProgress[id];
    if (!show || !prog?.bookmarked) continue;
    if (!show.posterUrl) brokenCoverCount += 1;
    const st = getShowStats(show, prog);
    if (st.isFinished) {
      bumpGenres(show.genres);
      continue;
    }
    if (st.watchedUnique > 0) activeWatch += 1;
    if (prog.rating && prog.rating >= 4) bumpGenres(show.genres);

    const remainingEps = Math.max(0, st.totalEpisodes - st.watchedUnique);
    const nextCode = st.nextEpisode
      ? formatEpisodeCode(st.nextEpisode.season, st.nextEpisode.number)
      : 'next ep';

    if (st.progressRatio >= 0.7 || (remainingEps > 0 && remainingEps <= 3)) {
      candidates.push({
        id: `finish-show-${show.id}`,
        intent: 'finish',
        tag: 'Almost done',
        headline: `Finish ${show.title}`,
        reason: `Only ${remainingEps} ${remainingEps === 1 ? 'episode' : 'episodes'} left (${Math.round(
          st.progressRatio * 100
        )}% complete) · ${nextCode}.`,
        domain: 'watch',
        actionLabel: `Open ${show.title}`,
        target: { kind: 'show', id: show.id, title: show.title, posterUrl: show.posterUrl },
      });
    } else if ((show.runtimeAvg || 42) <= 32 || st.nextEpisode) {
      candidates.push({
        id: `quick-show-${show.id}`,
        intent: 'quick',
        tag: windowHint === 'evening' ? 'Evening episode' : 'Quick watch',
        headline: `Queue ${show.title} ${nextCode}`,
        reason: `${show.runtimeAvg || 35}m runtime fits cleanly right now${
          st.nextEpisode?.title ? ` — "${st.nextEpisode.title}".` : '.'
        }`,
        domain: 'watch',
        actionLabel: 'Watch next',
        target: { kind: 'show', id: show.id, title: show.title, posterUrl: show.posterUrl },
      });
    }
  }

  // Scan Movies
  for (const id of state.movieOrder) {
    const m = state.movies[id];
    const prog = state.movieProgress[id];
    if (!m || !prog) continue;
    if (!m.posterUrl) brokenCoverCount += 1;
    if ((prog.watchCount || 0) > 0) {
      bumpGenres(m.genres);
      continue;
    }
    activeWatch += 1;
    if (windowHint === 'evening' || windowHint === 'night') {
      candidates.push({
        id: `deep-movie-${m.id}`,
        intent: 'deep',
        tag: 'Feature night',
        headline: `Watch ${m.title}`,
        reason: `${m.year} · ${m.runtime} min feature waiting in your Watchlist.`,
        domain: 'watch',
        actionLabel: 'View film',
        target: { kind: 'movie', id: m.id, title: m.title, posterUrl: m.posterUrl },
      });
    }
  }

  // Scan Read items
  for (const id of state.readOrder) {
    const r = state.readItems[id];
    const prog = state.readProgress[id];
    if (!r || !prog?.bookmarked) continue;
    const cover = resolveComicEditionCover(r, prog.edition, prog);
    if (!cover) brokenCoverCount += 1;
    if (
      r.format === 'comic' &&
      r.issueDetails &&
      Object.keys(r.issueDetails).length > 0 &&
      r.issueDetailsKey &&
      !r.issueDetailsKey.endsWith('::ca5')
    ) {
      staleComicCount += 1;
    }
    const st = getReadStats(r, prog);
    if (st.isFinished) {
      bumpGenres(r.genres);
      continue;
    }
    if (st.current > 0) activeRead += 1;
    const rem = Math.max(0, st.total - st.current);

    if (st.ratio >= 0.68 || (rem > 0 && rem <= 4)) {
      candidates.push({
        id: `finish-read-${r.id}`,
        intent: 'finish',
        tag: 'Nearly complete',
        headline: `Wrap up ${r.title}`,
        reason: `${rem} ${rem === 1 ? st.unitSingular : st.unitLabel} left (${Math.round(
          st.ratio * 100
        )}%) · next up is ${st.nextUnitShort}.`,
        domain: 'read',
        actionLabel: 'Continue reading',
        target: { kind: 'read', id: r.id, title: r.title, posterUrl: cover },
      });
    } else if (r.unit === 'issues' || r.format === 'manga') {
      candidates.push({
        id: `quick-read-${r.id}`,
        intent: 'quick',
        tag: windowHint === 'morning' ? 'Coffee read' : '10 min read',
        headline: `Read ${r.title} (${st.nextUnitShort})`,
        reason: `Bite-sized ${r.format} progress (${st.current}/${st.total} ${st.unitLabel}).`,
        domain: 'read',
        actionLabel: 'Log next',
        target: { kind: 'read', id: r.id, title: r.title, posterUrl: cover },
      });
    } else {
      candidates.push({
        id: `deep-read-${r.id}`,
        intent: 'deep',
        tag: 'Book session',
        headline: `Dive into ${r.title}`,
        reason: `${r.creator} · ${st.current}/${st.total} chapters logged.`,
        domain: 'read',
        actionLabel: 'Open book',
        target: { kind: 'read', id: r.id, title: r.title, posterUrl: cover },
      });
    }
  }

  // Scan Play items
  for (const id of state.gameOrder) {
    const g = state.games[id];
    const prog = state.gameProgress[id];
    if (!g || !prog?.bookmarked) continue;
    if (!g.coverUrl) brokenCoverCount += 1;
    if (prog.status === 'completed' || prog.status === 'dropped') {
      bumpGenres(g.genres);
      continue;
    }
    if (prog.status === 'playing' || (prog.hoursPlayed || 0) > 0) activePlay += 1;

    const pct = prog.completionPct || 0;
    if (pct >= 65) {
      candidates.push({
        id: `finish-game-${g.id}`,
        intent: 'finish',
        tag: 'Final stretch',
        headline: `Beat ${g.title}`,
        reason: `You're already at ${pct}% (${prog.hoursPlayed || 0}h on ${prog.platform}).`,
        domain: 'play',
        actionLabel: 'Resume run',
        target: { kind: 'game', id: g.id, title: g.title, posterUrl: g.coverUrl },
      });
    } else {
      const hasGenreMatch = cleanDisplayGenres(g.genres).some((gn) => (genreScore.get(gn) || 0) >= 2);
      candidates.push({
        id: `deep-game-${g.id}`,
        intent: 'deep',
        tag: prog.status === 'playing' ? 'Active campaign' : hasGenreMatch ? 'Matches your taste' : 'Backlog pick',
        headline: `${prog.status === 'playing' ? 'Continue' : 'Start'} ${g.title}`,
        reason: `${prog.platform} · ${prog.hoursPlayed || 0}h played${
          g.totalChapters ? ` · ${prog.currentChapter || 0}/${g.totalChapters} ${g.chapterUnit || 'chapters'}` : ''
        }.`,
        domain: 'play',
        actionLabel: 'Open game',
        target: { kind: 'game', id: g.id, title: g.title, posterUrl: g.coverUrl },
      });
    }
  }

  // Active custom runs check
  for (const list of state.lists || []) {
    const ev = evaluateCustomListProgress(list, state);
    if (ev.totalItems > 0 && ev.completedItems < ev.totalItems && ev.nextItem) {
      candidates.push({
        id: `finish-list-${list.id}`,
        intent: ev.averageRatio >= 0.6 ? 'finish' : 'deep',
        tag: 'Run progress',
        headline: `Advance "${list.name}"`,
        reason: `${ev.completedItems}/${ev.totalItems} complete · Next: ${ev.nextItem.title}.`,
        domain: 'all',
        actionLabel: 'Open list',
        target: { kind: 'list', id: list.id, title: list.name },
      });
    }
  }

  // Self-heal suggestion placed after core Watch/Read/Play picks so active recommendations lead
  if (brokenCoverCount > 0 || staleComicCount > 0) {
    candidates.push({
      id: 'mind-self-heal',
      intent: 'quick',
      tag: 'Maintenance',
      headline: `Repair ${brokenCoverCount + staleComicCount} cached library ${
        brokenCoverCount + staleComicCount === 1 ? 'item' : 'items'
      }`,
      reason:
        brokenCoverCount > 0 && staleComicCount > 0
          ? `${brokenCoverCount} missing cover URLs and ${staleComicCount} outdated comic caches can be auto-healed.`
          : brokenCoverCount > 0
            ? `${brokenCoverCount} titles have missing artwork ready for live lookup repair.`
            : `${staleComicCount} comic caches can refresh for clean Cover A thumbnails.`,
      domain: 'all',
      actionLabel: 'Scan & Self-Heal',
      requiresHeal: true,
    });
  }

  // Balance check
  const activeBuckets = [
    { d: 'Watch', n: activeWatch },
    { d: 'Read', n: activeRead },
    { d: 'Play', n: activePlay },
  ];
  const emptyDomains = activeBuckets.filter((b) => b.n === 0).map((b) => b.d);
  const balanceNote =
    emptyDomains.length === 0
      ? `Balanced momentum across Watch (${activeWatch}), Read (${activeRead}), and Play (${activePlay}).`
      : emptyDomains.length < 3
        ? `${emptyDomains.join(' & ')} ${emptyDomains.length === 1 ? 'is' : 'are'} quiet right now — mix one in today.`
        : 'Add or resume any Watch, Read, or Play title to activate Cue Mind.';

  let filtered =
    intent === 'auto' ? candidates : candidates.filter((c) => c.intent === intent);
  if (filtered.length === 0) {
    filtered = candidates;
  }

  // Deduplicate by target & cap to 6 crisp thoughts
  const seenTargets = new Set<string>();
  const finalThoughts: CueMindThought[] = [];
  for (const t of filtered) {
    const key = t.target ? `${t.target.kind}:${t.target.id}` : t.id;
    if (seenTargets.has(key)) continue;
    seenTargets.add(key);
    finalThoughts.push(t);
    if (finalThoughts.length >= 6) break;
  }

  if (finalThoughts.length === 0) {
    finalThoughts.push({
      id: 'mind-discover-fallback',
      intent: 'quick',
      tag: 'Cue Mind',
      headline: 'Everything in your active cue is wrapped up',
      reason: 'Browse Discover rails or scan a book ISBN to line up your next Watch, Read, or Play title.',
      domain: 'all',
      actionLabel: 'Browse Discover',
    });
  }

  return {
    greeting,
    balanceNote,
    brokenCoverCount,
    staleComicCount,
    thoughts: finalThoughts,
  };
}
