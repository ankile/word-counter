"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { COMMON_LENGTH, formsAfter, newFormsPerThousand, RANDOM_WORDS } from "../../../convex/difficulty";
import { niceScale, useWidth } from "./VocabularyCard";

type Book = FunctionReturnType<typeof api.compare.list>[number];

// Categorical hues in fixed order, one per book by when it was added (validated for colour-vision deficiency;
// the lighter ones always carry a text label or table row beside them)
const COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const GRID = "#e7e5e4";
const AXIS_TEXT = "#78716c";
const LABEL_TEXT = "#44403c";
const CROSSHAIR = "#a8a29e";
const HEIGHT = 260;
const MARGIN = { top: 16, right: 16, bottom: 36, left: 56 };

const fmt = (x: number) => Math.round(x).toLocaleString();
const fmtRate = (x: number) => (x < 10 ? x.toFixed(1) : fmt(x));
const fmtWords = (x: number) => (x >= 1000 ? `${Math.round(x / 1000).toLocaleString()}k` : fmt(x));

type Kind = "cumulative" | "marginal";

const CHARTS: Record<Kind, { title: string; subtitle: string; yLabel: string; value: (b: Book, words: number) => number; format: (x: number) => string }> = {
  cumulative: {
    title: "Different word forms as the book goes on",
    subtitle: "Solid over the photographed pages, dashed where it's projected to the end of the book.",
    yLabel: "word forms",
    value: (b, words) => formsAfter(b.curve, b.wordsPerSampledPage, words),
    format: fmt,
  },
  marginal: {
    title: "New word forms per 1,000 words",
    subtitle: "How quickly each book keeps bringing in words it hasn't used yet. Both axes are logarithmic.",
    yLabel: "new forms per 1,000 words",
    value: (b, words) => newFormsPerThousand(b.curve, b.wordsPerSampledPage, words),
    format: fmtRate,
  },
};

