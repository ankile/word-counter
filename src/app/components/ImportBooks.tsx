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
        className="text-sm text-blue-600 hover:text-blue-800"
      >
        Import from Book Tracker
      </button>
    );
  }

  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold">Import from Book Tracker</h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-500 hover:text-gray-700"
        >
          &times;
        </button>
      </div>

      {error && (
        <div className="text-red-600 text-sm mb-3 p-2 bg-red-50 rounded">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-gray-500 text-sm mb-3">Loading books...</div>
      )}

      {firebaseBooks.length > 0 && (
        <>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-gray-600">
              {firebaseBooks.length} books found
            </span>
            <button
              onClick={handleImportAll}
              disabled={loading}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Import All Remaining
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-2">
            {firebaseBooks.map((book) => {
              const isImported = importedFirebaseIds.has(book.id);
              const isImporting = importing.has(book.id);

              return (
                <div
                  key={book.id}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{book.title}</div>
                    {book.author && (
                      <div className="text-gray-500 text-xs truncate">
                        by {book.author}
                      </div>
                    )}
                    <div className="text-gray-400 text-xs">
                      {book.pageCount && `${book.pageCount} pages`}
                      {book.finished && " • Finished"}
                    </div>
                  </div>
                  <div className="ml-2">
                    {isImported ? (
                      <span className="text-green-600 text-xs">Imported</span>
                    ) : (
                      <button
                        onClick={() => handleImport(book)}
                        disabled={isImporting}
                        className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                      >
                        {isImporting ? "..." : "Import"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
