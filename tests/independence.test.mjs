import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const source = await readFile(new URL("src/lib/preliminary-analysis.ts", root), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { preliminaryAnalysis } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("preliminary estimate keeps the existing conditions-based calculation and discloses review", () => {
  const result = preliminaryAnalysis({ area: 100, conditions: [] });
  assert.equal(result.multiplier, 1);
  assert.equal(result.estimated_hours, 40);
  assert.equal(result.source, "conditions");
  assert.equal(result.requires_review, true);
  assert.deepEqual(result.suggested_materials, []);
  assert.match(result.summary, /fotos não foram analisadas automaticamente/);
});

test("combined conditions stay within the supported estimate range without inspecting photos", () => {
  const conditions = Object.freeze(["Umidade", "Trincas", "Desalinhamento", "Derrubar parede"]);
  const result = preliminaryAnalysis({ area: 100, conditions });
  assert.equal(result.multiplier, 1.6);
  assert.equal(result.difficulty, "alta");
  assert.equal(result.estimated_hours, 64);
  assert.deepEqual(result.detected_issues, conditions);
  assert.notEqual(result.detected_issues, conditions);
});

test("application source does not connect to the former platform or sign photos for an AI gateway", async () => {
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
      if (entry.isDirectory()) await inspect(path);
      else if (/\.(ts|tsx|css)$/.test(entry.name)) {
        assert.doesNotMatch(
          await readFile(path, "utf8"),
          /LOVABLE_API_KEY|@lovable|https?:\/\/[^\s"']*lovable\.(dev|app|com)/i,
          path.pathname,
        );
      }
    }
  }
  await inspect(new URL("src/", root));
  const handler = await readFile(new URL("src/lib/ai-analysis.functions.ts", root), "utf8");
  assert.doesNotMatch(handler, /\bfetch\s*\(|createSignedUrl/);
});

test("installed dependency graph excludes the former editor and pins patched Start packages", async () => {
  const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  const lock = JSON.parse(await readFile(new URL("package-lock.json", root), "utf8"));
  assert.ok(
    !Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).some((name) =>
      /lovable/i.test(name),
    ),
  );
  assert.ok(!Object.keys(lock.packages).some((name) => /lovable/i.test(name)));
  assert.equal(lock.packages["node_modules/@tanstack/react-start"].version, "1.168.60");
  assert.equal(lock.packages["node_modules/@tanstack/start-server-core"].version, "1.169.39");
});
