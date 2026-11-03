import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";

const globals = new Set("undefined Infinity NaN Object Array String Number Boolean Math JSON Date Intl Promise Set Map Uint8Array Float32Array parseInt parseFloat isNaN isFinite Error encodeURIComponent URLSearchParams Notification console window document navigator location history localStorage sessionStorage crypto process URL Image File FileReader Blob FormData Response fetch atob btoa setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame scrollTo alert confirm performance AudioContext".split(" "));
test("extracted components have no missing imports or shared variables", async () => {
  const dir = new URL("../components/", import.meta.url), missing = [];
  for (const f of (await readdir(dir,{recursive:true})).filter(f=>f.endsWith(".js"))) {
    const ast = parse(await readFile(new URL(f, dir), "utf8"), { sourceType: "module", plugins: ["jsx"] });
    traverse(ast, { ReferencedIdentifier(p) {
      const name = p.node.name;
      if (!p.scope.getBinding(name) && !globals.has(name)) missing.push(`${f}:${p.node.loc.start.line}: ${name}`);
    } });
  }
  assert.deepEqual(missing, []);
});
