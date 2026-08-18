/**
 * Custom (non-1:1) tools and handler overrides layered on top of the generated registry.
 *
 * The generated tools in tools.ts each map to a single RPC method and forward args verbatim.
 * A few operations need composite server-side logic instead:
 *
 *  - clone_entry: read an entity, copy its body byte-for-byte (with optional id replacements
 *    and dataset subsql overrides) and CREATE it as a new entry. This avoids the client (an
 *    LLM) having to re-serialize 50–125 KB of JSON, which is unreliable and expensive.
 *
 *  - update_dataset / validate_dataset: fetch the current head revision immediately before the
 *    call so a stale revision can't cause a mismatch, wrap the body in the `data.dataset`
 *    envelope the API requires, and turn a DATASET_REVISION_MISMATCH into an actionable error.
 *    NOTE: `data` MUST be `{ dataset: <content> }`. Sent flat, updateDataset answers 400
 *    GATEWAY_REQUEST_ERROR "{'dataset': ['Missing data for required field.']}" and validateDataset
 *    silently validates the STORED dataset instead of the submitted one (verified 2026-08-18).
 *
 * There are deliberately NO delete tools here (or anywhere) — non-destruction is a requirement.
 */
import { z } from "zod";
import { DataLensClient, DataLensError } from "./client.js";
import type { ToolSpec } from "./tools.js";

export type ToolHandler = (client: DataLensClient, args: Record<string, unknown>) => Promise<unknown>;
export type CustomTool = ToolSpec & { handler: ToolHandler };

// ---------------------------------------------------------------- helpers

/**
 * Hard ceiling on the serialized body during replacement. Far above any real entry (dashboards are
 * ~50–125 KB) but below V8's fatal string/array size, so a self-amplifying replacement (from='a',
 * to='aa') throws a normal, catchable error instead of aborting the whole process. Legitimate clones
 * keep the body roughly the same size, so this never affects real use.
 */
const MAX_REPLACE_BODY_CHARS = 100_000_000; // ~100 MB

/** Literal, global string replacements over the serialized body — used to retarget ids. */
function applyReplacements<T>(payload: T, replacements?: Array<{ from: string; to: string }>): T {
  if (!replacements?.length) return payload;
  let s = JSON.stringify(payload);
  // Keep the serialized body bounded at EVERY step. Both split() (its array) and the final JSON.parse()
  // (its array) abort the engine UNCATCHABLY past ~134M elements; a body <= the ceiling keeps both element
  // counts well under that. Legit clones never grow, so this only trips on a runaway replacement — either
  // self-amplifying (from='a', to='aa') or element-multiplying (from='0', to='0,0,0') — which we turn into
  // a normal catchable error. The guard must fire on the GROWN body, before the next split AND before parse.
  const guardSize = () => {
    if (s.length > MAX_REPLACE_BODY_CHARS) {
      throw new DataLensError(
        `clone_entry: replacement body grew past ${MAX_REPLACE_BODY_CHARS} chars — aborting to avoid a ` +
          "runaway. Check `replacements` (a rule like from='a', to='aa' or from='0', to='0,0,0' explodes the body).",
        400,
        null,
      );
    }
  };
  guardSize(); // original body sanity, before any split
  for (const r of replacements) {
    if (typeof r?.from === "string" && r.from !== "" && typeof r?.to === "string") {
      s = s.split(r.from).join(r.to);
      guardSize(); // bound the grown body before the next split and before the final JSON.parse
    }
  }
  return JSON.parse(s) as T;
}

/** For datasets: rewrite parameters.subsql of the source whose title or id matches a key. */
function applySubsqlOverrides(datasetDef: any, overrides?: Record<string, string>): void {
  if (!overrides || !Array.isArray(datasetDef?.sources)) return;
  for (const src of datasetDef.sources) {
    const key =
      overrides[src?.title] !== undefined ? src.title : overrides[src?.id] !== undefined ? src.id : undefined;
    if (key !== undefined && src.parameters && typeof src.parameters === "object") {
      src.parameters.subsql = overrides[key];
    }
  }
}

// ---------------------------------------------------------------- clone_entry

