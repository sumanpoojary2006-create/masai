import { runComplianceCheck } from "../lib/automation";

async function main() {
  const summary = await runComplianceCheck();
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
