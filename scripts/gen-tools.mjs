import { readFileSync, writeFileSync } from "node:fs";
const here = (p) => new URL(p, import.meta.url);
const spec = JSON.parse(readFileSync(here("./datalens-openapi.json"), "utf8"));
const D = (o) => { if (o && o.$ref) { const p = o.$ref.replace(/^#\//, "").split("/"); let c = spec; for (const k of p) c = c[k]; return c; } return o; };

const snake = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2").toLowerCase();
const ident = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));
// JSON.stringify does NOT escape U+2028/U+2029, which ARE JavaScript line terminators and would break
// out of a generated string literal (e.g. via an enum value). Escape them so every lit() consumer is safe.
const lit = (s) => JSON.stringify(s).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

function zodFor(propSchema, required) {
  const pv = D(propSchema);
  let t = pv.type;
  const nullable = Array.isArray(t) ? t.includes("null") : pv.nullable;
  if (Array.isArray(t)) t = t.find((x) => x !== "null");
  let z;
  if (Array.isArray(pv.enum) && pv.enum.every((e) => typeof e === "string")) {
    // enum-constrained string -> real z.enum so invalid values are rejected & shown to the model
    z = `z.enum([${pv.enum.map(lit).join(", ")}])`;
  } else if (t === "string") z = "z.string()";
  else if (t === "number" || t === "integer") z = "z.number()";
  else if (t === "boolean") z = "z.boolean()";
  else if (t === "array") {
    const it = D(pv.items || {});
    z = it.type === "string" ? "z.array(z.string())" : "z.array(z.any())";
  } else if (t === "object") z = "json()";
  else {
    // anyOf/oneOf of string | array<string> (e.g. id-or-ids) -> a real union; otherwise
    // unknown/$ref. z.any() is implicitly optional in zod, so a REQUIRED such field must
    // use json() (an object) to actually be enforced (every required one here is `entry`).
    const branches = (pv.anyOf || pv.oneOf || []).map((b) => D(b).type);
    if (branches.includes("string") && branches.includes("array")) z = "z.union([z.string(), z.array(z.string())])";
    else z = required ? "json()" : "z.any()";
  }
  if (nullable && !z.startsWith("z.any")) z += ".nullable()";
  if (!required) z += ".optional()";
  if (pv.description) {
    const d = pv.description.replace(/\s+/g, " ").trim();
    const short = d.length > 200 ? d.slice(0, 199).replace(/\s+\S*$/, "") + "…" : d;
    z += `.describe(${lit(short)})`;
  }
  return z;
}

// Gather top-level properties from a request body schema, merging allOf/small oneOf branches.
function gather(sch) {
  sch = D(sch);
  if (!sch) return { passthrough: false, props: {}, required: new Set() };
  // big discriminated unions (e.g. connections: one variant per db type) -> passthrough
  if (sch.oneOf && sch.oneOf.length > 5) return { passthrough: true };
  const props = {};
  const required = new Set(sch.required || []);
  const addFrom = (s, opt = false) => {
    s = D(s);
    if (!s) return;
    for (const [k, v] of Object.entries(s.properties || {})) props[k] = v;
    if (!opt) for (const r of s.required || []) required.add(r);
    for (const b of s.allOf || []) addFrom(b, opt);
    // small oneOf: alternatives -> merge as optional
    if (s.oneOf && s.oneOf.length <= 5) for (const b of s.oneOf) addFrom(b, true);
  };
  addFrom(sch);
  if (Object.keys(props).length === 0) return { passthrough: true };
  return { passthrough: false, props, required };
}

// Hand-tuned overrides:
//  - getEntries: root schema is a nested oneOf of {scope}|{ids}.
//  - updateDataset: the spec body is {datasetId, data} only, but the composite handler
//    (custom.ts updateDatasetFresh) needs workbookId for its preliminary getDataset head-revision
//    fetch — without it in the schema, the MCP SDK's zod parse silently strips the key before the
//    handler sees it. The handler never forwards workbookId to updateDataset itself.
const OVERRIDES = {
  updateDataset: {
    desc: "Update dataset. FULL-BODY replace: `data` is saved as the entire new dataset body (fields omitted from it are dropped); if `data` is omitted, the current body is re-saved as a new revision.",
    schema: `{
      datasetId: z.string(),
      workbookId: z.string().nullable().optional().describe("Workbook the dataset belongs to — used only to fetch the current head revision before saving; not sent to updateDataset itself."),
      data: json().optional(),
    }`,
  },
  getEntries: {
    schema: `{
      scope: z.string().optional().describe("Entry scope: dash | widget | dataset | connection | folder"),
      ids: z.union([z.string(), z.array(z.string())]).optional().describe("Specific entry ID(s) to fetch, instead of a scope"),
      includeData: z.boolean().optional(),
      includeLinks: z.boolean().optional(),
      includePermissionsInfo: z.boolean().optional(),
      ignoreWorkbookEntries: z.boolean().optional(),
      excludeLocked: z.boolean().optional(),
      filters: json().optional(),
      orderBy: json().optional(),
      createdBy: z.union([z.string(), z.array(z.string())]).optional(),
      page: z.number().optional(),
      pageSize: z.number().optional(),
    }`,
  },
};

function kindOf(method) {
  if (/^(get|list|validate)/.test(method)) return "read";
  // startWorkbookImport bulk-instantiates an entire workbook tree (datasets, connections
  // WITH credentials, charts, dashboards) from one blob — far past "adds a new object", so
  // gate it like a modification (explicit confirmation), not a light create.
  if (method === "startWorkbookImport") return "modify";
  if (/^(create|start)/.test(method)) return "create";
  return "modify"; // update, move, rename, assign, set, cancel, ...
}

const TAG_ORDER = ["Navigation", "Collection", "Workbook", "Entries", "Folder", "Dashboard", "Wizard", "QL", "Editor", "Dataset", "Connection", "Reports", "Embeds", "EmbeddingSecrets", "WorkbookExport", "WorkbookImport", "SharedEntry", "Licensing", "Audit"];

const entries = [];
for (const [path, ops] of Object.entries(spec.paths)) {
  const method = path.replace(/^\/rpc\//, "");
  if (/^delete/i.test(method)) continue; // deletes stay removed
  // Method names are interpolated into generated code (tool.method, and the passthrough describe()
  // below). Refuse anything that isn't a plain RPC identifier — a tampered spec could otherwise
  // smuggle a code-breakout payload through the path key. See check-conformance.mjs for the runtime audit.
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(method))
    throw new Error(`gen-tools: refusing unexpected RPC method name ${JSON.stringify(method)} (possible spec tampering)`);
  // fail-closed at codegen time (not just in check-conformance): a destructive verb the /^delete/ skip
  // doesn't cover must not be silently written into tools.ts even if conformance is never run.
  if (/^(purge|drop|remove|revoke|destroy|reset|truncate|wipe|erase|clear)/i.test(method))
    throw new Error(`gen-tools: refusing destructive-looking method ${JSON.stringify(method)} — not on the delete denylist; review before generating`);
  const op = ops[Object.keys(ops)[0]];
  const tag = (op.tags || ["Other"])[0];
  const desc = OVERRIDES[method]?.desc || (op.summary || op.description || method).replace(/\s+/g, " ").trim();
  entries.push({ method, name: snake(method), tag, desc, kind: kindOf(method), op });
}
entries.sort((a, b) => {
  const ta = TAG_ORDER.indexOf(a.tag), tb = TAG_ORDER.indexOf(b.tag);
  if (ta !== tb) return (ta < 0 ? 99 : ta) - (tb < 0 ? 99 : tb);
  return a.name.localeCompare(b.name);
});

let out = `/**
 * Declarative tool registry — GENERATED from the DataLens public OpenAPI spec
 * (https://api.datalens.tech, title "DataLens API"). One entry per RPC method.
 *
 * Each tool's input schema mirrors the API request body 1:1, so validated args are
 * forwarded verbatim — no per-tool adapters, no schema drift. Complex/opaque bodies
 * (connections, whose shape is a 29-variant union over db type) are accepted as a single
 * loose \`body\` object and passed through.
 *
 * SAFETY: this server is non-destructive. There are NO delete_ tools (deleteDashboard,
 * deleteWorkbook, ... are intentionally omitted). create_ tools require an explicit user
 * command; modify tools (update_/move_/rename_/...) additionally require explicit
 * user confirmation. See index.ts for how \`kind\` drives annotations and the safety policy.
 */
import { z, type ZodRawShape } from "zod";

/** An arbitrary JSON object — used for payloads too large to model field-by-field. */
const json = () => z.record(z.string(), z.any());

/** Whether a tool only reads, creates new objects, or modifies existing ones. */
export type ToolKind = "read" | "create" | "modify";

export interface ToolSpec {
  name: string;
  description: string;
  /** Zod raw shape used as the tool's input schema. */
  schema: ZodRawShape;
  /** DataLens RPC method name. */
  method: string;
  /** Read-only, creates new objects, or modifies existing ones. Drives MCP annotations. */
  kind: ToolKind;
  /** Map validated args to the RPC body. Defaults to identity (forward as-is). */
  build?: (args: Record<string, unknown>) => unknown;
}

export const TOOLS: ToolSpec[] = [
`;

let lastTag = null;
for (const e of entries) {
  if (e.tag !== lastTag) { out += `\n  // ----------------------------------------------------------------- ${String(e.tag).replace(/[^\x20-\x7e]/g, " ")}\n`; lastTag = e.tag; }
  let rb = D(e.op.requestBody);
  const sch = rb?.content?.["application/json"]?.schema;
  let schemaStr, build = "";
  if (OVERRIDES[e.method]) {
    schemaStr = OVERRIDES[e.method].schema;
  } else {
    const g = gather(sch);
    if (g.passthrough) {
      schemaStr = `{\n      body: json().describe(${lit("Full request body for " + e.method + " (type-specific / large payload)")}),\n    }`;
      build = `\n    build: ({ body }) => body,`;
    } else {
      const lines = Object.keys(g.props).map((k) => `      ${ident(k)}: ${zodFor(g.props[k], g.required.has(k))},`);
      schemaStr = lines.length ? `{\n${lines.join("\n")}\n    }` : `{}`;
    }
  }
  out += `  {
    name: ${lit(e.name)},
    description: ${lit(e.desc)},
    method: ${lit(e.method)},
    kind: ${lit(e.kind)},
    schema: ${schemaStr},${build}
  },\n`;
}
out += `];\n`;

writeFileSync(here("../src/tools.ts"), out);
const counts = entries.reduce((a, e) => ((a[e.kind] = (a[e.kind] || 0) + 1), a), {});
console.log("generated src/tools.ts:", entries.length, "tools", JSON.stringify(counts));
console.log("passthrough methods:", entries.filter((e) => { const g = gather(D(e.op.requestBody)?.content?.["application/json"]?.schema); return g.passthrough; }).map((e) => e.name).join(", "));
