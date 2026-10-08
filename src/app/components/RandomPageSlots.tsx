"use client";

import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { imageName, useUploadPages } from "../lib/useUploadPages";
import { CameraIcon, PhotoIcon } from "./icons";
import { PageScanner } from "./PageScanner";

// How many extra pages "Suggest more" draws
const MORE_PAGES = 4;

const smallButton = "text-xs font-medium transition-colors";

/**
 * Pages drawn at random from the whole book, to photograph as they are. Their counts (blank pages and chapter
 * openings included) correct the hand-picked pages, which are mostly full pages of text.
 */
export function RandomPageSlots(props: {
  bookId: Id<"books">;
  totalPages: number | undefined;
  openSlots: number[];
  slotShortfall: number;
  recommended?: boolean;
}) {
  const { bookId, totalPages, openSlots, slotShortfall } = props;
  const uploadPages = useUploadPages(bookId);
  const topUp = useMutation(api.books.topUpRandomSlots);
  const drawMore = useMutation(api.books.drawRandomSlots);
  const replaceSlot = useMutation(api.books.replaceRandomSlot);
  const [uploading, setUploading] = useState<Set<number>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [errors, setErrors] = useState<Record<number, { file: File; message: string }>>({});

  // Keep enough pages suggested for the ±10% target as the estimate changes
  useEffect(() => {
    if (slotShortfall > 0) void topUp({ id: bookId });
  }, [bookId, slotShortfall, topUp]);

  if (totalPages === undefined) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-5 text-sm text-stone-500">
        Set the page count in Book Tracker to get random pages to photograph.
      </div>
    );
  }

  const upload = async (slot: number, file: File | undefined) => {
    if (!file) return;
    setUploading((s) => new Set(s).add(slot));
    setErrors((s) => { const next = { ...s }; delete next[slot]; return next; });
    await uploadPages([file], undefined, [slot]).then(
      (failures) => { if (failures.length) setErrors((s) => ({ ...s, [slot]: { file, message: failures[0].message } })); },
      (error: Error) => setErrors((s) => ({ ...s, [slot]: { file, message: error.message } }))
    );
    setUploading((s) => new Set([...s].filter((x) => x !== slot)));
  };

  return (
    <section aria-labelledby="random-pages-heading" className="bg-white rounded-xl border border-stone-200 p-5">
      {scanning && <PageScanner bookId={bookId} slots={openSlots} onClose={() => setScanning(false)} />}
      <div className="flex items-start justify-between gap-4 mb-2">
        <h3 id="random-pages-heading" className="font-display text-lg font-semibold text-stone-900">
          Random pages
        </h3>
        <button
          onClick={() => drawMore({ id: bookId, count: MORE_PAGES })}
          className={`${smallButton} text-brand-600 hover:text-brand-700`}
        >
          Suggest more
        </button>
      </div>
      {props.recommended && <p className="text-sm text-green-700 mb-3">The recommended precision is met. Additional photos are optional.</p>}
      <details open={props.recommended ? undefined : true}>
      <summary className="cursor-pointer text-sm font-medium text-brand-600 mb-3">{openSlots.length} {props.recommended ? "optional " : ""}pages to photograph</summary>
      <p className="text-sm text-stone-500 mb-4">
        Photograph each of these pages as it is, even if it&apos;s blank or a chapter opening. Short pages are marked
        not ordinary automatically; correct a page if that&apos;s wrong. Skipping such pages is exactly the bias they
        correct.
      </p>

      {openSlots.length === 0 ? (
        <p className="text-sm text-stone-500">No random pages to photograph right now.</p>
      ) : (
        <>
          <button
            onClick={() => setScanning(true)}
            className="sm:hidden mb-3 inline-flex items-center px-4 py-2 bg-brand-700 text-white text-sm font-medium rounded-lg hover:bg-brand-800 transition-colors"
          >
            <CameraIcon className="w-4 h-4 mr-2" />
            Scan these pages
          </button>
          <ul className="divide-y divide-stone-100 border-y border-stone-100">
            {openSlots.map((slot) => (
              <li key={slot} className="py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-stone-900">Photograph page {slot}</span>
                <span className="flex items-center gap-3">
                  {uploading.has(slot) ? (
                    <span className="text-xs text-stone-500">Uploading...</span>
                  ) : (
                    <label className={`${smallButton} relative cursor-pointer text-brand-600 hover:text-brand-700 inline-flex items-center min-h-10 px-2 rounded focus-within:ring-2 focus-within:ring-brand-500`}>
                      <input
                        type="file"
                        accept="image/*"
                        aria-label={`Photo of page ${slot}`}
                        onChange={(e) => {
                          void upload(slot, e.target.files?.[0]);
                          e.target.value = "";
                        }}
                        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                      />
                      <PhotoIcon className="w-4 h-4 mr-1" />
                      Add photo
                    </label>
                  )}
                  <button
                    onClick={() => {
                      if (confirm(`Replace page ${slot} with another random page? Only do this if the page is missing or torn.`)) {
                        void replaceSlot({ id: bookId, bookPage: slot });
                      }
                    }}
                    title="Only for a page that's missing or torn"
                    className={`${smallButton} min-h-10 text-stone-500 hover:text-stone-600`}
                  >
                    Can&apos;t photograph it
                  </button>
                </span>
                </div>
                {errors[slot] && <div className="text-xs text-red-700 mt-1" role="alert">
                  {imageName(errors[slot].file)}: {errors[slot].message}
                  <button className="ml-2 min-h-10 underline" onClick={() => void upload(slot, errors[slot].file)}>Retry</button>
                </div>}
              </li>
            ))}
          </ul>
        </>
      )}
      </details>
    </section>
  );
}
