import { createServer } from "node:http";
import { createPropertySearchHandler } from "./property-search.js";
import { createListingRoutingGraph } from "../workflow/graph.js";
import type { IngestionTimings } from "../ingest/types.js";

const liveDependencies = {
  // These boundaries are emitted server-side for verification and never enter
  // the browser response DTO.
  onTiming: (timings: IngestionTimings) => console.log(`Live ingestion timing ${JSON.stringify(timings)}`),
};
const liveGraph = createListingRoutingGraph(liveDependencies, liveDependencies);
const handlePropertySearch = createPropertySearchHandler(liveGraph);
const port = 8787;

// Secrets are read only by server-side graph dependencies; this HTTP boundary
// returns a deliberately narrow DTO and never serializes workflow state.
const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/api/property-search") {
    sendJson(response, 404, { status: "not_found", message: "Not found." });
    return;
  }

  try {
    const endpointStartedAt = performance.now();
    const input = await readJson(request);
    const result = await handlePropertySearch(input);
    console.log(`Live endpoint timing ${JSON.stringify({ totalMs: performance.now() - endpointStartedAt })}`);
    sendJson(response, result.statusCode, result.body);
  } catch (error) {
    const isBadRequest = error instanceof SyntaxError;
    sendJson(response, isBadRequest ? 400 : 500, {
      status: isBadRequest ? "invalid" : "unavailable",
      message: isBadRequest ? "The search request was not valid." : "Property search is temporarily unavailable. Please try again later.",
    });
  }
});

server.requestTimeout = 330_000;
server.listen(port, "127.0.0.1", () => console.log(`STR Intelligence API listening on http://127.0.0.1:${port}`));

async function readJson(request: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw new SyntaxError("Request too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function sendJson(response: import("node:http").ServerResponse, statusCode: number, body: unknown) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}
