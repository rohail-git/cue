import { RotateCcw, Star, X } from 'lucide-react';
import type { RatingSource } from '../types';
import { formatRating, roundRatingTenth } from '../utils/ratings';

interface RatingControlProps {
  value?: number;
  onChange: (next: number | undefined) => void;
  size?: 'sm' | 'md';
  labelPrefix?: string;
  allowClear?: boolean;
}

export function RatingControl({
  value = 0,
  onChange,
  size = 'md',
  labelPrefix = 'Rate',
  allowClear = false,
}: RatingControlProps) {
  const iconClass = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  const handleStarClick = (star: number) => {
    if (value === star) {
      onChange(star - 0.5);
    } else if (value === star - 0.5) {
      onChange(star);
    } else {
      onChange(star);
    }
  };

  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => {
        const full = value >= star;
        const half = !full && value >= star - 0.5;
        return (
          <button
            key={star}
            type="button"
            onClick={() => handleStarClick(star)}
            aria-label={`${labelPrefix} ${star} stars`}
            title="Tap again for half-star"
            className="p-0.5 hover:scale-110 transition-transform relative inline-flex items-center justify-center"
          >
            <Star
              className={`${iconClass} ${
                full ? 'text-brand fill-brand' : 'text-ink-faint'
              }`}
            />
            {half && (
              <span className="absolute inset-y-0.5 left-0.5 w-1/2 overflow-hidden pointer-events-none">
                <Star className={`${iconClass} text-brand fill-brand`} />
              </span>
            )}
          </button>
        );
      })}
      {value > 0 && (
        <span className="ml-1 text-[11px] font-semibold text-brand tabular-nums">
          {formatRating(value)}
        </span>
      )}
      {allowClear && value > 0 && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          aria-label="Clear rating"
          className="ml-0.5 p-0.5 rounded-full text-ink-faint hover:text-ink"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

interface SuggestedRatingBannerProps {
  label: string;
  calculatedAvg: number;
  ratedCount: number;
  unitWord: string;
  currentRating?: number;
  ratingSource?: RatingSource;
  onAcceptAvg: (suggested: number) => void;
  onManualRate: (rating: number | undefined) => void;
  compact?: boolean;
}

export function SuggestedRatingBanner({
  label,
  calculatedAvg,
  ratedCount,
  unitWord,
  currentRating,
  ratingSource,
  onAcceptAvg,
  onManualRate,
  compact = false,
}: SuggestedRatingBannerProps) {
  const suggested = roundRatingTenth(calculatedAvg);
  const needsAccept =
    !currentRating || (ratingSource !== 'auto' && Math.abs(currentRating - suggested) >= 0.05);

  return (
    <div
      className={`rounded-2xl bg-surface border border-white/[0.06] ${
        compact ? 'px-3 py-2.5' : 'p-3.5'
      } flex items-center justify-between gap-3 flex-wrap`}
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold text-ink">
          {label} · Calculated avg:{' '}
          <span className="text-brand tabular-nums">{calculatedAvg.toFixed(2)}</span>{' '}
          <span className="text-ink-dim font-normal">
            (from {ratedCount} {ratedCount === 1 ? unitWord.replace(/s$/, '') : unitWord})
          </span>
        </p>
        {typeof currentRating === 'number' && currentRating > 0 && (
          <p className="text-[11px] text-ink-dim mt-0.5">
            Your rating:{' '}
            <span className="text-ink font-semibold tabular-nums">
              {formatRating(currentRating)}
            </span>{' '}
            <span>({ratingSource === 'manual' ? 'manual override' : 'from avg'})</span>
          </p>
        )}
      </div>

      <div className="flex items-center gap-2.5 flex-wrap shrink-0">
        <RatingControl
          size="sm"
          value={currentRating}
          onChange={(r) => onManualRate(r)}
          labelPrefix={`Override ${label} rating`}
          allowClear
        />
        {needsAccept && (
          <button
            type="button"
            onClick={() => onAcceptAvg(suggested)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand text-brand-ink text-[11px] font-semibold hover:opacity-90 transition-opacity"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Use {suggested.toFixed(1)}</span>
          </button>
        )}
      </div>
    </div>
  );
}
