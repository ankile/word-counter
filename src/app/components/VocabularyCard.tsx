"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  growthCurveAt,
  growthCurveMarginal,
  MIN_VOCABULARY_PAGES,
  type VocabularyStats,
} from "../../../convex/vocabulary";

const SERIES = "#3f5d80";
const GRID = "#e7e5e4";
const AXIS_TEXT = "#78716c";
const LABEL_TEXT = "#44403c";
const CROSSHAIR = "#a8a29e";
const HEIGHT = 220;
const MARGIN = { top: 16, right: 16, bottom: 36, left: 52 };

type Scale = "log" | "linear";

const fmt = (x: number) => Math.round(x).toLocaleString();
const pct = (x: number) => (x < 1 ? x.toFixed(2) : x.toFixed(1));
const fmtRate = (x: number) => (x < 10 ? x.toFixed(1) : fmt(x));

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

/** Integer pages to draw curves through: every page early on, then spaced out to the end. */
function curvePages(lastPage: number): number[] {
  const pages = new Set<number>();
  for (let p = 1; p <= Math.min(lastPage, 60); p++) pages.add(p);
  for (let i = 0; i <= 160; i++) {
    pages.add(Math.round(Math.exp((Math.log(lastPage) * i) / 160)));
    pages.add(Math.round(1 + ((lastPage - 1) * i) / 160));
  }
  return [...pages].filter((p) => p >= 1 && p <= lastPage).sort((a, b) => a - b);
}

/** A round number at or above value, with tick step: 1, 2 or 5 × 10^k. */
function niceScale(value: number, ticks: number) {
  const raw = value / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw)!;
  return { max: Math.ceil(value / step) * step, step };
}

interface CurveChartProps {
  label: string;
  lastPage: number;
  sampledPages: number;
  scale: Scale;
  onScaleChange: (scale: Scale) => void;
  sampled: { page: number; value: number }[];
  curve: (page: number) => number;
  // Optional vertical range at the last page (cumulative projection)
  whisker?: { low: number; high: number };
  endLabel?: string;
  hoverPage: number | null;
  onHover: (page: number | null) => void;
  tooltip: (page: number) => ReactNode;
}

