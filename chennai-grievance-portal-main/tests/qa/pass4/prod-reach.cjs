#!/usr/bin/env node
/**
 * QA pass 4, code-health scan: which top-level functions and constants in src/ can production really reach?
 *
 * Knip works per export, so a function used inside its own file counts as used even when the caller is itself dead, and
 * a check called only by its own test looks alive. This walks the real TypeScript symbols instead, from the Next.js
 * entry points (routes, pages, layouts, middleware, instrumentation) through every value reference. Tests, live runs,
 * golden runs and scripts are NOT entry points here. Report only: it changes nothing.
 *
 *   node tests/qa/pass4/prod-reach.cjs > ../docs/qa/pass4/evidence/scans/prod-reach.txt
 *
 * Over-counts as reachable, never under: a reference anywhere inside a top-level declaration keeps the whole declaration.
 */
const path = require("path");
const fs = require("fs");
const ROOT = process.cwd();
const ts = require(path.join(ROOT, "node_modules/typescript"));

const cfg = ts.getParsedCommandLineOfConfigFile("tsconfig.json", { incremental: false, noEmit: true }, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (d) => { throw new Error(String(d.messageText)); } });
const norm = (f) => f.replace(/\\/g, "/");
const isTestFile = (f) => /\.(test|live|golden)\.tsx?$/.test(f) || /\/__tests__\//.test(f);
const inSrc = (f) => norm(f).startsWith(norm(path.join(ROOT, "src")) + "/");
const rel = (f) => norm(path.relative(ROOT, f));
const roots = cfg.fileNames.filter((f) => inSrc(f) && !isTestFile(norm(f)));
const program = ts.createProgram(roots, cfg.options);
const checker = program.getTypeChecker();

const ENTRY = /^src\/(middleware|instrumentation|instrumentation-node)\.tsx?$|^src\/app\/(.*\/)?(page|layout|route|loading|error|global-error|not-found|template|default|icon|apple-icon|opengraph-image|twitter-image|sitemap|robots|manifest)\.(t|j)sx?$/;

/** @type {Map<string, {file:string,line:number,name:string,exported:boolean,node:any,lazy:boolean}>} */
const units = new Map();
const unitOfDecl = new Map();
const fileUnits = new Map();
const key = (sf, node, name) => `${rel(sf.fileName)}#${node.pos}#${name}`;
const hasExport = (n) => !!(ts.getCombinedModifierFlags(n) & ts.ModifierFlags.Export);

function addUnit(sf, node, name, exported, lazy) {
  const k = key(sf, node, name);
  const u = { key: k, file: rel(sf.fileName), line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, name, exported, node, lazy };
  units.set(k, u);
  unitOfDecl.set(node, u);
  if (!fileUnits.has(sf.fileName)) fileUnits.set(sf.fileName, []);
  fileUnits.get(sf.fileName).push(u);
  return u;
}

for (const sf of program.getSourceFiles()) {
  if (!inSrc(sf.fileName) || sf.isDeclarationFile || isTestFile(norm(sf.fileName))) continue;
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) || ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isImportEqualsDeclaration(st)) continue;
    if (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isEnumDeclaration(st) || ts.isModuleDeclaration(st)) {
      addUnit(sf, st, st.name ? st.name.getText(sf) : "default", hasExport(st), true);
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) addUnit(sf, d, d.name.getText(sf).slice(0, 60), hasExport(st), true);
    } else if (ts.isExportDeclaration(st) && st.moduleSpecifier) {
      // re-export: a pure alias, followed through by the checker
    } else {
      addUnit(sf, st, "(load)", ts.isExportAssignment(st), false);
    }
  }
}

/** the top-level unit a declaration sits in */
function unitContaining(decl) {
  let n = decl;
  while (n) {
    if (unitOfDecl.has(n)) return unitOfDecl.get(n);
    n = n.parent;
  }
  return null;
}

const seen = new Set();
const loaded = new Set();
const queue = [];
function reach(u) { if (u && !seen.has(u.key)) { seen.add(u.key); queue.push(u); } }

