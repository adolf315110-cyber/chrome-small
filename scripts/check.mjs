import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && ![".git", "node_modules"].includes(entry.name)) files.push(...await walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
if (manifest.manifest_version !== 3) throw new Error("manifest.json must use Manifest V3");
if (manifest.host_permissions?.length) throw new Error("Broad host permissions are not allowed");

const jsFiles = (await walk(root)).filter((path) => extname(path) === ".js" || extname(path) === ".mjs");
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${relative(root, file)}\n${result.stderr}`);
}

console.log(`Validated Manifest V3 and syntax-checked ${jsFiles.length} JavaScript files.`);
