import { BookList } from "./components/BookList";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <BookList />
      </div>
    </main>
  );
}
