import { execFileSync } from "node:child_process";

export default function globalSetup() {
  // Local runs test the working tree's backend on the dev deployment. A local Convex deployment only runs while
  // `npx convex dev` does, which already pushes the working tree (and holds the backend's port).
  if (!process.env.E2E_BASE_URL && !process.env.CONVEX_DEPLOYMENT?.startsWith("local:")) {
    execFileSync("npx", ["convex", "dev", "--once"], { stdio: "inherit" });
  }
}
