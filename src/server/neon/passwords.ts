import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(nodeScrypt);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string) {
  if (!/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(encoded)) return false;
  const [algorithm, salt, value] = encoded.split(":");
  if (algorithm !== "scrypt" || !salt || !value || value.length !== 128) return false;
  const expected = Buffer.from(value, "hex");
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
