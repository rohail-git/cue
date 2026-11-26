import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ChevronRight,
  HeartPulse,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { useCueStore } from '../store/useCueStore';
import { computeCueMind, type CueMindThought, type MindIntent } from '../utils/cueMind';
import {
  fetchLiveHealth,
  scanAndRepairLibrary,
  type LibraryRepairProgress,
  type LibraryRepairSummary,
  type LiveHealthReport,
} from '../utils/libraryHeal';
import { MediaImage } from './MediaImage';

const INTENT_TABS: Array<{ id: MindIntent; label: string }> = [
  { id: 'auto', label: 'Smart' },
  { id: 'quick', label: 'Quick' },
  { id: 'deep', label: 'Deep' },
  { id: 'finish', label: 'Finish' },
];

export function CueMindCard() {
  const { state, pushRoute, switchTab, patchMediaMetadata, showToast } = useCueStore();

  const [intent, setIntent] = useState<MindIntent>('auto');
  const [thoughtIndex, setThoughtIndex] = useState(0);
  const [healthOpen, setHealthOpen] = useState(false);

  const [health, setHealth] = useState<LiveHealthReport | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(true);

  const [repairing, setRepairing] = useState(false);
  const [repairProgress, setRepairProgress] = useState<LibraryRepairProgress | null>(null);
  const [repairSummary, setRepairSummary] = useState<LibraryRepairSummary | null>(null);

  const snapshot = useMemo(() => computeCueMind(state, intent), [state, intent]);
  const activeThought: CueMindThought =
    snapshot.thoughts[thoughtIndex % snapshot.thoughts.length] || snapshot.thoughts[0];

  const loadHealth = async (force = false) => {
    setLoadingHealth(true);
    const report = await fetchLiveHealth(force);
    setHealth(report);
    setLoadingHealth(false);
  };

  useEffect(() => {
    let cancelled = false;
    fetchLiveHealth(false).then((report) => {
      if (!cancelled) {
        setHealth(report);
        setLoadingHealth(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRunSelfHeal = async () => {
    if (repairing) return;
    setRepairing(true);
    setRepairSummary(null);
    setRepairProgress({ done: 0, total: 1, currentTitle: 'Scanning library…' });
    try {
      const summary = await scanAndRepairLibrary(state, patchMediaMetadata, (p) => {
        setRepairProgress(p);
      });
      setRepairSummary(summary);
      if (summary.repaired > 0 || summary.clearedStaleComics > 0) {
        showToast(
          `Self-healed ${summary.repaired} covers & ${summary.clearedStaleComics} comic caches`,
          undefined,
          undefined,
          { domain: 'watch', subtitle: 'Cue Mind Integrity' }
        );
      } else {
        showToast(`Verified ${summary.scanned} library items — all healthy`);
      }
    } finally {
      setRepairing(false);
      setRepairProgress(null);
    }
  };

  const handleOpenThoughtTarget = (thought: CueMindThought) => {
    if (thought.requiresHeal) {
      setHealthOpen(true);
      handleRunSelfHeal();
      return;
    }
    const tgt = thought.target;
    if (!tgt) {
      switchTab('search');
      return;
    }
    if (tgt.kind === 'show') pushRoute({ view: 'show-detail', showId: tgt.id });
    else if (tgt.kind === 'movie') pushRoute({ view: 'movie-detail', movieId: tgt.id });
    else if (tgt.kind === 'read') pushRoute({ view: 'read-detail', readId: tgt.id });
    else if (tgt.kind === 'game') pushRoute({ view: 'game-detail', gameId: tgt.id });
    else pushRoute({ view: 'list-detail', listId: tgt.id });
  };

  const domainTagColor =
    activeThought.domain === 'watch'
      ? 'bg-watch/15 text-watch'
      : activeThought.domain === 'read'
        ? 'bg-read/15 text-read'
        : activeThought.domain === 'play'
          ? 'bg-play/15 text-play'
          : 'bg-white/10 text-ink';

  const statusDotClass = loadingHealth
    ? 'bg-ink-dim animate-pulse'
    : health?.status === 'operational'
      ? 'bg-[#7AC7A4]'
      : health?.status === 'degraded'
        ? 'bg-read'
        : 'bg-red-400';

  const statusText = loadingHealth
    ? 'Checking APIs…'
    : health
      ? `Live · ${health.onlineCount}/${health.totalCount} APIs · ${health.overallLatencyMs}ms`
      : 'Offline cache';

  return (
    <section
      aria-label="Cue Mind"
      className="rounded-[22px] bg-surface border border-white/[0.06] p-4 mb-6 space-y-3"
    >
      {/* Top Header: Cue Mind + Live Telemetry Toggle */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-brand">
            <Sparkles className="w-3.5 h-3.5" />
            Cue Mind
          </span>
          <span className="text-[11px] text-ink-faint">· {snapshot.greeting}</span>
        </div>

        <button
          type="button"
          onClick={() => setHealthOpen((v) => !v)}
          aria-expanded={healthOpen}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background border border-white/10 hover:border-white/25 text-[11px] font-medium text-ink transition-colors"
        >
          <span className={`h-2 w-2 rounded-full shrink-0 ${statusDotClass}`} />
          <span className="tabular-nums">{statusText}</span>
        </button>
      </div>

      {/* Intent Chips & Thought Cyclers */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {INTENT_TABS.map((t) => {
            const active = intent === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setIntent(t.id);
                  setThoughtIndex(0);
                }}
                aria-pressed={active}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border shrink-0 transition-colors ${
                  active
                    ? 'bg-white/15 border-white/30 text-ink'
                    : 'bg-background border-white/8 text-ink-dim hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {snapshot.thoughts.length > 1 && (
          <button
            type="button"
            onClick={() => setThoughtIndex((i) => (i + 1) % snapshot.thoughts.length)}
            aria-label="Next thought"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-dim hover:text-ink shrink-0"
          >
            <RefreshCw className="w-3 h-3" />
            <span className="tabular-nums">
              {(thoughtIndex % snapshot.thoughts.length) + 1}/{snapshot.thoughts.length}
            </span>
          </button>
        )}
      </div>

      {/* Active Mind Suggestion */}
      <div className="rounded-[16px] bg-background/70 border border-white/[0.05] p-3 flex items-center gap-3">
        {activeThought.target?.posterUrl && (
          <button
            type="button"
            onClick={() => handleOpenThoughtTarget(activeThought)}
            className="w-12 h-[70px] rounded-xl overflow-hidden bg-surface-raised border border-white/8 shrink-0"
          >
            <MediaImage
              src={activeThought.target.posterUrl}
              alt={activeThought.target.title}
              className="w-full h-full object-cover"
            />
          </button>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span
              className={`text-[9.5px] font-semibold uppercase tracking-wide px-1.5 py-[2px] rounded leading-none ${domainTagColor}`}
            >
              {activeThought.tag}
            </span>
          </div>
          <p className="font-display font-bold text-[15px] text-ink leading-snug truncate">
            {activeThought.headline}
          </p>
          <p className="text-xs text-ink-dim leading-relaxed line-clamp-2 mt-0.5">
            {activeThought.reason}
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleOpenThoughtTarget(activeThought)}
          aria-label={activeThought.actionLabel}
          className="h-9 px-3 rounded-full bg-surface border border-white/12 hover:border-brand text-xs font-semibold text-ink inline-flex items-center gap-1 shrink-0 transition-colors"
        >
          <span className="hidden sm:inline">{activeThought.actionLabel}</span>
          <ChevronRight className="w-4 h-4 text-brand" />
        </button>
      </div>

      <p className="text-[11px] text-ink-faint px-0.5">{snapshot.balanceNote}</p>

      {/* Expandable Live System Health & Self-Heal Panel */}
      {healthOpen && (
        <div className="pt-3 border-t border-white/[0.06] space-y-3 animate-fade-in">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <HeartPulse className="w-3.5 h-3.5 text-[#7AC7A4]" />
              <span className="text-xs font-semibold text-ink">Upstream Catalog Health</span>
            </div>
            <button
              type="button"
              onClick={() => loadHealth(true)}
              disabled={loadingHealth}
              className="text-[11px] font-medium text-ink-dim hover:text-ink inline-flex items-center gap-1 disabled:opacity-50"
            >
              {loadingHealth ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              <span>Re-check</span>
            </button>
          </div>

          {health && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {health.services.map((svc) => (
                <div
                  key={svc.id}
                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-background/60 border border-white/[0.04] text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`h-2 w-2 rounded-full shrink-0 ${
                        svc.ok ? 'bg-[#7AC7A4]' : 'bg-red-400'
                      }`}
                    />
                    <span className="text-ink truncate">{svc.name}</span>
                  </div>
                  <span className="text-[11px] text-ink-faint tabular-nums shrink-0">
                    {svc.ok ? `${svc.latencyMs}ms` : svc.note || 'Down'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Self-Healing Bar */}
          <div className="rounded-xl bg-background/70 border border-white/[0.05] p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-watch" />
                <div>
                  <p className="text-xs font-semibold text-ink">Library Integrity & Self-Heal</p>
                  <p className="text-[11px] text-ink-dim">
                    Probes saved covers and refreshes broken URLs or outdated comic caches.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRunSelfHeal}
                disabled={repairing}
                className="px-3 py-1.5 rounded-full bg-brand text-brand-ink text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {repairing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wrench className="w-3.5 h-3.5" />
                )}
                <span>{repairing ? 'Scanning…' : 'Scan & Self-Heal'}</span>
              </button>
            </div>

            {repairProgress && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-ink-dim tabular-nums">
                  <span className="truncate">Checking {repairProgress.currentTitle}</span>
                  <span>
                    {repairProgress.done}/{repairProgress.total}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-watch transition-all duration-200"
                    style={{
                      width: `${Math.round(
                        (repairProgress.done / Math.max(1, repairProgress.total)) * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {repairSummary && !repairing && (
              <p className="text-[11px] text-[#7AC7A4] flex items-center gap-1.5 tabular-nums">
                <Activity className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Scanned {repairSummary.scanned} items · {repairSummary.healthy} healthy ·{' '}
                  {repairSummary.repaired} covers repaired · {repairSummary.clearedStaleComics}{' '}
                  comic caches refreshed
                </span>
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
