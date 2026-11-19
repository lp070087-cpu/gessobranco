import fs from "node:fs/promises";
import { format, resolveConfig } from "prettier";
import diff from "fast-diff";
for (const path of ["src/server/neon/portal.ts","src/routes/minha-conta.tsx","src/components/preciso/CustomerBusiness.tsx","src/components/preciso/PublicProducts.tsx","tests/commercial-api.test.mjs"]) {
  const source = await fs.readFile(path, "utf8");
  const options = await resolveConfig(path);
  const formatted = await format(source, { ...options, filepath: path });
  let cursor = 0;
  let patches = [];
  for (const [kind, value] of diff(source, formatted)) {
    if (kind < 0) patches.push([cursor, value.length, ""]);
    if (kind > 0) patches.push([cursor, 0, value]);
    if (kind <= 0) cursor += value.length;
  }
  for (let i = 0; i < patches.length; i += 10) console.log("FMT " + JSON.stringify([path, patches.slice(i, i + 10)]));
  await fs.writeFile(path, formatted);
}
