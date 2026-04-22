import { runComplianceCheck } from "../lib/automation";
import { closeLmsDb } from "../lib/lms-db";

async function main() {
  const targetUserId = process.env.TARGET_USER_ID?.trim() || undefined;
  try {
    const summary = await runComplianceCheck(targetUserId ? { userId: targetUserId } : undefined);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    // Always close the LMS DB handle so the process can exit promptly.
    closeLmsDb();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

process.on("beforeExit", () => {
  closeLmsDb();
});
