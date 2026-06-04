// Conformance audit: every tool in dist/tools.js vs the committed DataLens OpenAPI spec.
// Run after `npm run build`. Exits non-zero if any tool diverges from the API contract.
import { readFileSync } from "node:fs";
import { TOOLS } from "../dist/tools.js";

const here = (p) => new URL(p, import.meta.url);
const spec = JSON.parse(readFileSync(here("./datalens-openapi.json"), "utf8"));
const D = (o) => { if (o && o.$ref) { const p = o.$ref.replace(/^#\//, "").split("/"); let c = spec; for (const k of p) c = c[k]; return c; } return o; };

// Per-method expectation derived from the spec request body (mirrors gen-tools.mjs gather()).
function summarize(op) {
  let sch = op.requestBody ? D(op.requestBody).content?.["application/json"]?.schema : null;
  sch = D(sch);
  if (!sch) return { passthrough: false, props: {}, required: [] };
  if (sch.oneOf && sch.oneOf.length > 5) return { passthrough: true, props: {}, required: [] };
  const props = {}; const required = new Set(sch.required || []);
  const add = (s, opt = false) => {
    s = D(s); if (!s) return;
    for (const [k, v] of Object.entries(s.properties || {})) {
      const pv = D(v); let t = pv.type; const nul = Array.isArray(t) ? t.includes("null") : pv.nullable;
      if (Array.isArray(t)) t = t.find((x) => x !== "null");
      props[k] = { type: t || (pv.enum ? "string" : pv.anyOf || pv.oneOf ? "union" : pv.$ref ? "object" : "any"), nullable: !!nul };
    }
    if (!opt) for (const r of s.required || []) required.add(r);
    for (const b of s.allOf || []) add(b, opt);
    if (s.oneOf && s.oneOf.length <= 5) for (const b of s.oneOf) add(b, true);
  };
  add(sch);
  if (Object.keys(props).length === 0) return { passthrough: true, props: {}, required: [] };
  return { passthrough: false, props, required: [...required] };
}

const methods = {};
for (const [path, ops] of Object.entries(spec.paths)) {
  const m = path.replace(/^\/rpc\//, "");
  methods[m] = summarize(ops[Object.keys(ops)[0]]);
}

function baseType(zt) {
  let d = zt?._def, guard = 0;
  while (d && ["ZodOptional", "ZodNullable", "ZodDefault"].includes(d.typeName) && guard++ < 10) { zt = d.innerType || d.schema; d = zt?._def; }
  return d?.typeName;
}
const isOpt = (zt) => { try { return zt.isOptional(); } catch { return false; } };
const OK = {
  string: ["ZodString", "ZodEnum", "ZodAny", "ZodUnion"], number: ["ZodNumber", "ZodAny"], integer: ["ZodNumber", "ZodAny"],
  boolean: ["ZodBoolean", "ZodAny"], array: ["ZodArray", "ZodAny", "ZodUnion"], object: ["ZodRecord", "ZodObject", "ZodAny"],
  union: ["ZodAny", "ZodUnion", "ZodString", "ZodArray"],
  any: ["ZodString", "ZodNumber", "ZodBoolean", "ZodArray", "ZodRecord", "ZodObject", "ZodAny", "ZodUnion", "ZodEnum"],
};
// methods we deliberately classify against the prefix heuristic (documented in gen-tools.mjs)
const KIND_OVERRIDE = { startWorkbookImport: "modify" };
const kindFor = (m) => KIND_OVERRIDE[m] || (/^(get|list|validate)/.test(m) ? "read" : /^(create|start)/.test(m) ? "create" : "modify");
const OVERRIDE = new Set(["getEntries"]);

const errors = [], warns = []; const seen = new Set();
for (const t of TOOLS) {
  const m = t.method; seen.add(m);
  const s = methods[m];
  if (!s) { errors.push(`${t.name}: method "${m}" not in spec`); continue; }
  if (/^delete/i.test(m)) errors.push(`${t.name}: delete method present`);
  // fail-closed: the no-delete guarantee uses a name prefix, so flag destructive-looking verbs that
  // would slip past it if the upstream spec ever adds them under a different name.
  if (/^(purge|drop|remove|revoke|destroy|reset|truncate|wipe|erase|clear)/i.test(m))
    errors.push(`${t.name}: method "${m}" has a destructive-looking prefix not covered by the delete denylist — review before registering`);
  if (t.kind !== kindFor(m)) warns.push(`${t.name}: kind="${t.kind}" vs expected "${kindFor(m)}"`);
  const fields = t.schema || {}, names = Object.keys(fields);
  if (s.passthrough) { if (!(names.length === 1 && names[0] === "body" && t.build)) errors.push(`${t.name}: opaque body -> expected {body}+build, got [${names}]`); continue; }
  if (OVERRIDE.has(m)) { const allow = new Set([...Object.keys(s.props), "scope", "ids"]); for (const f of names) if (!allow.has(f)) warns.push(`${t.name}[override]: extra field "${f}"`); continue; }
  for (const r of s.required) { if (!(r in fields)) errors.push(`${t.name}: missing required "${r}"`); else if (isOpt(fields[r])) errors.push(`${t.name}: required "${r}" is optional`); }
  for (const f of names) { if (!(f in s.props)) { errors.push(`${t.name}: extra field "${f}" not in API (would 400)`); continue; } const bt = baseType(fields[f]); const want = OK[s.props[f].type] || OK.any; if (bt && !want.includes(bt)) warns.push(`${t.name}: "${f}" ${bt} vs spec ${s.props[f].type}`); }
}
for (const m of Object.keys(methods)) { if (/^delete/i.test(m)) continue; if (!seen.has(m)) errors.push(`spec method "${m}" has no tool`); }

console.log(`TOOLS ${TOOLS.length} | ERRORS ${errors.length} | WARNINGS ${warns.length}`);
if (errors.length) { console.log("\nERRORS:"); errors.forEach((e) => console.log("  ✗ " + e)); }
if (warns.length) { console.log("\nWARNINGS:"); warns.forEach((w) => console.log("  • " + w)); }
process.exit(errors.length ? 1 : 0);
