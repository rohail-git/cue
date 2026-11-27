import { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import { MediaImage } from './MediaImage';
import { useModalBackHandler } from '../store/useCueStore';
import { extractCountFromPastedText } from '../utils/fixInfoParser';

export interface FixMediaRefreshResult {
  total?: number;
  status?: 'ongoing' | 'completed' | 'hiatus';
  sourceLabel?: string;
  message?: string;
}

export interface FixMediaSavePatch {
  totalUnits?: number;
  title?: string;
  creator?: string;
  year?: number;
  coverUrl?: string;
}

export function FixMediaInfoModal({
  open,
  onClose,
  kind,
  title,
  creator,
  year,
  coverUrl,
  unitLabel,
  currentTotal,
  totalSource,
  publicationStatus,
  refreshLabel,
  onRefreshLive,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  kind: 'read' | 'show';
  title: string;
  creator?: string;
  year?: number;
  coverUrl?: string;
  unitLabel: 'chapters' | 'issues' | 'episodes';
  currentTotal: number;
  totalSource?: 'api' | 'estimated' | 'manual';
  publicationStatus?: 'ongoing' | 'completed' | 'hiatus';
  refreshLabel?: string;
  onRefreshLive?: () => Promise<FixMediaRefreshResult | null>;
  onSave: (patch: FixMediaSavePatch) => void;
}) {
  const [countDraft, setCountDraft] = useState(String(currentTotal));
  const [pasteDraft, setPasteDraft] = useState('');
  const [pasteStatus, setPasteStatus] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFeedback, setRefreshFeedback] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const [creatorDraft, setCreatorDraft] = useState(creator || '');
  const [yearDraft, setYearDraft] = useState(year ? String(year) : '');
  const [coverDraft, setCoverDraft] = useState(coverUrl || '');

  useModalBackHandler(open, onClose);

  useEffect(() => {
    if (!open) return;
    setCountDraft(String(currentTotal));
    setPasteDraft('');
    setPasteStatus(null);
    setRefreshing(false);
    setRefreshFeedback(null);
    setDetailsOpen(false);
    setTitleDraft(title);
    setCreatorDraft(creator || '');
    setYearDraft(year ? String(year) : '');
    setCoverDraft(coverUrl || '');
  }, [open, currentTotal, title, creator, year, coverUrl]);

  if (!open) return null;

  const bumpCount = (delta: number) => {
    const cur = Math.max(1, Math.round(Number(countDraft) || currentTotal || 1));
    setCountDraft(String(Math.min(10000, cur + delta)));
  };

  const handleRefresh = async () => {
    if (!onRefreshLive || refreshing) return;
    setRefreshing(true);
    setRefreshFeedback(null);
    try {
      const res = await onRefreshLive();
      if (res?.total && res.total > 0) {
        setCountDraft(String(res.total));
        const statusBit = res.status ? ` · ${res.status}` : '';
        const srcBit = res.sourceLabel ? ` (${res.sourceLabel})` : '';
        setRefreshFeedback(
          res.message || `Updated to ${res.total.toLocaleString()} ${unitLabel}${statusBit}${srcBit}`
        );
      } else if (res?.message) {
        setRefreshFeedback(res.message);
      } else {
        setRefreshFeedback(`No newer ${unitLabel} count returned — adjust manually or paste below.`);
      }
    } catch {
      setRefreshFeedback('Could not reach live sources right now. Set the count below.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleExtractPaste = () => {
    const extracted = extractCountFromPastedText(pasteDraft, unitLabel);
    if (extracted !== null) {
      setCountDraft(String(extracted));
      setPasteStatus(`Found ${extracted.toLocaleString()} ${unitLabel}`);
    } else {
      setPasteStatus(`Couldn't find a ${unitLabel} count in that snippet.`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedCount = Math.round(Number(countDraft));
    const parsedYear = Number(yearDraft);
    const patch: FixMediaSavePatch = {};
    if (Number.isFinite(parsedCount) && parsedCount >= 1 && parsedCount !== currentTotal) {
      patch.totalUnits = Math.min(10000, parsedCount);
    }
    if (titleDraft.trim() && titleDraft.trim() !== title) {
      patch.title = titleDraft.trim();
    }
    if (kind === 'read' && creatorDraft.trim() && creatorDraft.trim() !== (creator || '')) {
      patch.creator = creatorDraft.trim();
    }
    if (
      yearDraft.trim() &&
      Number.isFinite(parsedYear) &&
      parsedYear >= 1900 &&
      parsedYear !== year
    ) {
      patch.year = parsedYear;
    }
    if (coverDraft.trim() !== (coverUrl || '').trim()) {
      patch.coverUrl = coverDraft.trim();
    }
    onSave(patch);
    onClose();
  };

  const statusTag =
    totalSource === 'manual'
      ? 'Locked by your fix'
      : totalSource === 'estimated'
        ? 'Fallback estimate — verify or sync'
        : publicationStatus === 'ongoing'
          ? 'Ongoing series'
          : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/75 backdrop-blur-sm p-0 md:p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-lg max-h-[90dvh] overflow-y-auto bg-surface-raised border border-white/10 rounded-t-[28px] md:rounded-[26px] p-5 space-y-4 shadow-2xl animate-sheet-up"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Wrench className="w-4 h-4 text-brand shrink-0" />
              <h3 className="font-display font-bold text-lg text-ink">Fix info &amp; count</h3>
            </div>
            <p className="text-xs text-ink-dim truncate mt-0.5">{title}</p>
            {statusTag && (
              <p className="text-[11px] text-ink-faint mt-0.5">{statusTag}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-8 w-8 rounded-full bg-white/8 flex items-center justify-center text-ink-dim hover:text-ink shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {onRefreshLive && (
          <div className="rounded-2xl bg-surface border border-white/[0.08] p-3.5 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs font-medium text-ink">
                Pull latest count from live databases
              </p>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand/15 border border-brand/35 text-xs font-semibold text-brand hover:bg-brand/25 transition-colors disabled:opacity-50"
              >
                {refreshing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span>{refreshLabel || 'Check live count'}</span>
              </button>
            </div>
            {refreshFeedback && (
              <p className="text-[11.5px] text-ink-dim leading-snug">{refreshFeedback}</p>
            )}
          </div>
        )}

        <div className="rounded-2xl bg-surface border border-white/[0.08] p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="fix-total-units"
              className="text-xs font-semibold uppercase tracking-wider text-ink-dim"
            >
              Total {unitLabel}
            </label>
            <span className="text-[11px] text-ink-faint">
              Saved overrides stay locked
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="fix-total-units"
              type="number"
              min={1}
              max={10000}
              value={countDraft}
              onChange={(e) => setCountDraft(e.target.value)}
              className="flex-1 min-w-0 rounded-xl bg-background border border-white/12 px-3 py-2 text-sm font-semibold text-ink tabular-nums outline-none focus:border-brand"
            />
            <button
              type="button"
              onClick={() => bumpCount(1)}
              className="px-3 py-2 rounded-xl bg-white/8 hover:bg-white/12 text-xs font-semibold text-ink shrink-0 tabular-nums"
            >
              +1
            </button>
            <button
              type="button"
              onClick={() => bumpCount(10)}
              className="px-3 py-2 rounded-xl bg-white/8 hover:bg-white/12 text-xs font-semibold text-ink shrink-0 tabular-nums"
            >
              +10
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-surface border border-white/[0.08] p-3.5 space-y-2">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-brand shrink-0" />
            <label
              htmlFor="fix-paste-snippet"
              className="text-xs font-semibold text-ink"
            >
              Quick paste from Google / Wiki
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="fix-paste-snippet"
              type="text"
              value={pasteDraft}
              onChange={(e) => {
                setPasteDraft(e.target.value);
                if (pasteStatus) setPasteStatus(null);
              }}
              placeholder={`e.g. "1,199 released ${unitLabel}..."`}
              className="flex-1 min-w-0 rounded-xl bg-background border border-white/12 px-3 py-2 text-xs text-ink placeholder:text-ink-faint outline-none focus:border-brand"
            />
            <button
              type="button"
              onClick={handleExtractPaste}
              disabled={!pasteDraft.trim()}
              className="px-3 py-2 rounded-xl bg-surface-raised border border-white/12 text-xs font-semibold text-ink hover:border-brand disabled:opacity-40 shrink-0"
            >
              Extract
            </button>
          </div>
          {pasteStatus && (
            <p className="text-[11px] text-ink-dim">{pasteStatus}</p>
          )}
        </div>

        <div className="rounded-2xl bg-surface border border-white/[0.08] overflow-hidden">
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-ink-dim hover:text-ink"
          >
            <span>Edit title, cover &amp; details</span>
            {detailsOpen ? (
              <ChevronUp className="w-4 h-4 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 shrink-0" />
            )}
          </button>

          {detailsOpen && (
            <div className="px-3.5 pb-3.5 pt-1 space-y-2.5 border-t border-white/[0.06]">
              <div>
                <label className="block text-[11px] text-ink-dim mb-1">Title</label>
                <input
                  type="text"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  className="w-full rounded-xl bg-background border border-white/12 px-3 py-2 text-xs text-ink outline-none focus:border-brand"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {kind === 'read' && (
                  <div>
                    <label className="block text-[11px] text-ink-dim mb-1">
                      Author / Publisher
                    </label>
                    <input
                      type="text"
                      value={creatorDraft}
                      onChange={(e) => setCreatorDraft(e.target.value)}
                      className="w-full rounded-xl bg-background border border-white/12 px-3 py-2 text-xs text-ink outline-none focus:border-brand"
                    />
                  </div>
                )}
                <div className={kind === 'read' ? '' : 'col-span-2'}>
                  <label className="block text-[11px] text-ink-dim mb-1">Year</label>
                  <input
                    type="number"
                    min={1900}
                    max={2100}
                    value={yearDraft}
                    onChange={(e) => setYearDraft(e.target.value)}
                    className="w-full rounded-xl bg-background border border-white/12 px-3 py-2 text-xs text-ink tabular-nums outline-none focus:border-brand"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-ink-dim mb-1">
                  Cover image URL
                </label>
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-[52px] rounded-lg overflow-hidden bg-background border border-white/10 shrink-0">
                    <MediaImage
                      src={coverDraft}
                      alt={titleDraft || title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <input
                    type="url"
                    value={coverDraft}
                    onChange={(e) => setCoverDraft(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 min-w-0 rounded-xl bg-background border border-white/12 px-3 py-2 text-xs text-ink placeholder:text-ink-faint outline-none focus:border-brand"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          type="submit"
          className="w-full py-2.5 rounded-full bg-brand text-brand-ink text-sm font-semibold hover:opacity-95 transition-opacity"
        >
          Save changes
        </button>
      </form>
    </div>
  );
}