async function cloneEntry(client: DataLensClient, args: Record<string, unknown>): Promise<{ entryId: unknown }> {
  const entryId = args.entryId as string;
  const replacements = args.replacements as Array<{ from: string; to: string }> | undefined;
  const subsql = args.sourceSubsqlOverrides as Record<string, string> | undefined;

  // 1. identify the entity (scope + chart type) and its home workbook
  const lookup = (await client.rpc("getEntries", { ids: [entryId] })) as any;
  const entry = lookup?.entries?.[0];
  if (!entry) throw new DataLensError(`clone_entry: entry "${entryId}" not found`, 404, lookup);
  const srcWb = entry.workbookId ?? undefined;
  const target = (args.targetWorkbookId as string | undefined) ?? srcWb;
  const origName = entry.name ?? (typeof entry.key === "string" ? entry.key.split("/").pop() : entryId);
  const name = (args.newName as string | undefined) ?? `${origName} (copy)`;
  const scope: string = entry.scope;
  const type: string = entry.type ?? "";

  // 2–4. read body, transform, create via the create_ path (never update — no revision issues)
  if (scope === "dataset") {
    const got = (await client.rpc("getDataset", { datasetId: entryId, workbookId: srcWb })) as any;
    let def = structuredClone(got.dataset);
    applySubsqlOverrides(def, subsql); // structured: only parameters.subsql changes
    def = applyReplacements(def, replacements); // string: retarget ids (e.g. connection_id)
    delete def.revision_id; // create mints a new revision; field guids / avatars / relations kept as-is
    const created = (await client.rpc("createDataset", { dataset: def, name, workbook_id: target })) as any;
    return { entryId: created.id ?? created.dataset?.id };
  }

  if (scope === "dash") {
    const got = (await client.rpc("getDashboard", { dashboardId: entryId, workbookId: srcWb })) as any;
    let data = structuredClone(got.entry.data);
    data = applyReplacements(data, replacements); // retarget tile -> new chart/dataset ids
    data.salt = String(Math.random()); // fresh salt for the copy
    const meta = got.entry.meta ?? {};
    const created = (await client.rpc("createDashboard", { entry: { workbookId: target, name, data, meta } })) as any;
    return { entryId: created.entryId ?? created.entry?.entryId };
  }

  if (scope === "widget") {
    const isQl = /ql/i.test(type);
    const isWizard = /wizard/i.test(type);
    if (!isQl && !isWizard) {
      throw new DataLensError(
        `clone_entry: chart type "${type}" is not supported (only wizard and QL charts). ` +
          "Clone its dataset and rebuild this chart, or extend clone_entry for this type.",
        400,
        entry,
      );
    }
    const getMethod = isQl ? "getQLChart" : "getWizardChart";
    const createMethod = isQl ? "createQLChart" : "createWizardChart";
    const template = isQl ? "ql" : "datalens";
    const got = (await client.rpc(getMethod, { chartId: entryId, workbookId: srcWb })) as any;
    const data = applyReplacements(structuredClone(got.data), replacements); // retarget dataset/connection
    const created = (await client.rpc(createMethod, { template, data, workbookId: target, name })) as any;
    return { entryId: created.entryId };
  }

  throw new DataLensError(
    `clone_entry: unsupported scope "${scope}". Supported: dataset, dash, wizard/QL chart.`,
    400,
    entry,
  );
}

// ---------------------------------------------------------------- get_entry (auto-dispatch read)

/**
 * Read any entry by id without knowing its type up front: detect scope/type via getEntries
 * and dispatch to the right get_ method. Removes the "get_wizard_chart -> 404 because it is
 * actually a QL chart" papercut. Returns the underlying object verbatim.
 */
async function getEntry(client: DataLensClient, args: Record<string, unknown>): Promise<unknown> {
  const entryId = args.entryId as string;
  const revId = args.revId as string | undefined;
  const lookup = (await client.rpc("getEntries", { ids: [entryId] })) as any;
  const entry = lookup?.entries?.[0];
  if (!entry) throw new DataLensError(`get_entry: entry "${entryId}" not found`, 404, lookup);
  const workbookId = entry.workbookId ?? undefined;
  const scope: string = entry.scope;
  const type: string = entry.type ?? "";
  const rev = revId ? { revId } : {};

  if (scope === "dataset") return client.rpc("getDataset", { datasetId: entryId, workbookId, ...(revId ? { rev_id: revId } : {}) });
  if (scope === "dash") return client.rpc("getDashboard", { dashboardId: entryId, workbookId, ...rev });
  if (scope === "connection") return client.rpc("getConnection", { connectionId: entryId, workbookId, ...(revId ? { rev_id: revId } : {}) });
  if (scope === "widget") {
    if (/ql/i.test(type)) return client.rpc("getQLChart", { chartId: entryId, workbookId, ...rev });
    if (/editor/i.test(type)) return client.rpc("getEditorChart", { chartId: entryId, workbookId, ...rev });
    return client.rpc("getWizardChart", { chartId: entryId, workbookId, ...rev });
  }
  // folders and anything else have no separate body — return the entry metadata
  return entry;
}

// ---------------------------------------------------------------- dataset revision fix

