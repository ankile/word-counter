import { AppShell } from "./components/AppShell";
import { BookList } from "./components/BookList";

export default function Home() {
  return (
    <AppShell>
      <BookList />
    </AppShell>
  );
}
