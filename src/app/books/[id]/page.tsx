"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { use } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { AppShell } from "../../components/AppShell";
import { ChevronLeftIcon } from "../../components/icons";
import { PageList } from "../../components/PageList";
import { PhotoUpload } from "../../components/PhotoUpload";
import { SampleConfidence } from "../../components/SampleConfidence";

const backLink = (
  <Link
    href="/"
    className="text-blue-600 hover:text-blue-700 text-sm font-medium inline-flex items-center gap-1"
  >
    <ChevronLeftIcon className="w-4 h-4" />
    Back to library
  </Link>
);

export default function BookPage({ params }: PageProps<"/books/[id]">) {
  const bookId = use(params).id as Id<"books">;
  const book = useQuery(api.books.get, { id: bookId });

  if (book === undefined) {
    return (
      <AppShell header={<div className="animate-pulse h-6 w-32 bg-slate-200 rounded" />}>
        <div className="animate-pulse text-slate-400">Loading...</div>
      </AppShell>
    );
  }

  if (book === null) {
    return (
      <AppShell header={backLink}>
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-red-600 font-medium">
          Book not found
        </div>
      </AppShell>
    );
  }

  const stats = [
    { label: "Words (sampled)", value: book.totalWordCount.toLocaleString() },
    { label: "Pages sampled", value: book.pageCount },
    book.totalPages !== undefined && { label: "Total pages", value: book.totalPages },
    book.avgWordsPerPage !== null && { label: "Avg/page", value: book.avgWordsPerPage },
  ].filter((stat) => stat !== false);

  const readability = book.avgReadability;

  return (
    <AppShell header={backLink}>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">{book.title}</h1>
        {book.author && <p className="text-slate-500 mt-1">by {book.author}</p>}

        <div className="flex flex-wrap gap-4 mt-4 text-sm">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-center gap-2">
              <span className="text-slate-500">{stat.label}:</span>
              <span className="font-semibold text-slate-900">{stat.value}</span>
            </div>
          ))}
        </div>

        {readability && (
          <div className="mt-6 bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Readability Analysis</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Grade Level", value: readability.fleschKincaidGrade },
                { label: "Reading Ease", value: readability.fleschReadingEase },
                { label: "Words/Sentence", value: readability.avgWordsPerSentence },
                { label: "Syllables/Word", value: readability.avgSyllablesPerWord },
              ].map((tile) => (
                <div key={tile.label} className="text-center p-3 bg-slate-50 rounded-lg">
                  <div className="text-2xl font-bold text-slate-900">{tile.value}</div>
                  <div className="text-xs text-slate-500 mt-1">{tile.label}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-center">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                {readability.readingLevel}
              </span>
            </div>
          </div>
        )}

        {book.samplingStats && (
          <div className="mt-6">
            <SampleConfidence stats={book.samplingStats} totalBookPages={book.totalPages} />
          </div>
        )}
      </div>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Upload Photos</h2>
        <PhotoUpload bookId={bookId} />
      </section>

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
    </AppShell>
  );
}
