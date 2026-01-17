"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

interface FirebaseBook {
  id: string;
  title: string;
  author?: string;
  pageCount?: number;
  currentPage?: number;
  finished?: boolean;
}

// Default user ID for lars.ankile@gmail.com - will be replaced with proper auth
const DEFAULT_USER_ID = "1Cf0CaNfgnVSvTrF5dYjzRd9Xri2";

export function ImportBooks() {
  const [isOpen, setIsOpen] = useState(false);
  const [firebaseBooks, setFirebaseBooks] = useState<FirebaseBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<Set<string>>(new Set());

  const listFirebaseBooks = useAction(api.firebase.listFirebaseBooks);
  const importFromFirebase = useMutation(api.books.importFromFirebase);
  const books = useQuery(api.books.list);

  const importedFirebaseIds = new Set(
    books?.filter((b) => b.firebaseId).map((b) => b.firebaseId) || []
  );

  const handleOpen = async () => {
    setIsOpen(true);
    await fetchBooksForUser(DEFAULT_USER_ID);
  };

  const fetchBooksForUser = async (uid: string) => {
    setLoading(true);
    setError(null);
    try {
      const fetchedBooks = await listFirebaseBooks({ userId: uid });
      setFirebaseBooks(fetchedBooks);
      if (fetchedBooks.length === 0) {
        setError("No books found for this user.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch books");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (book: FirebaseBook) => {
    setImporting((prev) => new Set(prev).add(book.id));
    try {
      await importFromFirebase({
        firebaseId: book.id,
        firebaseUserId: DEFAULT_USER_ID,
        title: book.title,
        author: book.author,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import book");
    } finally {
      setImporting((prev) => {
        const next = new Set(prev);
        next.delete(book.id);
        return next;
      });
    }
  };

  const handleImportAll = async () => {
    const booksToImport = firebaseBooks.filter(
      (book) => !importedFirebaseIds.has(book.id)
    );
    for (const book of booksToImport) {
      await handleImport(book);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={handleOpen}
        className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors"
      >
        Import from Book Tracker
      </button>
    );
  }

  const remainingCount = firebaseBooks.filter(
    (book) => !importedFirebaseIds.has(book.id)
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h3 className="font-semibold text-slate-900">Import from Book Tracker</h3>
            <p className="text-sm text-slate-500">Select books to track word counts</p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-pulse text-slate-400">Loading books...</div>
            </div>
          )}

          {!loading && firebaseBooks.length > 0 && (
            <div className="space-y-2">
              {firebaseBooks.map((book) => {
                const isImported = importedFirebaseIds.has(book.id);
                const isImporting = importing.has(book.id);

                return (
                  <div
                    key={book.id}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                      isImported
                        ? "bg-slate-50 border-slate-200"
                        : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex-1 min-w-0 mr-3">
                      <div className={`font-medium truncate ${isImported ? "text-slate-400" : "text-slate-900"}`}>
                        {book.title}
                      </div>
                      {book.author && (
                        <div className="text-sm text-slate-500 truncate">
                          {book.author}
                        </div>
                      )}
                      <div className="text-xs text-slate-400 mt-0.5">
                        {book.pageCount && `${book.pageCount} pages`}
                        {book.finished && " · Finished"}
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      {isImported ? (
                        <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full">
                          Imported
                        </span>
                      ) : (
                        <button
                          onClick={() => handleImport(book)}
                          disabled={isImporting}
                          className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {isImporting ? "..." : "Import"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {firebaseBooks.length > 0 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
            <span className="text-sm text-slate-600">
              {firebaseBooks.length} books · {remainingCount} remaining
            </span>
            {remainingCount > 0 && (
              <button
                onClick={handleImportAll}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
              >
                Import All Remaining
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
