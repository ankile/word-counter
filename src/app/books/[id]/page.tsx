"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { AppShell } from "../../components/AppShell";
import { ChevronLeftIcon } from "../../components/icons";
import { PageList } from "../../components/PageList";
import { PhotoUpload } from "../../components/PhotoUpload";
import { RandomPageSlots } from "../../components/RandomPageSlots";
import { SampleConfidence } from "../../components/SampleConfidence";
import { SendToBookTracker } from "../../components/SendToBookTracker";
import { VocabularyCard } from "../../components/VocabularyCard";

const backLink = (
  <Link
    href="/"
    className="text-brand-600 hover:text-brand-700 text-sm font-medium inline-flex items-center gap-1"
  >
    <ChevronLeftIcon className="w-4 h-4" />
    Back to library
  </Link>
);

export default function BookPage({ params }: PageProps<"/books/[id]">) {
  const bookId = use(params).id as Id<"books">;
  const book = useQuery(api.books.get, { id: bookId });
  const removeBook = useMutation(api.books.remove);
  const router = useRouter();

  const handleDelete = async () => {
    if (confirm("Delete this book and all its pages?")) {
      router.push("/");
      await removeBook({ id: bookId });
    }
  };

  if (book === undefined) {
    return (
      <AppShell nav={<div className="animate-pulse h-5 w-32 bg-stone-200 rounded" />}>
        <div className="animate-pulse text-stone-400">Loading...</div>
      </AppShell>
    );
  }

  if (book === null) {
    return (
      <AppShell nav={backLink}>
        <div className="bg-white rounded-xl border border-stone-200 p-8 text-center text-red-600 font-medium">
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
    <AppShell nav={backLink}>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">{book.title}</h1>
        {book.author && <p className="text-stone-500 mt-1">by {book.author}</p>}

        <div className="flex flex-wrap gap-4 mt-4 text-sm">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-center gap-2">
              <span className="text-stone-500">{stat.label}:</span>
              <span className="font-semibold text-stone-900">{stat.value}</span>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <PhotoUpload bookId={bookId} />
        </div>

        {book.estimate && (
          <div className="mt-6">
            <SampleConfidence estimate={book.estimate} />
          </div>
        )}

        <div className="mt-6">
          <RandomPageSlots
            bookId={bookId}
            totalPages={book.totalPages}
            openSlots={book.openSlots}
            slotShortfall={book.slotShortfall}
          />
        </div>

        {book.trackerBookId && (
          <div className="mt-6">
            <SendToBookTracker bookId={bookId} estimate={book.estimate} publish={book.publish} />
          </div>
        )}

        {book.processedCount > 0 && (
          <div className="mt-6">
            <VocabularyCard stats={book.vocabulary} processedPages={book.processedCount} />
          </div>
        )}

        {book.processedCount > 0 && book.resolvedLanguage !== "en" && (
          <p className="mt-6 text-sm text-stone-500">
            Readability scores are English-only
            {book.resolvedLanguage ? ` (this book's language: ${book.resolvedLanguage})` : " (this book's language is unknown)"}.
          </p>
        )}

        {readability && (
          <div className="mt-6 bg-white rounded-xl border border-stone-200 p-5">
            <h3 className="font-display text-lg font-semibold text-stone-900 mb-4">Readability Analysis</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Grade Level", value: readability.fleschKincaidGrade },
                { label: "Reading Ease", value: readability.fleschReadingEase },
                { label: "Words/Sentence", value: readability.avgWordsPerSentence },
                { label: "Syllables/Word", value: readability.avgSyllablesPerWord },
              ].map((tile) => (
                <div key={tile.label} className="text-center p-3 bg-stone-50 rounded-lg">
                  <div className="text-2xl font-bold text-stone-900">{tile.value}</div>
                  <div className="text-xs text-stone-500 mt-1">{tile.label}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-center">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-brand-100 text-brand-800">
                {readability.readingLevel}
              </span>
            </div>
          </div>
        )}
      </div>

      <section>
        <h2 className="font-display text-xl font-semibold text-stone-900 mb-4">
          Pages
          {book.pageCount > 0 && (
            <span className="text-sm font-normal text-stone-500 ml-2">
              ({book.processedCount}/{book.pageCount} processed)
            </span>
          )}
        </h2>
        <PageList bookId={bookId} />
      </section>

      {!book.trackerBookId && (
        <button
          onClick={handleDelete}
          className="mt-8 text-sm text-stone-400 hover:text-red-600 transition-colors"
        >
          Delete book
        </button>
      )}
    </AppShell>
  );
}
