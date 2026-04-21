import { runComplianceCheck } from "../lib/automation";

async function main() {
  const targetUserId = process.env.TARGET_USER_ID?.trim() || undefined;
  const summary = await runComplianceCheck(targetUserId ? { userId: targetUserId } : undefined);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