function CurveChart(props: CurveChartProps) {
  const { sampledPages: n, scale, sampled, curve } = props;
  const [sampleView, setSampleView] = useState(false);
  const helpId = useId();
  const lastPage = sampleView ? n : props.lastPage;
  const whisker = sampleView ? undefined : props.whisker;
  const hoverPage = props.hoverPage !== null && props.hoverPage <= lastPage ? props.hoverPage : null;
  const endLabel = sampleView ? undefined : props.endLabel;
  const [containerRef, width] = useWidth<HTMLDivElement>();

  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const pages = [...new Set([...curvePages(lastPage), n])].sort((a, b) => a - b);
  const { max: yMax, step: yStep } = niceScale(
    Math.max(...sampled.map((p) => p.value), ...pages.map(curve), whisker?.high ?? 0),
    4
  );

  const toUnit = (page: number) =>
    scale === "log" ? Math.log(page) / Math.log(lastPage) : (page - 1) / (lastPage - 1);
  const fromUnit = (u: number) => (scale === "log" ? Math.exp(u * Math.log(lastPage)) : 1 + u * (lastPage - 1));
  const x = (page: number) => MARGIN.left + toUnit(page) * innerWidth;
  const y = (value: number) => MARGIN.top + innerHeight * (1 - value / yMax);
  const pageAt = (px: number) =>
    Math.min(lastPage, Math.max(1, Math.round(fromUnit((px - MARGIN.left) / innerWidth))));

  const path = (from: number, to: number) =>
    pages
      .filter((p) => p >= from && p <= to)
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(p).toFixed(1)},${y(curve(p)).toFixed(1)}`)
      .join("");
  const tickCount = Math.max(2, Math.floor(innerWidth / 110));
  const tickCandidates = [...new Set(
    scale === "log"
      ? Array.from({ length: Math.floor(Math.log10(lastPage)) + 1 }, (_, power) => [1, 2, 5].map((m) => m * 10 ** power))
          .flat().filter((t) => t <= lastPage)
      : [1, ...Array.from({ length: tickCount + 1 }, (_, i) => (i + 1) * niceScale(lastPage, tickCount).step).filter((t) => t <= lastPage)]
  )];
  // Keep endpoints visible and leave enough room between labels on narrow screens.
  const xTicks = [1];
  for (const tick of tickCandidates.slice(1)) {
    if (x(tick) - x(xTicks.at(-1)!) >= 52 && x(lastPage) - x(tick) >= 52) xTicks.push(tick);
  }
  xTicks.push(lastPage);
  const yTicks = Array.from({ length: Math.round(yMax / yStep) + 1 }, (_, i) => i * yStep);

  // Keep the endpoint label beside its value; a white backing keeps the curve legible beneath it.
  const labelRight = x(lastPage) - (whisker ? 16 : 0);
  const labelWidth = (endLabel?.length ?? 0) * 6.5;
  const labelY = Math.max(MARGIN.top + 14, y(curve(lastPage)) - 10);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <div className="text-xs text-stone-500">{props.label}</div>
        <div className="flex items-center gap-2">
          {props.lastPage > n && <button onClick={() => setSampleView(!sampleView)} aria-pressed={sampleView}
            className="min-h-9 px-2 text-xs font-medium text-brand-600 rounded border border-stone-200">
            {sampleView ? "Whole book" : "Sample detail"}
          </button>}
          <ScaleToggle scale={scale} onChange={props.onScaleChange} label={`${props.label}: page axis`} />
        </div>
      </div>
      <div ref={containerRef} className="relative">
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={`${props.label}: fitted over ${n} sampled pages${lastPage > n ? ` and projected to ${lastPage} sampled-page equivalents` : ""}`}
            tabIndex={0}
            aria-describedby={helpId}
            onFocus={() => props.onHover(1)}
            onBlur={() => props.onHover(null)}
            onKeyDown={(e) => {
              const current = hoverPage ?? 1;
              const next = e.key === "ArrowRight" ? Math.min(lastPage, current + 1)
                : e.key === "ArrowLeft" ? Math.max(1, current - 1)
                : e.key === "Home" ? 1 : e.key === "End" ? lastPage : e.key === "Escape" ? null : undefined;
              if (next !== undefined) { e.preventDefault(); props.onHover(next); }
            }}
            onPointerDown={(e) => props.onHover(pageAt(e.clientX - e.currentTarget.getBoundingClientRect().left))}
            onPointerMove={(e) => props.onHover(pageAt(e.clientX - e.currentTarget.getBoundingClientRect().left))}
            onPointerLeave={() => props.onHover(null)}
            onPointerCancel={() => props.onHover(null)}
            className="touch-pan-y select-none rounded focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            {lastPage > n && <rect x={x(n)} y={MARGIN.top} width={innerWidth * (1 - toUnit(n))} height={innerHeight} fill="#f2f5f9" />}
            {yTicks.map((t) => (
              <g key={t}>
                <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
                <text x={MARGIN.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={AXIS_TEXT}>
                  {fmt(t)}
                </text>
              </g>
            ))}
            {xTicks.map((t) => (
              <text key={t} x={x(t)} y={HEIGHT - MARGIN.bottom + 16} textAnchor={t === 1 ? "start" : t === lastPage ? "end" : "middle"} fontSize={11} fill={AXIS_TEXT}>
                {t.toLocaleString()}
              </text>
            ))}
            <text x={MARGIN.left + innerWidth / 2} y={HEIGHT - 4} textAnchor="middle" fontSize={11} fill={AXIS_TEXT}>
              Sampled-page equivalents{scale === "log" ? " (log scale)" : ""}
            </text>

            {lastPage > n && <g>
              <line x1={x(n)} x2={x(n)} y1={MARGIN.top} y2={MARGIN.top + innerHeight} stroke={CROSSHAIR} strokeDasharray="3 3" />
              <text x={x(n) + (x(n) > width / 2 ? -6 : 6)} textAnchor={x(n) > width / 2 ? "end" : "start"}
                y={MARGIN.top + 12} fontSize={11} fill={LABEL_TEXT}>{n} sampled</text>
              {width - MARGIN.right - x(n) > 100 && <text x={(x(n) + width - MARGIN.right) / 2} textAnchor="middle"
                y={MARGIN.top + 12} fontSize={11} fill={AXIS_TEXT}>Projected</text>}
            </g>}

            {/* Fitted over the sample, projected beyond it */}
            <path d={path(1, n)} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {lastPage > n && (
              <path d={path(n, lastPage)} fill="none" stroke={SERIES} strokeWidth={2} strokeDasharray="6 5" strokeLinecap="round" />
            )}
            {whisker && (
              <g stroke={SERIES} strokeWidth={2} strokeLinecap="round">
                <line x1={x(lastPage) - 2} x2={x(lastPage) - 2} y1={y(whisker.low)} y2={y(whisker.high)} />
                <line x1={x(lastPage) - 8} x2={x(lastPage) + 2} y1={y(whisker.low)} y2={y(whisker.low)} />
                <line x1={x(lastPage) - 8} x2={x(lastPage) + 2} y1={y(whisker.high)} y2={y(whisker.high)} />
              </g>
            )}
            {sampled.map((p) => (
              <circle key={p.page} cx={x(p.page)} cy={y(p.value)} r={4} fill={SERIES} stroke="white" strokeWidth={2} />
            ))}
            {endLabel && (
              <g>
              <rect x={labelRight - labelWidth - 4} y={labelY - 12} width={labelWidth + 8} height={17} rx={3} fill="white" fillOpacity={0.95} />
              <text
                x={labelRight}
                y={labelY}
                textAnchor="end"
                fontSize={11}
                fill={LABEL_TEXT}
              >
                {endLabel}
              </text>
              </g>
            )}
            {hoverPage && (
              <line x1={x(hoverPage)} x2={x(hoverPage)} y1={MARGIN.top} y2={MARGIN.top + innerHeight} stroke={CROSSHAIR} strokeWidth={1} />
            )}
          </svg>
        )}
        {hoverPage && width > 0 && (
          <div
            role="status"
            className="pointer-events-none absolute top-8 bg-white/95 border border-stone-200 rounded-lg shadow-sm px-3 py-2 text-xs"
            style={x(hoverPage) > width / 2
              ? { right: width - x(hoverPage) + 8, maxWidth: x(hoverPage) - 8 }
              : { left: x(hoverPage) + 8, maxWidth: width - x(hoverPage) - 8 }}
          >
            <div className="text-stone-500">{hoverPage <= n ? `${hoverPage.toLocaleString()} sampled pages` : `${hoverPage.toLocaleString()} sampled-page equivalents`}</div>
            {props.tooltip(hoverPage)}
          </div>
        )}
      </div>
      <p id={helpId} className="sr-only">Use left and right arrow keys to inspect values, Home for the first point, End for the last, and Escape to clear.</p>
    </div>
  );
}

function ScaleToggle({ scale, onChange, label }: { scale: Scale; onChange: (scale: Scale) => void; label: string }) {
  return (
    <div className="flex rounded-md border border-stone-200 p-0.5 text-xs shrink-0" role="group" aria-label={label}>
      {(["linear", "log"] as const).map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          aria-pressed={scale === s}
          className={`px-2 min-h-9 rounded font-medium ${scale === s ? "bg-stone-100 text-stone-900" : "text-stone-500"}`}
        >
          {s === "log" ? "Log" : "Linear"}
        </button>
      ))}
    </div>
  );
}

function TooltipRow({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <span className="font-semibold text-stone-900">{value}</span> <span className="text-stone-500">{label}</span>
    </div>
  );
}

/** V(k) = e^a · k^(b + c·ln k), with the fitted numbers. */
function Equation({ curve: [a, b, c] }: { curve: VocabularyStats["curve"] }) {
  return (
    <span className="font-mono text-stone-900">
      V(k) = {Math.exp(a).toFixed(1)} · k<sup>{b.toFixed(3)} {c < 0 ? "−" : "+"} {Math.abs(c).toFixed(4)}·ln k</sup>
    </span>
  );
}

const SOURCES = [
  { label: "Heaps' law", href: "https://en.wikipedia.org/wiki/Heaps%27_law" },
  { label: "Rarefaction", href: "https://en.wikipedia.org/wiki/Rarefaction_(ecology)" },
  { label: "Jackknife resampling", href: "https://en.wikipedia.org/wiki/Jackknife_resampling" },
  {
    label: "Gerlach & Altmann (2013), vocabulary growth slows in large texts",
    href: "https://arxiv.org/abs/1212.1362",
  },
  { label: "Validation on 10 novels", href: "https://github.com/ankile/word-counter/blob/main/docs/vocabulary.md" },
];

function ModelExplainer() {
  return (
    <details className="mt-1 text-sm group">
      <summary className="cursor-pointer text-xs font-medium text-brand-600 select-none">How is this estimated?</summary>
      <div className="mt-2 space-y-2 text-xs text-stone-600 leading-relaxed">
        <p>
          <span className="font-medium text-stone-900">Growth curve.</span> For every k, we compute the expected
          number of distinct words in k of your pages taken in random order (rarefaction), so the curve doesn&apos;t
          depend on the order you scanned in.
        </p>
        <p>
          <span className="font-medium text-stone-900">Model.</span> Vocabulary grows roughly as a power of text
          length (Heaps&apos; law, V = K·k<sup>β</sup>), but the exponent drifts down as a book goes on: new words get
          rarer as the core vocabulary is used up. So we fit Heaps&apos; law with a slowing exponent, log V = a + b·log k
          + c·(log k)², and project it to the book&apos;s estimated amount of text.
        </p>
        <p>
          <span className="font-medium text-stone-900">How well it works.</span> On 10 full public-domain novels,
          plain Heaps&apos; law overestimated whole-book vocabulary by 1.6–1.9×; this curve was within ±3% on average,
          with a typical error of about ±22% from 10 pages and ±13% from 30. The 95% range is calibrated on those
          novels and contained the true count 94–98% of the time.
        </p>
        <p>
          <span className="font-medium text-stone-900">Caveats.</span> A word is a distinct lowercase word form
          (&ldquo;run&rdquo; and &ldquo;running&rdquo; count separately); OCR errors add a few. Pages spread through
          the book work better than consecutive ones, which share names and topics and run about 5% low.
        </p>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
          {SOURCES.map((source) => (
            <li key={source.href}>
              <a href={source.href} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
                {source.label} ↗
              </a>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

export function VocabularyCard({ stats, processedPages, textPages, totalPages }: {
  stats: VocabularyStats | null; processedPages: number; textPages: number; totalPages: number | undefined;
}) {
  const [cumulativeScale, setCumulativeScale] = useState<Scale>("linear");
  const [marginalScale, setMarginalScale] = useState<Scale>("log");
  const [hoverPage, setHoverPage] = useState<number | null>(null);

  if (!stats) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-5">
        <h3 className="font-display text-lg font-semibold text-stone-900">Unique words</h3>
        <p className="text-sm text-stone-500 mt-1">
          {processedPages > 0 && textPages === 0
            ? "No words were detected in these scans. Photograph pages containing text to estimate vocabulary. Blank pages still count in random sampling."
            : `Scan at least ${MIN_VOCABULARY_PAGES} pages containing text to estimate vocabulary (${textPages} so far).`}
        </p>
      </div>
    );
  }

  const { projection, curve, fitQuality: quality } = stats;
  const n = stats.sampledPages;
  // The curve is read off at the sampled pages' worth of text in the book, which is the page count unless the sample
  // runs fuller or emptier than the book's average page
  const lastPage = projection?.pages ?? n;
  const phase = (page: number) => (page > n ? "projected" : "fitted");
  const sampledAt = (page: number) => stats.rarefied[page - 1];

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5">
      <h3 className="font-display text-lg font-semibold text-stone-900">Unique words</h3>
      <ModelExplainer />
      {projection ? (
        <div className="mt-2">
          <div className="font-display text-4xl font-semibold text-stone-900">≈{projection.uniqueWords.toLocaleString()}</div>
          <div className="text-sm text-stone-500 mt-1">
            95% range {projection.low.toLocaleString()}–{projection.high.toLocaleString()} across all{" "}
            {projection.totalPages.toLocaleString()} pages
          </div>
          {projection.pages !== projection.totalPages && (
            <div className="text-xs text-stone-500 mt-1">
              Projected to the book&apos;s ≈{projection.totalWords!.toLocaleString()} words: as much text as{" "}
              {projection.pages.toLocaleString()} of the sampled pages
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-stone-500 mt-1">{totalPages === undefined
          ? "Add the book's page count in Book Tracker to extrapolate to the whole book."
          : "The estimated whole-book text is shorter than this sample. Check the book's page count and sample classifications before projecting."}</p>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm">
        <span>
          <span className="font-semibold text-stone-900">{stats.seenUniqueWords.toLocaleString()}</span>{" "}
          <span className="text-stone-500">seen in {n} pages containing text</span>
        </span>
      </div>

      <div className="mt-5 mb-2">
        <p className="text-xs text-stone-500 mb-2">The horizontal axis measures amounts of sampled text, averaged across page order. It does not show printed page numbers.</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
          <span className="inline-flex items-center gap-1.5">
            <svg width="10" height="10" aria-hidden>
              <circle cx="5" cy="5" r="4" fill={SERIES} />
            </svg>
            Sampled (averaged over page order)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="18" height="10" aria-hidden>
              <line x1="1" x2="17" y1="5" y2="5" stroke={SERIES} strokeWidth="2" strokeLinecap="round" />
            </svg>
            Fitted
          </span>
          {projection && (
            <span className="inline-flex items-center gap-1.5">
              <svg width="18" height="10" aria-hidden>
                <line x1="1" x2="17" y1="5" y2="5" stroke={SERIES} strokeWidth="2" strokeDasharray="4 3" />
              </svg>
              Projected (bar: 95% range)
            </span>
          )}
        </div>
      </div>

      <div className="space-y-5">
        <CurveChart
          label="Unique words so far"
          lastPage={lastPage}
          sampledPages={n}
          scale={cumulativeScale}
          onScaleChange={setCumulativeScale}
          sampled={stats.rarefied.map((p) => ({ page: p.page, value: p.cumulative }))}
          curve={(page) => growthCurveAt(curve, page)}
          whisker={projection ? { low: projection.low, high: projection.high } : undefined}
          endLabel={projection ? `≈${projection.uniqueWords.toLocaleString()}` : undefined}
          hoverPage={hoverPage}
          onHover={setHoverPage}
          tooltip={(page) => (
            <>
              <TooltipRow value={fmt(growthCurveAt(curve, page))} label={`unique words (${phase(page)})`} />
              {sampledAt(page) && <TooltipRow value={fmt(sampledAt(page).cumulative)} label="sampled" />}
              {page === lastPage && projection && (
                <TooltipRow value={`${fmt(projection.low)}–${fmt(projection.high)}`} label="95% range" />
              )}
            </>
          )}
        />
        <CurveChart
          label="New unique words per page"
          lastPage={lastPage}
          sampledPages={n}
          scale={marginalScale}
          onScaleChange={setMarginalScale}
          sampled={stats.rarefied.map((p) => ({ page: p.page, value: p.marginal }))}
          curve={(page) => growthCurveMarginal(curve, page)}
          endLabel={
            projection ? `≈${fmtRate(growthCurveMarginal(curve, lastPage))} new words / page equiv.` : undefined
          }
          hoverPage={hoverPage}
          onHover={setHoverPage}
          tooltip={(page) => (
            <>
              <TooltipRow value={`+${growthCurveMarginal(curve, page).toFixed(1)}`} label={`new words (${phase(page)})`} />
              {sampledAt(page) && <TooltipRow value={`+${sampledAt(page).marginal}`} label="sampled" />}
            </>
          )}
        />
      </div>

      <details className="mt-4 text-sm">
      <summary className="cursor-pointer text-xs font-medium text-brand-600">Model diagnostics</summary>
      <div className="mt-2 rounded-lg bg-stone-50 p-4 text-sm space-y-2">
        <div>
          <div className="text-xs text-stone-500 mb-0.5">Fitted curve (k = sampled-page equivalents)</div>
          <Equation curve={curve} />
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div>
            <dt className="text-xs text-stone-500">Growth exponent</dt>
            <dd className="font-semibold text-stone-900 tabular-nums">{stats.growthExponent.toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-xs text-stone-500">R² (log-log)</dt>
            <dd className="font-semibold text-stone-900 tabular-nums">{quality.r2.toFixed(4)}</dd>
          </div>
          <div>
            <dt className="text-xs text-stone-500">Residual, RMS / max</dt>
            <dd className="font-semibold text-stone-900 tabular-nums">
              {pct(quality.rmsResidualPercent)}% / {pct(quality.maxResidualPercent)}%
            </dd>
          </div>
          {projection && (
            <>
              <div>
                <dt className="text-xs text-stone-500">Leave-one-page-out</dt>
                <dd className="font-semibold text-stone-900 tabular-nums">±{projection.leaveOneOutPercent.toFixed(1)}%</dd>
              </div>
              <div>
                <dt className="text-xs text-stone-500">Error on 10 novels</dt>
                <dd className="font-semibold text-stone-900 tabular-nums">±{projection.calibratedPercent.toFixed(1)}%</dd>
              </div>
            </>
          )}
        </dl>
        <p className="text-xs text-stone-500">
          R² and residuals show how closely the curve follows your sampled pages. They are near-perfect by
          construction, so they say little about the extrapolation. The projection&apos;s uncertainty is the larger of
          the last two (one standard deviation each); the 95% range spans about twice that either side.
        </p>
      </div>
      </details>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs font-medium text-brand-600">Show data</summary>
        <table className="mt-2 w-full text-xs tabular-nums">
          <thead className="text-stone-500">
            <tr>
              <th className="text-left font-medium py-1">Page equivalents</th>
              <th className="text-right font-medium py-1">New words</th>
              <th className="text-right font-medium py-1">Unique words</th>
              <th className="text-right font-medium py-1">Fitted</th>
            </tr>
          </thead>
          <tbody className="text-stone-700">
            {stats.rarefied.map((p) => (
              <tr key={p.page} className="border-t border-stone-100">
                <td className="py-1">{p.page}</td>
                <td className="text-right py-1">+{p.marginal}</td>
                <td className="text-right py-1">{fmt(p.cumulative)}</td>
                <td className="text-right py-1">{fmt(growthCurveAt(curve, p.page))}</td>
              </tr>
            ))}
            {projection && (
              <tr className="border-t border-stone-200 font-medium">
                <td className="py-1">{projection.pages.toLocaleString()} (projected)</td>
                <td className="text-right py-1">+{growthCurveMarginal(curve, projection.pages).toFixed(1)}</td>
                <td className="text-right py-1">
                  {fmt(projection.low)}–{fmt(projection.high)}
                </td>
                <td className="text-right py-1">{projection.uniqueWords.toLocaleString()}</td>
              </tr>
            )}
          </tbody>
        </table>
      </details>
    </div>
  );
}
