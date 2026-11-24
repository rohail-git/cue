import { Layers3, Repeat2, Sparkles } from 'lucide-react';
import type { DetailCardMode } from '../types';

interface DetailModeToggleProps {
  mode: DetailCardMode;
  onChange: (next: DetailCardMode) => void;
}

export function DetailModeToggle({ mode, onChange }: DetailModeToggleProps) {
  const isAdvanced = mode === 'advanced';

  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <button
        type="button"
        onClick={() => onChange(isAdvanced ? 'simple' : 'advanced')}
        aria-label={isAdvanced ? 'Flip to Simple view' : 'Flip to Advanced view'}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-dim hover:text-ink transition-colors"
      >
        <Repeat2 className="w-3.5 h-3.5 text-brand" />
        <span>{isAdvanced ? 'Advanced view' : 'Simple view'}</span>
      </button>

      <div
        role="group"
        aria-label="Detail card mode"
        className="inline-flex items-center rounded-full bg-surface border border-white/10 p-0.5"
      >
        <button
          type="button"
          onClick={() => onChange('simple')}
          aria-pressed={!isAdvanced}
          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
            !isAdvanced
              ? 'bg-brand text-brand-ink'
              : 'text-ink-dim hover:text-ink'
          }`}
        >
          <Sparkles className="w-3 h-3" />
          <span>Simple</span>
        </button>
        <button
          type="button"
          onClick={() => onChange('advanced')}
          aria-pressed={isAdvanced}
          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
            isAdvanced
              ? 'bg-brand text-brand-ink'
              : 'text-ink-dim hover:text-ink'
          }`}
        >
          <Layers3 className="w-3 h-3" />
          <span>Advanced</span>
        </button>
      </div>
    </div>
  );
}
