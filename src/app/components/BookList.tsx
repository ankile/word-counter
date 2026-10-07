"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { fetchTrackerBooks } from "../lib/bookTracker";
import { useUser } from "./Providers";

type Filter = "all" | "unfinished" | "sampled";
const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unfinished", label: "Unfinished" },
  { value: "sampled", label: "Sampled" },
];

/** Pull the latest Book Tracker library into Convex once per page load. */
function useTrackerSync() {
  const user = useUser();
  const syncFromTracker = useMutation(api.books.syncFromTracker);
  const [status, setStatus] = useState<"syncing" | "done" | { error: string }>("syncing");

  useEffect(() => {
    fetchTrackerBooks(user.uid)
      .then((books) => syncFromTracker({ books }))
      .then(
        () => setStatus("done"),
        // Surface the failure; the last synced library is still usable
        (err: Error) => setStatus({ error: err.message })
      );
  }, [user.uid, syncFromTracker]);

  return status;
}

export function BookList() {
  const books = useQuery(api.books.list);
  const syncStatus = useTrackerSync();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  if (books === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-slate-400">Loading books...</div>
      </div>
    );
  }

  const query = search.trim().toLowerCase();
  const visible = books.filter(
    (book) =>
      (filter === "all" || (filter === "unfinished" ? !book.finished : book.pageCount > 0)) &&
      (!query || `${book.title} ${book.author ?? ""}`.toLowerCase().includes(query))
  );

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-900">Your Books</h2>
        <p className="text-sm text-slate-500">
          {syncStatus === "syncing"
            ? "Syncing with Book Tracker..."
            : syncStatus === "done"
              ? `${books.length} books`
              : null}
        </p>
      </div>

      {typeof syncStatus === "object" && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          Couldn&apos;t sync with Book Tracker: {syncStatus.error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title or author"
          className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <div className="flex rounded-lg border border-slate-200 bg-white p-1 text-sm">
          {filters.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`flex-1 px-3 py-1.5 rounded-md font-medium transition-colors ${
                filter === value ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-sm text-slate-500">
          {books.length === 0 ? "No books yet. Add books in Book Tracker." : "No matching books"}
        </div>
      ) : (
        <ul className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {visible.map((book) => (
            <li key={book._id}>
              <Link
                href={`/books/${book._id}`}
                className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900 truncate">{book.title}</div>
                  <div className="text-sm text-slate-500 truncate">
                    {[book.author, book.finished && "Finished"].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="text-right text-sm shrink-0">
                  {book.pageCount > 0 ? (
                    <>
                      <div className="font-medium text-slate-900">
                        {book.avgWordsPerPage !== null ? `${book.avgWordsPerPage} words/page` : "Processing"}
                      </div>
                      <div className="text-slate-500">
                        {book.processedCount}/{book.pageCount} pages
                      </div>
                    </>
                  ) : (
                    <span className="text-slate-400">No samples</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
