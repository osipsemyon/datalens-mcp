// Minimal MCP stdio smoke test: initialize -> tools/list, in normal AND read-only mode.
// No network calls. Read-only mode is the advertised HARD write guarantee — assert it here.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

/** Spawn the server with extra env, do the MCP handshake, return the tool names. */
function listTools(extraEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["dist/index.js"], {
      cwd: repoRoot,
      env: { ...process.env, DATALENS_IAM_TOKEN: "dummy", DATALENS_ORG_ID: "dummy", ...extraEnv },
      stdio: ["pipe", "pipe", "inherit"],
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("timeout waiting for tools/list"));
    }, 5000);
    const send = (msg) => child.stdin.write(JSON.stringify(msg) + "\n");
    let buf = "";

    child.stdout.on("data", (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        const msg = JSON.parse(line);
        if (msg.id === 1) {
          send({ jsonrpc: "2.0", method: "notifications/initialized" });
          send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
        } else if (msg.id === 2) {
          clearTimeout(timer);
          child.kill();
          resolve(msg.result.tools.map((t) => t.name));
        }
      }
    });

    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "smoke", version: "0" },
      },
    });
  });
}

const fail = (msg) => {
  console.error("FAIL: " + msg);
  process.exit(1);
};

// every read tool name starts with one of these (incl. the composite get_entry)
const READ_NAME = /^(get_|list_|validate_)/;

// 1. normal mode: full registry, including write tools
const all = await listTools({});
console.log(`tools/list returned ${all.length} tools:`);
console.log(all.map((t) => "  - " + t).join("\n"));
if (all.length === 0) fail("no tools registered");
if (!all.some((n) => !READ_NAME.test(n))) fail("normal mode registered no write tools — registry looks broken");

// 2. DATALENS_READ_ONLY=1: ONLY read tools may exist — no write tool to call at all
const ro = await listTools({ DATALENS_READ_ONLY: "1" });
const leaked = ro.filter((n) => !READ_NAME.test(n));
if (leaked.length) fail(`READ_ONLY mode registered write tools: ${leaked.join(", ")}`);
if (ro.length === 0 || ro.length >= all.length) fail(`READ_ONLY tool count looks wrong: ${ro.length} vs ${all.length} total`);
console.log(`READ_ONLY mode: ${ro.length} read tools, zero write tools — OK`);
process.exit(0);
