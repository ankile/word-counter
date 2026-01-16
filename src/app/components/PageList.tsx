"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { PageCard } from "./PageCard";

interface PageListProps {
  bookId: Id<"books">;
}

export function PageList({ bookId }: PageListProps) {
  const pages = useQuery(api.pages.listByBook, { bookId });

  if (pages === undefined) {
    return <div className="text-gray-500">Loading pages...</div>;
  }

  if (pages.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No pages yet. Upload some photos above!
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {pages.map((page) => (
        <PageCard key={page._id} page={page} />
      ))}
    </div>
  );
}
