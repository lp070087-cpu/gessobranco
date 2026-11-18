import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Execute the actual TypeScript helper without requiring a database or mocking cryptography.
const source = readFileSync(new URL("../src/server/neon/passwords.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { hashPassword, verifyPassword } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("password hashes contain a random salt and never the original password", async () => {
  const password = "Uma senha segura! 2026";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.match(first, /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/);
  assert.notEqual(first, second);
  assert.equal(first.includes(password), false);
});

test("the real scrypt verifier accepts only the correct password", async () => {
  const encoded = await hashPassword("Senha válida! 2026 🔐");
  assert.equal(await verifyPassword("Senha válida! 2026 🔐", encoded), true);
  assert.equal(await verifyPassword("Senha incorreta! 2026", encoded), false);
  assert.equal(await verifyPassword("", encoded), false);
});

test("malformed encoded hashes are rejected rather than partially parsed", async () => {
  const encoded = await hashPassword("Uma senha segura! 2026");
  for (const malformed of [
    "",
    "scrypt",
    encoded + ":ignored",
    encoded.replace("scrypt:", "pbkdf2:"),
    encoded.replace(/^scrypt:[^:]+:/, "scrypt:not-a-salt:"),
    encoded.slice(0, -1),
    encoded.slice(0, -1) + "z",
    "scrypt:" + "0".repeat(100000) + ":" + "0".repeat(128),
  ]) {
    assert.equal(await verifyPassword("Uma senha segura! 2026", malformed), false);
  }
});
