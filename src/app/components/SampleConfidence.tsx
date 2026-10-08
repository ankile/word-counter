import type { ConfidenceLevel, SamplingStats } from "../../../convex/stats";
import { CheckCircleIcon, InfoIcon } from "./icons";

const confidenceConfig: Record<
  ConfidenceLevel,
  { bg: string; border: string; badge: string; icon: string; bar: string; label: string }
> = {
  low: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    badge: "bg-amber-100 text-amber-700",
    icon: "text-amber-500",
    bar: "bg-amber-500",
    label: "Low Confidence",
  },
  medium: {
    bg: "bg-brand-50",
    border: "border-brand-200",
    badge: "bg-brand-100 text-brand-700",
    icon: "text-brand-500",
    bar: "bg-brand-500",
    label: "Medium Confidence",
  },
  high: {
    bg: "bg-green-50",
    border: "border-green-200",
    badge: "bg-green-100 text-green-700",
    icon: "text-green-500",
    bar: "bg-green-500",
    label: "High Confidence",
  },
};

interface SampleConfidenceProps {
  stats: SamplingStats;
  totalBookPages?: number; // If known from Firebase import
}

export function SampleConfidence({ stats, totalBookPages }: SampleConfidenceProps) {
  const config = confidenceConfig[stats.confidenceLevel];

  return (
    <div className={`rounded-xl border ${config.border} ${config.bg} p-5`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-display text-lg font-semibold text-stone-900">Sampling Analysis</h3>
          <p className="text-xs text-stone-500 mt-0.5">Based on {stats.sampleSize} sampled pages</p>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${config.badge}`}>{config.label}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: "Words/page", value: stats.mean },
          { label: "Std deviation", value: `±${stats.stdDev}` },
          { label: "Variation (CV)", value: `${stats.cvPercent}%` },
          { label: "Current margin", value: `±${stats.currentMarginPercent}%` },
        ].map((tile) => (
          <div key={tile.label} className="bg-white/60 rounded-lg p-3">
            <div className="text-lg font-bold text-stone-900">{tile.value}</div>
            <div className="text-xs text-stone-500">{tile.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white/60 rounded-lg p-3 mb-4">
        <div className="text-xs text-stone-500 mb-1">95% CI for words per page</div>
        <div className="text-sm font-medium text-stone-900">
          {stats.ciLowerPerPage.toLocaleString()} – {stats.ciUpperPerPage.toLocaleString()} words
        </div>
      </div>

      {totalBookPages !== undefined && (
        <div className="bg-white/60 rounded-lg p-3 mb-4">
          <div className="text-xs text-stone-500 mb-1">Estimated total ({totalBookPages} pages)</div>
          <div className="text-sm font-medium text-stone-900">
            {Math.round(stats.mean * totalBookPages).toLocaleString()} words
          </div>
          <div className="text-xs text-stone-500 mt-1">
            95% CI: {(stats.ciLowerPerPage * totalBookPages).toLocaleString()} –{" "}
            {(stats.ciUpperPerPage * totalBookPages).toLocaleString()}
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 text-sm">
        {stats.additionalPagesNeeded > 0 ? (
          <>
            <InfoIcon className={`w-5 h-5 ${config.icon} flex-shrink-0 mt-0.5`} />
            <div>
              <span className="font-medium text-stone-700">Add ~{stats.additionalPagesNeeded} more pages</span>
              <span className="text-stone-500"> for ±10% precision at 95% confidence</span>
            </div>
          </>
        ) : (
          <>
            <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-medium text-stone-700">Sample size is sufficient</span>
              <span className="text-stone-500"> for ±10% precision at 95% confidence</span>
            </div>
          </>
        )}
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-xs text-stone-500 mb-1">
          <span>Sample progress</span>
          <span>
            {stats.sampleSize} / {stats.recommendedSampleSize} pages
          </span>
        </div>
        <div className="h-2 bg-white/60 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${config.bar}`}
            style={{ width: `${Math.min(100, (stats.sampleSize / stats.recommendedSampleSize) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
