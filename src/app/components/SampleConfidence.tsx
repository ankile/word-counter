"use client";

interface SamplingStats {
  sampleSize: number;
  mean: number;
  stdDev: number;
  cv: number;
  recommendedSampleSize: number;
  additionalPagesNeeded: number;
  confidenceLevel: "low" | "medium" | "high";
  currentMarginPercent: number;
  ciLowerPerPage: number;
  ciUpperPerPage: number;
}

interface SampleConfidenceProps {
  stats: SamplingStats;
  totalBookPages?: number; // If known from Firebase import
}

export function SampleConfidence({ stats, totalBookPages }: SampleConfidenceProps) {
  const confidenceConfig = {
    low: {
      bg: "bg-amber-50",
      border: "border-amber-200",
      badge: "bg-amber-100 text-amber-700",
      icon: "text-amber-500",
      label: "Low Confidence",
    },
    medium: {
      bg: "bg-blue-50",
      border: "border-blue-200",
      badge: "bg-blue-100 text-blue-700",
      icon: "text-blue-500",
      label: "Medium Confidence",
    },
    high: {
      bg: "bg-green-50",
      border: "border-green-200",
      badge: "bg-green-100 text-green-700",
      icon: "text-green-500",
      label: "High Confidence",
    },
  };

  const config = confidenceConfig[stats.confidenceLevel];

  // Calculate estimated total if we know total book pages
  const estimatedTotal = totalBookPages ? Math.round(stats.mean * totalBookPages) : null;
  const ciLowerTotal = totalBookPages ? Math.round(stats.ciLowerPerPage * totalBookPages) : null;
  const ciUpperTotal = totalBookPages ? Math.round(stats.ciUpperPerPage * totalBookPages) : null;

  return (
    <div className={`rounded-xl border ${config.border} ${config.bg} p-5`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Sampling Analysis</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Based on {stats.sampleSize} sampled pages
          </p>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${config.badge}`}>
          {config.label}
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-white/60 rounded-lg p-3">
          <div className="text-lg font-bold text-slate-900">{stats.mean}</div>
          <div className="text-xs text-slate-500">Words/page</div>
        </div>
        <div className="bg-white/60 rounded-lg p-3">
          <div className="text-lg font-bold text-slate-900">±{stats.stdDev}</div>
          <div className="text-xs text-slate-500">Std deviation</div>
        </div>
        <div className="bg-white/60 rounded-lg p-3">
          <div className="text-lg font-bold text-slate-900">{stats.cv}%</div>
          <div className="text-xs text-slate-500">Variation (CV)</div>
        </div>
        <div className="bg-white/60 rounded-lg p-3">
          <div className="text-lg font-bold text-slate-900">±{stats.currentMarginPercent}%</div>
          <div className="text-xs text-slate-500">Current margin</div>
        </div>
      </div>

      {/* Per-page confidence interval */}
      <div className="bg-white/60 rounded-lg p-3 mb-4">
        <div className="text-xs text-slate-500 mb-1">95% CI for words per page</div>
        <div className="text-sm font-medium text-slate-900">
          {stats.ciLowerPerPage.toLocaleString()} – {stats.ciUpperPerPage.toLocaleString()} words
        </div>
      </div>

      {/* Total book estimate if we know total pages */}
      {totalBookPages && estimatedTotal && ciLowerTotal && ciUpperTotal && (
        <div className="bg-white/60 rounded-lg p-3 mb-4">
          <div className="text-xs text-slate-500 mb-1">
            Estimated total ({totalBookPages} pages)
          </div>
          <div className="text-sm font-medium text-slate-900">
            {estimatedTotal.toLocaleString()} words
          </div>
          <div className="text-xs text-slate-500 mt-1">
            95% CI: {ciLowerTotal.toLocaleString()} – {ciUpperTotal.toLocaleString()}
          </div>
        </div>
      )}

      {/* Recommendation */}
      {stats.additionalPagesNeeded > 0 ? (
        <div className="flex items-start gap-2 text-sm">
          <svg className={`w-5 h-5 ${config.icon} flex-shrink-0 mt-0.5`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <span className="font-medium text-slate-700">
              Add ~{stats.additionalPagesNeeded} more pages
            </span>
            <span className="text-slate-500"> for ±10% precision at 95% confidence</span>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2 text-sm">
          <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-slate-700">
            <span className="font-medium">Sample size is sufficient</span>
            <span className="text-slate-500"> for ±10% precision at 95% confidence</span>
          </div>
        </div>
      )}

      {/* Progress bar showing sample size vs recommended */}
      <div className="mt-4">
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span>Sample progress</span>
          <span>{stats.sampleSize} / {stats.recommendedSampleSize} pages</span>
        </div>
        <div className="h-2 bg-white/60 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              stats.confidenceLevel === "high"
                ? "bg-green-500"
                : stats.confidenceLevel === "medium"
                ? "bg-blue-500"
                : "bg-amber-500"
            }`}
            style={{
              width: `${Math.min(100, (stats.sampleSize / stats.recommendedSampleSize) * 100)}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
