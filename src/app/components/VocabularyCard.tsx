"use client";

import { useEffect, useRef, useState } from "react";
import {
  growthCurveAt,
  growthCurveMarginal,
  MIN_VOCABULARY_PAGES,
  type VocabularyStats,
} from "../../../convex/vocabulary";

const SERIES = "#2a78d6";
const GRID = "#e2e8f0";
const AXIS_TEXT = "#64748b";
const HEIGHT = 240;
const MARGIN = { top: 16, right: 16, bottom: 36, left: 44 };

const fmt = (x: number) => Math.round(x).toLocaleString();

/** Width of an element, tracked across resizes (so chart text renders at real pixel size). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Integer pages to draw the curve through: every page early on, then log-spaced to the end. */
function curvePages(lastPage: number): number[] {
  const pages = new Set<number>();
  for (let p = 1; p <= Math.min(lastPage, 60); p++) pages.add(p);
  for (let i = 0; i <= 120; i++) pages.add(Math.round(Math.exp((Math.log(lastPage) * i) / 120)));
  return [...pages].filter((p) => p >= 1 && p <= lastPage).sort((a, b) => a - b);
}

function niceMax(value: number): number {
  const step = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / step) * step;
}

function GrowthChart({ stats }: { stats: VocabularyStats }) {
  const [containerRef, width] = useWidth<HTMLDivElement>();
  const [hoverPage, setHoverPage] = useState<number | null>(null);
  const n = stats.sampledPages;
  const lastPage = stats.projection?.totalPages ?? n;

  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const yMax = niceMax(Math.max(...stats.rarefied.map((p) => p.marginal), growthCurveMarginal(stats.curve, 1)));
  const x = (page: number) => MARGIN.left + (Math.log(page) / Math.log(lastPage)) * innerWidth;
  const y = (words: number) => MARGIN.top + innerHeight * (1 - words / yMax);
  const pageAt = (px: number) =>
    Math.min(lastPage, Math.max(1, Math.round(Math.exp(((px - MARGIN.left) / innerWidth) * Math.log(lastPage)))));

  const pages = curvePages(lastPage);
  const path = (from: number, to: number) =>
    pages
      .filter((p) => p >= from && p <= to)
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(p).toFixed(1)},${y(growthCurveMarginal(stats.curve, p)).toFixed(1)}`)
      .join("");
  const xTicks = [1, 10, 100, 1000, 10000].filter((t) => t <= lastPage);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  const endMarginal = growthCurveMarginal(stats.curve, lastPage);

  const hovered = hoverPage && {
    page: hoverPage,
    fitted: growthCurveMarginal(stats.curve, hoverPage),
    cumulative: growthCurveAt(stats.curve, hoverPage),
    sampled: stats.rarefied[hoverPage - 1]?.marginal,
  };

  return (
    <div ref={containerRef} className="relative">
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`New unique words per page, fitted over ${n} sampled pages and extrapolated to page ${lastPage}`}
          onPointerMove={(e) => setHoverPage(pageAt(e.clientX - e.currentTarget.getBoundingClientRect().left))}
          onPointerLeave={() => setHoverPage(null)}
          className="touch-none select-none"
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              <text x={MARGIN.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={AXIS_TEXT}>
                {fmt(t)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} x={x(t)} y={HEIGHT - MARGIN.bottom + 16} textAnchor="middle" fontSize={11} fill={AXIS_TEXT}>
              {t.toLocaleString()}
            </text>
          ))}
          <text x={MARGIN.left + innerWidth / 2} y={HEIGHT - 4} textAnchor="middle" fontSize={11} fill={AXIS_TEXT}>
            Page (log scale)
          </text>

          {/* Fitted over the sample, projected beyond it */}
          <path d={path(1, n)} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {lastPage > n && (
            <path
              d={path(n, lastPage)}
              fill="none"
              stroke={SERIES}
              strokeWidth={2}
              strokeDasharray="6 5"
              strokeLinecap="round"
            />
          )}
          {stats.rarefied.map((p) => (
            <circle key={p.page} cx={x(p.page)} cy={y(p.marginal)} r={4} fill={SERIES} stroke="white" strokeWidth={2} />
          ))}
          {lastPage > n && (
            <text x={x(lastPage)} y={y(endMarginal) - 10} textAnchor="end" fontSize={11} fill="#334155">
              ≈{fmt(endMarginal)} new/page by p. {lastPage.toLocaleString()}
            </text>
          )}

          {hovered && (
            <line
              x1={x(hovered.page)}
              x2={x(hovered.page)}
              y1={MARGIN.top}
              y2={MARGIN.top + innerHeight}
              stroke="#94a3b8"
              strokeWidth={1}
            />
          )}
        </svg>
      )}
      {hovered && (
        <div
          className="pointer-events-none absolute top-2 bg-white/95 border border-slate-200 rounded-lg shadow-sm px-3 py-2 text-xs"
          style={x(hovered.page) > width / 2 ? { right: width - x(hovered.page) + 8 } : { left: x(hovered.page) + 8 }}
        >
          <div className="text-slate-500">Page {hovered.page.toLocaleString()}</div>
          <div>
            <span className="font-semibold text-slate-900">+{hovered.fitted.toFixed(1)}</span>{" "}
            <span className="text-slate-500">new words ({hovered.page > n ? "projected" : "fitted"})</span>
          </div>
          {hovered.sampled !== undefined && (
            <div>
              <span className="font-semibold text-slate-900">+{hovered.sampled}</span>{" "}
              <span className="text-slate-500">sampled</span>
            </div>
          )}
          <div>
            <span className="font-semibold text-slate-900">{fmt(hovered.cumulative)}</span>{" "}
            <span className="text-slate-500">unique words so far</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function VocabularyCard({ stats, processedPages }: { stats: VocabularyStats | null; processedPages: number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="text-sm font-semibold text-slate-900">Unique words</h3>
      {!stats ? (
        <p className="text-sm text-slate-500 mt-1">
          Scan at least {MIN_VOCABULARY_PAGES} pages to estimate the book&apos;s vocabulary ({processedPages} so far).
        </p>
      ) : (
        <>
          {stats.projection ? (
            <div className="mt-2">
              <div className="text-3xl font-bold text-slate-900">≈{stats.projection.uniqueWords.toLocaleString()}</div>
              <div className="text-sm text-slate-500 mt-1">
                95% range {stats.projection.low.toLocaleString()}–{stats.projection.high.toLocaleString()} across all{" "}
                {stats.projection.totalPages.toLocaleString()} pages
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500 mt-1">
              Add the book&apos;s page count in Book Tracker to extrapolate to the whole book.
            </p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm">
            <span>
              <span className="font-semibold text-slate-900">{stats.seenUniqueWords.toLocaleString()}</span>{" "}
              <span className="text-slate-500">seen in {stats.sampledPages} pages</span>
            </span>
            <span title="Local Heaps' law exponent: 1 would mean every word is new, 0 that no new words appear">
              <span className="font-semibold text-slate-900">{stats.growthExponent.toFixed(2)}</span>{" "}
              <span className="text-slate-500">growth exponent</span>
            </span>
          </div>

          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1">New unique words per page</div>
            <GrowthChart stats={stats} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <svg width="10" height="10" aria-hidden>
                  <circle cx="5" cy="5" r="4" fill={SERIES} />
                </svg>
                Sampled pages (averaged over page order)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <svg width="18" height="10" aria-hidden>
                  <line x1="1" x2="17" y1="5" y2="5" stroke={SERIES} strokeWidth="2" strokeLinecap="round" />
                </svg>
                Fitted
              </span>
              {stats.projection && (
                <span className="inline-flex items-center gap-1.5">
                  <svg width="18" height="10" aria-hidden>
                    <line x1="1" x2="17" y1="5" y2="5" stroke={SERIES} strokeWidth="2" strokeDasharray="4 3" />
                  </svg>
                  Projected
                </span>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-500 mt-3">
            Each page repeats more of the words already seen, so new words per page fall. The curve (Heaps&apos; law with
            a slowing exponent) is fitted to your pages and extended to the last page. On 10 full novels the typical
            error at this many pages was about ±{Math.round(100 * (Math.exp(0.72 / Math.sqrt(stats.sampledPages)) - 1))}%;
            pages spread through the book estimate better than consecutive ones.
          </p>

          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-xs font-medium text-blue-600">Show data</summary>
            <table className="mt-2 w-full text-xs tabular-nums">
              <thead className="text-slate-500">
                <tr>
                  <th className="text-left font-medium py-1">Pages</th>
                  <th className="text-right font-medium py-1">New words</th>
                  <th className="text-right font-medium py-1">Unique words</th>
                </tr>
              </thead>
              <tbody className="text-slate-700">
                {stats.rarefied.map((p) => (
                  <tr key={p.page} className="border-t border-slate-100">
                    <td className="py-1">{p.page}</td>
                    <td className="text-right py-1">+{p.marginal}</td>
                    <td className="text-right py-1">{fmt(p.cumulative)}</td>
                  </tr>
                ))}
                {stats.projection && (
                  <tr className="border-t border-slate-200 font-medium">
                    <td className="py-1">{stats.projection.totalPages.toLocaleString()} (projected)</td>
                    <td className="text-right py-1">+{growthCurveMarginal(stats.curve, stats.projection.totalPages).toFixed(1)}</td>
                    <td className="text-right py-1">{stats.projection.uniqueWords.toLocaleString()}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </details>
        </>
      )}
    </div>
  );
}
