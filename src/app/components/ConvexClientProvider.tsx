"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode, useMemo } from "react";

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  const convex = useMemo(() => {
    if (!convexUrl) return null;
    return new ConvexReactClient(convexUrl);
  }, [convexUrl]);

  if (!convex) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <h1 className="text-xl font-bold text-gray-800 mb-4">
            Convex Not Configured
          </h1>
          <p className="text-gray-600 mb-4">
            Run <code className="bg-gray-200 px-2 py-1 rounded">npx convex dev</code> to set up your Convex backend.
          </p>
          <p className="text-sm text-gray-500">
            This will create a new project and add the URL to your .env.local file.
          </p>
        </div>
      </div>
    );
  }

  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
