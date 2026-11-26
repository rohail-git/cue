import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createEmptyState } from '../data/seedState';
import {
  generateSyncCode,
  isValidSyncCode,
  normalizeSyncCode,
  pullCloudLibrary,
  pushCloudLibrary,
} from '../services/syncApi';
import type {
  AppSettings,
  CastMember,
  ComicEditionId,
  ComicEditionRecord,
  ComicIssueMeta,
  CueStoreState,
  GameChapterSource,
  GameChapterUnit,
  GameItem,
  GamePlatform,
  GameWatchStatus,
  GeneralizedComicEditionId,
  HistoryEntry,
  JournalEntry,
  MediaDomain,
  Movie,
  MovieWatchStatus,
  PersonalMood,
  RatingSource,
  ReadItem,
  ReadProgress,
  ReadWatchStatus,
  RouteView,
  Season,
  Show,
  ShowProgress,
  UserProfile,
} from '../types';
import {
  evaluateBookSeriesProgress,
  evaluateComicEditionContainers,
  evaluateCustomListProgress,
  evaluateMovieCollectionProgress,
  findBookSeries,
  findMovieCollection,
} from '../utils/containers';
import {
  getComicEditionLabel,
  getKnownComicEditionSpec,
  mergeComicEditionCatalog,
  normalizeComicEditionId,
  resolveComicEditionCover,
  resolveComicEditionTotal,
} from '../utils/editions';
import { lookupKnownGameChapters } from '../utils/gameChapters';
import {
  annotateImportDuplicates,
  classifyReadFormat,
  type ImportConflictPolicy,
  type PreparedImportEntry,
} from '../utils/mediaImport';
import { getSeasonEpisodeAverage } from '../utils/ratings';
import {
  formatEpisodeCode,
  formatGameMeta,
  getAllEpisodes,
  getCompletedReadUnits,
  getEpisodeKey,
  getSeasonProgress,
  getShowStats,
} from '../utils/stats';

const STORAGE_KEY = 'cue_state_v3';
const LEGACY_V2_KEY = 'cue_state_v2';
const LEGACY_STORAGE_KEY = 'cue_state_v1';
const SYNC_CODE_KEY = 'cue_sync_code_v1';
const SYNC_TS_KEY = 'cue_sync_ts_v1';
const LOCAL_EDIT_TS_KEY = 'cue_local_ts_v1';

const MAX_HISTORY_ENTRIES = 60;

function appendHistory(prev: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  const next = [...prev, entry];
  return next.length > MAX_HISTORY_ENTRIES ? next.slice(next.length - MAX_HISTORY_ENTRIES) : next;
}

function loadInitialState(): CueStoreState {
  try {
    const rawV3 = localStorage.getItem(STORAGE_KEY);
    if (rawV3) {
      const parsed = JSON.parse(rawV3) as CueStoreState;
      if (parsed && parsed.shows && parsed.movies && parsed.readItems && parsed.games) {
        if (!Array.isArray(parsed.history)) {
          parsed.history = [];
        }
        if (!parsed.collectionRatings) {
          parsed.collectionRatings = {};
        }
        if (parsed.settings && !parsed.settings.detailMode) {
          parsed.settings.detailMode = 'simple';
        }
        return parsed;
      }
    }
    const empty = createEmptyState();
    const rawV2 = localStorage.getItem(LEGACY_V2_KEY);
    if (rawV2) {
      const v2 = JSON.parse(rawV2) as Partial<CueStoreState>;
      if (v2.profile) empty.profile = { ...empty.profile, ...v2.profile };
      if (v2.settings) {
        empty.settings = {
          ...empty.settings,
          watchLayout: v2.settings.watchLayout || empty.settings.watchLayout,
          readLayout: v2.settings.readLayout || empty.settings.readLayout,
          playLayout: v2.settings.playLayout || empty.settings.playLayout,
          sortBy: v2.settings.sortBy || empty.settings.sortBy,
          showPosterProgress: v2.settings.showPosterProgress ?? empty.settings.showPosterProgress,
          tmdbApiKey: v2.settings.tmdbApiKey || '',
        };
      }
      if (v2.showProgress) empty.showProgress = { ...empty.showProgress, ...v2.showProgress };
      if (v2.movieProgress) empty.movieProgress = { ...empty.movieProgress, ...v2.movieProgress };
      if (v2.gameProgress) empty.gameProgress = { ...empty.gameProgress, ...v2.gameProgress };
      return empty;
    }
    const rawV1 = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (rawV1) {
      const v1 = JSON.parse(rawV1) as {
        profile?: { name?: string; handle?: string; avatarUrl?: string; bannerUrl?: string };
        settings?: { tmdbApiKey?: string };
      };
      if (v1?.profile?.name) {
        empty.profile.name = v1.profile.name;
        empty.profile.handle = v1.profile.handle || empty.profile.handle;
        if (v1.profile.avatarUrl) empty.profile.avatarUrl = v1.profile.avatarUrl;
        if (v1.profile.bannerUrl) empty.profile.bannerUrl = v1.profile.bannerUrl;
      }
      if (v1?.settings?.tmdbApiKey) empty.settings.tmdbApiKey = v1.settings.tmdbApiKey;
    }
    return empty;
  } catch {
    return createEmptyState();
  }
}

export interface ToastOptions {
  domain?: MediaDomain | 'neutral';
  subtitle?: string;
  posterUrl?: string;
  tone?: 'success' | 'info' | 'undo';
}

export interface ToastItem extends ToastOptions {
  id: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export interface ReleaseBannerData {
  title: string;
  body: string;
  timeLabel: string;
  domain: MediaDomain;
  mediaKind?: 'show' | 'read' | 'game';
  mediaId?: string;
}

interface CueContextValue {
  state: CueStoreState;
  route: RouteView;
  canGoBack: boolean;
  switchTab: (
    tab: 'queue' | 'watch' | 'read' | 'play' | 'journal' | 'search',
    calendarMode?: boolean
  ) => void;
  pushRoute: (next: RouteView) => void;
  goBack: () => void;
  toggleCalendarMode: () => void;

  toast: ToastItem | null;
  dismissToast: () => void;
  showToast: (
    message: string,
    actionLabel?: string,
    onAction?: () => void,
    options?: ToastOptions
  ) => void;

  activeBanner: ReleaseBannerData | null;
  dismissBanner: () => void;
  triggerSampleReleaseAlert: () => void;

  filterSheetOpen: boolean;
  setFilterSheetOpen: (open: boolean) => void;
  notificationsOpen: boolean;
  setNotificationsOpen: (open: boolean) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  insightsOpen: boolean;
  setInsightsOpen: (open: boolean) => void;
  importModalOpen: boolean;
  setImportModalOpen: (open: boolean) => void;

  // Watch actions
  watchNextEpisode: (showId: string) => void;
  toggleEpisodeWatched: (showId: string, season: number, number: number) => void;
  incrementEpisodeRewatch: (showId: string, season: number, number: number, delta: number) => void;
  toggleShowBookmark: (showId: string) => void;
  toggleShowNotifications: (showId: string) => void;
  markSeasonWatched: (showId: string, seasonNumber: number, rewatchIfDone?: boolean) => void;
  markShowAllWatched: (showId: string) => void;
  startShowRewatch: (showId: string) => void;
  resetShowProgress: (showId: string) => void;
  rateEpisode: (showId: string, season: number, number: number, rating: number | undefined) => void;
  rateSeason: (
    showId: string,
    seasonNumber: number,
    rating: number | undefined,
    source?: RatingSource
  ) => void;
  rateShow: (showId: string, rating: number | undefined, source?: RatingSource) => void;
  setShowMood: (showId: string, mood: PersonalMood | undefined) => void;
  updateShowEpisodes: (
    showId: string,
    seasons: Season[],
    cast?: CastMember[],
    runtimeAvg?: number
  ) => void;

  toggleMovieWatched: (movieId: string) => void;
  incrementMovieRewatch: (movieId: string, delta: number) => void;
  toggleMovieWatchlist: (movieId: string) => void;
  rateMovie: (movieId: string, rating: number | undefined) => void;
  setMovieMood: (movieId: string, mood: PersonalMood | undefined) => void;

  // Read actions
  advanceReadProgress: (readId: string, delta?: number) => void;
  setReadProgress: (readId: string, currentUnit: number) => void;
  toggleReadUnit: (readId: string, unitNumber: number) => void;
  markReadFinished: (readId: string) => void;
  incrementReread: (readId: string, delta: number) => void;
  toggleReadBookmark: (readId: string) => void;
  rateReadUnit: (readId: string, unitNumber: number, rating: number | undefined) => void;
  rateReadItem: (readId: string, rating: number | undefined, source?: RatingSource) => void;
  setReadMood: (readId: string, mood: PersonalMood | undefined) => void;
  setReadEdition: (readId: string, edition: ComicEditionId) => void;
  selectComicEdition: (readId: string, editionRecord: ComicEditionRecord) => void;
  updateReadEditionsCatalog: (readId: string, editions: ComicEditionRecord[]) => void;
  updateReadIssueDetails: (
    readId: string,
    issueDetails: Record<number, ComicIssueMeta>,
    detailsKey: string,
    resolvedTotalUnits?: number
  ) => void;
  patchReadIssueMeta: (
    readId: string,
    unitNumber: number,
    patch: Partial<ComicIssueMeta>
  ) => void;
  updateReadEditionCovers: (
    readId: string,
    editionCovers: Partial<Record<ComicEditionId, string>>,
    cleanTitle?: string,
    editionIssueCounts?: Partial<Record<ComicEditionId, number>>,
    editionVariants?: Partial<Record<GeneralizedComicEditionId, string[]>>
  ) => void;
  updateReadTotalUnits: (readId: string, totalUnits: number) => void;
  updateReadFormat: (readId: string, format: ReadItem['format']) => void;
  autoClassifyReadLibrary: () => { comics: number; manga: number };
  resetReadProgress: (readId: string) => void;

  // Play actions
  logGameSession: (gameId: string, hoursDelta: number) => void;
  advanceGameChapter: (gameId: string, delta?: number) => void;
  setGameChapter: (gameId: string, chapter: number) => void;
  updateGameChaptersMeta: (
    gameId: string,
    totalChapters: number,
    unit?: GameChapterUnit,
    source?: GameChapterSource,
    note?: string
  ) => void;
  updateGameProgress: (
    gameId: string,
    patch: Partial<{
      status: GameWatchStatus;
      hoursPlayed: number;
      completionPct: number;
      platform: GamePlatform;
    }>
  ) => void;
  toggleGameCompleted: (gameId: string) => void;
  toggleGamePlatinum: (gameId: string) => void;
  incrementGamePlaythrough: (gameId: string, delta: number) => void;
  toggleGameBookmark: (gameId: string) => void;
  rateGame: (gameId: string, rating: number | undefined) => void;
  rateGameChapter: (gameId: string, chapter: number, rating: number | undefined) => void;
  setGameChapterTitle: (gameId: string, chapter: number, title: string) => void;
  setGameMood: (gameId: string, mood: PersonalMood | undefined) => void;
  resetGameProgress: (gameId: string) => void;

  // Collection & List actions
  rateCollection: (
    collectionKey: string,
    rating: number | undefined,
    source?: RatingSource
  ) => void;
  toggleListPinnedToQueue: (listId: string) => void;
  deleteCustomList: (listId: string) => void;

  // Live catalog additions
  addLiveShowToStore: (show: Show, andBookmark?: boolean) => void;
  addLiveMovieToStore: (movie: Movie, status?: MovieWatchStatus, andBookmark?: boolean) => void;
  addLiveReadToStore: (item: ReadItem, status?: ReadWatchStatus, andBookmark?: boolean) => void;
  addLiveGameToStore: (game: GameItem, status?: GameWatchStatus, andBookmark?: boolean) => void;
  patchMediaMetadata: (
    kind: 'show' | 'movie' | 'read' | 'game',
    id: string,
    patch: {
      posterUrl?: string;
      backdropUrl?: string;
      coverUrl?: string;
      clearStaleIssues?: boolean;
    }
  ) => void;

  // Private Journal & Lists
  addJournalEntry: (input: Omit<JournalEntry, 'id' | 'createdAt'>) => void;
  deleteJournalEntry: (entryId: string) => void;
  markAllNotificationsRead: () => void;
  createCustomList: (
    name: string,
    description: string,
    initialItem?: { kind: 'show' | 'movie' | 'read' | 'game'; id: string },
    initialItems?: Array<{ kind: 'show' | 'movie' | 'read' | 'game'; id: string }>
  ) => void;
  toggleItemInList: (
    listId: string,
    kind: 'show' | 'movie' | 'read' | 'game',
    id: string
  ) => void;

  updateProfile: (patch: Partial<UserProfile>) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  exportLibraryJson: () => string;
  importLibraryJson: (rawJson: string) => { ok: boolean; summary: string };
  restoreCueBackup: (backupState: CueStoreState) => void;
  importSmartBatch: (
    entries: PreparedImportEntry[],
    policy: ImportConflictPolicy
  ) => { added: number; updated: number; skipped: number };
  undoLastImport: () => void;
  selectiveReset: (scope: 'watch' | 'read' | 'play' | 'all') => void;
  clearAllData: () => void;

