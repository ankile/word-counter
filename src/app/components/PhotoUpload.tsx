"use client";

import { useRef, useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { imageName, useUploadPages, type UploadFailure } from "../lib/useUploadPages";
import { CameraIcon, PhotoIcon, SpinnerIcon } from "./icons";
import { PageScanner } from "./PageScanner";

const buttonClass = "inline-flex items-center px-5 py-3 bg-brand-700 text-white text-sm font-medium rounded-lg hover:bg-brand-800 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

export function PhotoUpload({ bookId, compact = false }: { bookId: Id<"books">; compact?: boolean }) {
  const uploadPages = useUploadPages(bookId);
  const picker = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failures, setFailures] = useState<UploadFailure[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [scanning, setScanning] = useState(false);

  const handleUpload = async (files: Blob[]) => {
    if (files.length === 0 || progress) return;
    setFailures([]);
    setProgress({ done: 0, total: files.length });
    // Decoding and network failures are expected. Show them and restore the picker.
    await uploadPages(files, () => setProgress((p) => p && { ...p, done: p.done + 1 })).then(
      setFailures,
      (error: Error) => setFailures(files.map((image) => ({ image, slot: undefined, message: error.message })))
    );
    setProgress(null);
  };

  return (
    <div
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); void handleUpload(Array.from(e.dataTransfer.files)); }}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
      className={`bg-white border-2 border-dashed rounded-xl ${compact ? "p-4" : "p-8"} text-center ${isDragging ? "border-brand-400 bg-brand-50" : "border-stone-200"}`}
    >
      {scanning && <PageScanner bookId={bookId} onClose={() => setScanning(false)} />}
      <input ref={picker} type="file" accept="image/*" multiple aria-label="Page photos"
        onChange={(e) => { void handleUpload(Array.from(e.target.files!)); e.target.value = ""; }} className="hidden" />
      {progress ? (
        <div className="space-y-3" role="status">
          <SpinnerIcon className="w-6 h-6 text-brand-600 animate-spin mx-auto" />
          <div className="font-medium text-stone-900">Uploaded {progress.done} of {progress.total}</div>
          <div className="max-w-xs mx-auto h-2 bg-stone-200 rounded-full overflow-hidden">
            <div className="h-full bg-brand-700 transition-all" style={{ width: `${progress.done / progress.total * 100}%` }} />
          </div>
        </div>
      ) : (
        <>
          {!compact && <PhotoIcon className="w-8 h-8 text-stone-400 mx-auto mb-3" />}
          <div className={`flex flex-wrap items-center justify-center gap-3 ${compact ? "" : "mb-3"}`}>
            <span className="text-sm text-stone-600">{compact ? "Add more page photos" : "Drop photos here or choose files below"}</span>
            <button onClick={() => setScanning(true)} className={`${buttonClass} sm:hidden`}>
              <CameraIcon className="w-4 h-4 mr-2" />Scan Pages
            </button>
            <button onClick={() => picker.current!.click()} className={buttonClass}>
              <PhotoIcon className="w-4 h-4 mr-2" />Choose Photos
            </button>
          </div>
          {!compact && <p className="text-xs text-stone-500">JPG, PNG and other browser-supported images. HEIC may need exporting as JPG. Multiple files allowed.</p>}
          {failures.length > 0 && (
            <div className="mt-3 rounded-lg bg-red-50 p-3 text-left text-sm text-red-700" role="alert">
              <ul className="space-y-1">{failures.map((failure, i) => <li key={i}>{imageName(failure.image)}: {failure.message}</li>)}</ul>
              <button onClick={() => void handleUpload(failures.map((f) => f.image))} className="mt-2 min-h-10 font-medium underline">Retry failed photos</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