/** Wrap a save/validate so a DataLens-side revision mismatch becomes an actionable message. */
async function callWithRevisionHelp(client: DataLensClient, method: string, body: unknown): Promise<unknown> {
  try {
    return await client.rpc(method, body);
  } catch (err) {
    if (err instanceof DataLensError && /REVISION_MISMATCH/i.test(JSON.stringify(err.body ?? err.message))) {
      throw new DataLensError(
        `${method}: DataLens returned DATASET_REVISION_MISMATCH even against the head revision fetched immediately ` +
          "before the call — someone else saved the dataset in between. Re-read it with get_dataset and retry. " +
          "To COPY a dataset use clone_entry instead.",
        err.status,
        err.body,
      );
    }
    throw err;
  }
}

/** update_dataset, but with the current head revision injected right before saving. */
async function updateDatasetFresh(client: DataLensClient, args: Record<string, unknown>): Promise<unknown> {
  const datasetId = args.datasetId as string;
  const workbookId = args.workbookId as string | undefined;
  const head = (await client.rpc("getDataset", { datasetId, ...(workbookId ? { workbookId } : {}) })) as any;
  const rev = head?.dataset?.revision_id;
  // full-body replace (the documented semantics); fall back to the current body if data omitted
  const def: any = (args.data as any) ?? head?.dataset ?? {};
  const data = { ...def, ...(rev ? { revision_id: rev } : {}) };
  return callWithRevisionHelp(client, "updateDataset", { datasetId, data: { dataset: data } });
}

/** validate_dataset, with the head revision injected; also avoids the datasetId-only 415. */
async function validateDatasetFresh(client: DataLensClient, args: Record<string, unknown>): Promise<unknown> {
  const datasetId = args.datasetId as string;
  const workbookId = args.workbookId as string | undefined;
  const head = (await client.rpc("getDataset", { datasetId, ...(workbookId ? { workbookId } : {}) })) as any;
  const rev = head?.dataset?.revision_id;
  const def: any = (args.data as any) ?? head?.dataset ?? {};
  const data = { ...def, ...(rev ? { revision_id: rev } : {}) };
  return callWithRevisionHelp(client, "validateDataset", { datasetId, ...(workbookId ? { workbookId } : {}), data: { dataset: data } });
}

// ---------------------------------------------------------------- exports

/** Extra tools appended to the generated registry. */
export const EXTRA_TOOLS: CustomTool[] = [
  {
    name: "get_entry",
    description:
      "Read ANY entry by id (dataset, dashboard, wizard/QL/editor chart, connection) without " +
      "knowing its type first — auto-detects the type and returns the same body the specific " +
      "get_ tool would. Use this instead of guessing get_wizard_chart vs get_ql_chart.",
    method: "get_entry", // synthetic — handler dispatches
    kind: "read",
    schema: {
      entryId: z.string().describe("ID of the entry to read"),
      revId: z.string().optional().describe("Optional specific revision to fetch"),
    },
    handler: getEntry,
  },
  {
    name: "clone_entry",
    description:
      "Server-side clone of a dataset, dashboard, or wizard/QL chart: reads the entity's saved body and creates a " +
      "byte-for-byte copy as a NEW entry, so the client never re-sends huge JSON. Optional `replacements` retarget " +
      "ids (e.g. a chart copy -> new dataset; a dashboard copy -> new charts/datasets); `sourceSubsqlOverrides` " +
      "rewrites dataset source SQL. Internal dataset ids (field guids, avatar/source ids) are preserved so cloned " +
      "charts still bind by guid.",
    method: "clone_entry", // synthetic — never sent; the handler drives the RPC calls
    kind: "create",
    schema: {
      entryId: z.string().describe("ID of the dataset / dashboard / wizard or QL chart to clone"),
      targetWorkbookId: z.string().optional().describe("Workbook to create the copy in (default: same as source)"),
      newName: z.string().optional().describe("Name of the copy (default: '<original> (copy)')"),
      replacements: z
        .array(z.object({ from: z.string().max(2000), to: z.string().max(2000) }))
        .max(50)
        .optional()
        .describe("Literal string replacements over the serialized clone body — retarget ids old -> new"),
      sourceSubsqlOverrides: z
        .record(z.string(), z.string())
        .optional()
        .describe("Datasets only: source title or id -> new subsql text. Everything else is preserved."),
    },
    handler: cloneEntry,
  },
];

/** Handler overrides for existing generated tools, keyed by tool name. */
export const HANDLER_OVERRIDES: Record<string, ToolHandler> = {
  update_dataset: updateDatasetFresh,
  validate_dataset: validateDatasetFresh,
};