  // No-account cloud sync
  syncCode: string | null;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  lastSyncedAt: number | null;
  syncError: string | null;
  createSyncCode: () => Promise<string | null>;
  linkSyncCode: (rawCode: string) => Promise<{ ok: boolean; message: string }>;
  syncNow: () => Promise<void>;
  unlinkSyncCode: () => void;
}

const CueContext = createContext<CueContextValue | null>(null);

interface CueHistoryState {
  cueNav: true;
  depth: number;
  stack: RouteView[];
  modal?: boolean;
}

function routesEqual(a?: RouteView, b?: RouteView): boolean {
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function getInitialHistoryState(): { stack: RouteView[]; depth: number } {
  try {
    const st = window.history.state as Partial<CueHistoryState> | null;
    if (st?.cueNav && Array.isArray(st.stack) && st.stack.length > 0) {
      return {
        stack: st.stack,
        depth: typeof st.depth === 'number' && st.depth >= 0 ? st.depth : 0,
      };
    }
  } catch {
    // ignore history access errors
  }
  return { stack: [{ view: 'queue' }], depth: 0 };
}

export function CueProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CueStoreState>(loadInitialState);
  const initialHistoryRef = useRef<{ stack: RouteView[]; depth: number } | null>(null);
  if (!initialHistoryRef.current) {
    initialHistoryRef.current = getInitialHistoryState();
  }
  const [routeStack, setRouteStack] = useState<RouteView[]>(initialHistoryRef.current.stack);
  const [toast, setToast] = useState<ToastItem | null>(null);
  const [activeBanner, setActiveBanner] = useState<ReleaseBannerData | null>(null);

  const [filterSheetOpen, setFilterSheetOpenRaw] = useState(false);
  const [notificationsOpen, setNotificationsOpenRaw] = useState(false);
  const [settingsOpen, setSettingsOpenRaw] = useState(false);
  const [insightsOpen, setInsightsOpenRaw] = useState(false);
  const [importModalOpen, setImportModalOpenRaw] = useState(false);
  const lastPreImportStateRef = useRef<CueStoreState | null>(null);
  const routeStackRef = useRef<RouteView[]>(routeStack);
  routeStackRef.current = routeStack;
  const historyDepthRef = useRef<number>(initialHistoryRef.current.depth);
  const modalFlagsRef = useRef({
    filter: false,
    notifications: false,
    settings: false,
    insights: false,
    import: false,
  });

  const [syncCode, setSyncCode] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem(SYNC_CODE_KEY);
      return saved && isValidSyncCode(saved) ? normalizeSyncCode(saved) : null;
    } catch {
      return null;
    }
  });
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(() => {
    try {
      const val = Number(localStorage.getItem(SYNC_TS_KEY));
      return Number.isFinite(val) && val > 0 ? val : null;
    } catch {
      return null;
    }
  });
  const [syncError, setSyncError] = useState<string | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const syncCodeRef = useRef(syncCode);
  syncCodeRef.current = syncCode;
  const lastSyncedAtRef = useRef(lastSyncedAt);
  lastSyncedAtRef.current = lastSyncedAt;
  const localEditedAtRef = useRef<number>(
    (() => {
      try {
        return Number(localStorage.getItem(LOCAL_EDIT_TS_KEY) || 0) || 0;
      } catch {
        return 0;
      }
    })()
  );
  const isInitialMountRef = useRef(true);
  const suppressNextPushRef = useRef(false);
  const pushTimerRef = useRef<number | null>(null);

  const route = routeStack[routeStack.length - 1];
  const canGoBack = routeStack.length > 1;

  const showToast = useCallback(
    (
      message: string,
      actionLabel?: string,
      onAction?: () => void,
      options?: ToastOptions
    ) => {
      setToast({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        message,
        actionLabel,
        onAction,
        ...options,
      });
    },
    []
  );

  const commitState = useCallback(
    (updater: (prev: CueStoreState) => CueStoreState): CueStoreState => {
      const next = updater(stateRef.current);
      if (next !== stateRef.current) {
        stateRef.current = next;
        setState(next);
      }
      return next;
    },
    []
  );

  const hydrateFromCloud = useCallback((cloudState: CueStoreState, cloudTs: number) => {
    if (!Array.isArray(cloudState.history)) {
      cloudState.history = [];
    }
    suppressNextPushRef.current = true;
    localEditedAtRef.current = cloudTs;
    try {
      localStorage.setItem(LOCAL_EDIT_TS_KEY, String(cloudTs));
      localStorage.setItem(SYNC_TS_KEY, String(cloudTs));
    } catch {
      // ignore storage quota
    }
    stateRef.current = cloudState;
    setState(cloudState);
    setLastSyncedAt(cloudTs);
    setSyncStatus('synced');
    setSyncError(null);
  }, []);

  const persistPush = useCallback(async (code: string, snapshot: CueStoreState, updatedAt: number) => {
    setSyncStatus('syncing');
    setSyncError(null);
    const res = await pushCloudLibrary(code, snapshot, updatedAt);
    if (res.ok) {
      try {
        localStorage.setItem(SYNC_TS_KEY, String(res.updatedAt));
        localStorage.setItem(LOCAL_EDIT_TS_KEY, String(res.updatedAt));
      } catch {
        // ignore storage quota
      }
      localEditedAtRef.current = res.updatedAt;
      setLastSyncedAt(res.updatedAt);
      setSyncStatus('synced');
      setSyncError(null);
      return res;
    }
    setSyncStatus('error');
    setSyncError(res.error || 'Failed to sync to cloud.');
    return res;
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore storage quota
    }

    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    if (suppressNextPushRef.current) {
      suppressNextPushRef.current = false;
      return;
    }

    const editedAt = Date.now();
    localEditedAtRef.current = editedAt;
    try {
      localStorage.setItem(LOCAL_EDIT_TS_KEY, String(editedAt));
    } catch {
      // ignore
    }

    const activeCode = syncCodeRef.current;
    if (!activeCode) return;

    if (pushTimerRef.current) window.clearTimeout(pushTimerRef.current);
    pushTimerRef.current = window.setTimeout(() => {
      void persistPush(activeCode, stateRef.current, editedAt);
    }, 1400);
  }, [state, persistPush]);

  useEffect(() => {
    return () => {
      if (pushTimerRef.current) window.clearTimeout(pushTimerRef.current);
    };
  }, []);

  const createSyncCode = useCallback(async () => {
    const code = generateSyncCode();
    const res = await persistPush(code, stateRef.current, Date.now());
    if (!res.ok) return null;
    try {
      localStorage.setItem(SYNC_CODE_KEY, code);
    } catch {
      // ignore
    }
    setSyncCode(code);
    showToast('Sync code created');
    return code;
  }, [persistPush, showToast]);

  const linkSyncCode = useCallback(
    async (rawCode: string): Promise<{ ok: boolean; message: string }> => {
      const code = normalizeSyncCode(rawCode);
      if (!isValidSyncCode(code)) {
        const message = 'Enter a valid sync code (e.g. CUE-XXXX-XXXX-XXXX).';
        setSyncError(message);
        return { ok: false, message };
      }

      setSyncStatus('syncing');
      setSyncError(null);
      const pulled = await pullCloudLibrary(code);
      if (pulled.error) {
        setSyncStatus('error');
        setSyncError(pulled.error);
        return { ok: false, message: pulled.error };
      }

      try {
        localStorage.setItem(SYNC_CODE_KEY, code);
      } catch {
        // ignore
      }
      setSyncCode(code);

      if (pulled.exists && pulled.state) {
        hydrateFromCloud(pulled.state, pulled.updatedAt || Date.now());
        showToast('Synced library from cloud');
        return { ok: true, message: 'Paired and loaded your cloud library.' };
      }

      const pushed = await persistPush(code, stateRef.current, Date.now());
      if (!pushed.ok) {
        return { ok: false, message: pushed.error || 'Could not upload local library.' };
      }
      showToast('Device linked to cloud');
      return { ok: true, message: 'Device linked cleanly.' };
    },
    [hydrateFromCloud, persistPush, showToast]
  );

  const pullIfCloudNewer = useCallback(
    async (code: string, pushIfLocalNewer = false) => {
      setSyncStatus('syncing');
      const pulled = await pullCloudLibrary(code);
      if (pulled.error) {
        setSyncStatus('error');
        setSyncError(pulled.error);
        return;
      }
      const localBaseline = Math.max(lastSyncedAtRef.current || 0, localEditedAtRef.current);
      if (pulled.exists && pulled.state && (pulled.updatedAt || 0) > localBaseline) {
        hydrateFromCloud(pulled.state, pulled.updatedAt || Date.now());
        showToast('Library updated from cloud');
        return;
      }
      if (pushIfLocalNewer || !pulled.exists) {
        await persistPush(code, stateRef.current, Date.now());
        return;
      }
      setSyncStatus('synced');
      setSyncError(null);
    },
    [hydrateFromCloud, persistPush, showToast]
  );

  const syncNow = useCallback(async () => {
    const code = syncCodeRef.current;
    if (!code) return;
    await pullIfCloudNewer(code, true);
  }, [pullIfCloudNewer]);

  const unlinkSyncCode = useCallback(() => {
    if (pushTimerRef.current) window.clearTimeout(pushTimerRef.current);
    try {
      localStorage.removeItem(SYNC_CODE_KEY);
      localStorage.removeItem(SYNC_TS_KEY);
    } catch {
      // ignore
    }
    setSyncCode(null);
    setLastSyncedAt(null);
    setSyncStatus('idle');
    setSyncError(null);
    showToast('Unlinked cloud sync');
  }, [showToast]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pairParam = params.get('pair');
    if (pairParam && isValidSyncCode(pairParam)) {
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`);
      void linkSyncCode(pairParam);
      return;
    }
    if (syncCodeRef.current) {
      void pullIfCloudNewer(syncCodeRef.current, false);
    }
  }, [linkSyncCode, pullIfCloudNewer]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && syncCodeRef.current) {
        void pullIfCloudNewer(syncCodeRef.current, false);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [pullIfCloudNewer]);

  const dismissToast = useCallback(() => setToast(null), []);
  const dismissBanner = useCallback(() => setActiveBanner(null), []);

  const closeAllModalsRaw = useCallback(() => {
    modalFlagsRef.current = {
      filter: false,
      notifications: false,
      settings: false,
      insights: false,
      import: false,
    };
    setFilterSheetOpenRaw(false);
    setNotificationsOpenRaw(false);
    setSettingsOpenRaw(false);
    setInsightsOpenRaw(false);
    setImportModalOpenRaw(false);
  }, []);

  const updateModalOpen = useCallback(
    (
      key: keyof typeof modalFlagsRef.current,
      rawSetter: (open: boolean) => void,
      open: boolean
    ) => {
      modalFlagsRef.current[key] = open;
      rawSetter(open);
      try {
        const cur = window.history.state as Partial<CueHistoryState> | null;
        if (open) {
          if (!(cur?.cueNav && cur?.modal === true)) {
            const nextDepth = historyDepthRef.current + 1;
            historyDepthRef.current = nextDepth;
            const entry: CueHistoryState = {
              cueNav: true,
              depth: nextDepth,
              stack: routeStackRef.current,
              modal: true,
            };
            window.history.pushState(entry, '');
          }
        } else {
          queueMicrotask(() => {
            const anyOpen = Object.values(modalFlagsRef.current).some(Boolean);
            const latest = window.history.state as Partial<CueHistoryState> | null;
            if (!anyOpen && latest?.cueNav && latest?.modal === true && historyDepthRef.current > 0) {
              window.history.back();
            }
          });
        }
      } catch {
        // ignore history access errors
      }
    },
    []
  );

  const setFilterSheetOpen = useCallback(
    (open: boolean) => updateModalOpen('filter', setFilterSheetOpenRaw, open),
    [updateModalOpen]
  );
  const setNotificationsOpen = useCallback(
    (open: boolean) => updateModalOpen('notifications', setNotificationsOpenRaw, open),
    [updateModalOpen]
  );
  const setSettingsOpen = useCallback(
    (open: boolean) => updateModalOpen('settings', setSettingsOpenRaw, open),
    [updateModalOpen]
  );
  const setInsightsOpen = useCallback(
    (open: boolean) => updateModalOpen('insights', setInsightsOpenRaw, open),
    [updateModalOpen]
  );
  const setImportModalOpen = useCallback(
    (open: boolean) => updateModalOpen('import', setImportModalOpenRaw, open),
    [updateModalOpen]
  );

  useEffect(() => {
    try {
      const cur = window.history.state as Partial<CueHistoryState> | null;
      if (!cur?.cueNav) {
        const initialEntry: CueHistoryState = {
          cueNav: true,
          depth: historyDepthRef.current,
          stack: routeStackRef.current,
        };
        window.history.replaceState(initialEntry, '');
      }
    } catch {
      // ignore history errors
    }

    const onPopState = (event: PopStateEvent) => {
      const hadModal = Object.values(modalFlagsRef.current).some(Boolean);
      closeAllModalsRaw();

      const st = event.state as Partial<CueHistoryState> | null;
      if (st?.cueNav && Array.isArray(st.stack) && st.stack.length > 0) {
        const nextStack = st.stack;
        const prevTop = routeStackRef.current[routeStackRef.current.length - 1];
        const nextTop = nextStack[nextStack.length - 1];
        historyDepthRef.current =
          typeof st.depth === 'number' && st.depth >= 0
            ? st.depth
            : Math.max(0, historyDepthRef.current - 1);
        routeStackRef.current = nextStack;
        setRouteStack(nextStack);
        if (!hadModal || !routesEqual(prevTop, nextTop)) {
          window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
        }
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [closeAllModalsRaw]);

  const commitNavigation = useCallback(
    (nextStack: RouteView[], mode: 'push' | 'replace' = 'push') => {
      closeAllModalsRaw();
      try {
        const cur = window.history.state as Partial<CueHistoryState> | null;
        if (mode === 'push' && cur?.cueNav && cur?.modal === true) {
          const entry: CueHistoryState = {
            cueNav: true,
            depth: historyDepthRef.current,
            stack: nextStack,
          };
          window.history.replaceState(entry, '');
        } else if (mode === 'push') {
          const nextDepth = historyDepthRef.current + 1;
          historyDepthRef.current = nextDepth;
          const entry: CueHistoryState = {
            cueNav: true,
            depth: nextDepth,
            stack: nextStack,
          };
          window.history.pushState(entry, '');
        } else {
          const entry: CueHistoryState = {
            cueNav: true,
            depth: historyDepthRef.current,
            stack: nextStack,
          };
          window.history.replaceState(entry, '');
        }
      } catch {
        // ignore history errors
      }
      routeStackRef.current = nextStack;
      setRouteStack(nextStack);
    },
    [closeAllModalsRaw]
  );

  const switchTab = useCallback(
    (
      tab: 'queue' | 'watch' | 'read' | 'play' | 'journal' | 'search',
      calendarMode = false
    ) => {
      const nextRoute: RouteView =
        tab === 'watch' || tab === 'read' || tab === 'play'
          ? { view: tab, calendarMode }
          : { view: tab };
      const curStack = routeStackRef.current;
      const anyModalOpen = Object.values(modalFlagsRef.current).some(Boolean);
      if (curStack.length === 1 && routesEqual(curStack[0], nextRoute) && !anyModalOpen) {
        return;
      }
      commitNavigation([nextRoute], 'push');
      if (tab !== 'watch' && tab !== 'read' && tab !== 'play') {
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      }
    },
    [commitNavigation]
  );

  const pushRoute = useCallback(
    (next: RouteView) => {
      commitNavigation([...routeStackRef.current, next], 'push');
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    },
    [commitNavigation]
  );

  const goBack = useCallback(() => {
    if (routeStackRef.current.length <= 1) return;
    if (historyDepthRef.current > 0) {
      try {
        window.history.back();
        return;
      } catch {
        // fall through to local stack pop
      }
    }
    const popped = routeStackRef.current.slice(0, -1);
    commitNavigation(popped, 'replace');
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [commitNavigation]);

  const toggleCalendarMode = useCallback(() => {
    const curStack = routeStackRef.current;
    const top = curStack[curStack.length - 1];
    if (top.view === 'watch' || top.view === 'read' || top.view === 'play') {
      const entering = !top.calendarMode;
      const nextStack: RouteView[] = [
        ...curStack.slice(0, -1),
        { ...top, calendarMode: entering },
      ];
      commitNavigation(nextStack, entering ? 'push' : 'replace');
      return;
    }
    commitNavigation([{ view: 'watch', calendarMode: true }], 'push');
  }, [commitNavigation]);

  const triggerSampleReleaseAlert = useCallback(() => {
    const firstShowId = stateRef.current.showOrder[0];
    const firstShow = firstShowId ? stateRef.current.shows[firstShowId] : undefined;
    const banner: ReleaseBannerData = {
      title: 'Release alerts active',
      body: firstShow
        ? `New episode alert sample for ${firstShow.title}`
        : 'Notifications appear here when tracked releases drop.',
      timeLabel: 'now',
      domain: 'watch',
      mediaKind: firstShow ? 'show' : undefined,
      mediaId: firstShow?.id,
    };
    setActiveBanner(banner);
    commitState((prev) => ({
      ...prev,
      notifications: [
        {
          id: `n-${Date.now()}`,
          domain: 'watch',
          title: banner.title,
          body: banner.body,
          timeLabel: 'now',
          read: false,
          mediaKind: banner.mediaKind,
          mediaId: banner.mediaId,
        },
        ...prev.notifications,
      ],
    }));
    showToast('Release alert simulated');
  }, [showToast]);

  const recomputeShowStatus = (
    show: Show,
    nextCounts: Record<string, number>,
    prev?: ShowProgress
  ): ShowProgress => {
    const allEps = getAllEpisodes(show);
    const total = allEps.length || show.totalEpisodes;
    let watchedUnique = 0;
    for (const ep of allEps) {
      if ((nextCounts[getEpisodeKey(ep.season, ep.number)] || 0) > 0) watchedUnique += 1;
    }
    const status =
      total > 0 && watchedUnique >= total
        ? 'finished'
        : watchedUnique > 0
          ? 'watching'
          : 'not_started';
    return {
      ...(prev || {}),
      status,
      episodeCounts: nextCounts,
      bookmarked: prev?.bookmarked ?? true,
      notifications: prev?.notifications ?? true,
      lastWatchedAt: new Date().toISOString(),
    };
  };

  const buildShowSeasonToast = (
    show: Show,
    seasonNumber: number,
    prevProg?: ShowProgress,
    nextProg?: ShowProgress
  ): { msg: string; actionLabel?: string } | null => {
    const beforeSp = getSeasonProgress(show, seasonNumber, prevProg);
    const afterSp = getSeasonProgress(show, seasonNumber, nextProg);
    if (beforeSp.watched < beforeSp.total && afterSp.watched >= afterSp.total && afterSp.total > 0) {
      const epAvg = getSeasonEpisodeAverage(show, seasonNumber, nextProg);
      if (epAvg && epAvg.count > 0) {
        return {
          msg: `Season ${seasonNumber} of ${show.title} finished · Episode avg: ${epAvg.avg.toFixed(2)} ★`,
          actionLabel: 'Rate season',
        };
      }
      const overallStats = getShowStats(show, nextProg);
      if (overallStats.isFinished) {
        return {
          msg: `Finished ${show.title}!`,
          actionLabel: 'Rate show',
        };
      }
      return {
        msg: `Finished Season ${seasonNumber} of ${show.title}!`,
        actionLabel: 'Rate season',
      };
    }
    return null;
  };

  const watchNextEpisode = useCallback(
    (showId: string) => {
      let toastMsg = '';
      let toastSub: string | undefined;
      let showPoster = '';
      let toastAction: string | undefined = 'Log note';
      commitState((prev) => {
        const show = prev.shows[showId];
        if (!show) return prev;
        showPoster = show.posterUrl;
        const prog = prev.showProgress[showId];
        const stats = getShowStats(show, prog);
        const targetEp = stats.nextEpisode;
        if (!targetEp) return prev;

        const epKey = getEpisodeKey(targetEp.season, targetEp.number);
        const watchedLabel = formatEpisodeCode(targetEp.season, targetEp.number);
        const nextCounts = {
          ...(prog?.episodeCounts || {}),
          [epKey]: Math.max(1, (prog?.episodeCounts?.[epKey] || 0) + 1),
        };
        const updatedProg = recomputeShowStatus(show, nextCounts, prog);
        const seasonNudge = buildShowSeasonToast(show, targetEp.season, prog, updatedProg);
        if (seasonNudge) {
          toastMsg = seasonNudge.msg;
          toastSub = undefined;
          toastAction = seasonNudge.actionLabel || 'Log note';
        } else {
          const nextStats = getShowStats(show, updatedProg);
          toastMsg = show.title;
          toastSub = nextStats.nextEpisode
            ? `Watched ${watchedLabel} · Next: ${formatEpisodeCode(
                nextStats.nextEpisode.season,
                nextStats.nextEpisode.number
              )}`
            : `Watched ${watchedLabel}`;
          toastAction = 'Log note';
        }
        const historyEntry: HistoryEntry = {
          id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          domain: 'watch',
          mediaKind: 'show',
          mediaId: showId,
          title: show.title,
          posterUrl: show.posterUrl,
          codeLabel: watchedLabel,
          subtitle: targetEp.title,
          loggedAt: new Date().toISOString(),
        };
        return {
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [showId]: updatedProg,
          },
          upcoming: prev.upcoming.filter(
            (u) => !(u.kind === 'episode' && u.mediaId === showId && u.daysUntil === 0)
          ),
          history: appendHistory(prev.history || [], historyEntry),
        };
      });

      if (toastMsg) {
        showToast(toastMsg, toastAction, () => pushRoute({ view: 'show-detail', showId }), {
          domain: 'watch',
          subtitle: toastSub,
          posterUrl: showPoster,
        });
      }
    },
    [pushRoute, showToast]
  );

  const toggleEpisodeWatched = useCallback(
    (showId: string, season: number, number: number) => {
      let seasonToast: { msg: string; actionLabel?: string } | null = null;
      let showPoster = '';
      commitState((prev) => {
        const show = prev.shows[showId];
        if (!show) return prev;
        showPoster = show.posterUrl;
        const prog = prev.showProgress[showId];
        const epKey = getEpisodeKey(season, number);
        const current = prog?.episodeCounts?.[epKey] || 0;
        const nextCounts = {
          ...(prog?.episodeCounts || {}),
          [epKey]: current > 0 ? 0 : 1,
        };
        const updatedProg = recomputeShowStatus(show, nextCounts, prog);
        if (current === 0) {
          seasonToast = buildShowSeasonToast(show, season, prog, updatedProg);
        }
        return {
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [showId]: updatedProg,
          },
        };
      });
      if (seasonToast) {
        const { msg, actionLabel } = seasonToast;
        showToast(msg, actionLabel, undefined, {
          domain: 'watch',
          posterUrl: showPoster,
        });
      }
    },
    [showToast]
  );

  const incrementEpisodeRewatch = useCallback(
    (showId: string, season: number, number: number, delta: number) => {
      commitState((prev) => {
        const show = prev.shows[showId];
        if (!show) return prev;
        const prog = prev.showProgress[showId];
        const epKey = getEpisodeKey(season, number);
        const current = prog?.episodeCounts?.[epKey] || 0;
        const nextCounts = {
          ...(prog?.episodeCounts || {}),
          [epKey]: Math.max(0, current + delta),
        };
        return {
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [showId]: recomputeShowStatus(show, nextCounts, prog),
          },
        };
      });
    },
    []
  );

  const toggleShowBookmark = useCallback(
    (showId: string) => {
      let nextBookmarked = true;
      commitState((prev) => {
        const existing = prev.showProgress[showId];
        nextBookmarked = !(existing?.bookmarked ?? false);
        return {
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [showId]: {
              ...(existing || {}),
              status: existing?.status || 'not_started',
              episodeCounts: existing?.episodeCounts || {},
              bookmarked: nextBookmarked,
              notifications: existing?.notifications ?? true,
            },
          },
        };
      });
      showToast(nextBookmarked ? 'Added to Watch library' : 'Removed from Watch library');
    },
    [showToast]
  );

  const toggleShowNotifications = useCallback(
    (showId: string) => {
      let nextVal = true;
      commitState((prev) => {
        const existing = prev.showProgress[showId];
        nextVal = !(existing?.notifications ?? true);
        return {
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [showId]: {
              ...(existing || {}),
              status: existing?.status || 'not_started',
              episodeCounts: existing?.episodeCounts || {},
              bookmarked: existing?.bookmarked ?? true,
              notifications: nextVal,
            },
          },
        };
      });
      showToast(nextVal ? 'Release alerts enabled' : 'Release alerts muted');
    },
    [showToast]
  );

  const markSeasonWatched = useCallback(
    (showId: string, seasonNumber: number, rewatchIfDone = false) => {
      let toastMsg = `Updated Season ${seasonNumber}`;
      commitState((prev) => {
        const show = prev.shows[showId];
        if (!show) return prev;
        const season = show.seasons.find((s) => s.number === seasonNumber);
        if (!season) return prev;
        const prog = prev.showProgress[showId];
        const nextCounts = { ...(prog?.episodeCounts || {}) };
        const allWatched = season.episodes.every(
          (ep) => (nextCounts[getEpisodeKey(ep.season, ep.number)] || 0) > 0
        );
        for (const ep of season.episodes) {
          const k = getEpisodeKey(ep.season, ep.number);
          if (allWatched && rewatchIfDone) nextCounts[k] = (nextCounts[k] || 1) + 1;
          else if (allWatched) nextCounts[k] = 0;
          else nextCounts[k] = Math.max(1, nextCounts[k] || 0);
        }
        const updatedProg = recomputeShowStatus(show, nextCounts, prog);
        const seasonToast = buildShowSeasonToast(show, seasonNumber, prog, updatedProg);
        if (seasonToast) {
          toastMsg = seasonToast.msg;
        }
        const nextHistory = !allWatched
          ? appendHistory(prev.history || [], {
              id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              domain: 'watch',
              mediaKind: 'show',
              mediaId: showId,
              title: show.title,
              posterUrl: show.posterUrl,
              codeLabel: `Season ${seasonNumber} Complete`,
              subtitle: `${season.episodes.length} episodes`,
              loggedAt: new Date().toISOString(),
            })
          : prev.history;
        return {
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [showId]: updatedProg,
          },
          history: nextHistory,
        };
      });
      showToast(toastMsg);
    },
    [showToast]
  );

  const markShowAllWatched = useCallback(
    (showId: string) => {
      commitState((prev) => {
        const show = prev.shows[showId];
        if (!show) return prev;
        const prog = prev.showProgress[showId];
        const nextCounts = { ...(prog?.episodeCounts || {}) };
        for (const ep of getAllEpisodes(show)) {
          const k = getEpisodeKey(ep.season, ep.number);
          nextCounts[k] = Math.max(1, nextCounts[k] || 0);
        }
        return {
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [showId]: recomputeShowStatus(show, nextCounts, prog),
          },
        };
      });
      showToast('Marked all episodes watched');
    },
    [showToast]
  );

  const startShowRewatch = useCallback(
    (showId: string) => {
      commitState((prev) => {
        const show = prev.shows[showId];
        if (!show) return prev;
        const prog = prev.showProgress[showId];
        const nextCounts = { ...(prog?.episodeCounts || {}) };
        for (const ep of getAllEpisodes(show)) {
          const k = getEpisodeKey(ep.season, ep.number);
          nextCounts[k] = (nextCounts[k] || 0) + 1;
        }
        return {
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [showId]: recomputeShowStatus(show, nextCounts, prog),
          },
        };
      });
      showToast('Logged full series rewatch');
    },
    [showToast]
  );

  const resetShowProgress = useCallback(
    (showId: string) => {
      commitState((prev) => {
        const show = prev.shows[showId];
        if (!show) return prev;
        const prog = prev.showProgress[showId];
        return {
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [showId]: recomputeShowStatus(show, {}, prog),
          },
        };
      });
      showToast('Reset show progress');
    },
    [showToast]
  );

  const rateEpisode = useCallback(
    (showId: string, season: number, number: number, rating: number | undefined) => {
      const epKey = getEpisodeKey(season, number);
      commitState((prev) => {
        const existing = prev.showProgress[showId];
        const nextEpRatings = { ...(existing?.episodeRatings || {}) };
        if (typeof rating === 'number' && rating > 0) {
          nextEpRatings[epKey] = rating;
        } else {
          delete nextEpRatings[epKey];
        }
        return {
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [showId]: {
              ...(existing || {}),
              status: existing?.status || 'watching',
              episodeCounts: existing?.episodeCounts || {},
              bookmarked: existing?.bookmarked ?? true,
              notifications: existing?.notifications ?? true,
              episodeRatings: nextEpRatings,
            },
          },
        };
      });
    },
    []
  );

  const rateSeason = useCallback(
    (
      showId: string,
      seasonNumber: number,
      rating: number | undefined,
      source: RatingSource = 'manual'
    ) => {
      commitState((prev) => {
        const existing = prev.showProgress[showId];
        const nextSeasonRatings = { ...(existing?.seasonRatings || {}) };
        const nextSeasonSources = { ...(existing?.seasonRatingSource || {}) };
        if (typeof rating === 'number' && rating > 0) {
          nextSeasonRatings[seasonNumber] = rating;
          nextSeasonSources[seasonNumber] = source;
        } else {
          delete nextSeasonRatings[seasonNumber];
          delete nextSeasonSources[seasonNumber];
        }
        return {
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [showId]: {
              ...(existing || {}),
              status: existing?.status || 'watching',
              episodeCounts: existing?.episodeCounts || {},
              bookmarked: existing?.bookmarked ?? true,
              notifications: existing?.notifications ?? true,
              seasonRatings: nextSeasonRatings,
              seasonRatingSource: nextSeasonSources,
            },
          },
        };
      });
    },
    []
  );

  const updateShowEpisodes = useCallback(
    (showId: string, seasons: Season[], cast?: CastMember[], runtimeAvg?: number) => {
      commitState((prev) => {
        const show = prev.shows[showId];
        if (!show || seasons.length === 0) return prev;
        const totalEpisodes = seasons.reduce((sum, s) => sum + s.episodes.length, 0);
        return {
          ...prev,
          shows: {
            ...prev.shows,
            [showId]: {
              ...show,
              seasons,
              totalEpisodes: totalEpisodes > 0 ? totalEpisodes : show.totalEpisodes,
              runtimeAvg: runtimeAvg || show.runtimeAvg,
              cast: cast && cast.length > 0 && show.cast.length === 0 ? cast : show.cast,
            },
          },
        };
      });
    },
    []
  );

  const rateShow = useCallback(
    (showId: string, rating: number | undefined, source: RatingSource = 'manual') => {
      commitState((prev) => {
        const existing = prev.showProgress[showId];
        return {
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [showId]: {
              ...(existing || {}),
              status: existing?.status || 'watching',
              episodeCounts: existing?.episodeCounts || {},
              bookmarked: existing?.bookmarked ?? true,
              notifications: existing?.notifications ?? true,
              rating,
              ratingSource: rating ? source : undefined,
            },
          },
        };
      });
    },
    []
  );

  const setShowMood = useCallback((showId: string, mood: PersonalMood | undefined) => {
    commitState((prev) => {
      const existing = prev.showProgress[showId];
      return {
        ...prev,
        showProgress: {
          ...prev.showProgress,
          [showId]: {
            ...(existing || {}),
            status: existing?.status || 'watching',
            episodeCounts: existing?.episodeCounts || {},
            bookmarked: existing?.bookmarked ?? true,
            notifications: existing?.notifications ?? true,
            mood,
          },
        },
      };
    });
  }, []);

  const toggleMovieWatched = useCallback(
    (movieId: string) => {
      let msg = '';
      let actionLabel: string | undefined;
      let moviePoster = '';
      commitState((prev) => {
        const movie = prev.movies[movieId];
        if (!movie) return prev;
        moviePoster = movie.posterUrl;
        const existing = prev.movieProgress[movieId];
        const isWatched = (existing?.watchCount || 0) > 0;
        const nowWatched = !isWatched;
        const nextHistory = nowWatched
          ? appendHistory(prev.history || [], {
              id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              domain: 'watch',
              mediaKind: 'movie',
              mediaId: movieId,
              title: movie.title,
              posterUrl: movie.posterUrl,
              codeLabel: `${movie.year} · ${movie.runtime}m`,
              subtitle: movie.director,
              loggedAt: new Date().toISOString(),
            })
          : prev.history;
        const nextMovieProgress = {
          ...prev.movieProgress,
          [movieId]: {
            ...(existing || {}),
            status: (isWatched ? 'watchlist' : 'watched') as MovieWatchStatus,
            watchCount: isWatched ? 0 : 1,
            watchedAt: isWatched ? undefined : new Date().toISOString(),
          },
        };
        const nextState: CueStoreState = {
          ...prev,
          movieProgress: nextMovieProgress,
          history: nextHistory,
        };

        if (nowWatched) {
          const col = findMovieCollection(movie.title, movie.year);
          if (col) {
            const ev = evaluateMovieCollectionProgress(col, nextState);
            if (ev.isComplete) {
              msg = `Nice — ${movie.title} completes ${col.name} (${ev.watchedCount}/${ev.totalCount})!`;
              actionLabel = 'View trilogy';
            } else if (ev.remainingCount === 1) {
              msg = `Watched ${movie.title} · 1 more film to finish ${col.name} (${ev.watchedCount}/${ev.totalCount})`;
              actionLabel = 'Journal';
            } else {
              msg = `Watched ${movie.title} · ${col.name} (${ev.watchedCount}/${ev.totalCount})`;
              actionLabel = 'Journal';
            }
          } else {
            msg = `Watched ${movie.title}`;
            actionLabel = 'Journal';
          }
        } else {
          msg = `Moved ${movie.title} back to Watchlist`;
          actionLabel = undefined;
        }

        return nextState;
      });
      if (msg) {
        showToast(msg, actionLabel, () => pushRoute({ view: 'movie-detail', movieId }), {
          domain: 'watch',
          posterUrl: moviePoster,
        });
      }
    },
    [pushRoute, showToast]
  );

  const incrementMovieRewatch = useCallback(
    (movieId: string, delta: number) => {
      commitState((prev) => {
        const existing = prev.movieProgress[movieId];
        const nextCount = Math.max(0, (existing?.watchCount || 0) + delta);
        return {
          ...prev,
          movieProgress: {
            ...prev.movieProgress,
            [movieId]: {
              ...(existing || {}),
              status: nextCount > 0 ? 'watched' : 'watchlist',
              watchCount: nextCount,
              watchedAt: nextCount > 0 ? new Date().toISOString() : undefined,
            },
          },
        };
      });
      if (delta > 0) showToast('Logged movie rewatch');
    },
    [showToast]
  );

  const toggleMovieWatchlist = useCallback(
    (movieId: string) => {
      let inList = true;
      commitState((prev) => {
        const existing = prev.movieProgress[movieId];
        if (existing) {
          inList = false;
          const copy = { ...prev.movieProgress };
          delete copy[movieId];
          return { ...prev, movieProgress: copy };
        }
        inList = true;
        return {
          ...prev,
          movieProgress: {
            ...prev.movieProgress,
            [movieId]: { status: 'watchlist', watchCount: 0 },
          },
        };
      });
      showToast(inList ? 'Added to Watch library' : 'Removed from Watch library');
    },
    [showToast]
  );

  const rateMovie = useCallback((movieId: string, rating: number | undefined) => {
    commitState((prev) => {
      const existing = prev.movieProgress[movieId];
      return {
        ...prev,
        movieProgress: {
          ...prev.movieProgress,
          [movieId]: {
            ...(existing || {}),
            status: existing?.status || 'watched',
            watchCount: Math.max(1, existing?.watchCount || 0),
            watchedAt: existing?.watchedAt || new Date().toISOString(),
            rating,
          },
        },
      };
    });
  }, []);

  const setMovieMood = useCallback((movieId: string, mood: PersonalMood | undefined) => {
    commitState((prev) => {
      const existing = prev.movieProgress[movieId];
      return {
        ...prev,
        movieProgress: {
          ...prev.movieProgress,
          [movieId]: {
            ...(existing || {}),
            status: existing?.status || 'watchlist',
            watchCount: existing?.watchCount || 0,
            mood,
          },
        },
      };
    });
  }, []);

  // Read actions
  const normalizeReadProgress = (
    item: ReadItem,
    nextUnit: number,
    prev?: ReadProgress,
    completedUnitsOverride?: number[]
  ): ReadProgress => {
    const total = Math.max(1, item.totalUnits);
    let completed: number[];
    if (completedUnitsOverride) {
      completed = [...new Set(completedUnitsOverride.filter((n) => Number.isFinite(n) && n >= 1))].sort(
        (a, b) => a - b
      );
    } else {
      const existingHigh = (prev?.completedUnits || []).filter((n) => n > total);
      const clampedCount = Math.min(total, Math.max(0, Math.round(nextUnit)));
      const base: number[] = [];
      for (let i = 1; i <= clampedCount; i += 1) base.push(i);
      completed = [...new Set([...base, ...existingHigh])].sort((a, b) => a - b);
    }
    const activeCount = completed.filter((n) => n <= total).length;
    const finished = activeCount >= total;
    const prevMax = prev?.maxCompletedUnit ?? prev?.currentUnit ?? 0;
    return {
      ...(prev || {}),
      status: finished ? 'finished' : activeCount > 0 ? 'reading' : 'want_to_read',
      currentUnit: activeCount,
      completedUnits: completed,
      maxCompletedUnit: Math.max(activeCount, prevMax),
      rereadCount: finished ? Math.max(1, prev?.rereadCount || 0) : prev?.rereadCount || 0,
      bookmarked: prev?.bookmarked ?? true,
      edition: prev?.edition,
      lastReadAt: activeCount > 0 ? new Date().toISOString() : prev?.lastReadAt,
    };
  };

  const computeReadSmartNudge = (
    item: ReadItem,
    prevProg: ReadProgress | undefined,
    updatedProg: ReadProgress,
    unitLabel: string,
    nextState: CueStoreState
  ): { msg: string; actionLabel?: string } => {
    if (item.format === 'comic') {
      const before = evaluateComicEditionContainers(item, prevProg);
      const after = evaluateComicEditionContainers(item, updatedProg);
      const activeId = normalizeComicEditionId(updatedProg.edition) || 'digital';
      const newlyCompletedOther = after.filter((a) => {
        if (a.id === activeId || !a.isTechnicallyComplete) return false;
        const b = before.find((x) => x.id === a.id);
        return Boolean(b && !b.isTechnicallyComplete);
      });

      if (newlyCompletedOther.length > 0) {
        const labels = newlyCompletedOther.map((e) => e.label);
        const names =
          labels.length > 1
            ? `${labels.slice(0, -1).join(', ')} & ${labels[labels.length - 1]}`
            : labels[0];
        const sample = newlyCompletedOther[0];
        const prefix = updatedProg.status === 'finished' ? `Finished ${item.title}` : unitLabel;
        return {
          msg: `${prefix} · Technically completes ${names} (${sample.completedIssues}/${sample.totalIssues})!`,
          actionLabel: 'Inspect',
        };
      }

      const oneAwayOther = after.find((a) => {
        if (a.id === activeId || a.remainingIssues !== 1) return false;
        const b = before.find((x) => x.id === a.id);
        return Boolean(b && b.completedIssues < a.completedIssues);
      });
      if (oneAwayOther && updatedProg.status !== 'finished') {
        return {
          msg: `${item.title} · ${unitLabel} (1 more issue until ${oneAwayOther.label})`,
          actionLabel: 'Log note',
        };
      }
    }

    if (item.format === 'novel' && updatedProg.status === 'finished') {
      const series = findBookSeries(item.title);
      if (series) {
        const ev = evaluateBookSeriesProgress(series, nextState);
        if (ev.isComplete) {
          return {
            msg: `Finished ${item.title} · Completes ${series.name} (${ev.finishedCount}/${ev.totalCount})!`,
            actionLabel: 'Rate series',
          };
        }
        if (ev.remainingCount === 1) {
          return {
            msg: `Finished ${item.title} · 1 book left in ${series.name} (${ev.finishedCount}/${ev.totalCount})`,
            actionLabel: 'View series',
          };
        }
        return {
          msg: `Finished ${item.title} · ${series.name} (${ev.finishedCount}/${ev.totalCount})`,
          actionLabel: 'View series',
        };
      }
    }

    if (updatedProg.status === 'finished') {
      return { msg: `Finished ${item.title}`, actionLabel: 'Log note' };
    }
    return { msg: `${item.title} · ${unitLabel}`, actionLabel: 'Log note' };
  };

  const advanceReadProgress = useCallback(
    (readId: string, delta?: number) => {
      let msg = '';
      let actionLabel: string | undefined = 'Log note';
      let coverUrl = '';
      commitState((prev) => {
        const item = prev.readItems[readId];
        if (!item) return prev;
        const prog = prev.readProgress[readId];
        coverUrl = resolveComicEditionCover(item, prog?.edition, prog);
        const step = delta ?? 1;
        const prevUnits = getCompletedReadUnits(item, prog);
        const existingHigh = (prog?.completedUnits || []).filter((n) => n > item.totalUnits);
        let nextActive = [...prevUnits];
        let touchedUnit = prog?.currentUnit || 0;

        if (step > 0) {
          for (let s = 0; s < step; s += 1) {
            const set = new Set(nextActive);
            let nextMissing: number | null = null;
            for (let u = 1; u <= item.totalUnits; u += 1) {
              if (!set.has(u)) {
                nextMissing = u;
                break;
              }
            }
            if (nextMissing === null) break;
            nextActive.push(nextMissing);
            touchedUnit = nextMissing;
          }
        } else if (step < 0) {
          for (let s = 0; s < Math.abs(step); s += 1) {
            if (nextActive.length === 0) break;
            nextActive.pop();
          }
          touchedUnit = nextActive[nextActive.length - 1] || 0;
        }

        const combined = [...new Set([...nextActive, ...existingHigh])].sort((a, b) => a - b);
        const updated = normalizeReadProgress(item, nextActive.length, prog, combined);
        const unitLabel =
          item.unit === 'issues'
            ? `Issue #${step > 0 ? touchedUnit : updated.currentUnit}`
            : `Ch. ${step > 0 ? touchedUnit : updated.currentUnit}`;
        const activeCover = resolveComicEditionCover(item, updated.edition, updated);
        coverUrl = activeCover;
        const nextHistory =
          step > 0 && touchedUnit > 0
            ? appendHistory(prev.history || [], {
                id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                domain: 'read',
                mediaKind: 'read',
                mediaId: readId,
                title: item.title,
                posterUrl: activeCover,
                codeLabel: unitLabel,
                subtitle: item.creator,
                loggedAt: new Date().toISOString(),
              })
            : prev.history;
        const nextState: CueStoreState = {
          ...prev,
          readProgress: { ...prev.readProgress, [readId]: updated },
          history: nextHistory,
        };
        const nudge = computeReadSmartNudge(item, prog, updated, unitLabel, nextState);
        msg = nudge.msg;
        actionLabel = nudge.actionLabel;
        return nextState;
      });
      if (msg) {
        showToast(msg, actionLabel, () => pushRoute({ view: 'read-detail', readId }), {
          domain: 'read',
          posterUrl: coverUrl,
        });
      }
    },
    [pushRoute, showToast]
  );

  const setReadProgress = useCallback((readId: string, currentUnit: number) => {
    commitState((prev) => {
      const item = prev.readItems[readId];
      if (!item) return prev;
      const prog = prev.readProgress[readId];
      return {
        ...prev,
        readProgress: {
          ...prev.readProgress,
          [readId]: normalizeReadProgress(item, currentUnit, prog),
        },
      };
    });
  }, []);

  const toggleReadUnit = useCallback(
    (readId: string, unitNumber: number) => {
      let msg = '';
      let actionLabel: string | undefined;
      let coverUrl = '';
      commitState((prev) => {
        const item = prev.readItems[readId];
        if (!item || unitNumber < 1 || unitNumber > item.totalUnits) return prev;
        const prog = prev.readProgress[readId];
        const prevUnits = getCompletedReadUnits(item, prog);
        const existingHigh = (prog?.completedUnits || []).filter((n) => n > item.totalUnits);
        const hadUnit = prevUnits.includes(unitNumber);
        const nextActive = hadUnit
          ? prevUnits.filter((u) => u !== unitNumber)
          : [...prevUnits, unitNumber].sort((a, b) => a - b);
        const combined = [...new Set([...nextActive, ...existingHigh])].sort((a, b) => a - b);
        const updated = normalizeReadProgress(item, nextActive.length, prog, combined);
        const unitLabel = item.unit === 'issues' ? `Issue #${unitNumber}` : `Ch. ${unitNumber}`;
        const activeCover = resolveComicEditionCover(item, updated.edition, updated);
        coverUrl = activeCover;
        coverUrl = activeCover;
        const nextHistory = !hadUnit
          ? appendHistory(prev.history || [], {
              id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              domain: 'read',
              mediaKind: 'read',
              mediaId: readId,
              title: item.title,
              posterUrl: activeCover,
              codeLabel: unitLabel,
              subtitle: item.creator,
              loggedAt: new Date().toISOString(),
            })
          : prev.history;
        const nextState: CueStoreState = {
          ...prev,
          readProgress: { ...prev.readProgress, [readId]: updated },
          history: nextHistory,
        };
        if (!hadUnit) {
          const nudge = computeReadSmartNudge(item, prog, updated, unitLabel, nextState);
          msg = nudge.msg;
          actionLabel = nudge.actionLabel;
        }
        return nextState;
      });
      if (msg) {
        showToast(msg, actionLabel, () => pushRoute({ view: 'read-detail', readId }), {
          domain: 'read',
          posterUrl: coverUrl,
        });
      }
    },
    [pushRoute, showToast]
  );

  const updateReadTotalUnits = useCallback((readId: string, totalUnits: number) => {
    const safeTotal = Math.max(1, Math.round(totalUnits));
    commitState((prev) => {
      const item = prev.readItems[readId];
      if (!item) return prev;
      const prog = prev.readProgress[readId];
      const nextEditionCounts = prog?.edition
        ? { ...(item.editionIssueCounts || {}), [prog.edition]: safeTotal }
        : item.editionIssueCounts;
      const updatedItem: ReadItem = {
        ...item,
        totalUnits: safeTotal,
        baseTotalUnits: prog?.edition ? item.baseTotalUnits : safeTotal,
        editionIssueCounts: nextEditionCounts,
      };
      return {
        ...prev,
        readItems: { ...prev.readItems, [readId]: updatedItem },
        readProgress: prog
          ? {
              ...prev.readProgress,
              [readId]: normalizeReadProgress(updatedItem, prog.currentUnit, prog, prog.completedUnits),
            }
          : prev.readProgress,
      };
    });
  }, []);

  const markReadFinished = useCallback(
    (readId: string) => {
      let msg = '';
      let actionLabel: string | undefined;
      let coverUrl = '';
      commitState((prev) => {
        const item = prev.readItems[readId];
        if (!item) return prev;
        const prog = prev.readProgress[readId];
        const isDone = prog?.status === 'finished';
        const existingHigh = (prog?.completedUnits || []).filter((n) => n > item.totalUnits);
        const allUnits: number[] = [];
        for (let i = 1; i <= item.totalUnits; i += 1) allUnits.push(i);
        const combined = [...new Set([...allUnits, ...existingHigh])].sort((a, b) => a - b);
        const updated: ReadProgress = {
          ...(prog || {}),
          status: 'finished',
          currentUnit: item.totalUnits,
          completedUnits: combined,
          maxCompletedUnit: Math.max(item.totalUnits, prog?.maxCompletedUnit || 0),
          rereadCount: isDone ? (prog?.rereadCount || 1) + 1 : Math.max(1, prog?.rereadCount || 0),
          bookmarked: prog?.bookmarked ?? true,
          edition: prog?.edition,
          lastReadAt: new Date().toISOString(),
        };
        const activeCover = resolveComicEditionCover(item, updated.edition, updated);
        coverUrl = activeCover;
        const editionLabel =
          item.format === 'comic' && updated.edition
            ? getComicEditionLabel(updated.edition, item, updated)
            : '';
        const nextHistory = !isDone
          ? appendHistory(prev.history || [], {
              id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              domain: 'read',
              mediaKind: 'read',
              mediaId: readId,
              title: item.title,
              posterUrl: activeCover,
              codeLabel: editionLabel ? `${editionLabel} · Complete` : `Finished · ${item.totalUnits} ${item.unit}`,
              subtitle: item.creator,
              loggedAt: new Date().toISOString(),
            })
          : prev.history;
        const nextState: CueStoreState = {
          ...prev,
          readProgress: { ...prev.readProgress, [readId]: updated },
          history: nextHistory,
        };
        const unitLabel = item.unit === 'issues' ? `Issues #1–${item.totalUnits}` : `Ch. 1–${item.totalUnits}`;
        const nudge = computeReadSmartNudge(item, prog, updated, unitLabel, nextState);
        msg = nudge.msg;
        actionLabel = nudge.actionLabel;
        return nextState;
      });
      if (msg) {
        showToast(msg, actionLabel, () => pushRoute({ view: 'read-detail', readId }), {
          domain: 'read',
          posterUrl: coverUrl,
        });
      }
    },
    [pushRoute, showToast]
  );

  const incrementReread = useCallback(
    (readId: string, delta: number) => {
      commitState((prev) => {
        const item = prev.readItems[readId];
        if (!item) return prev;
        const prog = prev.readProgress[readId];
        const nextReread = Math.max(0, (prog?.rereadCount || 0) + delta);
        return {
          ...prev,
          readProgress: {
            ...prev.readProgress,
            [readId]: {
              ...(prog || {}),
              status: nextReread > 0 ? 'finished' : 'reading',
              currentUnit: nextReread > 0 ? item.totalUnits : prog?.currentUnit || 0,
              maxCompletedUnit:
                nextReread > 0
                  ? Math.max(item.totalUnits, prog?.maxCompletedUnit || 0)
                  : prog?.maxCompletedUnit,
              rereadCount: nextReread,
              bookmarked: prog?.bookmarked ?? true,
              edition: prog?.edition,
              lastReadAt: new Date().toISOString(),
            },
          },
        };
      });
      if (delta > 0) showToast('Logged reread');
    },
    [showToast]
  );

  const toggleReadBookmark = useCallback(
    (readId: string) => {
      let added = true;
      commitState((prev) => {
        const existing = prev.readProgress[readId];
        added = !(existing?.bookmarked ?? false);
        return {
          ...prev,
          readProgress: {
            ...prev.readProgress,
            [readId]: {
              ...(existing || {}),
              status: existing?.status || 'want_to_read',
              currentUnit: existing?.currentUnit || 0,
              rereadCount: existing?.rereadCount || 0,
              bookmarked: added,
            },
          },
        };
      });
      showToast(added ? 'Added to Read library' : 'Removed from Read library');
    },
    [showToast]
  );

  const rateReadUnit = useCallback(
    (readId: string, unitNumber: number, rating: number | undefined) => {
      commitState((prev) => {
        const existing = prev.readProgress[readId];
        const nextUnitRatings = { ...(existing?.unitRatings || {}) };
        if (typeof rating === 'number' && rating > 0) {
          nextUnitRatings[unitNumber] = rating;
        } else {
          delete nextUnitRatings[unitNumber];
        }
        return {
          ...prev,
          readProgress: {
            ...prev.readProgress,
            [readId]: {
              ...(existing || {}),
              status: existing?.status || 'reading',
              currentUnit: existing?.currentUnit || 0,
              rereadCount: existing?.rereadCount || 0,
              bookmarked: existing?.bookmarked ?? true,
              unitRatings: nextUnitRatings,
            },
          },
        };
      });
    },
    []
  );

  const rateReadItem = useCallback(
    (readId: string, rating: number | undefined, source: RatingSource = 'manual') => {
      commitState((prev) => {
        const existing = prev.readProgress[readId];
        return {
          ...prev,
          readProgress: {
            ...prev.readProgress,
            [readId]: {
              ...(existing || {}),
              status: existing?.status || 'reading',
              currentUnit: existing?.currentUnit || 0,
              rereadCount: existing?.rereadCount || 0,
              bookmarked: existing?.bookmarked ?? true,
              rating,
              ratingSource: rating ? source : undefined,
            },
          },
        };
      });
    },
    []
  );

  const setReadMood = useCallback((readId: string, mood: PersonalMood | undefined) => {
    commitState((prev) => {
      const existing = prev.readProgress[readId];
      return {
        ...prev,
        readProgress: {
          ...prev.readProgress,
          [readId]: {
            ...(existing || {}),
            status: existing?.status || 'reading',
            currentUnit: existing?.currentUnit || 0,
            rereadCount: existing?.rereadCount || 0,
            bookmarked: existing?.bookmarked ?? true,
            mood,
          },
        },
      };
    });
  }, []);

  const applyEditionSwitchState = (
    prev: CueStoreState,
    readId: string,
    nextCategory: GeneralizedComicEditionId,
    nextTotal: number,
    nextLabel: string,
    nextCover: string,
    extraProgress?: Partial<ReadProgress>,
    editionRecord?: ComicEditionRecord
  ): CueStoreState => {
    const item = prev.readItems[readId];
    if (!item) return prev;
    const existing = prev.readProgress[readId];
    const preservedMax = Math.max(existing?.currentUnit || 0, existing?.maxCompletedUnit || 0);
    const existingUnits = existing?.completedUnits;
    let nextCompletedList: number[];
    if (Array.isArray(existingUnits) && existingUnits.length > 0) {
      nextCompletedList = [...existingUnits];
    } else {
      nextCompletedList = [];
      for (let i = 1; i <= preservedMax; i += 1) nextCompletedList.push(i);
    }
    const activeCount = nextCompletedList.filter((u) => u <= nextTotal).length;
    const finished = activeCount >= nextTotal;
    const nextCoversMap =
      nextCover && nextCover !== item.coverUrl
        ? { ...(item.editionCovers || {}), [nextCategory]: nextCover }
        : item.editionCovers;
    const nextCountsMap = { ...(item.editionIssueCounts || {}), [nextCategory]: nextTotal };
    const nextEditionsList = editionRecord
      ? mergeComicEditionCatalog(
          (item.editions || []).filter((e) => e.id !== editionRecord.id),
          [editionRecord]
        )
      : item.editions;
    const nextHistory = nextCover
      ? (prev.history || []).map((h) =>
          h.domain === 'read' && h.mediaId === readId ? { ...h, posterUrl: nextCover } : h
        )
      : prev.history;

    return {
      ...prev,
      readItems: {
        ...prev.readItems,
        [readId]: {
          ...item,
          editionCovers: nextCoversMap,
          editionIssueCounts: nextCountsMap,
          editions: nextEditionsList,
          baseTotalUnits: item.baseTotalUnits ?? item.totalUnits,
          totalUnits: Math.max(1, nextTotal),
        },
      },
      readProgress: {
        ...prev.readProgress,
        [readId]: {
          ...(existing || {}),
          status: finished ? 'finished' : activeCount > 0 ? 'reading' : 'want_to_read',
          currentUnit: activeCount,
          completedUnits: nextCompletedList,
          maxCompletedUnit: Math.max(preservedMax, activeCount),
          rereadCount: finished ? Math.max(1, existing?.rereadCount || 0) : existing?.rereadCount || 0,
          bookmarked: existing?.bookmarked ?? true,
          edition: nextCategory,
          editionTitle: extraProgress?.editionTitle ?? (nextLabel || undefined),
          editionId: extraProgress?.editionId,
          editionCoverUrl: extraProgress?.editionCoverUrl,
        },
      },
      history: nextHistory,
    };
  };

  const setReadEdition = useCallback(
    (readId: string, edition: ComicEditionId) => {
      const normalizedEdition = normalizeComicEditionId(edition) || 'digital';
      let toastMsg = '';
      commitState((prev) => {
        const item = prev.readItems[readId];
        if (!item) return prev;
        const label = getComicEditionLabel(normalizedEdition, item);
        const nextTotal = resolveComicEditionTotal(item, normalizedEdition);
        const nextCover = resolveComicEditionCover(item, normalizedEdition);
        toastMsg = label ? `${label} · ${nextTotal} ${item.unit}` : '';
        return applyEditionSwitchState(prev, readId, normalizedEdition, nextTotal, label, nextCover, {
          editionId: undefined,
          editionTitle: undefined,
          editionCoverUrl: undefined,
        });
      });
      if (toastMsg) showToast(toastMsg);
    },
    [showToast]
  );

  const selectComicEdition = useCallback(
    (readId: string, editionRecord: ComicEditionRecord) => {
      let toastMsg = '';
      commitState((prev) => {
        const item = prev.readItems[readId];
        if (!item) return prev;
        const nextTotal = Math.max(1, editionRecord.issueCount);
        const nextLabel = editionRecord.shortLabel || editionRecord.title;
        const nextCover =
          editionRecord.coverUrl || resolveComicEditionCover(item, editionRecord.category);
        toastMsg = `${nextLabel} · ${nextTotal} ${item.unit}`;
        return applyEditionSwitchState(
          prev,
          readId,
          editionRecord.category,
          nextTotal,
          nextLabel,
          nextCover,
          {
            editionId: editionRecord.id,
            editionTitle: nextLabel,
            editionCoverUrl: editionRecord.coverUrl || undefined,
          },
          editionRecord
        );
      });
      if (toastMsg) showToast(toastMsg);
    },
    [showToast]
  );

  const updateReadEditionsCatalog = useCallback(
    (readId: string, editions: ComicEditionRecord[]) => {
      commitState((prev) => {
        const item = prev.readItems[readId];
        if (!item) return prev;
        const customExisting = (item.editions || []).filter((e) => e.source === 'custom');
        const merged = mergeComicEditionCatalog(editions, customExisting);
        return {
          ...prev,
          readItems: {
            ...prev.readItems,
            [readId]: {
              ...item,
              editions: merged,
            },
          },
        };
      });
    },
    []
  );

  const updateReadIssueDetails = useCallback(
    (
      readId: string,
      issueDetails: Record<number, ComicIssueMeta>,
      detailsKey: string,
      resolvedTotalUnits?: number
    ) => {
      commitState((prev) => {
        const item = prev.readItems[readId];
        if (!item) return prev;
        const prog = prev.readProgress[readId];
        const isDefaultSeriesEdition =
          item.comicKind === 'series' && (!prog?.edition || prog.edition === 'digital');
        const nextTotal =
          isDefaultSeriesEdition && resolvedTotalUnits && resolvedTotalUnits > item.totalUnits
            ? resolvedTotalUnits
            : item.totalUnits;
        return {
          ...prev,
          readItems: {
            ...prev.readItems,
            [readId]: {
              ...item,
              totalUnits: nextTotal,
              baseTotalUnits:
                isDefaultSeriesEdition && nextTotal > (item.baseTotalUnits || 0)
                  ? nextTotal
                  : item.baseTotalUnits,
              issueDetails,
              issueDetailsKey: detailsKey,
            },
          },
        };
      });
    },
    []
  );

  const patchReadIssueMeta = useCallback(
    (readId: string, unitNumber: number, patch: Partial<ComicIssueMeta>) => {
      if (!patch || Object.keys(patch).length === 0) return;
      commitState((prev) => {
        const item = prev.readItems[readId];
        if (!item) return prev;
        const existingDetails = item.issueDetails || {};
        const prevMeta = existingDetails[unitNumber] || { number: unitNumber };
        return {
          ...prev,
          readItems: {
            ...prev.readItems,
            [readId]: {
              ...item,
              issueDetails: {
                ...existingDetails,
                [unitNumber]: {
                  ...prevMeta,
                  ...patch,
                },
              },
            },
          },
        };
      });
    },
    []
  );

  const updateReadEditionCovers = useCallback(
    (
      readId: string,
      editionCovers: Partial<Record<ComicEditionId, string>>,
      cleanTitle?: string,
      editionIssueCounts?: Partial<Record<ComicEditionId, number>>,
      editionVariants?: Partial<Record<GeneralizedComicEditionId, string[]>>
    ) => {
      commitState((prev) => {
        const item = prev.readItems[readId];
        if (!item) return prev;
        const nextTitle = cleanTitle || item.title;
        const spec = getKnownComicEditionSpec(nextTitle);
        const mergedCovers: Partial<Record<ComicEditionId, string>> = {
          ...(item.editionCovers || {}),
          ...editionCovers,
          ...(spec?.covers || {}),
        };
        if (mergedCovers.absolute && !mergedCovers.hardcover) {
          mergedCovers.hardcover = mergedCovers.absolute;
        }
        delete mergedCovers.absolute;
        const mergedCounts: Partial<Record<ComicEditionId, number>> = {
          ...(item.editionIssueCounts || {}),
          ...(editionIssueCounts || {}),
          ...(spec?.counts || {}),
        };
        if (mergedCounts.absolute && !mergedCounts.hardcover) {
          mergedCounts.hardcover = mergedCounts.absolute;
        }
        delete mergedCounts.absolute;
        const mergedVariants: Partial<Record<GeneralizedComicEditionId, string[]>> = {
          ...(item.editionVariants || {}),
          ...(editionVariants || {}),
        };
        if (spec) {
          const allowed = new Set<ComicEditionId>(spec.availableEditions);
          for (const k of Object.keys(mergedCovers) as ComicEditionId[]) {
            if (!allowed.has(k)) delete mergedCovers[k];
          }
          for (const k of Object.keys(mergedCounts) as ComicEditionId[]) {
            if (!allowed.has(k)) delete mergedCounts[k];
          }
          for (const k of Object.keys(mergedVariants) as GeneralizedComicEditionId[]) {
            if (!allowed.has(k)) delete mergedVariants[k];
          }
        }
        const existingProg = prev.readProgress[readId];
        const normalizedActive = normalizeComicEditionId(existingProg?.edition);
        const safeActiveEdition =
          normalizedActive && spec && !spec.availableEditions.includes(normalizedActive)
            ? spec.availableEditions[0]
            : normalizedActive;
        const tempItem: ReadItem = {
          ...item,
          title: nextTitle,
          editionCovers: mergedCovers,
          editionIssueCounts: mergedCounts,
          editionVariants: mergedVariants,
        };
        const resolvedTotal = existingProg?.editionId
          ? item.totalUnits
          : safeActiveEdition
            ? resolveComicEditionTotal(tempItem, safeActiveEdition)
            : !item.editionIssueCounts && mergedCounts.digital && item.totalUnits === 12
              ? mergedCounts.digital
              : item.totalUnits;
        const updatedItem: ReadItem = {
          ...tempItem,
          baseTotalUnits: item.baseTotalUnits ?? resolvedTotal,
          totalUnits: resolvedTotal,
        };
        const nextCover = resolveComicEditionCover(updatedItem, safeActiveEdition, existingProg);
        const nextHistory = (prev.history || []).map((h) =>
          h.domain === 'read' && h.mediaId === readId
            ? { ...h, title: nextTitle, posterUrl: nextCover }
            : h
        );
        return {
          ...prev,
          readItems: {
            ...prev.readItems,
            [readId]: updatedItem,
          },
          readProgress: existingProg
            ? {
                ...prev.readProgress,
                [readId]: normalizeReadProgress(
                  updatedItem,
                  existingProg.currentUnit,
                  {
                    ...existingProg,
                    edition: safeActiveEdition,
                  },
                  existingProg.completedUnits
                ),
              }
            : prev.readProgress,
          history: nextHistory,
        };
      });
    },
    []
  );

  const updateReadFormat = useCallback(
    (readId: string, format: ReadItem['format']) => {
      let movedTitle = '';
      commitState((prev) => {
        const item = prev.readItems[readId];
        if (!item || item.format === format) return prev;
        movedTitle = item.title;
        const nextUnit = format === 'comic' ? 'issues' : 'chapters';
        const formatGenre = format === 'comic' ? 'Comics' : format === 'manga' ? 'Manga' : 'Fiction';
        const filteredGenres = item.genres.filter(
          (g) => !['fiction', 'comics', 'comic', 'manga'].includes(g.toLowerCase())
        );
        const updatedItem: ReadItem = {
          ...item,
          format,
          unit: nextUnit,
          genres: [formatGenre, ...filteredGenres],
        };
        return {
          ...prev,
          readItems: {
            ...prev.readItems,
            [readId]: updatedItem,
          },
        };
      });
      if (movedTitle) {
        const label = format === 'comic' ? 'Comics' : format === 'manga' ? 'Manga' : 'Novels';
        showToast(`Moved "${movedTitle}" to ${label}`);
      }
    },
    [showToast]
  );

  const resetReadProgress = useCallback(
    (readId: string) => {
      commitState((prev) => {
        const existing = prev.readProgress[readId];
        return {
          ...prev,
          readProgress: {
            ...prev.readProgress,
            [readId]: {
              ...(existing || {}),
              status: 'want_to_read',
              currentUnit: 0,
              completedUnits: [],
              maxCompletedUnit: 0,
              rereadCount: 0,
              bookmarked: existing?.bookmarked ?? true,
              edition: existing?.edition,
            },
          },
        };
      });
      showToast('Reset reading progress');
    },
    [showToast]
  );

  // Play actions
  const formatGameChapterCode = (chapter: number, unit: GameChapterUnit = 'chapters'): string => {
    if (unit === 'acts') return `Act ${chapter}`;
    if (unit === 'missions') return `Mission ${chapter}`;
    if (unit === 'milestones') return `Milestone ${chapter}`;
    return `Ch. ${chapter}`;
  };

  const applyGameChapter = (
    game: GameItem,
    existing: CueStoreState['gameProgress'][string] | undefined,
    rawChapter: number
  ): CueStoreState['gameProgress'][string] => {
    const total = game.totalChapters && game.totalChapters > 0 ? game.totalChapters : undefined;
    const clamped = total
      ? Math.max(0, Math.min(total, Math.round(rawChapter)))
      : Math.max(0, Math.round(rawChapter));
    const nextPct = total
      ? Math.min(100, Math.round((clamped / total) * 100))
      : existing?.completionPct || 0;
    const isFinished = Boolean(total && clamped >= total);
    const nextStatus: GameWatchStatus = isFinished
      ? 'completed'
      : clamped > 0 || (existing?.hoursPlayed || 0) > 0
        ? 'playing'
        : 'backlog';
    return {
      ...(existing || {}),
      status: nextStatus,
      hoursPlayed: existing?.hoursPlayed || 0,
      completionPct: nextPct,
      currentChapter: clamped,
      playthroughCount: isFinished
        ? Math.max(1, existing?.playthroughCount || 0)
        : existing?.playthroughCount || 0,
      platinum: existing?.platinum ?? false,
      platform: existing?.platform || game.platforms[0] || 'PC',
      bookmarked: existing?.bookmarked ?? true,
      lastPlayedAt: new Date().toISOString(),
    };
  };

  const advanceGameChapter = useCallback(
    (gameId: string, delta = 1) => {
      let toastMsg = '';
      let gameCover = '';
      commitState((prev) => {
        const game = prev.games[gameId];
        if (!game) return prev;
        gameCover = game.coverUrl;
        const prog = prev.gameProgress[gameId];
        const nextVal = (prog?.currentChapter || 0) + delta;
        const updated = applyGameChapter(game, prog, nextVal);
        const unit = game.chapterUnit || 'chapters';
        const codeLabel = formatGameChapterCode(updated.currentChapter || 0, unit);
        const activePlatform = updated.platform;
        const nextHistory =
          delta > 0 && (updated.currentChapter || 0) > 0
            ? appendHistory(prev.history || [], {
                id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                domain: 'play',
                mediaKind: 'game',
                mediaId: gameId,
                title: game.title,
                posterUrl: game.coverUrl,
                codeLabel,
                subtitle: formatGameMeta(
                  game,
                  { platform: activePlatform, hoursPlayed: 0 },
                  { includeHours: false }
                ),
                loggedAt: new Date().toISOString(),
              })
            : prev.history;
        const nextState: CueStoreState = {
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [gameId]: updated,
          },
          history: nextHistory,
        };
        if (updated.status === 'completed' && prog?.status !== 'completed') {
          const matchingLists = prev.lists.filter((l) =>
            l.items.some((it) => it.kind === 'game' && it.id === gameId)
          );
          const completedList = matchingLists.find((l) => {
            const wasDone = evaluateCustomListProgress(l, prev).isComplete;
            const nowDone = evaluateCustomListProgress(l, nextState).isComplete;
            return !wasDone && nowDone;
          });
          toastMsg = completedList
            ? `Completed ${game.title} · Finishes "${completedList.name}"!`
            : `Completed ${game.title}`;
        } else {
          toastMsg =
            updated.status === 'completed'
              ? `Completed ${game.title}`
              : `${game.title} · ${codeLabel}`;
        }
        return nextState;
      });
      if (toastMsg) {
        showToast(toastMsg, 'Log note', () => pushRoute({ view: 'game-detail', gameId }), {
          domain: 'play',
          posterUrl: gameCover,
        });
      }
    },
    [pushRoute, showToast]
  );

  const setGameChapter = useCallback((gameId: string, chapter: number) => {
    commitState((prev) => {
      const game = prev.games[gameId];
      if (!game) return prev;
      const prog = prev.gameProgress[gameId];
      return {
        ...prev,
        gameProgress: {
          ...prev.gameProgress,
          [gameId]: applyGameChapter(game, prog, chapter),
        },
      };
    });
  }, []);

  const updateGameChaptersMeta = useCallback(
    (
      gameId: string,
      totalChapters: number,
      unit: GameChapterUnit = 'chapters',
      source: GameChapterSource = 'manual',
      note?: string
    ) => {
      const safeTotal = Math.max(1, Math.min(200, Math.round(totalChapters)));
      commitState((prev) => {
        const game = prev.games[gameId];
        if (!game) return prev;
        if (source !== 'manual' && game.chapterSource === 'manual') {
          return prev;
        }
        const updatedGame: GameItem = {
          ...game,
          totalChapters: safeTotal,
          chapterUnit: unit,
          chapterSource: source,
          chapterNote: note,
        };
        const existingProg = prev.gameProgress[gameId];
        const nextProg =
          existingProg && typeof existingProg.currentChapter === 'number' && existingProg.currentChapter > 0
            ? applyGameChapter(updatedGame, existingProg, existingProg.currentChapter)
            : existingProg;
        return {
          ...prev,
          games: { ...prev.games, [gameId]: updatedGame },
          gameProgress: nextProg
            ? { ...prev.gameProgress, [gameId]: nextProg }
            : prev.gameProgress,
        };
      });
    },
    []
  );

  const logGameSession = useCallback(
    (gameId: string, hoursDelta: number) => {
      let label = '';
      let gameCover = '';
      commitState((prev) => {
        const game = prev.games[gameId];
        if (!game) return prev;
        gameCover = game.coverUrl;
        const prog = prev.gameProgress[gameId];
        const nextHours = Math.max(0, Math.round(((prog?.hoursPlayed || 0) + hoursDelta) * 10) / 10);
        const nextPct =
          prog?.status === 'completed'
            ? prog.completionPct
            : Math.min(100, (prog?.completionPct || 0) + (hoursDelta > 0 ? 5 : 0));
        label = `${game.title} · ${nextHours}h logged`;
        const activePlatform = prog?.platform || game.platforms[0] || 'PC';
        const nextHistory =
          hoursDelta > 0
            ? appendHistory(prev.history || [], {
                id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                domain: 'play',
                mediaKind: 'game',
                mediaId: gameId,
                title: game.title,
                posterUrl: game.coverUrl,
                codeLabel: `+${hoursDelta}h · ${nextHours}h`,
                subtitle: formatGameMeta(
                  game,
                  { platform: activePlatform, hoursPlayed: 0 },
                  { includeHours: false }
                ),
                loggedAt: new Date().toISOString(),
              })
            : prev.history;
        return {
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [gameId]: {
              ...(prog || {}),
              status: prog?.status === 'completed' ? 'completed' : nextHours > 0 ? 'playing' : 'backlog',
              hoursPlayed: nextHours,
              completionPct: nextPct,
              playthroughCount: prog?.playthroughCount || 0,
              platinum: prog?.platinum ?? false,
              platform: activePlatform,
              bookmarked: prog?.bookmarked ?? true,
              lastPlayedAt: new Date().toISOString(),
            },
          },
          history: nextHistory,
        };
      });
      if (label) {
        showToast(label, 'Log note', () => pushRoute({ view: 'game-detail', gameId }), {
          domain: 'play',
          posterUrl: gameCover,
        });
      }
    },
    [pushRoute, showToast]
  );

  const updateGameProgress = useCallback(
    (
      gameId: string,
      patch: Partial<{
        status: GameWatchStatus;
        hoursPlayed: number;
        completionPct: number;
        platform: GamePlatform;
      }>
    ) => {
      let statusToast: { title: string; subtitle: string; coverUrl: string } | null = null;
      commitState((prev) => {
        const game = prev.games[gameId];
        if (!game) return prev;
        const existing = prev.gameProgress[gameId];
        const nextStatus = patch.status ?? existing?.status ?? 'playing';
        const nextPct = patch.completionPct ?? existing?.completionPct ?? 0;
        const nextPlaythroughs =
          nextStatus === 'completed'
            ? Math.max(1, existing?.playthroughCount || 0)
            : existing?.playthroughCount || 0;
        if (patch.status && patch.status !== existing?.status) {
          const labelMap: Record<GameWatchStatus, string> = {
            playing: 'Moved to Playing',
            backlog: 'Moved to Backlog',
            completed: 'Marked Completed',
            dropped: 'Moved to Dropped',
          };
          statusToast = {
            title: game.title,
            subtitle: labelMap[patch.status],
            coverUrl: game.coverUrl,
          };
        }
        return {
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [gameId]: {
              ...(existing || {}),
              status: nextStatus,
              hoursPlayed: patch.hoursPlayed ?? existing?.hoursPlayed ?? 0,
              completionPct: nextPct,
              playthroughCount: nextPlaythroughs,
              platinum: existing?.platinum ?? false,
              platform: patch.platform ?? existing?.platform ?? game.platforms[0] ?? 'PC',
              bookmarked: existing?.bookmarked ?? true,
              lastPlayedAt: new Date().toISOString(),
            },
          },
        };
      });
      if (statusToast) {
        const { title, subtitle, coverUrl } = statusToast as {
          title: string;
          subtitle: string;
          coverUrl: string;
        };
        showToast(title, undefined, undefined, {
          domain: 'play',
          subtitle,
          posterUrl: coverUrl,
        });
      }
    },
    [showToast]
  );

  const toggleGameCompleted = useCallback(
    (gameId: string) => {
      let msg = '';
      commitState((prev) => {
        const game = prev.games[gameId];
        if (!game) return prev;
        const existing = prev.gameProgress[gameId];
        const wasDone = existing?.status === 'completed';
        const nextDone = !wasDone;
        msg = nextDone ? `Completed ${game.title}` : `Moved ${game.title} to Playing`;
        return {
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [gameId]: {
              ...(existing || {}),
              status: nextDone ? 'completed' : 'playing',
              hoursPlayed: existing?.hoursPlayed || 0,
              completionPct: nextDone ? Math.max(100, existing?.completionPct || 100) : existing?.completionPct || 50,
              currentChapter: nextDone && game.totalChapters ? game.totalChapters : existing?.currentChapter,
              playthroughCount: nextDone ? Math.max(1, existing?.playthroughCount || 0) : existing?.playthroughCount || 0,
              platinum: existing?.platinum ?? false,
              platform: existing?.platform || game.platforms[0] || 'PC',
              bookmarked: existing?.bookmarked ?? true,
              lastPlayedAt: new Date().toISOString(),
            },
          },
        };
      });
      if (msg) showToast(msg);
    },
    [showToast]
  );

  const toggleGamePlatinum = useCallback((gameId: string) => {
    commitState((prev) => {
      const game = prev.games[gameId];
      if (!game) return prev;
      const existing = prev.gameProgress[gameId];
      const nextPlat = !(existing?.platinum ?? false);
      return {
        ...prev,
        gameProgress: {
          ...prev.gameProgress,
          [gameId]: {
            ...(existing || {}),
            status: nextPlat ? 'completed' : existing?.status || 'playing',
            hoursPlayed: existing?.hoursPlayed || 0,
            completionPct: nextPlat ? 100 : existing?.completionPct || 0,
            currentChapter: nextPlat && game.totalChapters ? game.totalChapters : existing?.currentChapter,
            playthroughCount: nextPlat ? Math.max(1, existing?.playthroughCount || 0) : existing?.playthroughCount || 0,
            platinum: nextPlat,
            platform: existing?.platform || game.platforms[0] || 'PC',
            bookmarked: existing?.bookmarked ?? true,
            lastPlayedAt: new Date().toISOString(),
          },
        },
      };
    });
  }, []);

  const incrementGamePlaythrough = useCallback(
    (gameId: string, delta: number) => {
      commitState((prev) => {
        const game = prev.games[gameId];
        if (!game) return prev;
        const existing = prev.gameProgress[gameId];
        const nextCount = Math.max(0, (existing?.playthroughCount || 0) + delta);
        return {
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [gameId]: {
              ...(existing || {}),
              status: nextCount > 0 ? 'completed' : 'playing',
              hoursPlayed: existing?.hoursPlayed || 0,
              completionPct: existing?.completionPct || 100,
              playthroughCount: nextCount,
              platinum: existing?.platinum ?? false,
              platform: existing?.platform || game.platforms[0] || 'PC',
              bookmarked: existing?.bookmarked ?? true,
              lastPlayedAt: new Date().toISOString(),
            },
          },
        };
      });
      if (delta > 0) showToast('Logged new playthrough');
    },
    [showToast]
  );

  const toggleGameBookmark = useCallback(
    (gameId: string) => {
      let added = true;
      commitState((prev) => {
        const game = prev.games[gameId];
        if (!game) return prev;
        const existing = prev.gameProgress[gameId];
        added = !(existing?.bookmarked ?? false);
        return {
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [gameId]: {
              ...(existing || {}),
              status: existing?.status || 'backlog',
              hoursPlayed: existing?.hoursPlayed || 0,
              completionPct: existing?.completionPct || 0,
              playthroughCount: existing?.playthroughCount || 0,
              platinum: existing?.platinum ?? false,
              platform: existing?.platform || game.platforms[0] || 'PC',
              bookmarked: added,
            },
          },
        };
      });
      showToast(added ? 'Added to Play library' : 'Removed from Play library');
    },
    [showToast]
  );

  const rateGame = useCallback((gameId: string, rating: number | undefined) => {
    commitState((prev) => {
      const game = prev.games[gameId];
      if (!game) return prev;
      const existing = prev.gameProgress[gameId];
      return {
        ...prev,
        gameProgress: {
          ...prev.gameProgress,
          [gameId]: {
            ...(existing || {}),
            status: existing?.status || 'playing',
            hoursPlayed: existing?.hoursPlayed || 0,
            completionPct: existing?.completionPct || 0,
            playthroughCount: existing?.playthroughCount || 0,
            platinum: existing?.platinum ?? false,
            platform: existing?.platform || game.platforms[0] || 'PC',
            bookmarked: existing?.bookmarked ?? true,
            rating,
          },
        },
      };
    });
  }, []);

  const rateGameChapter = useCallback(
    (gameId: string, chapter: number, rating: number | undefined) => {
      commitState((prev) => {
        const game = prev.games[gameId];
        if (!game) return prev;
        const existing = prev.gameProgress[gameId];
        const nextRatings = { ...(existing?.chapterRatings || {}) };
        if (rating === undefined) {
          delete nextRatings[chapter];
        } else {
          nextRatings[chapter] = rating;
        }
        return {
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [gameId]: {
              ...(existing || {}),
              status: existing?.status || 'playing',
              hoursPlayed: existing?.hoursPlayed || 0,
              completionPct: existing?.completionPct || 0,
              playthroughCount: existing?.playthroughCount || 0,
              platinum: existing?.platinum ?? false,
              platform: existing?.platform || game.platforms[0] || 'PC',
              bookmarked: existing?.bookmarked ?? true,
              chapterRatings: nextRatings,
            },
          },
        };
      });
    },
    []
  );

  const setGameChapterTitle = useCallback(
    (gameId: string, chapter: number, title: string) => {
      const cleanTitle = title.trim();
      commitState((prev) => {
        const game = prev.games[gameId];
        if (!game) return prev;
        const existing = prev.gameProgress[gameId];
        const nextTitles = { ...(existing?.chapterTitles || {}) };
        if (!cleanTitle) {
          delete nextTitles[chapter];
        } else {
          nextTitles[chapter] = cleanTitle;
        }
        return {
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [gameId]: {
              ...(existing || {}),
              status: existing?.status || 'playing',
              hoursPlayed: existing?.hoursPlayed || 0,
              completionPct: existing?.completionPct || 0,
              playthroughCount: existing?.playthroughCount || 0,
              platinum: existing?.platinum ?? false,
              platform: existing?.platform || game.platforms[0] || 'PC',
              bookmarked: existing?.bookmarked ?? true,
              chapterTitles: nextTitles,
            },
          },
        };
      });
    },
    []
  );

  const setGameMood = useCallback((gameId: string, mood: PersonalMood | undefined) => {
    commitState((prev) => {
      const game = prev.games[gameId];
      if (!game) return prev;
      const existing = prev.gameProgress[gameId];
      return {
        ...prev,
        gameProgress: {
          ...prev.gameProgress,
          [gameId]: {
            ...(existing || {}),
            status: existing?.status || 'playing',
            hoursPlayed: existing?.hoursPlayed || 0,
            completionPct: existing?.completionPct || 0,
            playthroughCount: existing?.playthroughCount || 0,
            platinum: existing?.platinum ?? false,
            platform: existing?.platform || game.platforms[0] || 'PC',
            bookmarked: existing?.bookmarked ?? true,
            mood,
          },
        },
      };
    });
  }, []);

  const resetGameProgress = useCallback(
    (gameId: string) => {
      commitState((prev) => {
        const game = prev.games[gameId];
        if (!game) return prev;
        const existing = prev.gameProgress[gameId];
        return {
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [gameId]: {
              ...(existing || {}),
              status: 'backlog',
              hoursPlayed: 0,
              completionPct: 0,
              currentChapter: 0,
              playthroughCount: 0,
              platinum: false,
              platform: existing?.platform || game.platforms[0] || 'PC',
              bookmarked: existing?.bookmarked ?? true,
            },
          },
        };
      });
      showToast('Reset game progress');
    },
    [showToast]
  );

  // Collections & Cross-Media Lists
  const rateCollection = useCallback(
    (collectionKey: string, rating: number | undefined, source: RatingSource = 'manual') => {
      commitState((prev) => {
        const nextMap = { ...(prev.collectionRatings || {}) };
        if (typeof rating === 'number' && rating > 0) {
          nextMap[collectionKey] = { rating, source };
        } else {
          delete nextMap[collectionKey];
        }
        return {
          ...prev,
          collectionRatings: nextMap,
        };
      });
    },
    []
  );

  const toggleListPinnedToQueue = useCallback(
    (listId: string) => {
      let pinned = false;
      commitState((prev) => ({
        ...prev,
        lists: prev.lists.map((l) => {
          if (l.id !== listId) return l;
          pinned = !l.pinnedToQueue;
          return { ...l, pinnedToQueue: pinned };
        }),
      }));
      showToast(pinned ? 'Pinned run to Cue' : 'Unpinned from Cue');
    },
    [showToast]
  );

  const deleteCustomList = useCallback(
    (listId: string) => {
      commitState((prev) => ({
        ...prev,
        lists: prev.lists.filter((l) => l.id !== listId),
      }));
      showToast('Deleted custom list');
    },
    [showToast]
  );

  // Live additions
  const addLiveShowToStore = useCallback(
    (show: Show, andBookmark = true) => {
      commitState((prev) => {
        const exists = Boolean(prev.shows[show.id]);
        const existingProgress = prev.showProgress[show.id];
        return {
          ...prev,
          shows: { ...prev.shows, [show.id]: show },
          showOrder: exists ? prev.showOrder : [show.id, ...prev.showOrder],
          showProgress: andBookmark
            ? {
                ...prev.showProgress,
                [show.id]: existingProgress
                  ? { ...existingProgress, bookmarked: true }
                  : {
                      status: 'not_started',
                      episodeCounts: {},
                      bookmarked: true,
                      notifications: true,
                    },
              }
            : prev.showProgress,
        };
      });
      if (andBookmark) {
        showToast(show.title, undefined, undefined, {
          domain: 'watch',
          subtitle: 'Added to Watch',
          posterUrl: show.posterUrl,
        });
      }
    },
    [showToast]
  );

  const addLiveMovieToStore = useCallback(
    (movie: Movie, status: MovieWatchStatus = 'watchlist', andBookmark = true) => {
      commitState((prev) => {
        const exists = Boolean(prev.movies[movie.id]);
        return {
          ...prev,
          movies: { ...prev.movies, [movie.id]: movie },
          movieOrder: exists ? prev.movieOrder : [movie.id, ...prev.movieOrder],
          movieProgress: andBookmark
            ? {
                ...prev.movieProgress,
                [movie.id]: prev.movieProgress[movie.id] || {
                  status,
                  watchCount: status === 'watched' ? 1 : 0,
                  watchedAt: status === 'watched' ? new Date().toISOString() : undefined,
                },
              }
            : prev.movieProgress,
        };
      });
      if (andBookmark) {
        showToast(movie.title, undefined, undefined, {
          domain: 'watch',
          subtitle: 'Added to Watch',
          posterUrl: movie.posterUrl,
        });
      }
    },
    [showToast]
  );

  const addLiveReadToStore = useCallback(
    (item: ReadItem, status: ReadWatchStatus = 'want_to_read', andBookmark = true) => {
      commitState((prev) => {
        const exists = Boolean(prev.readItems[item.id]);
        const existingProgress = prev.readProgress[item.id];
        return {
          ...prev,
          readItems: { ...prev.readItems, [item.id]: item },
          readOrder: exists ? prev.readOrder : [item.id, ...prev.readOrder],
          readProgress: andBookmark
            ? {
                ...prev.readProgress,
                [item.id]: existingProgress
                  ? { ...existingProgress, bookmarked: true }
                  : {
                      status,
                      currentUnit: 0,
                      rereadCount: 0,
                      bookmarked: true,
                    },
              }
            : prev.readProgress,
        };
      });
      if (andBookmark) {
        showToast(item.title, undefined, undefined, {
          domain: 'read',
          subtitle: 'Added to Read',
          posterUrl: item.coverUrl,
        });
      }
    },
    [showToast]
  );

  const addLiveGameToStore = useCallback(
    (game: GameItem, status: GameWatchStatus = 'backlog', andBookmark = true) => {
      const known = !game.totalChapters ? lookupKnownGameChapters(game.title) : null;
      const enrichedGame: GameItem = known
        ? {
            ...game,
            totalChapters: known.totalChapters,
            chapterUnit: known.unit,
            chapterSource: known.source,
            chapterNote: known.note,
          }
        : game;
      commitState((prev) => {
        const exists = Boolean(prev.games[enrichedGame.id]);
        const existingProgress = prev.gameProgress[enrichedGame.id];
        return {
          ...prev,
          games: { ...prev.games, [enrichedGame.id]: enrichedGame },
          gameOrder: exists ? prev.gameOrder : [enrichedGame.id, ...prev.gameOrder],
          gameProgress: andBookmark
            ? {
                ...prev.gameProgress,
                [enrichedGame.id]: existingProgress
                  ? { ...existingProgress, bookmarked: true }
                  : {
                      status,
                      hoursPlayed: 0,
                      completionPct: 0,
                      currentChapter: 0,
                      playthroughCount: 0,
                      platinum: false,
                      platform: enrichedGame.platforms[0] || 'PC',
                      bookmarked: true,
                    },
              }
            : prev.gameProgress,
        };
      });
      if (andBookmark) {
        showToast(enrichedGame.title, undefined, undefined, {
          domain: 'play',
          subtitle: 'Added to Play',
          posterUrl: enrichedGame.coverUrl,
        });
      }
    },
    [showToast]
  );

  const patchMediaMetadata = useCallback(
    (
      kind: 'show' | 'movie' | 'read' | 'game',
      id: string,
      patch: {
        posterUrl?: string;
        backdropUrl?: string;
        coverUrl?: string;
        clearStaleIssues?: boolean;
      }
    ) => {
      commitState((prev) => {
        if (kind === 'show') {
          const s = prev.shows[id];
          if (!s) return prev;
          return {
            ...prev,
            shows: {
              ...prev.shows,
              [id]: {
                ...s,
                posterUrl: patch.posterUrl ?? s.posterUrl,
                backdropUrl: patch.backdropUrl ?? s.backdropUrl,
              },
            },
          };
        }
        if (kind === 'movie') {
          const m = prev.movies[id];
          if (!m) return prev;
          return {
            ...prev,
            movies: {
              ...prev.movies,
              [id]: {
                ...m,
                posterUrl: patch.posterUrl ?? m.posterUrl,
                backdropUrl: patch.backdropUrl ?? m.backdropUrl,
              },
            },
          };
        }
        if (kind === 'read') {
          const r = prev.readItems[id];
          if (!r) return prev;
          return {
            ...prev,
            readItems: {
              ...prev.readItems,
              [id]: {
                ...r,
                coverUrl: patch.coverUrl ?? r.coverUrl,
                backdropUrl: patch.backdropUrl ?? r.backdropUrl,
                ...(patch.clearStaleIssues
                  ? { issueDetails: undefined, issueDetailsKey: undefined }
                  : {}),
              },
            },
          };
        }
        const g = prev.games[id];
        if (!g) return prev;
        return {
          ...prev,
          games: {
            ...prev.games,
            [id]: {
              ...g,
              coverUrl: patch.coverUrl ?? g.coverUrl,
              backdropUrl: patch.backdropUrl ?? g.backdropUrl,
            },
          },
        };
      });
    },
    []
  );

  // Private Journal & Lists
  const addJournalEntry = useCallback(
    (input: Omit<JournalEntry, 'id' | 'createdAt'>) => {
      commitState((prev) => ({
        ...prev,
        journalEntries: [
          {
            ...input,
            id: `j-${Date.now()}`,
            createdAt: new Date().toISOString(),
          },
          ...prev.journalEntries,
        ],
      }));
      showToast('Saved to private journal');
    },
    [showToast]
  );

  const deleteJournalEntry = useCallback(
    (entryId: string) => {
      commitState((prev) => ({
        ...prev,
        journalEntries: prev.journalEntries.filter((j) => j.id !== entryId),
      }));
      showToast('Journal entry deleted');
    },
    [showToast]
  );

  const markAllNotificationsRead = useCallback(() => {
    commitState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => ({ ...n, read: true })),
    }));
  }, []);

  const createCustomList = useCallback(
    (
      name: string,
      description: string,
      initialItem?: { kind: 'show' | 'movie' | 'read' | 'game'; id: string },
      initialItems?: Array<{ kind: 'show' | 'movie' | 'read' | 'game'; id: string }>
    ) => {
      const items =
        initialItems && initialItems.length > 0
          ? initialItems
          : initialItem
            ? [initialItem]
            : [];
      commitState((prev) => ({
        ...prev,
        lists: [
          {
            id: `list-${Date.now()}`,
            name: name.trim(),
            description: description.trim(),
            items,
            createdAt: new Date().toISOString(),
          },
          ...prev.lists,
        ],
      }));
      showToast(`Created list "${name.trim()}"`);
    },
    [showToast]
  );

  const toggleItemInList = useCallback(
    (listId: string, kind: 'show' | 'movie' | 'read' | 'game', id: string) => {
      let added = false;
      commitState((prev) => ({
        ...prev,
        lists: prev.lists.map((l) => {
          if (l.id !== listId) return l;
          const exists = l.items.some((x) => x.kind === kind && x.id === id);
          added = !exists;
          return {
            ...l,
            items: exists
              ? l.items.filter((x) => !(x.kind === kind && x.id === id))
              : [...l.items, { kind, id }],
          };
        }),
      }));
      showToast(added ? 'Added to list' : 'Removed from list');
    },
    [showToast]
  );

  const updateProfile = useCallback(
    (patch: Partial<UserProfile>) => {
      commitState((prev) => ({
        ...prev,
        profile: { ...prev.profile, ...patch },
      }));
      showToast('Profile saved');
    },
    [showToast]
  );

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    commitState((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...patch },
    }));
  }, []);

  const exportLibraryJson = useCallback(() => {
    return JSON.stringify(
      {
        app: 'cue',
        version: '2.0.0',
        exportedAt: new Date().toISOString(),
        state,
      },
      null,
      2
    );
  }, [state]);

  const undoLastImport = useCallback(() => {
    const snapshot = lastPreImportStateRef.current;
    if (!snapshot) return;
    lastPreImportStateRef.current = null;
    stateRef.current = snapshot;
    setState(snapshot);
    showToast('Import undone');
  }, [showToast]);

  const restoreCueBackup = useCallback(
    (backupState: CueStoreState) => {
      lastPreImportStateRef.current = stateRef.current;
      stateRef.current = backupState;
      setState(backupState);
      showToast('Restored cue library backup', 'Undo', undoLastImport, { tone: 'undo' });
    },
    [showToast, undoLastImport]
  );

  const importSmartBatch = useCallback(
    (
      rawEntries: PreparedImportEntry[],
      policy: ImportConflictPolicy
    ): { added: number; updated: number; skipped: number } => {
      const selectedEntries = rawEntries.filter((e) => e.selected);
      if (selectedEntries.length === 0) {
        return { added: 0, updated: 0, skipped: 0 };
      }

      const prev = stateRef.current;
      lastPreImportStateRef.current = prev;

      const annotated = annotateImportDuplicates(
        selectedEntries.map((e) => e.candidate),
        prev
      );

      const nextShows = { ...prev.shows };
      const nextMovies = { ...prev.movies };
      const nextReadItems = { ...prev.readItems };
      const nextGames = { ...prev.games };
      const nextShowProgress = { ...prev.showProgress };
      const nextMovieProgress = { ...prev.movieProgress };
      const nextReadProgress = { ...prev.readProgress };
      const nextGameProgress = { ...prev.gameProgress };

      const newShowIds: string[] = [];
      const newMovieIds: string[] = [];
      const newReadIds: string[] = [];
      const newGameIds: string[] = [];
      const historyAdds: HistoryEntry[] = [];

      let added = 0;
      let updated = 0;
      let skipped = 0;
      const nowIso = new Date().toISOString();

      selectedEntries.forEach((entry, idx) => {
        const c = annotated[idx];
        const existingId = c.existingId;

        if (existingId) {
          if (policy === 'skip_existing') {
            skipped += 1;
            return;
          }

          let changed = false;
          if (c.kind === 'show' && nextShows[existingId]) {
            const ep = nextShowProgress[existingId];
            if (ep && !ep.rating && c.userRating) {
              nextShowProgress[existingId] = { ...ep, rating: c.userRating };
              changed = true;
            }
          } else if (c.kind === 'movie' && nextMovies[existingId]) {
            const mp = nextMovieProgress[existingId];
            const patched = {
              status: mp?.status || 'watchlist',
              watchCount: mp?.watchCount || 0,
              watchedAt: mp?.watchedAt,
              rating: mp?.rating,
              mood: mp?.mood,
            };
            if (!patched.rating && c.userRating) {
              patched.rating = c.userRating;
              changed = true;
            }
            if (patched.watchCount === 0 && c.completed) {
              patched.status = 'watched';
              patched.watchCount = 1;
              patched.watchedAt = patched.watchedAt || c.dateStr || nowIso;
              changed = true;
            }
            if (changed) nextMovieProgress[existingId] = patched;
          } else if (c.kind === 'read' && nextReadItems[existingId]) {
            const rp = nextReadProgress[existingId];
            const item = nextReadItems[existingId];
            const targetFormat: ReadItem['format'] | undefined =
              c.mediaType === 'comic'
                ? 'comic'
                : c.mediaType === 'manga'
                  ? 'manga'
                  : c.mediaType === 'novel'
                    ? 'novel'
                    : undefined;
            if (targetFormat && item.format !== targetFormat && (item.format === 'novel' || policy === 'merge_missing')) {
              const nextUnit = targetFormat === 'comic' ? 'issues' : 'chapters';
              const formatGenre =
                targetFormat === 'comic' ? 'Comics' : targetFormat === 'manga' ? 'Manga' : 'Fiction';
              const filteredGenres = item.genres.filter(
                (g) => !['fiction', 'comics', 'comic', 'manga'].includes(g.toLowerCase())
              );
              nextReadItems[existingId] = {
                ...item,
                format: targetFormat,
                unit: nextUnit,
                genres: [formatGenre, ...filteredGenres],
              };
              changed = true;
            }
            const nextCover = c.posterUrl || entry.read?.coverUrl || '';
            if (!nextReadItems[existingId].coverUrl && nextCover) {
              nextReadItems[existingId] = {
                ...nextReadItems[existingId],
                coverUrl: nextCover,
                backdropUrl: nextReadItems[existingId].backdropUrl || nextCover,
              };
              changed = true;
            }
            if (rp) {
              const patched = { ...rp };
              if (!patched.rating && c.userRating) {
                patched.rating = c.userRating;
                changed = true;
              }
              if (rp.status === 'want_to_read' && c.completed) {
                const updatedItem = nextReadItems[existingId];
                patched.status = 'finished';
                patched.currentUnit = updatedItem.totalUnits;
                patched.maxCompletedUnit = Math.max(updatedItem.totalUnits, rp.maxCompletedUnit || 0);
                patched.rereadCount = Math.max(1, rp.rereadCount || 0);
                changed = true;
              }
              if (changed) nextReadProgress[existingId] = patched;
            }
          } else if (c.kind === 'game' && nextGames[existingId]) {
            const gp = nextGameProgress[existingId];
            if (gp) {
              const patched = { ...gp };
              if (!patched.rating && c.userRating) {
                patched.rating = c.userRating;
                changed = true;
              }
              if (gp.status === 'backlog' && c.completed) {
                patched.status = 'completed';
                patched.completionPct = 100;
                patched.playthroughCount = Math.max(1, gp.playthroughCount || 0);
                changed = true;
              }
              if (changed) nextGameProgress[existingId] = patched;
            }
          }

          if (changed) updated += 1;
          else skipped += 1;
          return;
        }

        if (c.kind === 'show' && entry.show) {
          const show = entry.show;
          const sid = nextShows[show.id] ? `${show.id}-${idx}` : show.id;
          const storedShow = sid === show.id ? show : { ...show, id: sid };
          nextShows[sid] = storedShow;
          newShowIds.push(sid);
          const epCounts: Record<string, number> = {};
          if (c.completed) {
            for (const ep of getAllEpisodes(storedShow)) {
              epCounts[getEpisodeKey(ep.season, ep.number)] = 1;
            }
          }
          nextShowProgress[sid] = {
            status: c.completed ? 'finished' : 'not_started',
            episodeCounts: epCounts,
            bookmarked: true,
            notifications: true,
            lastWatchedAt: c.completed ? c.dateStr || nowIso : undefined,
            rating: c.userRating,
          };
          if (c.completed) {
            historyAdds.push({
              id: `hist-imp-${sid}-${Date.now()}`,
              domain: 'watch',
              mediaKind: 'show',
              mediaId: sid,
              title: storedShow.title,
              posterUrl: storedShow.posterUrl,
              codeLabel: 'Imported · Finished',
              subtitle: storedShow.mediaType === 'anime' ? 'Anime' : 'Show',
              loggedAt: c.dateStr || nowIso,
            });
          }
          added += 1;
        } else if (c.kind === 'movie' && entry.movie) {
          const movie = entry.movie;
          const mid = nextMovies[movie.id] ? `${movie.id}-${idx}` : movie.id;
          const storedMovie = mid === movie.id ? movie : { ...movie, id: mid };
          nextMovies[mid] = storedMovie;
          newMovieIds.push(mid);
          nextMovieProgress[mid] = {
            status: c.completed ? 'watched' : 'watchlist',
            watchCount: c.completed ? 1 : 0,
            watchedAt: c.completed ? c.dateStr || nowIso : undefined,
            rating: c.userRating,
          };
          if (c.completed) {
            historyAdds.push({
              id: `hist-imp-${mid}-${Date.now()}`,
              domain: 'watch',
              mediaKind: 'movie',
              mediaId: mid,
              title: storedMovie.title,
              posterUrl: storedMovie.posterUrl,
              codeLabel: 'Watched',
              subtitle: `${storedMovie.year} · ${storedMovie.runtime}m`,
              loggedAt: c.dateStr || nowIso,
            });
          }
          added += 1;
        } else if (c.kind === 'read' && entry.read) {
          const read = entry.read;
          const rid = nextReadItems[read.id] ? `${read.id}-${idx}` : read.id;
          const storedRead = rid === read.id ? read : { ...read, id: rid };
          nextReadItems[rid] = storedRead;
          newReadIds.push(rid);
          const finished = c.readStatus === 'finished' || c.completed;
          const reading = c.readStatus === 'reading';
          nextReadProgress[rid] = {
            status: finished ? 'finished' : reading ? 'reading' : 'want_to_read',
            currentUnit: finished ? storedRead.totalUnits : reading ? 1 : 0,
            maxCompletedUnit: finished ? storedRead.totalUnits : reading ? 1 : 0,
            rereadCount: finished ? 1 : 0,
            bookmarked: true,
            lastReadAt: finished || reading ? c.dateStr || nowIso : undefined,
            rating: c.userRating,
          };
          if (finished) {
            historyAdds.push({
              id: `hist-imp-${rid}-${Date.now()}`,
              domain: 'read',
              mediaKind: 'read',
              mediaId: rid,
              title: storedRead.title,
              posterUrl: storedRead.coverUrl,
              codeLabel: 'Finished',
              subtitle: storedRead.creator,
              loggedAt: c.dateStr || nowIso,
            });
          }
          added += 1;
        } else if (c.kind === 'game' && entry.game) {
          const game = entry.game;
          const gid = nextGames[game.id] ? `${game.id}-${idx}` : game.id;
          const storedGame = gid === game.id ? game : { ...game, id: gid };
          nextGames[gid] = storedGame;
          newGameIds.push(gid);
          nextGameProgress[gid] = {
            status: c.completed ? 'completed' : 'backlog',
            hoursPlayed: 0,
            completionPct: c.completed ? 100 : 0,
            currentChapter: c.completed && storedGame.totalChapters ? storedGame.totalChapters : 0,
            playthroughCount: c.completed ? 1 : 0,
            platinum: false,
            platform: storedGame.platforms[0] || 'PC',
            bookmarked: true,
            lastPlayedAt: c.completed ? c.dateStr || nowIso : undefined,
            rating: c.userRating,
          };
          if (c.completed) {
            historyAdds.push({
              id: `hist-imp-${gid}-${Date.now()}`,
              domain: 'play',
              mediaKind: 'game',
              mediaId: gid,
              title: storedGame.title,
              posterUrl: storedGame.coverUrl,
              codeLabel: 'Completed',
              subtitle: storedGame.developer,
              loggedAt: c.dateStr || nowIso,
            });
          }
          added += 1;
        }
      });

      const cappedHistory = [...(prev.history || []), ...historyAdds.slice(-15)];
      const trimmedHistory =
        cappedHistory.length > MAX_HISTORY_ENTRIES
          ? cappedHistory.slice(cappedHistory.length - MAX_HISTORY_ENTRIES)
          : cappedHistory;

      const nextBatchState: CueStoreState = {
        ...prev,
        shows: nextShows,
        movies: nextMovies,
        readItems: nextReadItems,
        games: nextGames,
        showOrder: [...newShowIds, ...prev.showOrder],
        movieOrder: [...newMovieIds, ...prev.movieOrder],
        readOrder: [...newReadIds, ...prev.readOrder],
        gameOrder: [...newGameIds, ...prev.gameOrder],
        showProgress: nextShowProgress,
        movieProgress: nextMovieProgress,
        readProgress: nextReadProgress,
        gameProgress: nextGameProgress,
        history: trimmedHistory,
      };
      stateRef.current = nextBatchState;
      setState(nextBatchState);

      const summaryParts: string[] = [];
      if (added > 0) summaryParts.push(`Added ${added}`);
      if (updated > 0) summaryParts.push(`Updated ${updated}`);
      if (skipped > 0) summaryParts.push(`${skipped} skipped`);
      showToast(summaryParts.join(' · ') || 'Nothing changed', 'Undo', undoLastImport, {
        tone: 'undo',
      });

      return { added, updated, skipped };
    },
    [showToast, undoLastImport]
  );

  const autoClassifyReadLibrary = useCallback((): { comics: number; manga: number } => {
    const prev = stateRef.current;
    const nextReadItems = { ...prev.readItems };
    let comics = 0;
    let manga = 0;

    for (const id of Object.keys(nextReadItems)) {
      const item = nextReadItems[id];
      if (!item || item.format !== 'novel') continue;
      const detected = classifyReadFormat({
        title: item.title,
        author: item.creator,
        genres: item.genres,
      });
      if (detected === 'novel') continue;
      if (detected === 'comic') comics += 1;
      if (detected === 'manga') manga += 1;
      const formatGenre = detected === 'comic' ? 'Comics' : 'Manga';
      const filteredGenres = item.genres.filter(
        (g) => !['fiction', 'comics', 'comic', 'manga'].includes(g.toLowerCase())
      );
      nextReadItems[id] = {
        ...item,
        format: detected,
        unit: detected === 'comic' ? 'issues' : 'chapters',
        genres: [formatGenre, ...filteredGenres],
      };
    }

    if (comics === 0 && manga === 0) {
      showToast('All Read items are already categorized');
      return { comics: 0, manga: 0 };
    }

    lastPreImportStateRef.current = prev;
    const nextState: CueStoreState = {
      ...prev,
      readItems: nextReadItems,
    };
    stateRef.current = nextState;
    setState(nextState);

    const parts: string[] = [];
    if (comics > 0) parts.push(`${comics} ${comics === 1 ? 'comic' : 'comics'}`);
    if (manga > 0) parts.push(`${manga} manga`);
    showToast(`Moved ${parts.join(' & ')} out of Novels`, 'Undo', undoLastImport, {
      domain: 'read',
      tone: 'undo',
    });
    return { comics, manga };
  }, [showToast, undoLastImport]);

  const importLibraryJson = useCallback(
    (rawJson: string): { ok: boolean; summary: string } => {
      try {
        const parsed = JSON.parse(rawJson);
        if (parsed?.app === 'cue' && parsed?.state?.shows && parsed?.state?.readItems) {
          const restored = parsed.state as CueStoreState;
          stateRef.current = restored;
          setState(restored);
          showToast('Restored cue library backup');
          return { ok: true, summary: 'Full cue backup restored.' };
        }

        let matchedShows = 0;
        let matchedMovies = 0;
        const importedShowTitles = new Set<string>();
        const importedMovieTitles = new Set<string>();

        const scan = (node: unknown) => {
          if (Array.isArray(node)) node.forEach(scan);
          else if (node && typeof node === 'object') {
            const obj = node as Record<string, unknown>;
            if (typeof obj.series_name === 'string') importedShowTitles.add(obj.series_name.toLowerCase());
            if (typeof obj.show_title === 'string') importedShowTitles.add(obj.show_title.toLowerCase());
            if (obj.show && typeof (obj.show as Record<string, unknown>).title === 'string') {
              importedShowTitles.add(String((obj.show as Record<string, unknown>).title).toLowerCase());
            }
            if (obj.movie && typeof (obj.movie as Record<string, unknown>).title === 'string') {
              importedMovieTitles.add(String((obj.movie as Record<string, unknown>).title).toLowerCase());
            }
            if (typeof obj.movie_title === 'string') importedMovieTitles.add(obj.movie_title.toLowerCase());
          }
        };
        scan(parsed);

        commitState((prev) => {
          const nextShowProg = { ...prev.showProgress };
          const nextMovieProg = { ...prev.movieProgress };
          for (const id of prev.showOrder) {
            const s = prev.shows[id];
            if (importedShowTitles.has(s.title.toLowerCase())) {
              matchedShows += 1;
              if (!nextShowProg[id]) {
                nextShowProg[id] = {
                  status: 'watching',
                  episodeCounts: {},
                  bookmarked: true,
                  notifications: true,
                };
              }
            }
          }
          for (const id of prev.movieOrder) {
            const m = prev.movies[id];
            if (importedMovieTitles.has(m.title.toLowerCase())) {
              matchedMovies += 1;
              nextMovieProg[id] = {
                status: 'watched',
                watchCount: Math.max(1, nextMovieProg[id]?.watchCount || 0),
                watchedAt: new Date().toISOString(),
              };
            }
          }
          return { ...prev, showProgress: nextShowProg, movieProgress: nextMovieProg };
        });

        const msg =
          matchedShows + matchedMovies > 0
            ? `Imported ${matchedShows} shows & ${matchedMovies} movies`
            : 'Parsed JSON archive';
        showToast(msg);
        return { ok: true, summary: msg };
      } catch {
        return { ok: false, summary: 'Invalid JSON file format.' };
      }
    },
    [showToast]
  );

  const selectiveReset = useCallback(
    (scope: 'watch' | 'read' | 'play' | 'all') => {
      const resetWatchState = (prev: CueStoreState) => {
        const nextShows: Record<string, ShowProgress> = {};
        for (const id of Object.keys(prev.showProgress)) {
          nextShows[id] = {
            status: 'not_started',
            episodeCounts: {},
            bookmarked: prev.showProgress[id].bookmarked,
            notifications: prev.showProgress[id].notifications,
          };
        }
        const nextMovies = { ...prev.movieProgress };
        for (const id of Object.keys(nextMovies)) {
          nextMovies[id] = { status: 'watchlist', watchCount: 0 };
        }
        return { nextShows, nextMovies };
      };

      const resetReadState = (prev: CueStoreState) => {
        const nextRead: Record<string, ReadProgress> = {};
        for (const id of Object.keys(prev.readProgress)) {
          nextRead[id] = {
            status: 'want_to_read',
            currentUnit: 0,
            completedUnits: [],
            maxCompletedUnit: 0,
            rereadCount: 0,
            bookmarked: prev.readProgress[id].bookmarked,
            edition: prev.readProgress[id].edition,
          };
        }
        return nextRead;
      };

      const resetPlayState = (prev: CueStoreState) => {
        const nextGames = { ...prev.gameProgress };
        for (const id of Object.keys(nextGames)) {
          nextGames[id] = {
            ...nextGames[id],
            status: 'backlog',
            hoursPlayed: 0,
            completionPct: 0,
            currentChapter: 0,
            playthroughCount: 0,
            platinum: false,
          };
        }
        return nextGames;
      };

      if (scope === 'all') {
        commitState((prev) => {
          const { nextShows, nextMovies } = resetWatchState(prev);
          return {
            ...prev,
            showProgress: nextShows,
            movieProgress: nextMovies,
            readProgress: resetReadState(prev),
            gameProgress: resetPlayState(prev),
            history: [],
          };
        });
        showToast('Reset all progress data');
        return;
      }
      if (scope === 'watch') {
        commitState((prev) => {
          const { nextShows, nextMovies } = resetWatchState(prev);
          return {
            ...prev,
            showProgress: nextShows,
            movieProgress: nextMovies,
            history: (prev.history || []).filter((h) => h.domain !== 'watch'),
          };
        });
        showToast('Reset Watch progress');
        return;
      }
      if (scope === 'read') {
        commitState((prev) => ({
          ...prev,
          readProgress: resetReadState(prev),
          history: (prev.history || []).filter((h) => h.domain !== 'read'),
        }));
        showToast('Reset Read progress');
        return;
      }
      commitState((prev) => ({
        ...prev,
        gameProgress: resetPlayState(prev),
        history: (prev.history || []).filter((h) => h.domain !== 'play'),
      }));
      showToast('Reset Play progress');
    },
    [showToast]
  );

  const clearAllData = useCallback(() => {
    if (pushTimerRef.current) window.clearTimeout(pushTimerRef.current);
    syncCodeRef.current = null;
    lastSyncedAtRef.current = null;
    localEditedAtRef.current = 0;
    suppressNextPushRef.current = true;
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_V2_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      localStorage.removeItem(SYNC_CODE_KEY);
      localStorage.removeItem(SYNC_TS_KEY);
      localStorage.removeItem(LOCAL_EDIT_TS_KEY);
    } catch {
      // ignore storage errors
    }
    setSyncCode(null);
    setLastSyncedAt(null);
    setSyncStatus('idle');
    setSyncError(null);
    setActiveBanner(null);
    const empty = createEmptyState();
    stateRef.current = empty;
    setState(empty);
    setRouteStack([{ view: 'queue' }]);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    showToast('All data removed — starting fresh');
  }, [showToast]);

  return (
    <CueContext.Provider
      value={{
        state,
        route,
        canGoBack,
        switchTab,
        pushRoute,
        goBack,
        toggleCalendarMode,
        toast,
        dismissToast,
        showToast,
        activeBanner,
        dismissBanner,
        triggerSampleReleaseAlert,
        filterSheetOpen,
        setFilterSheetOpen,
        notificationsOpen,
        setNotificationsOpen,
        settingsOpen,
        setSettingsOpen,
        insightsOpen,
        setInsightsOpen,
        importModalOpen,
        setImportModalOpen,
        watchNextEpisode,
        toggleEpisodeWatched,
        incrementEpisodeRewatch,
        toggleShowBookmark,
        toggleShowNotifications,
        markSeasonWatched,
        markShowAllWatched,
        startShowRewatch,
        resetShowProgress,
        rateEpisode,
        rateSeason,
        rateShow,
        setShowMood,
        updateShowEpisodes,
        toggleMovieWatched,
        incrementMovieRewatch,
        toggleMovieWatchlist,
        rateMovie,
        setMovieMood,
        advanceReadProgress,
        setReadProgress,
        toggleReadUnit,
        markReadFinished,
        incrementReread,
        toggleReadBookmark,
        rateReadUnit,
        rateReadItem,
        setReadMood,
        setReadEdition,
        selectComicEdition,
        updateReadEditionsCatalog,
        updateReadIssueDetails,
        patchReadIssueMeta,
        updateReadEditionCovers,
        updateReadTotalUnits,
        updateReadFormat,
        autoClassifyReadLibrary,
        resetReadProgress,
        logGameSession,
        advanceGameChapter,
        setGameChapter,
        updateGameChaptersMeta,
        updateGameProgress,
        toggleGameCompleted,
        toggleGamePlatinum,
        incrementGamePlaythrough,
        toggleGameBookmark,
        rateGame,
        rateGameChapter,
        setGameChapterTitle,
        setGameMood,
        resetGameProgress,
        rateCollection,
        toggleListPinnedToQueue,
        deleteCustomList,
        addLiveShowToStore,
        addLiveMovieToStore,
        addLiveReadToStore,
        addLiveGameToStore,
        patchMediaMetadata,
        addJournalEntry,
        deleteJournalEntry,
        markAllNotificationsRead,
        createCustomList,
        toggleItemInList,
        updateProfile,
        updateSettings,
        exportLibraryJson,
        importLibraryJson,
        restoreCueBackup,
        importSmartBatch,
        undoLastImport,
        selectiveReset,
        clearAllData,
        syncCode,
        syncStatus,
        lastSyncedAt,
        syncError,
        createSyncCode,
        linkSyncCode,
        syncNow,
        unlinkSyncCode,
      }}
    >
      {children}
    </CueContext.Provider>
  );
}

export function useCueStore() {
  const ctx = useContext(CueContext);
  if (!ctx) throw new Error('useCueStore must be used inside CueProvider');
  return ctx;
}
