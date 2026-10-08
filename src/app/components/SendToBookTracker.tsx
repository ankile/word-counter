"use client";

import { useMutation } from "convex/react";
import { FirebaseError } from "firebase/app";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { BookEstimate } from "../../../convex/stats";
import type { WordEstimatePayload } from "../../../convex/validators";
import { sendWordEstimate } from "../lib/bookTracker";
import { SpinnerIcon } from "./icons";

interface Publish {
  blocker: string | null;
  payload: WordEstimatePayload | null;
  sent: { publishedAt: number; current: boolean } | null;
}

/** Explicitly send the estimate to the book's catalog edition in Book Tracker; re-sending overwrites it. */
export function SendToBookTracker(props: { bookId: Id<"books">; estimate: BookEstimate | null; publish: Publish }) {
  const { bookId, estimate, publish } = props;
  const recordPublished = useMutation(api.books.recordPublished);
  const [state, setState] = useState<"idle" | "sending" | { error: string }>("idle");

  const send = async () => {
    const payload = publish.payload!;
    setState("sending");
    try {
      const { measuredAt } = await sendWordEstimate(payload);
      await recordPublished({ id: bookId, payload, measuredAt });
      setState("idle");
    } catch (err) {
      // Book Tracker's refusals (e.g. failed-precondition) are expected; show them rather than crash
      if (!(err instanceof FirebaseError)) throw err;
      setState({ error: `${err.code.replace(/^functions\//, "")}: ${err.message}` });
    }
  };

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={send}
          disabled={publish.payload === null || state === "sending"}
          className="inline-flex items-center px-4 py-2 bg-brand-700 text-white text-sm font-medium rounded-lg hover:bg-brand-800 transition-colors disabled:bg-stone-300 disabled:cursor-not-allowed"
        >
          {state === "sending" && <SpinnerIcon className="w-4 h-4 mr-2 animate-spin" />}
          Send to Book Tracker
        </button>
        {publish.blocker ? (
          <span className="text-sm text-stone-500">{publish.blocker}</span>
        ) : (
          estimate &&
          !estimate.meetsRecommended && (
            <span className="text-sm text-stone-500">
              ±{estimate.marginPercent}%: {estimate.randomPagesForRecommended} more random{" "}
              {estimate.randomPagesForRecommended === 1 ? "page" : "pages"} for the recommended ±10%
            </span>
          )
        )}
      </div>
      {publish.sent && (
        <p className="text-sm mt-3 text-stone-600">
          Sent to Book Tracker on {new Date(publish.sent.publishedAt).toLocaleDateString()}
          {!publish.sent.current && <span className="ml-2 font-medium text-amber-700">Out of date</span>}
        </p>
      )}
      {typeof state === "object" && (
        <p className="text-sm mt-3 text-red-600" role="alert">
          Book Tracker didn&apos;t store it: {state.error}
        </p>
      )}
    </div>
  );
}
