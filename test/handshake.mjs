// Minimal MCP stdio smoke test: initialize -> tools/list. No network calls.
import { spawn } from "node:child_process";

const child = spawn("node", ["dist/index.js"], {
  cwd: new URL("..", import.meta.url).pathname,
  env: { ...process.env, DATALENS_IAM_TOKEN: "dummy", DATALENS_ORG_ID: "dummy" },
  stdio: ["pipe", "pipe", "inherit"],
});

const send = (msg) => child.stdin.write(JSON.stringify(msg) + "\n");
let buf = "";
const seen = new Set();

child.stdout.on("data", (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id === 1) {
      seen.add("init");
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    } else if (msg.id === 2) {
      const tools = msg.result.tools;
      console.log(`tools/list returned ${tools.length} tools:`);
      console.log(tools.map((t) => "  - " + t.name).join("\n"));
      child.kill();
      process.exit(0);
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

setTimeout(() => {
  console.error("timeout");
  child.kill();
  process.exit(1);
}, 5000);
