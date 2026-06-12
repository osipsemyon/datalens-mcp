#!/usr/bin/env node
/**
 * DataLens MCP server.
 *
 * Exposes the Yandex DataLens public API (https://api.datalens.tech) as MCP tools over
 * stdio — the same transport the Looker MCP uses. Configuration and secrets come from
 * environment variables (see DataLensClient.fromEnv / README), never from code.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { DataLensClient, DataLensError } from "./client.js";
import { TOOLS } from "./tools.js";
import { EXTRA_TOOLS, HANDLER_OVERRIDES, type CustomTool } from "./custom.js";

/**
 * Safety policy advertised to every client at connect time (MCP `instructions`).
 * The server is deliberately non-destructive (no delete tools at all) and gates writes:
 * creates need an explicit command, modifications need explicit confirmation. The policy
 * is keyed off each tool's `kind` (see tools.ts).
 */
const SERVER_INSTRUCTIONS = [
  "DataLens MCP server — SAFETY POLICY. This is advisory: the server does NOT itself block calls,",
  "so enforcement depends on you honoring this and on your MCP client's approval prompts. For a hard",
  "guarantee, run the server with DATALENS_READ_ONLY=1 (write tools are then not registered at all).",
  "1. READ freely: get_/list_/validate_ tools are read-only and safe for discovery. Caveat: a few",
  "   reads return bulk dumps — get_workbook_export_result returns a whole workbook including",
  "   connection config; treat its output as sensitive.",
  "2. CREATE (create_ tools) adds NEW objects to the user's DataLens org. Only call one when",
  "   the user has, in this conversation, explicitly asked to create that specific object.",
  "   Never create speculatively, proactively, or to test/fix.",
  "3. MODIFY / SENSITIVE: update_/move_/rename_-style tools change EXISTING objects. Highest blast",
  "   radius — permission grants (update_collection_access_bindings, update_workbook_access_bindings),",
  "   licensing (assign_licenses), signing secrets / public embeds (create_embedding_secret,",
  "   create_embed), bulk import/export (start_workbook_import, start_workbook_export), and",
  "   permission-granting folders (create_folder). Only call any of these after the user has EXPLICITLY",
  "   asked AND confirmed it — treat every such call as requiring explicit confirmation, every time.",
  "4. There are NO delete tools by design — nothing can be deleted through this server.",
].join("\n");

const CREATE_NOTE =
  "⚠️ CREATE — adds a NEW object to DataLens. Only call when the user has explicitly asked " +
  "to create this object in the current conversation; never on your own initiative. ";

const MODIFY_NOTE =
  "⚠️ MODIFY — changes an EXISTING object in DataLens. Only call after the user has " +
  "explicitly asked for this change AND confirmed it; never on your own initiative. ";

const SENSITIVE_NOTE =
  "⚠️ SENSITIVE — creates a high-impact object (signing secret, public embed, or permission " +
  "grant). Only call after the user has explicitly asked AND confirmed it; never on your own initiative. ";

/**
 * Tools with outsized blast radius that warrant the highest (confirm-every-time) gating, regardless
 * of their create/modify kind: permission grants, licensing, signing secrets, public embeds, bulk
 * import/export, and permission-granting folders.
 */
const SENSITIVE_TOOLS = new Set([
  "create_embedding_secret",
  "create_embed",
  "create_folder",
  "start_workbook_export",
  "start_workbook_import",
  "update_collection_access_bindings",
  "update_workbook_access_bindings",
  "assign_licenses",
]);

/**
 * Response size handling. A tool result is ALWAYS valid JSON: either the complete object
 * is returned inline, or — when it would exceed the limit — the full, valid JSON is spilled
 * to a file and the path is returned. We never emit half-truncated JSON.
 *
 * Limit is DATALENS_MAX_RESPONSE_CHARS (chars), default 5,000,000; set 0 to disable spilling.
 * Per-call `raw: true` also disables spilling and returns the full JSON inline.
 */
const DEFAULT_MAX_RESPONSE_CHARS = 5_000_000;
function resolveMaxResponseChars(): number {
  const raw = process.env.DATALENS_MAX_RESPONSE_CHARS?.trim();
  if (!raw) return DEFAULT_MAX_RESPONSE_CHARS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MAX_RESPONSE_CHARS;
}
/**
 * Spill files can contain sensitive API data (e.g. connection credentials). Write them to a private,
 * freshly-minted per-process dir (mkdtemp → 0700, unguessable) created lazily on first spill, and
 * write each file 0600 with O_EXCL ('wx') — so other local users can't read them and a pre-planted
 * symlink at a predictable path can't redirect/clobber the write.
 */
let spillDir: string | null = null;
let spillSeq = 0;
function getSpillDir(): string {
  if (spillDir === null) spillDir = mkdtempSync(join(tmpdir(), "datalens-mcp-"));
  return spillDir;
}
/** Per-call escape hatch: return full JSON inline regardless of size. Injected into every tool. */
const RAW_PARAM = {
  raw: z
    .boolean()
    .optional()
    .describe("Return the full JSON inline even if huge (disables the size-guard file spill)."),
};

/**
 * Minimal zero-dependency `.env` loader. The server reads process.env directly; this lets a plain
 * `.env` file (copied from `.env.example`) "just work" for local/manual runs without a dotenv dep.
 * Real environment variables (e.g. injected by your MCP client) ALWAYS win — `.env` never overrides
 * an already-set var. Looks at DATALENS_ENV_FILE, else `./.env` (cwd) and `<repo>/.env` (next to dist/).
 */
