import { execFileSync } from "node:child_process";

export default function globalSetup() {
  // Local runs test the working tree's backend on the dev deployment
  if (!process.env.E2E_BASE_URL) execFileSync("npx", ["convex", "dev", "--once"], { stdio: "inherit" });
}
