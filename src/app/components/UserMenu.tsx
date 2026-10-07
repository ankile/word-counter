"use client";

import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useUser } from "./Providers";

export function UserMenu() {
  const user = useUser();
  return (
    <div className="flex items-center gap-3 text-sm text-slate-500 min-w-0">
      <span className="hidden sm:inline truncate">{user.email}</span>
      <button onClick={() => signOut(auth)} className="font-medium hover:text-slate-900 transition-colors">
        Sign out
      </button>
    </div>
  );
}
