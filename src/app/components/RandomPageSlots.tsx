"use client";

import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useUploadPages } from "../lib/useUploadPages";
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
}) {
  const { bookId, totalPages, openSlots, slotShortfall } = props;
  const uploadPages = useUploadPages(bookId);
  const topUp = useMutation(api.books.topUpRandomSlots);
  const drawMore = useMutation(api.books.drawRandomSlots);
  const replaceSlot = useMutation(api.books.replaceRandomSlot);
  const [uploading, setUploading] = useState<Set<number>>(new Set());
  const [scanning, setScanning] = useState(false);

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
    await uploadPages([file], undefined, [slot]);
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
      <p className="text-sm text-stone-500 mb-4">
        Photograph each of these pages as it is, even if it&apos;s blank or a chapter opening, then mark whether
        it&apos;s an ordinary page of text. Skipping such pages is exactly the bias they correct.
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
              <li key={slot} className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm text-stone-900">Photograph page {slot}</span>
                <span className="flex items-center gap-3">
                  {uploading.has(slot) ? (
                    <span className="text-xs text-stone-500">Uploading...</span>
                  ) : (
                    <label className={`${smallButton} cursor-pointer text-brand-600 hover:text-brand-700 inline-flex items-center`}>
                      <input
                        type="file"
                        accept="image/*"
                        aria-label={`Photo of page ${slot}`}
                        onChange={(e) => {
                          void upload(slot, e.target.files?.[0]);
                          e.target.value = "";
                        }}
                        className="hidden"
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
                    className={`${smallButton} text-stone-400 hover:text-stone-600`}
                  >
                    Can&apos;t photograph it
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
