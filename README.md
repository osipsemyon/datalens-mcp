# datalens-mcp

An MCP server for the **Yandex DataLens public API** (`https://api.datalens.tech`).
Exposes dashboards, charts, datasets and connections as MCP tools over stdio — modelled
on the same practices as the Looker MCP (stdio transport, secrets via env, thin API layer).

## What it does

The DataLens API is RPC-style (`POST /rpc/<method>`). This server wraps **(almost) the whole
public API as 70 tools** — 68 generated directly from the official OpenAPI spec (each tool's
input schema mirrors the API request body 1:1, see [src/tools.ts](src/tools.ts)) plus two
composite tools, `get_entry` and `clone_entry` (see [src/custom.ts](src/custom.ts)).

It is **non-destructive by design**: every `delete*` method is intentionally omitted, so
nothing can be deleted through this server. The tools fall into three `kind`s:

| kind | count | what it does | gating |
|------|-------|--------------|--------|
| **read** | 35 | `get_*` / `list_*` / `validate_*` / `get_entry` | none — safe for discovery |
| **create** | 14 | `create_*` / `start_*` / `clone_entry` — add NEW objects | only on an **explicit user command** |
| **modify** | 21 | `update_*` / `move_*` / `rename_*` / `start_workbook_import` / … — change EXISTING objects (or bulk-import) | only on an explicit request **+ confirmation** |

Coverage by area: collections, workbooks (incl. `get_workbook_entries`, move, export/import),
entries (relations, rename), dashboards, wizard / QL / **editor** charts, datasets, connections,
folders, reports, embeds & embedding secrets, access bindings, licensing and audit.

### Composite tools, cloning & a dataset-edit caveat

- **`get_entry(entryId)`** reads any entry — dataset, dashboard, wizard/QL/editor chart, connection —
  auto-detecting its type, so you don't have to guess `get_wizard_chart` vs `get_ql_chart` (which
  404s on the wrong type). Returns the same body the specific `get_` tool would.
- **`clone_entry`** copies a dataset, dashboard, or wizard/QL chart **server-side**, byte-for-byte,
  and creates it as a new entry — so an LLM client never has to re-serialize 50–125 KB of JSON
  (which is unreliable). Optional `replacements` retarget ids (chart copy → new dataset; dashboard
  copy → new charts/datasets); `sourceSubsqlOverrides` rewrites a dataset source's SQL while
  preserving field guids / avatars. This is the recommended way to clone/migrate entities.
- **`update_dataset` / `validate_dataset`** fetch the current head revision before saving and wrap the
  body in the `data: { dataset: … }` envelope the API requires, so editing an **existing** dataset works
  in place. (Earlier releases sent the dataset content flat under `data`; `updateDataset` answered
  `400 GATEWAY_REQUEST_ERROR {'dataset': ['Missing data for required field.']}`, which was misread as a
  gateway-side revision limitation. `dataset` is optional on `validateDataset`, so a flat body there
  silently validated the *stored* dataset and still reported OK.) `clone_entry`
  (+ `sourceSubsqlOverrides`) remains the way to *copy* a dataset rather than edit one.

> **Safety policy (advisory).** The server advertises this policy via MCP `instructions` at connect
> time and tags every tool with annotations — `readOnlyHint` for reads, `destructiveHint` for **every**
> write (create *and* modify, so confirmation-by-default clients prompt before any mutation). `create`/
> `modify` tool descriptions are prefixed with a ⚠️ note, and the highest-impact operations — permission
> grants (`update_*_access_bindings`), licensing, signing secrets / public embeds, bulk import/export,
> and permission-granting folders (`create_folder`) — get an extra ⚠️ SENSITIVE prefix. **This is advisory: the server does not itself block calls** —
> enforcement depends on the model honoring it and on your MCP client's approval flow. For a hard
> guarantee, set `DATALENS_READ_ONLY=1`, which registers **only** read tools (no write tool exists to call).

> **Note:** dashboards and `*_chart` create/update are marked *Experimental* by DataLens — the
> request schema can change. The robust workflow is **clone-then-edit**: call a `get_*`
> tool to fetch a real object, tweak the returned JSON, then pass it to the matching `create_*`.

## Setup

```bash
npm install
npm run build
```

## Auth

Both are required. Set them as real environment variables (e.g. in your MCP client config, below),
or copy `.env.example` to `.env` and fill it in — the server **auto-loads `.env`** at startup
(real env vars always take precedence; point elsewhere with `DATALENS_ENV_FILE`).

