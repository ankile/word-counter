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

  const statusColors = {
    pending: "bg-yellow-100 text-yellow-800",
    processing: "bg-blue-100 text-blue-800",
    done: "bg-green-100 text-green-800",
    error: "bg-red-100 text-red-800",
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
            fill="rgba(59, 130, 246, 0.2)"
            stroke="rgba(59, 130, 246, 0.8)"
            strokeWidth="1"
          />
        );
      })}
    </svg>
  );

  return (
    <>
      <div className="border rounded-lg overflow-hidden bg-white">
        <div className="aspect-[3/4] relative bg-gray-100">
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
          <div className="absolute top-2 left-2 bg-black/60 text-white text-sm px-2 py-1 rounded">
            #{page.pageNumber}
          </div>
          {hasBoundingBoxes && (
            <button
              onClick={() => setShowOverlay(!showOverlay)}
              className={`absolute top-2 right-2 text-xs px-2 py-1 rounded transition-colors ${
                showOverlay
                  ? "bg-blue-600 text-white"
                  : "bg-white/80 text-gray-700 hover:bg-white"
              }`}
            >
              {showOverlay ? "Hide OCR" : "Show OCR"}
            </button>
          )}
        </div>

        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <span
              className={`text-xs px-2 py-1 rounded-full ${statusColors[page.status]}`}
            >
              {page.status}
            </span>
            {page.status === "done" && page.wordCount !== undefined && (
              <span className="text-sm font-medium">
                {page.wordCount.toLocaleString()} words
              </span>
            )}
          </div>

          {page.status === "done" && page.readability && (
            <div className="text-xs text-gray-500 mb-2">
              <span title={`Flesch Reading Ease: ${page.readability.fleschReadingEase}`}>
                Grade {page.readability.fleschKincaidGrade}
              </span>
              <span className="mx-1">&bull;</span>
              <span title={page.readability.readingLevel}>
                {page.readability.fleschReadingEase.toFixed(0)} ease
              </span>
            </div>
          )}

          {page.status === "error" && page.error && (
            <p className="text-xs text-red-600 mb-2 truncate" title={page.error}>
              {page.error}
            </p>
          )}

          {page.status === "done" && page.extractedText && (
            <div>
              <button
                onClick={() => setShowText(!showText)}
                className="text-xs text-blue-600 hover:underline mb-2"
              >
                {showText ? "Hide text" : "Show text"}
              </button>
              {showText && (
                <pre className="text-xs bg-gray-50 p-2 rounded max-h-40 overflow-auto whitespace-pre-wrap">
                  {page.extractedText}
                </pre>
              )}
            </div>
          )}

          <div className="flex gap-2 mt-2">
            {(page.status === "error" || page.status === "done") && (
              <button
                onClick={handleReprocess}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Re-process
              </button>
            )}
            <button
              onClick={handleDelete}
              className="text-xs text-red-600 hover:text-red-800"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Lightbox Modal */}
      {showLightbox && page.imageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setShowLightbox(false)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] w-full h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <img
                ref={lightboxImageRef}
                src={page.imageUrl}
                alt={`Page ${page.pageNumber}`}
                className="max-w-full max-h-[85vh] object-contain"
              />
              {showOverlay && hasBoundingBoxes && lightboxDimensions && renderOverlay(lightboxDimensions)}
            </div>
            <button
              onClick={() => setShowLightbox(false)}
              className="absolute top-0 right-0 text-white text-2xl p-2 hover:bg-white/10 rounded"
            >
              &times;
            </button>
            {hasBoundingBoxes && (
              <button
                onClick={() => setShowOverlay(!showOverlay)}
                className={`absolute top-0 left-0 text-sm px-3 py-2 rounded transition-colors ${
                  showOverlay
                    ? "bg-blue-600 text-white"
                    : "bg-white/20 text-white hover:bg-white/30"
                }`}
              >
                {showOverlay ? "Hide OCR" : "Show OCR"}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
