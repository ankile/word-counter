"use client";

import { Authenticated, AuthLoading, ConvexProviderWithAuth, ConvexReactClient, Unauthenticated } from "convex/react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { auth } from "../lib/firebase";
import { SignIn } from "./SignIn";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// undefined while Firebase restores the session, null when signed out
const UserContext = createContext<User | null | undefined>(undefined);

/** The signed-in Book Tracker user. Only use below <Authenticated>. */
export function useUser(): User {
  return useContext(UserContext)!;
}

function useConvexAuthFromFirebase() {
  const user = useContext(UserContext);
  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => (user ? await user.getIdToken(forceRefreshToken) : null),
    [user]
  );
  return useMemo(
    () => ({ isLoading: user === undefined, isAuthenticated: !!user, fetchAccessToken }),
    [user, fetchAccessToken]
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);

  return (
    <UserContext.Provider value={user}>
      <ConvexProviderWithAuth client={convex} useAuth={useConvexAuthFromFirebase}>
        <AuthLoading>
          <div className="min-h-screen flex items-center justify-center animate-pulse text-slate-400">Loading...</div>
        </AuthLoading>
        <Unauthenticated>
          <SignIn />
        </Unauthenticated>
        <Authenticated>{children}</Authenticated>
      </ConvexProviderWithAuth>
    </UserContext.Provider>
  );
}
