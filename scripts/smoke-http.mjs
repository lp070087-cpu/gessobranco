// Run against a locally running PRECISO server. Does not write production data.
import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL || "http://localhost:3001";
const routes = [
  ["/", 200],
  ["/login", 200],
  ["/signup", 200],
  ["/admin", 200],
  ["/home", 200],
  ["/rota-inexistente-preciso", 404],
];
let failures = 0;
for (const [path, status] of routes) {
  try {
    const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(30000) });
    const html = await response.text();
    assert.equal(response.status, status);
    assert.match(html, /lang="pt-BR"/);
    assert.doesNotMatch(html, /postgres(?:ql)?:\/\//);
    console.log("PASS", path, status);
  } catch (error) {
    failures++;
    console.error("FAIL", path, error.message);
  }
}
console.log("HTTP smoke only: does not validate browser hydration, login or database permissions.");
process.exitCode = failures ? 1 : 0;
