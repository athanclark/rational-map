import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { openSync, closeSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run this check with npm run test:package");
function run(command, args, cwd, output = "inherit") {
  const result = spawnSync(command, args, {
    cwd, stdio: output === "inherit" ? "inherit" : ["ignore", output, "inherit"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(command + " exited with status " + result.status);
}

const artifacts = join(root, "artifacts");
await mkdir(artifacts, { recursive: true });
const metadataFile = join(artifacts, "pack.json");
const metadataFd = openSync(metadataFile, "w");
try {
  run(process.execPath, [npm, "pack", "--ignore-scripts", "--json", "--pack-destination", artifacts],
    root, metadataFd);
} finally {
  closeSync(metadataFd);
}
const metadata = JSON.parse(await readFile(metadataFile, "utf8"));
const packed = Array.isArray(metadata) ? metadata : Object.values(metadata);
assert.equal(packed.length, 1);
const tarball = join(artifacts, packed[0].filename);
const files = new Set(packed[0].files.map(f => f.path));
for (const required of ["LICENSE", "README.md", "dist/index.js", "dist/index.d.ts", "dist/browser.js"]) {
  assert.ok(files.has(required), "Missing package file: " + required);
}
const temp = await mkdtemp(join(tmpdir(), "rational-package-"));
try {
  await writeFile(join(temp, "package.json"), JSON.stringify({private:true, type:"module"}));
  run(process.execPath, [npm, "install", "--ignore-scripts", "--no-audit", "--no-fund", tarball], temp);
  const usage = [
    'import { Rational as Q, RationalMap } from "rational-ordered-map";',
    'import { Rational as SubQ } from "rational-ordered-map/rational";',
    'import { Rational as BQ, RationalMap as BMap } from "rational-ordered-map/browser";',
    'const buckets = new RationalMap<readonly string[]>(v => BigInt(v.length));',
    'buckets.set(SubQ.from(1n, 3n), ["a", "b"]);',
    'const count: bigint = buckets.countRange(Q.zero, Q.one);',
    'if (count !== 2n) throw new Error("Installed package lost weighted bounds");',
    'const exact = Q.parseDecimal(".1").add(Q.parseDecimal(".2")).toString();',
    'if (exact !== "3/10") throw new Error("Installed arithmetic is inexact");',
    'const browser = new BMap<string>().set(BQ.zero, "first").set(BQ.one, "second");',
    'if (browser.countRange(BQ.zero, BQ.one) !== 1n) throw new Error("Browser bounds failed");',
    'if (browser.overview(BQ.zero, BQ.from(2n), BQ.one, "span").groups.length !== 2)',
    '  throw new Error("Browser summaries failed");',
  ].join("\n");
  await writeFile(join(temp, "usage.mts"), usage);
  run(process.execPath, [join(root, "node_modules/typescript/bin/tsc"),
    "--strict", "--module", "nodenext", "--target", "es2020", "--outDir", "out", "usage.mts"], temp);
  run(process.execPath, ["out/usage.mjs"], temp);
  const bundle = await readFile(join(temp, "node_modules/rational-ordered-map/dist/browser.js"), "utf8");
  assert.ok(bundle.includes("Copyright (c) 2025 Robert Eisele"), "Missing bundled dependency notice");
  console.log("PASS installed npm package: declarations, public exports, exact bounds and summaries");
  console.log("Artifact: " + tarball);
} finally {
  await rm(temp, {recursive:true, force:true});
}
