"use client";

import { useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { useUploadPages } from "../lib/useUploadPages";
import { CameraIcon, PhotoIcon, SpinnerIcon } from "./icons";
import { PageScanner } from "./PageScanner";

const buttonClass =
  "inline-flex items-center px-5 py-3 bg-brand-700 text-white text-sm font-medium rounded-lg cursor-pointer hover:bg-brand-800 transition-colors shadow-sm";

export function PhotoUpload({ bookId }: { bookId: Id<"books"> }) {
  const uploadPages = useUploadPages(bookId);
  // null when idle
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [scanning, setScanning] = useState(false);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setProgress({ done: 0, total: files.length });
    // Pages are numbered in selection order
    await uploadPages(Array.from(files), () => setProgress((p) => p && { ...p, done: p.done + 1 }));
    setProgress(null);
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleUpload(e.target.files);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleUpload(e.dataTransfer.files);
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragging(false);
      }}
      className={`relative bg-white border-2 border-dashed rounded-xl p-8 text-center transition-all ${
        isDragging
          ? "border-brand-400 bg-brand-50"
          : progress
            ? "border-brand-300 bg-brand-50"
            : "border-stone-200 hover:border-stone-300"
      }`}
    >
      {scanning && <PageScanner bookId={bookId} onClose={() => setScanning(false)} />}
      {progress ? (
        <div className="space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-100">
            <SpinnerIcon className="w-6 h-6 text-brand-600 animate-spin" />
          </div>
          <div>
            <div className="text-lg font-medium text-stone-900">
              Uploaded {progress.done} of {progress.total}
            </div>
            <div className="text-sm text-stone-500 mt-1">Please wait...</div>
          </div>
          <div className="max-w-xs mx-auto h-2 bg-stone-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-700 rounded-full transition-all duration-300"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-stone-100 mb-4">
            <PhotoIcon className="w-6 h-6 text-stone-400" />
          </div>
          <div className="text-stone-600 mb-4">
            <span className="hidden sm:inline">
              <span className="font-medium">Drop photos here</span> or click to browse
            </span>
            <span className="sm:hidden">Photograph a few pages to estimate the word count</span>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <button onClick={() => setScanning(true)} className={`${buttonClass} sm:hidden`}>
              <CameraIcon className="w-4 h-4 mr-2" />
              Scan Pages
            </button>
            <label className={buttonClass}>
              <input type="file" accept="image/*" multiple onChange={handleInput} className="hidden" />
              <PhotoIcon className="w-4 h-4 mr-2" />
              Choose Photos
            </label>
          </div>
          <p className="mt-4 text-sm text-stone-400">
            <span className="sm:hidden">Scan Pages lets you snap page after page without leaving the camera</span>
            <span className="hidden sm:inline">Supports JPG, PNG, HEIC • Multiple files allowed</span>
          </p>
        </>
      )}
    </div>
  );
}