/** Both books' curves on shared axes, words read along the bottom; hover or arrow keys read off every book. */
function CompareChart({ books, kind }: { books: Book[]; kind: Kind }) {
  const chart = CHARTS[kind];
  const log = kind === "marginal";
  const [containerRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

  // From one photographed page's worth of words (log axis) or zero, to the longest book
  const xMax = Math.max(...books.map((b) => b.totalWords));
  const xMin = log ? Math.min(...books.map((b) => b.wordsPerSampledPage)) : 0;
  const samples = (b: Book) =>
    Array.from({ length: 121 }, (_, i) =>
      log
        ? Math.exp(Math.log(Math.max(xMin, b.wordsPerSampledPage)) + ((Math.log(b.totalWords) - Math.log(Math.max(xMin, b.wordsPerSampledPage))) * i) / 120)
        : Math.max(1, (b.totalWords * i) / 120)
    );
  const values = books.flatMap((b) => samples(b).map((w) => chart.value(b, w))).filter((v) => v > 0);
  const linearY = niceScale(Math.max(...values), 4);
  const yLow = log ? 10 ** Math.floor(Math.log10(Math.min(...values))) : 0;
  const yHigh = log ? 10 ** Math.ceil(Math.log10(Math.max(...values))) : linearY.max;

  const x = (w: number) =>
    MARGIN.left + innerWidth * (log ? Math.log(w / xMin) / Math.log(xMax / xMin) : w / xMax);
  const y = (v: number) =>
    MARGIN.top + innerHeight * (1 - (log ? Math.log(Math.max(v, yLow) / yLow) / Math.log(yHigh / yLow) : v / yHigh));
  const wordsAt = (px: number) => {
    const u = Math.min(1, Math.max(0, (px - MARGIN.left) / innerWidth));
    return log ? xMin * (xMax / xMin) ** u : u * xMax;
  };
  const path = (b: Book, from: number, to: number) =>
    [from, ...samples(b).filter((w) => w > from && w < to), to]
      .map((w, i) => `${i === 0 ? "M" : "L"}${x(w).toFixed(1)},${y(chart.value(b, w)).toFixed(1)}`)
      .join("");

  const xTicks = log
    ? [100, 300, 1_000, 3_000, 10_000, 30_000, 100_000, 300_000, 1_000_000].filter((t) => t >= xMin && t <= xMax)
    : Array.from({ length: Math.floor(xMax / niceScale(xMax, 4).step) + 1 }, (_, i) => i * niceScale(xMax, 4).step);
  const yTicks = log
    ? [1, 3, 10, 30, 100, 300, 1_000, 3_000].filter((t) => t >= yLow && t <= yHigh)
    : Array.from({ length: Math.round(yHigh / linearY.step) + 1 }, (_, i) => i * linearY.step);

  // End labels beside each book's last point, pushed apart so they don't overlap
  const labels = books
    .map((b, i) => ({ i, y: y(chart.value(b, b.totalWords)), text: `${b.title} · ${chart.format(chart.value(b, b.totalWords))}` }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 14);

  return (
    <figure className="min-w-0">
      <figcaption className="mb-1">
        <div className="text-sm font-semibold text-stone-900">{chart.title}</div>
        <div className="text-xs text-stone-500">{chart.subtitle}</div>
      </figcaption>
      <div ref={containerRef} className="relative">
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={`${chart.title}, one line per book`}
            tabIndex={0}
            onPointerMove={(e) => setHover(wordsAt(e.clientX - e.currentTarget.getBoundingClientRect().left))}
            onPointerDown={(e) => setHover(wordsAt(e.clientX - e.currentTarget.getBoundingClientRect().left))}
            onPointerLeave={() => setHover(null)}
            onBlur={() => setHover(null)}
            onKeyDown={(e) => {
              const px = hover === null ? MARGIN.left : x(hover);
              const step = innerWidth / 50;
              const next = e.key === "ArrowRight" ? px + step : e.key === "ArrowLeft" ? px - step : e.key === "Escape" ? null : undefined;
              if (next !== undefined) {
                e.preventDefault();
                setHover(next === null ? null : wordsAt(next));
              }
            }}
            className="touch-pan-y select-none rounded focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            {yTicks.map((t) => (
              <g key={t}>
                <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} stroke={GRID} />
                <text x={MARGIN.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={AXIS_TEXT}>
                  {fmt(t)}
                </text>
              </g>
            ))}
            {xTicks.map((t) => (
              <text key={t} x={x(Math.max(t, log ? xMin : 0))} y={HEIGHT - MARGIN.bottom + 16} textAnchor="middle" fontSize={11} fill={AXIS_TEXT}>
                {fmtWords(t)}
              </text>
            ))}
            <text x={MARGIN.left + innerWidth / 2} y={HEIGHT - 4} textAnchor="middle" fontSize={11} fill={AXIS_TEXT}>
              Words read{log ? " (log scale)" : ""}
            </text>
            <text x={12} y={MARGIN.top + innerHeight / 2} textAnchor="middle" fontSize={11} fill={AXIS_TEXT}
              transform={`rotate(-90 12 ${MARGIN.top + innerHeight / 2})`}>
              {chart.yLabel}
            </text>
            {books.map((b, i) => {
              const start = log ? Math.max(xMin, b.wordsPerSampledPage) : 1;
              const sampled = Math.min(b.sampledWords, b.totalWords);
              return (
                <g key={b._id} stroke={COLORS[i]} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path d={path(b, start, sampled)} />
                  {b.totalWords > sampled && <path d={path(b, sampled, b.totalWords)} strokeDasharray="6 5" />}
                  <circle cx={x(b.totalWords)} cy={y(chart.value(b, b.totalWords))} r={4.5}
                    fill={b.provisional ? "white" : COLORS[i]} stroke={b.provisional ? COLORS[i] : "white"} strokeWidth={2} />
                </g>
              );
            })}
            {labels.map(({ i, y: labelY, text }) => {
              const end = x(books[i].totalWords);
              const right = end > width - 140;
              return (
                <text key={i} x={right ? end - 8 : end + 8} y={labelY} dy="0.32em" textAnchor={right ? "end" : "start"}
                  fontSize={11} fill={LABEL_TEXT} stroke="white" strokeWidth={3} paintOrder="stroke">
                  {text}
                </text>
              );
            })}
            {hover !== null && (
              <line x1={x(hover)} x2={x(hover)} y1={MARGIN.top} y2={MARGIN.top + innerHeight} stroke={CROSSHAIR} />
            )}
          </svg>
        )}
        {hover !== null && width > 0 && (
          <div
            role="status"
            className="pointer-events-none absolute top-6 bg-white/95 border border-stone-200 rounded-lg shadow-sm px-3 py-2 text-xs"
            style={x(hover) > width / 2 ? { right: width - x(hover) + 8 } : { left: x(hover) + 8 }}
          >
            <div className="text-stone-500 mb-0.5">{fmt(hover)} words read</div>
            {books.map((b, i) => (
              <div key={b._id} className="flex items-center gap-2 whitespace-nowrap">
                <span className="inline-block w-3 h-0.5" style={{ background: COLORS[i] }} />
                <span className="text-stone-700">{b.title}</span>
                <span className="font-semibold text-stone-900 ml-auto pl-2">
                  {hover <= b.totalWords ? chart.format(chart.value(b, hover)) : "finished"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}

// missing says why a book has no value for the measure
type Measure = { title: string; subtitle: string; value: (b: Book) => number | null; format: (x: number) => string; missing: string };

const MEASURES: Measure[] = [
  {
    title: `Word forms in the first ${fmtWords(COMMON_LENGTH)} words`,
    subtitle: "The same length of text for every book",
    value: (b) => b.uniqueAtCommonLength,
    format: fmt,
    missing: `Under ${fmtWords(COMMON_LENGTH)} words`,
  },
  {
    title: `New forms per 1,000 words at ${fmtWords(COMMON_LENGTH)}`,
    subtitle: "How fast new words still arrive there",
    value: (b) => b.newPerThousandAtCommonLength,
    format: fmtRate,
    missing: `Under ${fmtWords(COMMON_LENGTH)} words`,
  },
  {
    title: `Different forms in ${RANDOM_WORDS.toLocaleString()} random words`,
    subtitle: "Measured on the photos alone, nothing projected",
    value: (b) => b.distinctInRandomWords,
    format: fmt,
    missing: `Fewer than ${RANDOM_WORDS.toLocaleString()} words photographed`,
  },
  {
    title: "Flesch–Kincaid grade",
    subtitle: "Sentence length and syllables per word (English only)",
    value: (b) => b.fleschKincaidGrade,
    format: (x) => x.toFixed(1),
    missing: "Not English",
  },
];

/** One measure, every book on its own row: a dot along a bar from zero, so longer means harder. */
function MeasurePanel({ books, measure }: { books: Book[]; measure: Measure }) {
  const max = Math.max(...books.map((b) => measure.value(b) ?? 0)) || 1;
  return (
    <div className="min-w-0">
      <div className="text-sm font-semibold text-stone-900">{measure.title}</div>
      <div className="text-xs text-stone-500 mb-2">{measure.subtitle}</div>
      <ul className="space-y-1.5">
        {books.map((b, i) => {
          const value = measure.value(b);
          return (
            <li key={b._id} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 text-sm">
              <span className="truncate text-stone-700" title={b.title}>{b.title}</span>
              {value === null ? (
                <span className="text-xs text-stone-400">{measure.missing}</span>
              ) : (
                <span className="flex items-center gap-2 min-w-0">
                  <span className="relative h-2 flex-1 rounded-full bg-stone-100">
                    <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(value / max) * 100}%`, background: COLORS[i], opacity: 0.35 }} />
                    <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white"
                      style={{ left: `${(value / max) * 100}%`, background: COLORS[i] }} />
                  </span>
                  <span className="w-14 shrink-0 text-right tabular-nums text-stone-900">{measure.format(value)}</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The main page's comparison of the reader's measured books on vocabulary and readability. Needs two books with a word
 * estimate and at least four photographed pages of text.
 */
export function BookComparison() {
  const all = useQuery(api.compare.list);
  if (all === undefined || all.length < 2) return null;
  // One fixed hue per book; past eight books the earliest-added ones are drawn, every book stays in the table
  const books = all.slice(0, COLORS.length);
  const provisional = books.some((b) => b.provisional);

  return (
    <section aria-labelledby="compare-heading" className="space-y-5">
      <div>
        <h2 id="compare-heading" className="font-display text-2xl font-semibold tracking-tight text-stone-900">
          How your books compare
        </h2>
        <p className="text-sm text-stone-500 mt-1">
          Vocabulary and readability of the books you&apos;ve photographed enough pages of. Words are counted as written,
          so &ldquo;run&rdquo; and &ldquo;running&rdquo; are two forms.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-6">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-700" aria-label="Books">
          {books.map((b, i) => (
            <li key={b._id} className="flex items-center gap-2">
              <span className="inline-block w-4 h-0.5 rounded" style={{ background: COLORS[i] }} />
              {b.title}
            </li>
          ))}
        </ul>
        <div className="grid gap-6 lg:grid-cols-2">
          <CompareChart books={books} kind="cumulative" />
          <CompareChart books={books} kind="marginal" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-5">
        <div className="grid gap-6 md:grid-cols-2">
          {MEASURES.map((measure) => (
            <MeasurePanel key={measure.title} books={books} measure={measure} />
          ))}
        </div>
        <p className="text-xs text-stone-500 mt-5">
          The share of a book&apos;s words that are different forms isn&apos;t a fair difficulty measure on its own: the
          longer a book, the more of its words are repeats. The measures above compare every book at the same length.
          {provisional && " A hollow dot marks a book with only hand-picked pages, whose whole-book numbers read high."}
        </p>
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-xs font-medium text-brand-600 select-none">All numbers</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead className="text-stone-500">
                <tr className="border-b border-stone-200">
                  <th scope="col" className="text-left font-medium py-1.5 pr-3">Book</th>
                  <th scope="col" className="text-right font-medium py-1.5 px-2">Words / page</th>
                  <th scope="col" className="text-right font-medium py-1.5 px-2">Total words</th>
                  <th scope="col" className="text-right font-medium py-1.5 px-2">Word forms</th>
                  <th scope="col" className="text-right font-medium py-1.5 px-2">Forms / words</th>
                  <th scope="col" className="text-right font-medium py-1.5 px-2">Forms in {fmtWords(COMMON_LENGTH)}</th>
                  <th scope="col" className="text-right font-medium py-1.5 px-2">New / 1,000 at {fmtWords(COMMON_LENGTH)}</th>
                  <th scope="col" className="text-right font-medium py-1.5 px-2">New / 1,000 at end</th>
                  <th scope="col" className="text-right font-medium py-1.5 px-2">Forms in {RANDOM_WORDS.toLocaleString()}</th>
                  <th scope="col" className="text-right font-medium py-1.5 pl-2">FK grade</th>
                </tr>
              </thead>
              <tbody className="text-stone-900">
                {all.map((b) => (
                  <tr key={b._id} className="border-b border-stone-100">
                    <th scope="row" className="text-left font-medium py-1.5 pr-3">
                      {b.title}
                      {b.provisional && <span className="font-normal text-stone-500"> (hand-picked pages only)</span>}
                    </th>
                    <td className="text-right px-2">{b.wordsPerPage.toFixed(1)}</td>
                    <td className="text-right px-2">{fmt(b.totalWords)} <span className="text-stone-500">({fmt(b.totalWordsLow)}–{fmt(b.totalWordsHigh)})</span></td>
                    <td className="text-right px-2">{fmt(b.uniqueWords)} <span className="text-stone-500">({fmt(b.uniqueWordsLow)}–{fmt(b.uniqueWordsHigh)})</span></td>
                    <td className="text-right px-2">{(b.uniqueShare * 100).toFixed(1)}%</td>
                    <td className="text-right px-2">{b.uniqueAtCommonLength === null ? "–" : fmt(b.uniqueAtCommonLength)}</td>
                    <td className="text-right px-2">{b.newPerThousandAtCommonLength === null ? "–" : fmtRate(b.newPerThousandAtCommonLength)}</td>
                    <td className="text-right px-2">{fmtRate(b.newPerThousandAtEnd)}</td>
                    <td className="text-right px-2">{b.distinctInRandomWords === null ? "–" : fmt(b.distinctInRandomWords)}</td>
                    <td className="text-right pl-2">{b.fleschKincaidGrade === null ? "–" : b.fleschKincaidGrade.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  );
}
