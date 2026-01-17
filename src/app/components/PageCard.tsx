"use client";

import { useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc } from "../../../convex/_generated/dataModel";
import { useState, useRef, useEffect } from "react";

interface PageCardProps {
  page: Doc<"pages"> & { imageUrl: string | null };
}

export function PageCard({ page }: PageCardProps) {
  const removePage = useMutation(api.pages.remove);
  const processPage = useAction(api.ocrAction.processPage);
  const [showText, setShowText] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{
    natural: { width: number; height: number };
    display: { width: number; height: number };
  } | null>(null);
  const [lightboxDimensions, setLightboxDimensions] = useState<{
    natural: { width: number; height: number };
    display: { width: number; height: number };
  } | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const lightboxImageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const updateDimensions = () => {
      if (imageRef.current && imageRef.current.complete) {
        setImageDimensions({
          natural: {
            width: imageRef.current.naturalWidth,
            height: imageRef.current.naturalHeight,
          },
          display: {
            width: imageRef.current.clientWidth,
            height: imageRef.current.clientHeight,
          },
        });
      }
    };

    const img = imageRef.current;
    if (img) {
      img.addEventListener("load", updateDimensions);
      updateDimensions();
    }

    window.addEventListener("resize", updateDimensions);
    return () => {
      if (img) img.removeEventListener("load", updateDimensions);
      window.removeEventListener("resize", updateDimensions);
    };
  }, [page.imageUrl]);

  useEffect(() => {
    const updateLightboxDimensions = () => {
      if (lightboxImageRef.current && lightboxImageRef.current.complete) {
        setLightboxDimensions({
          natural: {
            width: lightboxImageRef.current.naturalWidth,
            height: lightboxImageRef.current.naturalHeight,
          },
          display: {
            width: lightboxImageRef.current.clientWidth,
            height: lightboxImageRef.current.clientHeight,
          },
        });
      }
    };

    const img = lightboxImageRef.current;
    if (img && showLightbox) {
      img.addEventListener("load", updateLightboxDimensions);
      updateLightboxDimensions();
    }

    return () => {
      if (img) img.removeEventListener("load", updateLightboxDimensions);
    };
  }, [showLightbox]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowLightbox(false);
    };
    if (showLightbox) {
      document.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [showLightbox]);

  const handleReprocess = () => {
    processPage({ pageId: page._id });
  };

  const handleDelete = () => {
    if (confirm("Delete this page?")) {
      removePage({ id: page._id });
    }
  };

  const statusConfig = {
    pending: { bg: "bg-amber-100", text: "text-amber-700", label: "Pending" },
    processing: { bg: "bg-blue-100", text: "text-blue-700", label: "Processing" },
    done: { bg: "bg-green-100", text: "text-green-700", label: "Done" },
    error: { bg: "bg-red-100", text: "text-red-700", label: "Error" },
  };

  const scaleBox = (
    vertices: { x: number; y: number }[],
    dims: { natural: { width: number; height: number }; display: { width: number; height: number } }
  ) => {
    if (vertices.length < 4) return null;
    const scaleX = dims.display.width / dims.natural.width;
    const scaleY = dims.display.height / dims.natural.height;

    const xs = vertices.map((v) => v.x * scaleX);
    const ys = vertices.map((v) => v.y * scaleY);

    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  };

  const hasBoundingBoxes = page.boundingBoxes && page.boundingBoxes.length > 0;
  const status = statusConfig[page.status];

  const renderOverlay = (dims: { natural: { width: number; height: number }; display: { width: number; height: number } }) => (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ mixBlendMode: "multiply" }}
    >
      {page.boundingBoxes!.map((box, i) => {
        const rect = scaleBox(box.vertices, dims);
        if (!rect) return null;
        return (
          <rect
            key={i}
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            fill="rgba(59, 130, 246, 0.15)"
            stroke="rgba(59, 130, 246, 0.6)"
            strokeWidth="1"
          />
        );
      })}
    </svg>
  );

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
        {/* Image area */}
        <div className="aspect-[3/4] relative bg-slate-100">
          {page.imageUrl && (
            <>
              <img
                ref={imageRef}
                src={page.imageUrl}
                alt={`Page ${page.pageNumber}`}
                className="w-full h-full object-contain cursor-pointer"
                onClick={() => setShowLightbox(true)}
              />
              {showOverlay && hasBoundingBoxes && imageDimensions && renderOverlay(imageDimensions)}
            </>
          )}
          {/* Page number badge */}
          <div className="absolute top-3 left-3 bg-slate-900/70 text-white text-xs font-medium px-2 py-1 rounded-md">
            Page {page.pageNumber}
          </div>
          {/* OCR toggle */}
          {hasBoundingBoxes && (
            <button
              onClick={() => setShowOverlay(!showOverlay)}
              className={`absolute top-3 right-3 text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
                showOverlay
                  ? "bg-blue-600 text-white"
                  : "bg-white/90 text-slate-700 hover:bg-white"
              }`}
            >
              {showOverlay ? "Hide OCR" : "Show OCR"}
            </button>
          )}
        </div>

        {/* Info area */}
        <div className="p-4">
          {/* Status and word count */}
          <div className="flex items-center justify-between mb-3">
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${status.bg} ${status.text}`}>
              {status.label}
            </span>
            {page.status === "done" && page.wordCount !== undefined && (
              <span className="text-sm font-semibold text-slate-900">
                {page.wordCount.toLocaleString()} words
              </span>
            )}
          </div>

          {/* Readability */}
          {page.status === "done" && page.readability && (
            <div className="flex items-center gap-3 text-xs text-slate-500 mb-3">
              <span title={`Flesch-Kincaid Grade Level`}>
                Grade {page.readability.fleschKincaidGrade}
              </span>
              <span className="text-slate-300">|</span>
              <span title={page.readability.readingLevel}>
                Ease: {page.readability.fleschReadingEase.toFixed(0)}
              </span>
            </div>
          )}

          {/* Error message */}
          {page.status === "error" && page.error && (
            <p className="text-xs text-red-600 mb-3 truncate" title={page.error}>
              {page.error}
            </p>
          )}

          {/* Extracted text toggle */}
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

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
            {(page.status === "error" || page.status === "done") && (
              <button
                onClick={handleReprocess}
                className="text-xs font-medium text-slate-500 hover:text-blue-600 transition-colors"
              >
                Re-process
              </button>
            )}
            <button
              onClick={handleDelete}
              className="text-xs font-medium text-slate-500 hover:text-red-600 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Lightbox Modal */}
      {showLightbox && page.imageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
          onClick={() => setShowLightbox(false)}
        >
          <div
            className="relative max-w-5xl max-h-[90vh] w-full h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <img
                ref={lightboxImageRef}
                src={page.imageUrl}
                alt={`Page ${page.pageNumber}`}
                className="max-w-full max-h-[85vh] object-contain rounded-lg"
              />
              {showOverlay && hasBoundingBoxes && lightboxDimensions && renderOverlay(lightboxDimensions)}
            </div>
            {/* Close button */}
            <button
              onClick={() => setShowLightbox(false)}
              className="absolute top-4 right-4 p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {/* OCR toggle in lightbox */}
            {hasBoundingBoxes && (
              <button
                onClick={() => setShowOverlay(!showOverlay)}
                className={`absolute top-4 left-4 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
                  showOverlay
                    ? "bg-blue-600 text-white"
                    : "bg-white/10 text-white hover:bg-white/20"
                }`}
              >
                {showOverlay ? "Hide OCR" : "Show OCR"}
              </button>
            )}
            {/* Page info in lightbox */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-sm px-4 py-2 rounded-lg">
              Page {page.pageNumber}
              {page.wordCount !== undefined && ` • ${page.wordCount.toLocaleString()} words`}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
