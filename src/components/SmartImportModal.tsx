import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Upload,
  X,
} from 'lucide-react';
import {
  buildFallbackPreparedEntry,
  enrichImportCandidate,
  resolveImdbIdsBatch,
} from '../services/mediaApi';
import { useCueStore } from '../store/useCueStore';
import {
  annotateImportDuplicates,
  applyResolvedImdbBatch,
  type ImportCandidate,
  type ImportConflictPolicy,
  type ParsedImportBatch,
  parseImportFile,
  type PreparedImportEntry,
} from '../utils/mediaImport';

type PreviewTypeFilter = 'all' | 'movie' | 'show' | 'anime' | 'game';

export function SmartImportModal() {
  const {
    state,
    importModalOpen,
    setImportModalOpen,
    importSmartBatch,
    restoreCueBackup,
    showToast,
  } = useCueStore();

  const [rawInput, setRawInput] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedImportBatch | null>(null);
  const [selectedMap, setSelectedMap] = useState<Record<string, boolean>>({});
  const [policy, setPolicy] = useState<ImportConflictPolicy>('skip_existing');
  const [enrichArt, setEnrichArt] = useState(true);
  const [showSkipped, setShowSkipped] = useState(false);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progressCount, setProgressCount] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });

  const [resolvingIds, setResolvingIds] = useState(false);
  const [resolveProgress, setResolveProgress] = useState<{
    done: number;
    total: number;
    skippedEpisodes: number;
  }>({ done: 0, total: 0, skippedEpisodes: 0 });

  const [previewQuery, setPreviewQuery] = useState('');
  const [previewFilter, setPreviewFilter] = useState<PreviewTypeFilter>('all');
  const [visibleCount, setVisibleCount] = useState(60);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);
  const resolveCancelRef = useRef(false);

  useEffect(() => {
    if (!importModalOpen) {
      cancelRef.current = true;
      resolveCancelRef.current = true;
      setImporting(false);
      setResolvingIds(false);
      setProgressCount({ done: 0, total: 0 });
    }
  }, [importModalOpen]);

  const annotatedCandidates = useMemo(() => {
    if (!parsed) return [];
    return annotateImportDuplicates(parsed.candidates, state);
  }, [parsed, state]);

  const resolvedCandidates = useMemo(
    () => annotatedCandidates.filter((c) => !c.needsResolution),
    [annotatedCandidates]
  );

  const pendingCandidates = useMemo(
    () => annotatedCandidates.filter((c) => Boolean(c.needsResolution)),
    [annotatedCandidates]
  );

  const filteredPreviewCandidates = useMemo(() => {
    const q = previewQuery.trim().toLowerCase();
    return resolvedCandidates.filter((c) => {
      if (previewFilter === 'movie' && c.mediaType !== 'movie') return false;
      if (previewFilter === 'show' && c.mediaType !== 'tv') return false;
      if (previewFilter === 'anime' && c.mediaType !== 'anime') return false;
      if (previewFilter === 'game' && c.mediaType !== 'game') return false;
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        (c.externalConst && c.externalConst.toLowerCase().includes(q)) ||
        String(c.year).includes(q)
      );
    });
  }, [resolvedCandidates, previewFilter, previewQuery]);

  const resolvePendingImdbIds = async (targetBatch: ParsedImportBatch, limit?: number) => {
    const pending = targetBatch.candidates.filter((c) => c.needsResolution && c.externalConst);
    const slice = typeof limit === 'number' ? pending.slice(0, limit) : pending;
    if (slice.length === 0) return;

    resolveCancelRef.current = false;
    setResolvingIds(true);
    const initialSkippedCount = targetBatch.skipped.length;
    setResolveProgress({ done: 0, total: slice.length, skippedEpisodes: 0 });

    let working = targetBatch;
    const chunkSize = 35;

    try {
      for (let i = 0; i < slice.length; i += chunkSize) {
        if (resolveCancelRef.current) break;
        const chunkIds = slice
          .slice(i, i + chunkSize)
          .map((c) => c.externalConst!)
          .filter(Boolean);
        const resolvedMap = await resolveImdbIdsBatch(chunkIds);
        if (resolveCancelRef.current) break;

        working = applyResolvedImdbBatch(working, resolvedMap);
        const annotated = annotateImportDuplicates(working.candidates, state);
        const resolvedChunkIds = new Set(chunkIds.map((id) => id.toLowerCase()));

        setParsed(working);
        setSelectedMap((prev) => {
          const next = { ...prev };
          for (const c of annotated) {
            if (
              !c.needsResolution &&
              c.externalConst &&
              resolvedChunkIds.has(c.externalConst.toLowerCase())
            ) {
              if (next[c.tempId] === undefined) {
                next[c.tempId] = !c.existingId;
              }
            }
          }
          return next;
        });

        setResolveProgress({
          done: Math.min(slice.length, i + chunkIds.length),
          total: slice.length,
          skippedEpisodes: working.skipped.length - initialSkippedCount,
        });
      }

      const finalResolved = working.candidates.filter((c) => !c.needsResolution);
      if (working.source === 'imdb-account-export' && finalResolved.length > 50) {
        setEnrichArt(false);
      }
    } finally {
      setResolvingIds(false);
    }
  };

  const resetPreviewControls = () => {
    resolveCancelRef.current = true;
    setResolvingIds(false);
    setShowSkipped(false);
    setPreviewQuery('');
    setPreviewFilter('all');
    setVisibleCount(60);
  };

  const runParse = (text: string, name = '') => {
    setRawInput(text);
    setFileName(name);
    resetPreviewControls();
    const result = parseImportFile(text, name);
    setParsed(result);
    const annotated = annotateImportDuplicates(result.candidates, state);
    const initialSel: Record<string, boolean> = {};
    for (const c of annotated) {
      if (!c.needsResolution) {
        initialSel[c.tempId] = !c.existingId;
      }
    }
    setSelectedMap(initialSel);
    setEnrichArt(true);

    if (result.needsIdResolution && result.candidates.length > 0 && result.candidates.length <= 100) {
      void resolvePendingImdbIds(result);
    }
  };

  if (!importModalOpen) return null;

  const newCount = resolvedCandidates.filter((c) => !c.existingId).length;
  const dupCount = resolvedCandidates.filter((c) => Boolean(c.existingId)).length;
  const selectedCandidates = resolvedCandidates.filter((c) => selectedMap[c.tempId]);
  const visibleCandidates = filteredPreviewCandidates.slice(0, visibleCount);
  const busy = importing || resolvingIds;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    runParse(text, file.name);
    e.target.value = '';
  };

  const handleSelectAll = () => {
    const next: Record<string, boolean> = {};
    for (const c of resolvedCandidates) next[c.tempId] = true;
    setSelectedMap(next);
  };

  const handleSelectNewOnly = () => {
    const next: Record<string, boolean> = {};
    for (const c of resolvedCandidates) next[c.tempId] = !c.existingId;
    setSelectedMap(next);
  };

  const handleConfirmImport = async () => {
    if (!parsed) return;

    if (parsed.source === 'cue-backup' && parsed.cueBackupState) {
      restoreCueBackup(parsed.cueBackupState);
      setImportModalOpen(false);
      return;
    }

    if (selectedCandidates.length === 0) return;

    cancelRef.current = false;
    setImporting(true);
    setProgressCount({ done: 0, total: selectedCandidates.length });

    const prepared: PreparedImportEntry[] = [];
    const batchSize = 3;

    try {
      for (let i = 0; i < selectedCandidates.length; i += batchSize) {
        if (cancelRef.current) break;
        const slice = selectedCandidates.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          slice.map(async (cand) => {
            if (!enrichArt || (cand.existingId && policy === 'skip_existing')) {
              return buildFallbackPreparedEntry(cand);
            }
            return enrichImportCandidate(cand, state.settings.tmdbApiKey);
          })
        );
        if (cancelRef.current) break;
        prepared.push(...batchResults);
        setProgressCount({
          done: Math.min(selectedCandidates.length, i + slice.length),
          total: selectedCandidates.length,
        });
      }

      if (cancelRef.current) {
        showToast('Import cancelled — no changes made');
        setImporting(false);
        return;
      }

      importSmartBatch(prepared, policy);
      setImporting(false);
      setParsed(null);
      setRawInput('');
      setFileName('');
      setImportModalOpen(false);
    } catch {
      setImporting(false);
      showToast('Import interrupted — no changes made');
    }
  };

  const domainBadgeClass = (c: ImportCandidate) => {
    if (c.domain === 'watch') return 'bg-watch/15 text-watch';
    if (c.domain === 'read') return 'bg-read/15 text-read';
    return 'bg-play/15 text-play';
  };

  const typeLabel = (c: ImportCandidate) => {
    if (c.mediaType === 'tv') return 'SHOW';
    if (c.mediaType === 'anime') return 'ANIME';
    if (c.mediaType === 'movie') return 'MOVIE';
    if (c.mediaType === 'manga') return 'MANGA';
    if (c.mediaType === 'comic') return 'COMIC';
    if (c.mediaType === 'novel') return 'NOVEL';
    return 'GAME';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm p-0 md:p-4 animate-fade-in"
      onClick={() => !importing && setImportModalOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Smart Import"
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-2xl max-h-[90dvh] flex flex-col bg-surface border border-white/10 rounded-t-[28px] md:rounded-[28px] shadow-2xl animate-sheet-up overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 shrink-0">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-watch" />
            <div>
              <h3 className="font-display font-bold text-lg text-ink leading-tight">
                Smart Safe Import
              </h3>
              <p className="text-[11px] text-ink-dim">
                Preview changes, skip duplicates safely, and undo anytime
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={importing}
            onClick={() => setImportModalOpen(false)}
            aria-label="Close import modal"
            className="h-8 w-8 rounded-full bg-white/8 flex items-center justify-center text-ink-dim hover:text-ink disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto overflow-x-hidden min-w-0 space-y-4">
          {/* Upload / Paste Picker */}
          {!parsed && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {[
                  'IMDb Account Data CSV',
                  'IMDb Ratings CSV',
                  'IMDb Watchlist CSV',
                  'Letterboxd CSV',
                  'Goodreads CSV',
                  'Trakt / TV Time JSON',
                  'Cue Backup JSON',
                ].map((fmt) => (
                  <span
                    key={fmt}
                    className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-background border border-white/10 text-ink-dim"
                  >
                    {fmt}
                  </span>
                ))}
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-[22px] border border-dashed border-white/20 bg-background hover:border-watch/60 hover:bg-surface-raised/40 p-7 text-center transition-colors"
              >
                <Upload className="w-7 h-7 text-watch mx-auto mb-2.5" />
                <p className="font-display font-bold text-base text-ink">
                  Choose CSV or JSON export file
                </p>
                <p className="text-xs text-ink-dim mt-1">
                  From IMDb (Account Data or Your Ratings / Watchlist → ⋮ → Export), Letterboxd, Goodreads, or Cue
                </p>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.json,text/csv,application/json"
                className="hidden"
                onChange={handleFileChange}
              />

              <div>
                <button
                  type="button"
                  onClick={() => setShowPasteBox((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-dim hover:text-ink"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-brand" />
                  <span>Or paste CSV / JSON text directly</span>
                  {showPasteBox ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                </button>

                {showPasteBox && (
                  <div className="mt-2.5 space-y-2.5">
                    <textarea
                      rows={5}
                      value={rawInput}
                      onChange={(e) => setRawInput(e.target.value)}
                      placeholder={'Const,Your Rating,Date Rated,Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors\ntt7631058,8,2026-10-12,The Lord of the Rings: The Rings of Power,,tvSeries,6.9,65,2022,"Action, Adventure, Drama",400000,2022-09-01,'}
                      className="w-full rounded-2xl bg-background border border-white/12 p-3 text-xs font-mono text-ink placeholder:text-ink-faint outline-none focus:border-brand resize-y"
                    />
                    <button
                      type="button"
                      disabled={!rawInput.trim()}
                      onClick={() => runParse(rawInput, 'pasted-export.csv')}
                      className="px-4 py-2 rounded-full bg-brand text-brand-ink text-xs font-semibold disabled:opacity-40"
                    >
                      Preview import
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Parse Error */}
          {parsed?.error && (
            <div className="rounded-2xl bg-red-500/10 border border-red-400/25 p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-ink">Could not parse import</p>
                <p className="text-xs text-ink-dim mt-0.5">{parsed.error}</p>
                <button
                  type="button"
                  onClick={() => setParsed(null)}
                  className="mt-2.5 text-xs font-semibold text-brand"
                >
                  Choose another file
                </button>
              </div>
            </div>
          )}

          {/* Cue Backup Preview */}
          {parsed && !parsed.error && parsed.source === 'cue-backup' && parsed.cueBackupState && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-background border border-white/8 p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-watch/15 text-watch">
                    {parsed.sourceLabel}
                  </span>
                  {fileName && <span className="text-xs text-ink-dim truncate">{fileName}</span>}
                </div>
                <p className="text-sm text-ink font-semibold pt-1">Ready to restore snapshot:</p>
                <p className="text-xs text-ink-dim tabular-nums">
                  {parsed.cueBackupState.showOrder?.length || 0} shows ·{' '}
                  {parsed.cueBackupState.movieOrder?.length || 0} movies ·{' '}
                  {parsed.cueBackupState.readOrder?.length || 0} read titles ·{' '}
                  {parsed.cueBackupState.gameOrder?.length || 0} games ·{' '}
                  {parsed.cueBackupState.journalEntries?.length || 0} notes
                </p>
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setParsed(null)}
                  className="px-4 py-2 rounded-full bg-background border border-white/10 text-xs font-semibold text-ink-dim hover:text-ink"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  className="px-5 py-2.5 rounded-full bg-brand text-brand-ink text-sm font-semibold"
                >
                  Restore backup
                </button>
              </div>
            </div>
          )}

          {/* Candidate Review Screen */}
          {parsed && !parsed.error && parsed.source !== 'cue-backup' && (
            <div className="space-y-4">
              {/* Summary Bar */}
              <div className="rounded-2xl bg-background border border-white/8 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-watch/15 text-watch">
                      {parsed.sourceLabel}
                    </span>
                    <span className="text-xs text-ink font-semibold tabular-nums">
                      {resolvedCandidates.length > 0
                        ? `${newCount} new`
                        : `${pendingCandidates.length} IDs`}
                    </span>
                    {dupCount > 0 && (
                      <span className="text-xs text-ink-dim tabular-nums">
                        · {dupCount} already in library
                      </span>
                    )}
                    {parsed.skipped.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowSkipped((v) => !v)}
                        className="text-xs text-brand hover:underline tabular-nums"
                      >
                        · {parsed.skipped.length} skipped
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={importing}
                    onClick={() => {
                      resetPreviewControls();
                      setParsed(null);
                    }}
                    className="text-xs text-ink-dim hover:text-ink disabled:opacity-40"
                  >
                    Change file
                  </button>
                </div>

                {showSkipped && parsed.skipped.length > 0 && (
                  <div className="rounded-xl bg-surface p-2.5 max-h-28 overflow-y-auto space-y-1 border border-white/6">
                    {parsed.skipped.slice(0, 120).map((sk) => (
                      <p key={`${sk.rowNumber}-${sk.title}`} className="text-[11px] text-ink-dim">
                        {sk.rowNumber > 0 ? `Row ${sk.rowNumber} · ` : ''}
                        <span className="text-ink">{sk.title}</span> — {sk.reason}
                      </p>
                    ))}
                    {parsed.skipped.length > 120 && (
                      <p className="text-[11px] text-ink-faint">
                        …and {parsed.skipped.length - 120} more skipped rows.
                      </p>
                    )}
                  </div>
                )}

                {/* Safety Policy + Enrichment */}
                <div className="flex items-center justify-between gap-3 flex-wrap pt-1 border-t border-white/6">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setPolicy('skip_existing')}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                        policy === 'skip_existing'
                          ? 'border-watch bg-watch/15 text-watch'
                          : 'border-white/10 text-ink-dim hover:text-ink'
                      }`}
                    >
                      Safe Merge (skip duplicates)
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setPolicy('merge_missing')}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                        policy === 'merge_missing'
                          ? 'border-watch bg-watch/15 text-watch'
                          : 'border-white/10 text-ink-dim hover:text-ink'
                      }`}
                    >
                      Merge missing ratings
                    </button>
                  </div>

                  <label className="inline-flex items-center gap-1.5 text-[11px] text-ink-dim cursor-pointer select-none">
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={enrichArt}
                      onChange={(e) => setEnrichArt(e.target.checked)}
                      className="accent-[#6EC5D4] rounded"
                    />
                    <Sparkles className="w-3 h-3 text-watch" />
                    <span>
                      {parsed.source === 'imdb-account-export' && selectedCandidates.length > 50 && !enrichArt
                        ? 'Posters fetched (fast import)'
                        : 'Fetch posters & episodes'}
                    </span>
                  </label>
                </div>
              </div>

              {/* IMDb Account Data ID Resolution Panel */}
              {(pendingCandidates.length > 0 || resolvingIds) && (
                <div className="rounded-2xl bg-background border border-watch/25 p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2.5 flex-wrap">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-xs font-semibold text-ink">
                        IMDb Account Export detected ({pendingCandidates.length} title IDs remaining)
                      </p>
                      <p className="text-[11px] text-ink-dim leading-relaxed">
                        IMDb’s privacy CSV only contains <code className="text-ink">tt…</code> IDs. Cue looks up real titles &amp; posters and automatically skips individual TV episodes.
                      </p>
                      <p className="text-[10.5px] text-ink-faint">
                        Tip: IMDb’s web export (Your Ratings → ⋮ → Export) includes titles and genres instantly.
                      </p>
                    </div>
                  </div>

                  {resolvingIds ? (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="inline-flex items-center gap-1.5 text-ink font-medium tabular-nums">
                          <Loader2 className="w-3.5 h-3.5 text-watch animate-spin" />
                          <span>
                            Resolving IMDb IDs {resolveProgress.done} / {resolveProgress.total}…
                            {resolveProgress.skippedEpisodes > 0
                              ? ` (${resolveProgress.skippedEpisodes} skipped)`
                              : ''}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            resolveCancelRef.current = true;
                          }}
                          className="text-xs font-semibold text-brand hover:underline shrink-0"
                        >
                          Stop &amp; use resolved
                        </button>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full bg-watch transition-all duration-200"
                          style={{
                            width: `${
                              resolveProgress.total > 0
                                ? Math.round((resolveProgress.done / resolveProgress.total) * 100)
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap pt-0.5">
                      <button
                        type="button"
                        disabled={importing}
                        onClick={() =>
                          void resolvePendingImdbIds(
                            parsed,
                            pendingCandidates.length > 100 ? 100 : undefined
                          )
                        }
                        className="px-3.5 py-1.5 rounded-full bg-watch text-[#0E1A1E] text-xs font-semibold hover:opacity-95 disabled:opacity-40"
                      >
                        {pendingCandidates.length > 100
                          ? 'Resolve latest 100'
                          : `Resolve ${pendingCandidates.length} titles`}
                      </button>
                      {pendingCandidates.length > 100 && (
                        <button
                          type="button"
                          disabled={importing}
                          onClick={() => void resolvePendingImdbIds(parsed)}
                          className="px-3.5 py-1.5 rounded-full bg-surface border border-white/15 text-xs font-semibold text-ink hover:border-white/30 disabled:opacity-40"
                        >
                          Resolve all {pendingCandidates.length}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Search & Type Filter Bar for large resolved lists */}
              {resolvedCandidates.length > 20 && (
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="relative flex-1 min-w-[160px]">
                    <Search className="w-3.5 h-3.5 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={previewQuery}
                      onChange={(e) => {
                        setPreviewQuery(e.target.value);
                        setVisibleCount(60);
                      }}
                      placeholder="Filter resolved titles…"
                      className="w-full rounded-full bg-background border border-white/10 pl-8 pr-3 py-1.5 text-xs text-ink placeholder:text-ink-faint outline-none focus:border-watch"
                    />
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {(
                      [
                        ['all', 'All'],
                        ['movie', 'Movies'],
                        ['show', 'Shows'],
                        ['anime', 'Anime'],
                        ['game', 'Games'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setPreviewFilter(id);
                          setVisibleCount(60);
                        }}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                          previewFilter === id
                            ? 'border-white/30 bg-white/12 text-ink'
                            : 'border-white/8 text-ink-dim hover:text-ink'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Row selection controls */}
              {resolvedCandidates.length > 0 && (
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-ink-dim tabular-nums">
                    {selectedCandidates.length} of {resolvedCandidates.length} resolved selected
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleSelectNewOnly}
                      className="text-ink-dim hover:text-ink font-medium disabled:opacity-40"
                    >
                      New only ({newCount})
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleSelectAll}
                      className="text-ink-dim hover:text-ink font-medium disabled:opacity-40"
                    >
                      Select all
                    </button>
                  </div>
                </div>
              )}

              {/* Candidate List (paginated for large CSVs) */}
              {resolvedCandidates.length > 0 && (
                <div className="max-h-64 overflow-y-auto space-y-2 pr-0.5">
                  {visibleCandidates.map((c) => {
                    const checked = Boolean(selectedMap[c.tempId]);
                    return (
                      <button
                        key={c.tempId}
                        type="button"
                        disabled={importing}
                        onClick={() =>
                          setSelectedMap((prev) => ({ ...prev, [c.tempId]: !prev[c.tempId] }))
                        }
                        className={`w-full text-left rounded-2xl p-3 border flex items-center justify-between gap-3 transition-colors ${
                          checked
                            ? 'bg-background border-white/12'
                            : 'bg-background/50 border-white/[0.04] opacity-65'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`h-5 w-5 rounded-md border flex items-center justify-center shrink-0 ${
                              checked
                                ? 'bg-watch border-watch text-[#0E1A1E]'
                                : 'border-white/25 text-transparent'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" strokeWidth={2.8} />
                          </span>
                          {c.posterUrl && (
                            <img
                              src={c.posterUrl}
                              alt=""
                              loading="lazy"
                              className="w-8 h-11 rounded object-cover shrink-0 bg-surface"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-ink truncate">{c.title}</p>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              <span
                                className={`text-[9.5px] font-semibold uppercase px-1.5 py-[1px] rounded ${domainBadgeClass(
                                  c
                                )}`}
                              >
                                {typeLabel(c)}
                              </span>
                              <span className="text-[11px] text-ink-dim tabular-nums">{c.year}</span>
                              <span className="text-[11px] text-ink-dim">
                                · {c.completed ? (c.kind === 'read' ? 'Finished' : 'Watched') : 'Watchlist'}
                              </span>
                              {c.userRating && (
                                <span className="inline-flex items-center gap-0.5 text-[11px] text-brand tabular-nums">
                                  <Star className="w-3 h-3 fill-brand" />
                                  {c.userRating}/5
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <span
                          className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                            c.existingId
                              ? 'bg-white/8 text-ink-dim'
                              : 'bg-watch/15 text-watch'
                          }`}
                        >
                          {c.existingId ? 'In library' : 'New'}
                        </span>
                      </button>
                    );
                  })}

                  {filteredPreviewCandidates.length > visibleCandidates.length && (
                    <button
                      type="button"
                      onClick={() => setVisibleCount((n) => n + 60)}
                      className="w-full py-2 rounded-xl bg-background border border-white/10 text-xs font-semibold text-ink-dim hover:text-ink"
                    >
                      Show 60 more ({filteredPreviewCandidates.length - visibleCandidates.length} remaining)
                    </button>
                  )}
                </div>
              )}

              {/* Enrichment Progress */}
              {importing && (
                <div className="rounded-xl bg-background border border-white/8 p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-ink font-medium">
                      <Loader2 className="w-3.5 h-3.5 text-watch animate-spin" />
                      <span>
                        Fetching metadata {progressCount.done} / {progressCount.total}…
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        cancelRef.current = true;
                      }}
                      className="text-red-300 font-semibold"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-watch transition-all duration-200"
                      style={{
                        width: `${
                          progressCount.total > 0
                            ? Math.round((progressCount.done / progressCount.total) * 100)
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Footer Action */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-[11px] text-ink-dim">
                  One-click Undo available after import
                </span>
                <button
                  type="button"
                  disabled={busy || selectedCandidates.length === 0}
                  onClick={handleConfirmImport}
                  className="px-5 py-2.5 rounded-full bg-watch text-[#0E1A1E] text-sm font-semibold disabled:opacity-40 hover:opacity-95 transition-opacity"
                >
                  {importing
                    ? 'Importing…'
                    : `Import ${selectedCandidates.length} ${
                        selectedCandidates.length === 1 ? 'title' : 'titles'
                      }`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