function loadDotEnv(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = process.env.DATALENS_ENV_FILE
    ? [process.env.DATALENS_ENV_FILE]
    : [join(process.cwd(), ".env"), join(here, "..", ".env")];
  for (const file of candidates) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue; // file not found / unreadable -> try next candidate
    }
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue; // skips blank lines and #comments
      const key = m[1];
      if (key in process.env) continue; // never override a real env var
      let val = m[2].trim();
      if (val === "") continue;
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
    return; // first existing file wins
  }
}

async function main() {
  loadDotEnv();
  // Fail fast with a clear message if auth env is missing.
  const client = DataLensClient.fromEnv();
  const maxResponseChars = resolveMaxResponseChars();

  const server = new McpServer(
    {
      name: "datalens",
      version: "0.1.0",
    },
    { instructions: SERVER_INSTRUCTIONS },
  );

  // generated 1:1 tools + custom composite tools (clone_entry); some generated tools also
  // get a composite handler override (dataset save/validate revision handling).
  // DATALENS_READ_ONLY=1 registers only read tools — a hard, opt-in write guarantee.
  const readOnlyMode = process.env.DATALENS_READ_ONLY === "1" || process.env.DATALENS_READ_ONLY === "true";
  const toRegister = readOnlyMode ? [...TOOLS, ...EXTRA_TOOLS].filter((t) => t.kind === "read") : [...TOOLS, ...EXTRA_TOOLS];
  for (const tool of toRegister) {
    const handler = (tool as CustomTool).handler ?? HANDLER_OVERRIDES[tool.name];
    const readOnly = tool.kind === "read";
    const sensitive = SENSITIVE_TOOLS.has(tool.name);
    const note = sensitive ? SENSITIVE_NOTE : tool.kind === "modify" ? MODIFY_NOTE : tool.kind === "create" ? CREATE_NOTE : "";
    server.registerTool(
      tool.name,
      {
        description: note + tool.description,
        // `raw` is a server-side response-control flag, stripped before the RPC call.
        inputSchema: { ...tool.schema, ...RAW_PARAM },
        annotations: {
          readOnlyHint: readOnly,
          // any state mutation (create OR modify) is destructive for client auto-approval purposes
          destructiveHint: !readOnly,
          idempotentHint: readOnly,
          openWorldHint: true,
        },
      },
      async (args: Record<string, unknown>) => {
        try {
          // pull the server-only `raw` flag out so it never reaches the API body
          const { raw: rawFlag, ...rpcArgs } = args as { raw?: boolean } & Record<string, unknown>;
          const result = handler
            ? await handler(client, rpcArgs)
            : await client.rpc(tool.method, tool.build ? tool.build(rpcArgs) : rpcArgs);
          // read tools -> compact JSON (smaller); writes -> pretty (small, easier to read).
          // Either way it is COMPLETE, valid JSON — never sliced.
          const text = readOnly ? JSON.stringify(result) : JSON.stringify(result, null, 2);
          const unlimited = rawFlag === true || maxResponseChars === 0;
          if (unlimited || text.length <= maxResponseChars) {
            return { content: [{ type: "text", text }] };
          }
          // Too large: write the COMPLETE, valid JSON to a file and hand back its path,
          // rather than truncating into broken JSON. Round-trips stay possible.
          const full = JSON.stringify(result);
          try {
            const filePath = join(getSpillDir(), `${tool.method}-${++spillSeq}.json`);
            writeFileSync(filePath, full, { mode: 0o600, flag: "wx" });
            return {
              content: [
                {
                  type: "text",
                  text:
                    `Result is ${text.length} chars (> DATALENS_MAX_RESPONSE_CHARS=${maxResponseChars}). ` +
                    `The COMPLETE, valid JSON was written to:\n${filePath}\n\n` +
                    `Read that file for the full object. To get the full JSON inline instead, ` +
                    `re-call this tool with raw=true (or set DATALENS_MAX_RESPONSE_CHARS=0).`,
                },
              ],
            };
          } catch {
            // if spilling fails, still return the COMPLETE JSON inline — never truncate
            return { content: [{ type: "text", text: full }] };
          }
        } catch (err) {
          if (err instanceof DataLensError) {
            // Reflect the upstream body for debugging, but bound it: a hostile/huge body shouldn't
            // dominate the model context. (The IAM token never appears here — it lives only in the
            // request header, never in err.body.)
            const bodyText = JSON.stringify(err.body, null, 2);
            const safeBody =
              typeof bodyText === "string" && bodyText.length > 4000
                ? `${bodyText.slice(0, 4000)}\n…(truncated, ${bodyText.length} chars total)`
                : bodyText;
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: `${err.message}\n\nResponse body:\n${safeBody}`,
                },
              ],
            };
          }
          return {
            isError: true,
            content: [{ type: "text", text: `Unexpected error: ${String(err)}` }],
          };
        }
      },
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio servers must not write to stdout; log to stderr only.
  process.stderr.write(
    `datalens-mcp ready — ${toRegister.length} tools registered${readOnlyMode ? " (READ-ONLY mode)" : ""}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`datalens-mcp failed to start: ${String(err)}\n`);
  process.exit(1);
});
