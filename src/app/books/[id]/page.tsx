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
      <main className="min-h-screen flex flex-col">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
            <div className="animate-pulse h-6 w-32 bg-slate-200 rounded" />
          </div>
        </header>
        <div className="flex-1 max-w-5xl mx-auto py-8 px-4 sm:px-6 w-full">
          <div className="animate-pulse text-slate-400">Loading...</div>
        </div>
      </main>
    );
  }

  if (book === null) {
    return (
      <main className="min-h-screen flex flex-col">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
            <Link href="/" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
              &larr; Back to books
            </Link>
          </div>
        </header>
        <div className="flex-1 max-w-5xl mx-auto py-8 px-4 sm:px-6 w-full">
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <div className="text-red-600 font-medium">Book not found</div>
            <Link href="/" className="text-blue-600 hover:underline text-sm mt-2 inline-block">
              Return to library
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <Link href="/" className="text-blue-600 hover:text-blue-700 text-sm font-medium inline-flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to library
          </Link>
        </div>
      </header>

      <div className="flex-1 max-w-5xl mx-auto py-8 px-4 sm:px-6 w-full">
        {/* Book info */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">{book.title}</h1>
          {book.author && (
            <p className="text-slate-500 mt-1">by {book.author}</p>
          )}

          {/* Stats row */}
          <div className="flex flex-wrap gap-4 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Words:</span>
              <span className="font-semibold text-slate-900">{book.totalWordCount.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Pages:</span>
              <span className="font-semibold text-slate-900">{book.pageCount}</span>
            </div>
            {book.pageCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Avg/page:</span>
                <span className="font-semibold text-slate-900">
                  {Math.round(book.totalWordCount / book.pageCount)}
                </span>
              </div>
            )}
          </div>

          {/* Readability card */}
          {book.avgReadability && (
            <div className="mt-6 bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">Readability Analysis</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-slate-50 rounded-lg">
                  <div className="text-2xl font-bold text-slate-900">{book.avgReadability.fleschKincaidGrade}</div>
                  <div className="text-xs text-slate-500 mt-1">Grade Level</div>
                </div>
                <div className="text-center p-3 bg-slate-50 rounded-lg">
                  <div className="text-2xl font-bold text-slate-900">{book.avgReadability.fleschReadingEase}</div>
                  <div className="text-xs text-slate-500 mt-1">Reading Ease</div>
                </div>
                <div className="text-center p-3 bg-slate-50 rounded-lg">
                  <div className="text-2xl font-bold text-slate-900">{book.avgReadability.avgWordsPerSentence}</div>
                  <div className="text-xs text-slate-500 mt-1">Words/Sentence</div>
                </div>
                <div className="text-center p-3 bg-slate-50 rounded-lg">
                  <div className="text-2xl font-bold text-slate-900">{book.avgReadability.avgSyllablesPerWord}</div>
                  <div className="text-xs text-slate-500 mt-1">Syllables/Word</div>
                </div>
              </div>
              <div className="mt-4 text-center">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                  {book.avgReadability.readingLevel}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Upload section */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Upload Photos</h2>
          <PhotoUpload bookId={bookId} currentPageCount={book.pageCount} />
        </section>

        {/* Pages section */}
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Pages
            {book.pageCount > 0 && (
              <span className="text-sm font-normal text-slate-500 ml-2">
                ({book.processedCount}/{book.pageCount} processed)
              </span>
            )}
          </h2>
          <PageList bookId={bookId} />
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 text-center text-sm text-slate-500">
          <a
            href="https://github.com/ankile/word-counter"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-700 transition-colors"
          >
            View on GitHub
          </a>
        </div>
      </footer>
    </main>
  );
}
