import { useState } from 'react';
import { CalendarCheck2, Check, Pencil, X } from 'lucide-react';

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Formats an ISO or YYYY-MM-DD date string cleanly without local timezone day drift. */
export function formatFinishedDate(iso?: string): string | null {
  if (!iso) return null;
  const trimmed = iso.trim();
  const ymd = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    const year = Number(ymd[1]);
    const monthIdx = Number(ymd[2]) - 1;
    const day = Number(ymd[3]);
    if (monthIdx >= 0 && monthIdx < 12 && day >= 1 && day <= 31) {
      return `${MONTH_NAMES[monthIdx]} ${day}, ${year}`;
    }
  }
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Extracts a safe YYYY-MM-DD value for native <input type="date"> controls. */
export function toDateInputValue(iso?: string): string {
  if (!iso) return new Date().toISOString().slice(0, 10);
  const ymd = iso.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (ymd) return ymd[1];
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

interface FinishedDateRowProps {
  isFinished: boolean;
  finishedAt?: string;
  fallbackDate?: string;
  verbLabel?: 'Finished' | 'Watched' | 'Completed';
  onChangeDate: (ymd: string) => void;
  onMarkFinished?: () => void;
}

/** Clean inline completion date display & editor bar for Advanced detail cards. */
export function FinishedDateRow({
  isFinished,
  finishedAt,
  fallbackDate,
  verbLabel = 'Finished',
  onChangeDate,
  onMarkFinished,
}: FinishedDateRowProps) {
  const effectiveDate = finishedAt || (isFinished ? fallbackDate : undefined);
  const formatted = formatFinishedDate(effectiveDate);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => toDateInputValue(effectiveDate));

  const openEditor = () => {
    setDraft(toDateInputValue(effectiveDate));
    setEditing(true);
  };

  if (!isFinished) {
    return (
      <div className="rounded-2xl bg-background/45 border border-white/[0.06] px-3.5 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-ink-faint">
          <CalendarCheck2 className="w-3.5 h-3.5 shrink-0" />
          <span>Not {verbLabel.toLowerCase()} yet</span>
        </div>
        {onMarkFinished && (
          <button
            type="button"
            onClick={onMarkFinished}
            className="text-xs font-semibold text-watched hover:opacity-85 transition-opacity inline-flex items-center gap-1"
          >
            <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
            <span>Mark {verbLabel.toLowerCase()}</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-background/55 border border-white/[0.07] px-3.5 py-2.5 space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarCheck2 className="w-4 h-4 text-watched shrink-0" />
          <p className="text-xs font-medium text-ink truncate">
            {formatted ? (
              <>
                <span className="text-ink-dim">{verbLabel} </span>
                <span className="font-semibold text-ink tabular-nums">{formatted}</span>
              </>
            ) : (
              <span className="text-ink-dim">{verbLabel} · Date not set</span>
            )}
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={openEditor}
            aria-label={`Edit ${verbLabel.toLowerCase()} date`}
            className="px-2.5 py-1 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-[11px] font-semibold text-ink-dim hover:text-ink inline-flex items-center gap-1 transition-colors shrink-0"
          >
            <Pencil className="w-3 h-3" />
            <span>Edit date</span>
          </button>
        )}
      </div>

      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (draft) onChangeDate(draft);
            setEditing(false);
          }}
          className="flex items-center gap-2 flex-wrap pt-1 border-t border-white/[0.06]"
        >
          <input
            type="date"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={`${verbLabel} date`}
            className="[color-scheme:dark] flex-1 min-w-[140px] rounded-xl bg-surface border border-white/12 px-3 py-1.5 text-xs text-ink outline-none focus:border-brand"
          />
          <button
            type="button"
            onClick={() => setDraft(new Date().toISOString().slice(0, 10))}
            className="px-2.5 py-1.5 rounded-xl bg-white/8 text-[11px] font-semibold text-ink-dim hover:text-ink"
          >
            Today
          </button>
          <button
            type="submit"
            disabled={!draft}
            className="px-3 py-1.5 rounded-xl bg-brand text-brand-ink text-xs font-semibold disabled:opacity-40"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            aria-label="Cancel editing date"
            className="h-7 w-7 rounded-full bg-white/8 flex items-center justify-center text-ink-dim hover:text-ink"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </form>
      )}
    </div>
  );
}
