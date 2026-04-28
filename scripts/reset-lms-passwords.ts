/**
 * One-time migration: clears all stored LMS passwords that can't be decrypted
 * with the current LMS_PASSWORD_ENCRYPTION_KEY.
 *
 * Run with: npx tsx scripts/reset-lms-passwords.ts
 *
 * After running, users will be prompted to re-enter their LMS password
 * when they next visit the Profile page.
 */
import { createServerSupabase } from "../lib/supabase";
import { isEncryptedLmsPassword, decryptLmsPassword } from "../lib/lms-password";

async function main() {
  const supabase = createServerSupabase();

  const { data: profiles, error } = await supabase
    .from("user_profiles")
    .select("user_id, email, lms_password");

  if (error) throw new Error(error.message);
  if (!profiles || profiles.length === 0) {
    console.log("No profiles found.");
    return;
  }

  const toReset: string[] = [];

  for (const profile of profiles) {
    if (!isEncryptedLmsPassword(profile.lms_password)) continue;

    const decrypted = decryptLmsPassword(profile.lms_password);
    if (decrypted === "") {
      // decryption failed — wrong key
      toReset.push(profile.user_id);
      console.log(`Will reset password for: ${profile.email}`);
    }
  }

  if (toReset.length === 0) {
    console.log("All passwords decrypt successfully — nothing to reset.");
    return;
  }

  const { error: updateError } = await supabase
    .from("user_profiles")
    .update({ lms_password: null })
    .in("user_id", toReset);

  if (updateError) throw new Error(updateError.message);

  console.log(`\nReset ${toReset.length} password(s). Affected users must re-enter their LMS password on the Profile page.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
