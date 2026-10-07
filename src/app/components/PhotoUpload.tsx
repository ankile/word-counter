"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PhotoIcon, PlusIcon, SpinnerIcon } from "./icons";

export function PhotoUpload({ bookId }: { bookId: Id<"books"> }) {
  const generateUploadUrl = useMutation(api.pages.generateUploadUrl);
  const createPages = useMutation(api.pages.createMany);
  // null when idle
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const uploadFile = async (file: File): Promise<Id<"_storage">> => {
    const response = await fetch(await generateUploadUrl(), {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
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
            <span className="font-medium">Drop photos here</span> or click to browse
          </div>
          <label className="inline-flex items-center px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg cursor-pointer hover:bg-blue-700 transition-colors shadow-sm">
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                handleUpload(e.target.files);
                e.target.value = "";
              }}
              className="hidden"
            />
            <PlusIcon className="w-4 h-4 mr-2" />
            Select Photos
          </label>
          <p className="mt-4 text-sm text-slate-400">Supports JPG, PNG, HEIC • Multiple files allowed</p>
        </>
      )}
    </div>
  );
}
