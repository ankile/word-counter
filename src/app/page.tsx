import { BookList } from "./components/BookList";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 max-w-4xl mx-auto py-8 px-4 w-full">
        <BookList />
      </div>
      <footer className="text-center py-4 text-sm text-gray-500">
        <a
          href="https://github.com/ankile/word-counter"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-gray-700"
        >
          View on GitHub
        </a>
      </footer>
    </main>
  );
}
