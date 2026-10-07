"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { resizeImage } from "../lib/resizeImage";
import { CameraIcon, PhotoIcon, SpinnerIcon } from "./icons";

const buttonClass =
  "inline-flex items-center px-5 py-3 bg-blue-600 text-white text-sm font-medium rounded-lg cursor-pointer hover:bg-blue-700 transition-colors shadow-sm";

export function PhotoUpload({ bookId }: { bookId: Id<"books"> }) {
  const generateUploadUrl = useMutation(api.pages.generateUploadUrl);
  const createPages = useMutation(api.pages.createMany);
  // null when idle
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const uploadFile = async (file: File): Promise<Id<"_storage">> => {
    const image = await resizeImage(file);
    const response = await fetch(await generateUploadUrl(), {
      method: "POST",
      headers: { "Content-Type": image.type },
      body: image,
    });
    const { storageId } = await response.json();
    setProgress((p) => p && { ...p, done: p.done + 1 });
    return storageId;
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setProgress({ done: 0, total: files.length });
    // Upload in parallel; pages are numbered in selection order
    const imageStorageIds = await Promise.all(Array.from(files).map(uploadFile));
    await createPages({ bookId, imageStorageIds });
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
          ? "border-blue-400 bg-blue-50"
          : progress
            ? "border-blue-300 bg-blue-50"
            : "border-slate-200 hover:border-slate-300"
      }`}
    >
      {progress ? (
        <div className="space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100">
            <SpinnerIcon className="w-6 h-6 text-blue-600 animate-spin" />
          </div>
          <div>
            <div className="text-lg font-medium text-slate-900">
              Uploaded {progress.done} of {progress.total}
            </div>
            <div className="text-sm text-slate-500 mt-1">Please wait...</div>
          </div>
          <div className="max-w-xs mx-auto h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-300"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 mb-4">
            <PhotoIcon className="w-6 h-6 text-slate-400" />
          </div>
          <div className="text-slate-600 mb-4">
            <span className="hidden sm:inline">
              <span className="font-medium">Drop photos here</span> or click to browse
            </span>
            <span className="sm:hidden">Photograph a few pages to estimate the word count</span>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {/* capture opens the rear camera directly on phones */}
            <label className={`${buttonClass} sm:hidden`}>
              <input type="file" accept="image/*" capture="environment" onChange={handleInput} className="hidden" />
              <CameraIcon className="w-4 h-4 mr-2" />
              Take Photo
            </label>
            <label className={buttonClass}>
              <input type="file" accept="image/*" multiple onChange={handleInput} className="hidden" />
              <PhotoIcon className="w-4 h-4 mr-2" />
              Choose Photos
            </label>
          </div>
          <p className="mt-4 text-sm text-slate-400">Supports JPG, PNG, HEIC • Multiple files allowed</p>
        </>
      )}
    </div>
  );
}
