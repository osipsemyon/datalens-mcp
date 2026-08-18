// Regression test: dataset save/validate must send the `data: { dataset: … }` envelope.
// No network calls — a stub client records what the handlers would POST.
//
// Sent flat (`data: <content>`), updateDataset answers
// 400 GATEWAY_REQUEST_ERROR {'dataset': ['Missing data for required field.']}, and validateDataset
// — where `dataset` is optional — silently validates the STORED dataset and still reports OK.
import { HANDLER_OVERRIDES } from "../dist/custom.js";

const fail = (msg) => {
  console.error("FAIL: " + msg);
  process.exit(1);
};

const HEAD = { dataset: { revision_id: "rev-head", result_schema: [], sources: [] } };

/** Client stub: answers getDataset with HEAD, records every other call. */
function stubClient(calls) {
  return {
    async rpc(method, body) {
      if (method === "getDataset") return HEAD;
      calls.push({ method, body });
      return { code: "OK" };
    },
  };
}

for (const tool of ["update_dataset", "validate_dataset"]) {
  const calls = [];
  const edited = { revision_id: "stale", result_schema: [{ guid: "x" }] };
  await HANDLER_OVERRIDES[tool](stubClient(calls), {
    datasetId: "ds1",
    workbookId: "wb1",
    data: edited,
  });

  if (calls.length !== 1) fail(`${tool}: expected exactly one save/validate call, got ${calls.length}`);
  const { body } = calls[0];
  if (!body.data || typeof body.data !== "object") fail(`${tool}: no data in request body`);
  if (!body.data.dataset) fail(`${tool}: data.dataset missing — body was sent flat, the API will reject it`);
  if (body.data.result_schema) fail(`${tool}: dataset content leaked to the top level of data`);
  if (body.data.dataset.revision_id !== "rev-head")
    fail(`${tool}: head revision not injected (got ${body.data.dataset.revision_id})`);
  if (body.datasetId !== "ds1") fail(`${tool}: datasetId not forwarded`);
  console.log(`${tool}: data.dataset envelope + head revision — OK`);
}
process.exit(0);
