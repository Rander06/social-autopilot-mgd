import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import type { UserRole } from "./types";

const ENC_PREFIX = "enc:v1:";
export const SESSION_COOKIE = "mgd_saas_session";

export interface SessionPayload {
  userId: string;
  companyId: string | null;
  role: UserRole;
  email: string;
  name: string;
  exp: number;
}

function getEncryptionKey(): Buffer {
  const rawSecret =
    process.env.ENCRYPTION_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    "mgd-autopilot-default-aes-key";
  return crypto.createHash("sha256").update(rawSecret).digest();
}

export function encryptSecret(plainText?: string | null): string | null {
  if (!plainText || !plainText.trim()) return null;
  const trimmed = plainText.trim();
  if (trimmed.startsWith(ENC_PREFIX)) return trimmed;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(trimmed, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${ENC_PREFIX}${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(cipherText?: string | null): string | null {
  if (!cipherText || !cipherText.trim()) return null;
  const trimmed = cipherText.trim();
  if (!trimmed.startsWith(ENC_PREFIX)) return trimmed;

  try {
    const payload = trimmed.slice(ENC_PREFIX.length);
    const [ivHex, tagHex, dataHex] = payload.split(":");
    if (!ivHex || !tagHex || !dataHex) return null;

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getEncryptionKey(),
      Buffer.from(ivHex, "hex")
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, "hex")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

export function maskSecret(plainOrEnc?: string | null): string {
  const plain = decryptSecret(plainOrEnc);
  if (!plain) return "";
  if (plain.length <= 10) return "••••••••";
  return `${plain.slice(0, 5)}••••••${plain.slice(-4)}`;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 32).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash.startsWith("scrypt:")) {
    return password === storedHash;
  }
  const [, salt, expectedHex] = storedHash.split(":");
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(password, salt, 32);
  const expected = Buffer.from(expectedHex, "hex");
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function generateId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function getSessionSecret(): string {
  return (
    process.env.ENCRYPTION_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    "mgd-local-session-secret"
  );
}

export function signSession(payload: SessionPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSessionSecret())
    .update(data)
    .digest("base64url");
  return `${data}.${sig}`;
}

export function verifySessionToken(
  token?: string | null
): SessionPayload | null {
  if (!token) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expectedSig = crypto
    .createHmac("sha256", getSessionSecret())
    .update(data)
    .digest("base64url");
  if (sig !== expectedSig) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(data, "base64url").toString("utf8")
    ) as SessionPayload;
    if (parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getSessionFromRequest(
  request: NextRequest
): SessionPayload | null {
  const cookieVal = request.cookies.get(SESSION_COOKIE)?.value;
  const fromCookie = verifySessionToken(cookieVal);
  if (fromCookie) return fromCookie;

  const cronSecret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization");
  if (cronSecret && auth === `Bearer ${cronSecret}`) {
    return {
      userId: "usr-super-admin",
      companyId: "comp-mgd",
      role: "SUPER_ADMIN",
      email: "admin@meugestordigital.com.br",
      name: "Super Admin",
      exp: Date.now() + 3600_000,
    };
  }
  return null;
}
