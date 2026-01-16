"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { PhotoUpload } from "../../components/PhotoUpload";
import { PageList } from "../../components/PageList";
import Link from "next/link";
import { use } from "react";

interface BookPageProps {
  params: Promise<{ id: string }>;
}

export default function BookPage({ params }: BookPageProps) {
  const { id } = use(params);
  const bookId = id as Id<"books">;
  const book = useQuery(api.books.get, { id: bookId });

  if (book === undefined) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto py-8 px-4">
          <div className="text-gray-500">Loading...</div>
        </div>
      </main>
    );
  }

  if (book === null) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto py-8 px-4">
          <div className="text-red-600">Book not found</div>
          <Link href="/" className="text-blue-600 hover:underline">
            Back to books
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <Link href="/" className="text-blue-600 hover:underline text-sm">
          &larr; Back to books
        </Link>

        <div className="mt-4 mb-6">
          <h1 className="text-2xl font-bold">{book.title}</h1>
          <p className="text-gray-600">
            {book.totalWordCount.toLocaleString()} total words &bull;{" "}
            {book.pageCount} pages
            {book.pageCount > 0 && (
              <> &bull; {Math.round(book.totalWordCount / book.pageCount)} avg/page</>
            )}
          </p>
        </div>

        <div className="space-y-6">
          <section>
            <h2 className="text-lg font-semibold mb-3">Upload Photos</h2>
            <PhotoUpload bookId={bookId} currentPageCount={book.pageCount} />
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">Pages</h2>
            <PageList bookId={bookId} />
          </section>
        </div>
      </div>
    </main>
  );
}
