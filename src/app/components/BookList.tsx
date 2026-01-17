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
    return <div className="text-gray-500">Loading books...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Books</h1>
        <button
          onClick={() => setIsCreating(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          + New Book
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="flex gap-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Book title"
            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          <button
            type="submit"
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => setIsCreating(false)}
            className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
          >
            Cancel
          </button>
        </form>
      )}

      <ImportBooks />

      {books.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No books yet. Create one to get started!
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((book) => (
            <div
              key={book._id}
              className="border rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <Link href={`/books/${book._id}`} className="block">
                <h2 className="text-lg font-semibold truncate">{book.title}</h2>
                <div className="mt-2 text-sm text-gray-600">
                  <p>{book.totalWordCount.toLocaleString()} words</p>
                  {book.pageCount > 0 && (
                    <p>{Math.round(book.totalWordCount / book.pageCount)} avg/page</p>
                  )}
                  <p>
                    {book.processedCount}/{book.pageCount} pages processed
                  </p>
                </div>
              </Link>
              <button
                onClick={() => handleDelete(book._id)}
                className="mt-3 text-sm text-red-600 hover:text-red-800"
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
