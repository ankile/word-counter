"use client";

import { useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useState, useRef } from "react";

interface PhotoUploadProps {
  bookId: Id<"books">;
  currentPageCount: number;
}

export function PhotoUpload({ bookId, currentPageCount }: PhotoUploadProps) {
  const generateUploadUrl = useMutation(api.pages.generateUploadUrl);
  const createPage = useMutation(api.pages.create);
  const processPage = useAction(api.ocrAction.processPage);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    setProgress({ current: 0, total: files.length });

    const fileArray = Array.from(files);

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      setProgress({ current: i + 1, total: files.length });

      const uploadUrl = await generateUploadUrl();

      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      const { storageId } = await result.json();

      const pageId = await createPage({
        bookId,
        imageStorageId: storageId,
        pageNumber: currentPageCount + i + 1,
      });

      // Trigger OCR processing (fire and forget)
      processPage({ pageId });
    }

    setUploading(false);
    setProgress({ current: 0, total: 0 });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleUpload(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
        uploading
          ? "border-blue-400 bg-blue-50"
          : "border-gray-300 hover:border-gray-400"
      }`}
    >
      {uploading ? (
        <div>
          <div className="text-lg font-medium text-blue-600">
            Uploading... {progress.current}/{progress.total}
          </div>
          <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{
                width: `${(progress.current / progress.total) * 100}%`,
              }}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="text-gray-600 mb-4">
            Drag and drop photos here, or click to select
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleUpload(e.target.files)}
            className="hidden"
            id="photo-upload"
          />
          <label
            htmlFor="photo-upload"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 transition-colors"
          >
            Select Photos
          </label>
          <p className="mt-4 text-sm text-gray-500">
            You can also take photos directly on mobile
          </p>
        </>
      )}
    </div>
  );
}
