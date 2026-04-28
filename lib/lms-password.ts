import crypto from "crypto";

const ENCRYPTION_PREFIX = "enc:v1:";

function getEncryptionKey() {
  const secret = process.env.LMS_PASSWORD_ENCRYPTION_KEY?.trim();
  if (!secret) {
    throw new Error("LMS_PASSWORD_ENCRYPTION_KEY is not set.");
  }

  return crypto.createHash("sha256").update(secret).digest();
}

export function isEncryptedLmsPassword(value: string | null | undefined) {
  return Boolean(value && value.startsWith(ENCRYPTION_PREFIX));
}

export function encryptLmsPassword(plainText: string) {
  const iv = crypto.randomBytes(12);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${ENCRYPTION_PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptLmsPassword(value: string) {
  if (!isEncryptedLmsPassword(value)) {
    return value;
  }

  const payload = value.slice(ENCRYPTION_PREFIX.length);
  const [ivText, tagText, encryptedText] = payload.split(".");
  if (!ivText || !tagText || !encryptedText) {
    throw new Error("Stored LMS password value is malformed.");
  }

  const iv = Buffer.from(ivText, "base64url");
  const tag = Buffer.from(tagText, "base64url");
  const encrypted = Buffer.from(encryptedText, "base64url");

  const key = getEncryptionKey();
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    // Key mismatch — password was encrypted with a different key.
    // Return empty string so callers can handle re-authentication gracefully.
    return "";
  }
}
