import { AppShell } from "./components/AppShell";
import { BookComparison } from "./components/BookComparison";
import { BookList } from "./components/BookList";

export default function Home() {
  return (
    <AppShell>
      <div className="space-y-10">
        <BookList />
        <BookComparison />
      </div>
    </AppShell>
  );
}