- `DATALENS_IAM_TOKEN` — a ready IAM token: `yc iam create-token`. Short-lived (~12h); refresh
  it when it expires (a 401/403 returns a clear "refresh the token" error). The token is read
  **once at startup**, so after refreshing it you must **restart the server** (or your MCP client)
  for the new token to take effect. **Yandex OAuth tokens are not supported** — the OAuth→IAM
  exchange was discontinued for tokens issued after 2026-06-01, so the server takes an IAM token directly.
- `DATALENS_ORG_ID` — your DataLens organization ID, sent as the mandatory `x-dl-org-id` header.

Optional:

- `DATALENS_API_BASE` — override for self-hosted DataLens. Must be `https` (the IAM token is sent to
  it on every request); `http` is allowed only for `localhost`, or set `DATALENS_ALLOW_INSECURE_BASE=1`
  to permit `http` to a self-hosted host on a trusted network.
- `DATALENS_READ_ONLY=1` — register only read tools; a hard, opt-in write guarantee.
- `DATALENS_API_VERSION` (default `1`).
- `DATALENS_TIMEOUT_MS` (per-request timeout, default `60000`).
- `DATALENS_MAX_RESPONSE_CHARS` (default `5000000`, `0` = unlimited).

### Large responses

Tool results are **always complete, valid JSON** — never truncated mid-object. Read tools
return compact (minified) JSON. If a result would exceed `DATALENS_MAX_RESPONSE_CHARS`, the
full JSON is written to a temp file and the tool returns its path (so clone-then-edit
round-trips still work). The spill file lives in a private, per-process temp directory
(`0700`) and is written `0600` — but it may contain sensitive data (e.g. connection config),
so treat it accordingly. Pass `raw: true` to any tool to force the full JSON inline regardless
of size.

## Connect to Claude Code

Either run:

```bash
claude mcp add datalens -- node /path/to/datalens-mcp/dist/index.js
```

…then set the env vars, or add a block to `~/.claude.json` under `mcpServers` (mirrors the
existing `looker` entry):

```json
"datalens": {
  "command": "node",
  "args": ["/path/to/datalens-mcp/dist/index.js"],
  "env": {
    "DATALENS_IAM_TOKEN": "<your-iam-token>",
    "DATALENS_ORG_ID": "<your-org-id>"
  }
}
```

Restart Claude Code; the tools appear as `mcp__datalens__*`.

### Optional: auto-refresh the IAM token (`yc` users)

The IAM token expires after ~12h. Instead of pasting a fresh one each time, launch the server via the
bundled [`bin/datalens-launch.sh`](bin/datalens-launch.sh), which mints a token on every start —
nothing is stored on disk. Point the MCP `command` at it (no `env` token needed):

```json
"datalens": {
  "command": "/path/to/datalens-mcp/bin/datalens-launch.sh",
  "args": [],
  "env": { "DATALENS_USE_YC_TOKEN": "1", "DATALENS_ORG_ID": "<your-org-id>" }
}
```

(Or put `DATALENS_USE_YC_TOKEN=1` and `DATALENS_ORG_ID=...` in `.env`.) On every server start
(e.g. a VS Code "Reload Window") it re-mints automatically. Requires the
[`yc` CLI](https://yandex.cloud/docs/cli/) already logged in (`yc init`) — the browser is used only
for that one-time login; `yc iam create-token` then runs non-interactively. If your MCP client
launches with a minimal `PATH`, edit the script to use absolute paths to `yc`/`node`.

## Test

```bash
npm test          # initialize + tools/list, in normal AND read-only mode (no network);
                  # asserts DATALENS_READ_ONLY=1 registers zero write tools
npm run check:tools   # build + conformance audit of every tool against the OpenAPI spec
```

## Layout

- `src/client.ts` — IAM-token auth and the `rpc()` call (timeout, clear 401/timeout errors).
- `src/tools.ts` — tool registry, **generated** from the live OpenAPI spec by `scripts/gen-tools.mjs`.
- `src/custom.ts` — composite tools (`get_entry`, `clone_entry`) and the dataset save/validate handler overrides.
- `src/index.ts` — server wiring, stdio transport, per-`kind` safety annotations, error mapping.
- `scripts/gen-tools.mjs` — regenerates `src/tools.ts` from a saved OpenAPI spec (`npm run gen:tools`).
- `scripts/check-conformance.mjs` — fail-closed audit: every tool vs the spec (run in CI via `npm run check:tools`).

## Contact

Questions, ideas, or issues — reach the maintainer on Telegram [@osipsemyon](https://t.me/osipsemyon),
by email at osipsemyon@gmail.com, or via [GitHub issues](https://github.com/osipsemyon/datalens-mcp/issues).
For security reports, see [SECURITY.md](SECURITY.md).
