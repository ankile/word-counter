"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import Link from "next/link";
import { useState } from "react";
import { ImportBooks } from "./ImportBooks";

export function BookList() {
  const books = useQuery(api.books.list);
  const createBook = useMutation(api.books.create);
  const removeBook = useMutation(api.books.remove);
  const [newTitle, setNewTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    await createBook({ title: newTitle.trim() });
    setNewTitle("");
    setIsCreating(false);
  };

  const handleDelete = async (id: typeof books extends (infer T)[] | undefined ? T extends { _id: infer I } ? I : never : never) => {
    if (confirm("Delete this book and all its pages?")) {
      await removeBook({ id });
    }
  };

  if (books === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-slate-400">Loading books...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Your Books</h2>
          <p className="text-sm text-slate-500">
            {books.length} {books.length === 1 ? "book" : "books"} tracked
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ImportBooks />
          <button
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            + New Book
          </button>
        </div>
      </div>

      {/* Create form */}
      {isCreating && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <form onSubmit={handleCreate} className="flex gap-3">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Enter book title..."
              className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
              autoFocus
            />
            <button
              type="submit"
              className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-5 py-2.5 bg-slate-100 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      {/* Book grid */}
      {books.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="text-slate-400 mb-2">No books yet</div>
          <p className="text-sm text-slate-500">
            Create a new book or import from Book Tracker to get started
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((book) => (
            <div
              key={book._id}
              className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-slate-300 transition-all group"
            >
              <Link href={`/books/${book._id}`} className="block">
                <h3 className="font-semibold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                  {book.title}
                </h3>
                {book.author && (
                  <p className="text-sm text-slate-500 truncate mt-0.5">
                    by {book.author}
                  </p>
                )}
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Words</span>
                    <span className="font-medium text-slate-900">
                      {book.totalWordCount.toLocaleString()}
                    </span>
                  </div>
                  {book.pageCount > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Avg per page</span>
                      <span className="font-medium text-slate-900">
                        {Math.round(book.totalWordCount / book.pageCount)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Pages</span>
                    <span className="font-medium text-slate-900">
                      {book.processedCount}/{book.pageCount}
                    </span>
                  </div>
                </div>
                {/* Progress bar */}
                {book.pageCount > 0 && (
                  <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{
                        width: `${(book.processedCount / book.pageCount) * 100}%`,
                      }}
                    />
                  </div>
                )}
              </Link>
              <button
                onClick={() => handleDelete(book._id)}
                className="mt-4 text-sm text-slate-400 hover:text-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
