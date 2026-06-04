# Security

## Threat model

`datalens-mcp` runs locally as a stdio MCP server and talks to the DataLens API with an **org-scoped
IAM bearer token** you provide via env. Its client is an LLM, which may be steered by untrusted content
(prompt injection via entry names, descriptions, and API responses).

- **The safety policy is advisory.** The server tags tools with MCP annotations (`readOnlyHint`,
  `destructiveHint` on every write) and advertises a policy via `instructions`, but it does **not**
  itself block calls — enforcement depends on your MCP client's approval flow and the model honoring
  the policy. There are **no delete tools** by design.
- **For a hard guarantee, run read-only:** set `DATALENS_READ_ONLY=1` and no create/modify tool is
  registered at all.
- **Credential egress is bounded.** The token is sent only to `DATALENS_API_BASE`, which must be `https`
  (except `localhost`, or with an explicit `DATALENS_ALLOW_INSECURE_BASE=1`). URLs with embedded
  credentials or a query/fragment are rejected. The token is never echoed into tool results or errors.
- **Sensitive operations** — permission grants (`update_*_access_bindings`), licensing, signing
  secrets / public embeds, and bulk import/export — carry an extra ⚠️ SENSITIVE note and should only
  be run on an explicit, confirmed user request.
- **Large responses** spill to a private per-process temp dir (`0700`, files `0600`) but may contain
  sensitive data (e.g. connection config) — treat spill files accordingly.

## Reporting a vulnerability

Please report privately rather than filing a public issue — open a GitHub security advisory, or contact
the maintainer at [@osipsemyon](https://t.me/osipsemyon) (Telegram) or osipsemyon@gmail.com. Include
reproduction steps and the affected version.
