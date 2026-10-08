import type { ReactNode } from "react";
import { Wordmark } from "./Logo";
import { UserMenu } from "./UserMenu";

export function AppShell({ nav, children }: { nav?: ReactNode; children: ReactNode }) {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="bg-white/90 backdrop-blur border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <Wordmark />
          <UserMenu />
        </div>
      </header>

      <div className="flex-1 max-w-5xl mx-auto py-8 px-4 sm:px-6 w-full">
        {nav && <div className="mb-6">{nav}</div>}
        {children}
      </div>

      <footer className="border-t border-stone-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-stone-500">
          <a href="https://book.ankile.com" className="hover:text-stone-800 transition-colors">
            Book Tracker
          </a>
          <span aria-hidden>·</span>
          <a
            href="https://github.com/ankile/word-counter"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-stone-800 transition-colors"
          >
            View on GitHub
          </a>
        </div>
      </footer>
    </main>
  );
}
