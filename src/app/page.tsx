import { BookList } from "./components/BookList";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Word Counter</h1>
              <p className="text-sm text-slate-500">Track your reading progress</p>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-5xl mx-auto py-8 px-4 sm:px-6 w-full">
        <BookList />
      </div>

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
