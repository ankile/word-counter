"use client";

import { useAction, useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { FirebaseBook } from "../../../convex/firebase";
import { CloseIcon } from "./icons";

export function ImportBooks({ importedFirebaseIds }: { importedFirebaseIds: Set<string> }) {
  const [isOpen, setIsOpen] = useState(false);
  // null while loading
  const [firebaseBooks, setFirebaseBooks] = useState<FirebaseBook[] | null>(null);
  const [importing, setImporting] = useState<Set<string>>(new Set());

  const listFirebaseBooks = useAction(api.firebase.listFirebaseBooks);
  const importFromFirebase = useMutation(api.books.importFromFirebase);

  const handleOpen = async () => {
    setIsOpen(true);
    setFirebaseBooks(null);
    setFirebaseBooks(await listFirebaseBooks());
  };

  const handleImport = async (book: FirebaseBook) => {
    setImporting((prev) => new Set(prev).add(book.id));
    await importFromFirebase({
      firebaseId: book.id,
      title: book.title,
      author: book.author,
      totalPages: book.pageCount,
    });
    setImporting((prev) => {
      const next = new Set(prev);
      next.delete(book.id);
      return next;
    });
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

  const remaining = (firebaseBooks ?? []).filter((book) => !importedFirebaseIds.has(book.id));

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
            aria-label="Close"
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {firebaseBooks === null ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-pulse text-slate-400">Loading books...</div>
            </div>
          ) : firebaseBooks.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">No books found in Book Tracker.</div>
          ) : (
            <div className="space-y-2">
              {firebaseBooks.map((book) => {
                const isImported = importedFirebaseIds.has(book.id);
                return (
                  <div
                    key={book.id}
                    className={`flex items-center justify-between p-3 rounded-lg border border-slate-200 transition-colors ${
                      isImported ? "bg-slate-50" : "bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex-1 min-w-0 mr-3">
                      <div className={`font-medium truncate ${isImported ? "text-slate-400" : "text-slate-900"}`}>
                        {book.title}
                      </div>
                      {book.author && <div className="text-sm text-slate-500 truncate">{book.author}</div>}
                      <div className="text-xs text-slate-400 mt-0.5">
                        {[book.pageCount && `${book.pageCount} pages`, book.finished && "Finished"]
                          .filter(Boolean)
                          .join(" · ")}
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
                          disabled={importing.has(book.id)}
                          className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {importing.has(book.id) ? "..." : "Import"}
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
        {firebaseBooks && firebaseBooks.length > 0 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
            <span className="text-sm text-slate-600">
              {firebaseBooks.length} books · {remaining.length} remaining
            </span>
            {remaining.length > 0 && (
              <button
                onClick={() => Promise.all(remaining.map(handleImport))}
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
