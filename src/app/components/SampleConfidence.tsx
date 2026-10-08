import type { BookEstimate } from "../../../convex/stats";
import { CheckCircleIcon, InfoIcon } from "./icons";

type Status = "chosen" | "wide" | "sendable" | "recommended";

const statusConfig: Record<Status, { bg: string; border: string; badge: string; icon: string; label: string }> = {
  chosen: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    badge: "bg-amber-100 text-amber-700",
    icon: "text-amber-500",
    label: "Hand-picked pages only",
  },
  wide: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    badge: "bg-amber-100 text-amber-700",
    icon: "text-amber-500",
    label: "Not sendable yet",
  },
  sendable: {
    bg: "bg-brand-50",
    border: "border-brand-200",
    badge: "bg-brand-100 text-brand-700",
    icon: "text-brand-500",
    label: "Within ±20%",
  },
  recommended: {
    bg: "bg-green-50",
    border: "border-green-200",
    badge: "bg-green-100 text-green-700",
    icon: "text-green-500",
    label: "Within ±10%",
  },
};

const pages = (n: number) => `${n} ${n === 1 ? "page" : "pages"}`;

/** What's still missing, in random pages: to send (±20%) and for the recommended ±10%. */
function pagesToAdd(estimate: BookEstimate): string | null {
  if (estimate.meetsRecommended) return null;
  if (estimate.sendable) return `${pages(estimate.randomPagesForRecommended)} more for the recommended ±10%`;
  return `${pages(estimate.randomPagesForSendable)} more to send, ${estimate.randomPagesForRecommended} for the recommended ±10%`;
}

export function SampleConfidence({ estimate }: { estimate: BookEstimate }) {
  const status: Status =
    estimate.method === "chosen-pages"
      ? "chosen"
      : estimate.meetsRecommended
        ? "recommended"
        : estimate.sendable
          ? "sendable"
          : "wide";
  const config = statusConfig[status];
  const toAdd = pagesToAdd(estimate);

  return (
    <section aria-labelledby="estimate-heading" className={`rounded-xl border ${config.border} ${config.bg} p-5`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 id="estimate-heading" className="font-display text-lg font-semibold text-stone-900">
            Words per page
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            {estimate.chosenPages} hand-picked, {estimate.randomPages} random {estimate.randomPages === 1 ? "page" : "pages"}
          </p>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${config.badge}`}>{config.label}</span>
      </div>

      {estimate.method === "chosen-pages" && (
        <p className="text-sm text-amber-800 mb-4">
          Hand-picked pages are usually full pages of text, so this reads high: the book also has blank pages, chapter
          openings and illustrations. Photograph the random pages below to correct it.
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: "Words/page", value: estimate.wordsPerPage.toLocaleString() },
          { label: "95% range", value: `${Math.round(estimate.wordsPerPageLow)}–${Math.round(estimate.wordsPerPageHigh)}` },
          { label: "Margin", value: `±${estimate.marginPercent}%` },
          {
            label: "Ordinary pages",
            value: estimate.ordinaryShare === null ? "–" : `${Math.round(estimate.ordinaryShare * 100)}%`,
          },
        ].map((tile) => (
          <div key={tile.label} className="bg-white/60 rounded-lg p-3">
            <div className="text-lg font-bold text-stone-900">{tile.value}</div>
            <div className="text-xs text-stone-500">{tile.label}</div>
          </div>
        ))}
      </div>

      {estimate.pageCountBasis !== null && (
        <div className="bg-white/60 rounded-lg p-3 mb-4">
          <div className="text-xs text-stone-500 mb-1">Estimated total ({estimate.pageCountBasis} pages)</div>
          <div className="text-sm font-medium text-stone-900">{estimate.totalWords!.toLocaleString()} words</div>
          <div className="text-xs text-stone-500 mt-1">
            95% CI: {estimate.totalWordsLow!.toLocaleString()} – {estimate.totalWordsHigh!.toLocaleString()}
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 text-sm">
        {toAdd ? (
          <>
            <InfoIcon className={`w-5 h-5 ${config.icon} flex-shrink-0 mt-0.5`} />
            <div>
              <span className="font-medium text-stone-700">Random pages: {toAdd}</span>
            </div>
          </>
        ) : (
          <>
            <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            <span className="font-medium text-stone-700">Meets the recommended ±10% at 95% confidence</span>
          </>
        )}
      </div>
    </section>
  );
}