function loadModule(fileName) {
  if (loaded.has(fileName)) return;
  loaded.add(fileName);
  const sf = program.getSourceFile(fileName);
  if (!sf) return;
  for (const u of fileUnits.get(fileName) ?? []) if (!u.lazy) reach(u);
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && !(st.importClause && st.importClause.isTypeOnly)) {
      const sym = checker.getSymbolAtLocation(st.moduleSpecifier);
      const d = sym && sym.declarations && sym.declarations[0];
      if (d && inSrc(d.getSourceFile().fileName)) loadModule(d.getSourceFile().fileName);
    }
    if (ts.isExportDeclaration(st) && st.moduleSpecifier && !st.isTypeOnly) {
      const sym = checker.getSymbolAtLocation(st.moduleSpecifier);
      const d = sym && sym.declarations && sym.declarations[0];
      if (d && inSrc(d.getSourceFile().fileName)) loadModule(d.getSourceFile().fileName);
    }
  }
}

function follow(sym) {
  if (!sym) return;
  let s = sym;
  if (s.flags & ts.SymbolFlags.Alias) { try { s = checker.getAliasedSymbol(s); } catch { return; } }
  for (const d of s.declarations ?? []) {
    const f = d.getSourceFile().fileName;
    if (!inSrc(f) || isTestFile(norm(f))) continue;
    const u = unitContaining(d);
    if (u) reach(u);
    loadModule(f);
  }
}

function moduleDefaultOf(arg) {
  const sym = checker.getSymbolAtLocation(arg);
  if (!sym) return;
  const d = sym.declarations && sym.declarations[0];
  if (d) loadModule(d.getSourceFile().fileName);
  const ex = checker.getExportsOfModule(sym).find((e) => e.name === "default");
  follow(ex);
}

function walk(n) {
  if (ts.isTypeNode(n) || ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)) return;
  if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) moduleDefaultOf(n.arguments[0]);
  if (ts.isBindingElement(n) && ts.isObjectBindingPattern(n.parent)) {
    const name = (n.propertyName ?? n.name).getText();
    const t = checker.getTypeAtLocation(n.parent);
    const p = t && t.getProperty && t.getProperty(name);
    if (p) follow(p);
  }
  if (ts.isShorthandPropertyAssignment(n)) follow(checker.getShorthandAssignmentValueSymbol(n));
  if (ts.isIdentifier(n)) follow(checker.getSymbolAtLocation(n));
  ts.forEachChild(n, walk);
}

// the entry points: everything they export, and whatever they do at load
for (const sf of program.getSourceFiles()) {
  if (!inSrc(sf.fileName) || sf.isDeclarationFile || !ENTRY.test(rel(sf.fileName))) continue;
  loadModule(sf.fileName);
  for (const u of fileUnits.get(sf.fileName) ?? []) if (u.exported || !u.lazy) reach(u);
  for (const st of sf.statements) if (ts.isExportDeclaration(st)) walk(st);
}
while (queue.length) walk(queue.pop().node);

// what is left, and who else uses it
const wordIn = new Map();
function other(dir, filter) {
  const out = [];
  const go = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== "node_modules") go(p); } else if (filter(norm(p))) out.push(p); } };
  go(path.join(ROOT, dir));
  return out.map((f) => ({ f, s: fs.readFileSync(f, "utf8") }));
}
const tests = other("src", isTestFile).concat(other("tests", (f) => /\.(ts|tsx|mjs|cjs|js)$/.test(f)));
const scripts = other("scripts", (f) => /\.(ts|tsx|mjs|cjs|js)$/.test(f));
const usedIn = (list, name) => {
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) return false;
  const re = new RegExp(`(?<![\\w$.])${name.replace(/\$/g, "\\$")}(?![\\w$])`);
  return list.some((x) => re.test(x.s));
};
const dead = [...units.values()].filter((u) => !seen.has(u.key) && u.lazy);
const rows = dead.map((u) => ({ ...u, who: usedIn(tests, u.name) ? "tests" : usedIn(scripts, u.name) ? "scripts" : "nobody" }));
rows.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
const count = (w) => rows.filter((r) => r.who === w).length;
console.log(`Top-level values in src: ${units.size}. Reachable from production entry points: ${seen.size}. Not reachable: ${rows.length} (only tests name them: ${count("tests")}; only scripts: ${count("scripts")}; nobody: ${count("nobody")}).`);
console.log(`Modules never loaded in production: ${[...fileUnits.keys()].filter((f) => !loaded.has(f)).map(rel).join(", ") || "none"}`);
console.log("");
for (const r of rows) console.log(`${r.who.padEnd(7)} ${r.exported ? "export" : "local "} ${r.file}:${r.line} ${r.name}`);
