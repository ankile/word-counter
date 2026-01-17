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
          {book.avgReadability && (
            <div className="mt-3 p-3 bg-white rounded-lg border">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Readability</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-gray-500 text-xs">Grade Level</div>
                  <div className="font-medium">{book.avgReadability.fleschKincaidGrade}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Reading Ease</div>
                  <div className="font-medium">{book.avgReadability.fleschReadingEase}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Words/Sentence</div>
                  <div className="font-medium">{book.avgReadability.avgWordsPerSentence}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Syllables/Word</div>
                  <div className="font-medium">{book.avgReadability.avgSyllablesPerWord}</div>
                </div>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                {book.avgReadability.readingLevel}
              </div>
            </div>
          )}
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
