"use client";

import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import type { BoundingBox, PageStatus } from "../../../convex/validators";
import { CloseIcon } from "./icons";

type Page = Doc<"pages"> & { imageUrl: string | null };
type Size = { width: number; height: number };

const statusConfig: Record<PageStatus, { className: string; label: string }> = {
  pending: { className: "bg-amber-100 text-amber-700", label: "Pending" },
  processing: { className: "bg-blue-100 text-blue-700", label: "Processing" },
  done: { className: "bg-green-100 text-green-700", label: "Done" },
  error: { className: "bg-red-100 text-red-700", label: "Error" },
};

/**
 * Word boxes drawn in original image pixel coordinates. With the default
 * preserveAspectRatio ("xMidYMid meet") the SVG letterboxes exactly like an
 * object-contain image covering the same element, so no manual scaling is needed.
 */
function OcrOverlay({ boxes, imageSize }: { boxes: BoundingBox[]; imageSize: Size }) {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none mix-blend-multiply"
      viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
    >
      {boxes.map((box, i) => {
        if (box.vertices.length < 4) return null;
        const xs = box.vertices.map((v) => v.x);
        const ys = box.vertices.map((v) => v.y);
        const x = Math.min(...xs);
        const y = Math.min(...ys);
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={Math.max(...xs) - x}
            height={Math.max(...ys) - y}
            fill="rgba(59, 130, 246, 0.15)"
            stroke="rgba(59, 130, 246, 0.6)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}

function OcrToggle({ active, onToggle, className }: { active: boolean; onToggle: () => void; className: string }) {
  return (
    <button onClick={onToggle} className={`font-medium transition-colors ${className}`}>
      {active ? "Hide OCR" : "Show OCR"}
    </button>
  );
}

function Lightbox({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="relative max-w-5xl max-h-[90vh] w-full h-full flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
        >
          <CloseIcon className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}

export function PageCard({ page }: { page: Page }) {
  const removePage = useMutation(api.pages.remove);
  const reprocessPage = useMutation(api.pages.reprocess);
  const [showText, setShowText] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [imageSize, setImageSize] = useState<Size | null>(null);

  const handleDelete = () => {
    if (confirm("Delete this page?")) {
      removePage({ id: page._id });
    }
  };

  const status = statusConfig[page.status];
  const boxes = page.boundingBoxes ?? [];
  const hasBoxes = boxes.length > 0;
  const overlay = showOverlay && hasBoxes && imageSize && <OcrOverlay boxes={boxes} imageSize={imageSize} />;
  const toggleOverlay = () => setShowOverlay(!showOverlay);

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
        {/* Image area */}
        <div className="aspect-[3/4] relative bg-slate-100">
          {page.imageUrl && (
            <>
              {/* Plain <img>: the overlay needs the original image's pixel dimensions */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={page.imageUrl}
                alt={`Page ${page.pageNumber}`}
                className="w-full h-full object-contain cursor-pointer"
                onLoad={(e) =>
                  setImageSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })
                }
                onClick={() => setShowLightbox(true)}
              />
              {overlay}
            </>
          )}
          <div className="absolute top-3 left-3 bg-slate-900/70 text-white text-xs font-medium px-2 py-1 rounded-md">
            Page {page.pageNumber}
          </div>
          {hasBoxes && (
            <OcrToggle
              active={showOverlay}
              onToggle={toggleOverlay}
              className={`absolute top-3 right-3 text-xs px-2.5 py-1 rounded-md ${
                showOverlay ? "bg-blue-600 text-white" : "bg-white/90 text-slate-700 hover:bg-white"
              }`}
            />
          )}
        </div>

        {/* Info area */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${status.className}`}>{status.label}</span>
            {page.status === "done" && page.wordCount !== undefined && (
              <span className="text-sm font-semibold text-slate-900">{page.wordCount.toLocaleString()} words</span>
            )}
          </div>

          {page.status === "done" && page.readability && (
            <div className="flex items-center gap-3 text-xs text-slate-500 mb-3">
              <span title="Flesch-Kincaid Grade Level">Grade {page.readability.fleschKincaidGrade}</span>
              <span className="text-slate-300">|</span>
              <span title={page.readability.readingLevel}>Ease: {page.readability.fleschReadingEase.toFixed(0)}</span>
            </div>
          )}

          {page.status === "error" && page.error && (
            <p className="text-xs text-red-600 mb-3 truncate" title={page.error}>
              {page.error}
            </p>
          )}

          {page.status === "done" && page.extractedText && (
            <div className="mb-3">
              <button
                onClick={() => setShowText(!showText)}
                className="text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                {showText ? "Hide extracted text" : "Show extracted text"}
              </button>
              {showText && (
                <pre className="mt-2 text-xs text-slate-600 bg-slate-50 p-3 rounded-lg max-h-40 overflow-auto whitespace-pre-wrap border border-slate-100">
                  {page.extractedText}
                </pre>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
            <button
              onClick={() => reprocessPage({ id: page._id })}
              className="text-xs font-medium text-slate-500 hover:text-blue-600 transition-colors"
            >
              Re-process
            </button>
            <button
              onClick={handleDelete}
              className="text-xs font-medium text-slate-500 hover:text-red-600 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {showLightbox && page.imageUrl && (
        <Lightbox onClose={() => setShowLightbox(false)}>
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={page.imageUrl}
              alt={`Page ${page.pageNumber}`}
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
            />
            {overlay}
          </div>
          {hasBoxes && (
            <OcrToggle
              active={showOverlay}
              onToggle={toggleOverlay}
              className={`absolute top-4 left-4 text-sm px-3 py-2 rounded-lg ${
                showOverlay ? "bg-blue-600 text-white" : "bg-white/10 text-white hover:bg-white/20"
              }`}
            />
          )}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-sm px-4 py-2 rounded-lg">
            Page {page.pageNumber}
            {page.wordCount !== undefined && ` • ${page.wordCount.toLocaleString()} words`}
          </div>
        </Lightbox>
      )}
    </>
  );
}
