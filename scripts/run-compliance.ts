import { runComplianceCheck } from "../lib/automation";
import { closeLmsDb } from "../lib/lms-db";

async function main() {
  const targetUserId = process.env.TARGET_USER_ID?.trim() || undefined;
  const summary = await runComplianceCheck(targetUserId ? { userId: targetUserId } : undefined);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  closeLmsDb();
  console.error(error);
  process.exit(1);
});

process.on("beforeExit", () => {
  closeLmsDb();
});
