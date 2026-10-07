import { AppShell } from "./components/AppShell";
import { BookList } from "./components/BookList";

export default function Home() {
  return (
    <AppShell
      header={
        <>
          <h1 className="text-xl font-semibold text-slate-900">Word Counter</h1>
          <p className="text-sm text-slate-500">Track your reading progress</p>
        </>
      }
    >
      <BookList />
    </AppShell>
  );
}
