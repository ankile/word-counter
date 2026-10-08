"use client";

import { signInWithEmailAndPassword } from "firebase/auth";
import type { FirebaseError } from "firebase/app";
import { useState } from "react";
import { auth } from "../lib/firebase";
import { LogoMark } from "./Logo";

// Unknown email and wrong password read the same, so the form doesn't reveal which accounts exist
const SIGN_IN_ERRORS: Record<string, string> = {
  "auth/invalid-credential": "Wrong email or password",
  "auth/user-not-found": "Wrong email or password",
  "auth/wrong-password": "Wrong email or password",
  "auth/too-many-requests": "Too many sign-in attempts. Wait a few minutes and try again.",
};

export function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    // Wrong credentials are an expected outcome here, so show them instead of throwing
    await signInWithEmailAndPassword(auth, email, password).catch((err: FirebaseError) =>
      setError(SIGN_IN_ERRORS[err.code] ?? err.message)
    );
    setSubmitting(false);
  };

  const inputClass =
    "w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-lg text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent";

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-4 bg-brand-800 bg-[radial-gradient(circle_at_50%_30%,rgb(255_255_255/0.12),transparent_24rem)]">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="rounded-[22%] shadow-lg shadow-brand-950/30 ring-1 ring-white/15">
          <LogoMark size={72} />
        </div>
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-tight text-white">Word Counter</h1>
          <p className="text-brand-100 mt-2">How many words are in that book?</p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white rounded-2xl shadow-xl shadow-brand-950/20 p-6 space-y-4">
        <p className="text-sm text-stone-500">Sign in with your Book Tracker account</p>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className={inputClass}
        />
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className={inputClass}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 bg-brand-700 text-white font-medium rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
        >
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
