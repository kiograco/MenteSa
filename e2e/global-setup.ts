import { execSync } from "node:child_process";

// The booking test always picks the same deterministic slot (first upcoming day, first open
// time), so a second run against a database that still has the first run's appointment would
// correctly get rejected by the app's duplicate-booking guard — not a flaky test, just a dirty
// fixture. Reset to the seeded state before every run instead of asking whoever runs this to
// remember to do it by hand.
export default function globalSetup() {
  execSync("npx supabase db reset", { stdio: "inherit" });
}
