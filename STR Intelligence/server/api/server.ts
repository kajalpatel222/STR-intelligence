import { createServer } from "node:http";
import { createPropertySearchHandler } from "./property-search.js";
import { createListingRoutingGraph } from "../workflow/graph.js";
import type { IngestionTimings } from "../ingest/types.js";
import { CriteriaDefaultsRepository } from "../criteria/repository.js";
import { createInvestmentCriteriaHandler } from "./investment-criteria.js";
import { handleAttentionEvaluation } from "./attention-evaluation.js";
import { createListingReviewsHandler } from "./listing-reviews.js";
import { ListingReviewRepository } from "../reviews/repository.js";

const liveDependencies = {
  // These boundaries are emitted server-side for verification and never enter
  // the browser response DTO.
  onTiming: (timings: IngestionTimings) => console.log(`Live ingestion timing ${JSON.stringify(timings)}`),
};
const liveGraph = createListingRoutingGraph(liveDependencies, liveDependencies);
const criteriaRepository = new CriteriaDefaultsRepository();
const handlePropertySearch = createPropertySearchHandler(liveGraph, criteriaRepository);
const handleInvestmentCriteria = createInvestmentCriteriaHandler(criteriaRepository);
const handleListingReviews = createListingReviewsHandler(new ListingReviewRepository());
const port = 8787;

// Secrets are read only by server-side graph dependencies; this HTTP boundary
// returns a deliberately narrow DTO and never serializes workflow state.
const server = createServer(async (request, response) => {
  const isPropertySearch = request.method === "POST" && request.url === "/api/property-search";
  const isCriteriaGet = request.method === "GET" && request.url === "/api/investment-criteria";
  const isCriteriaPut = request.method === "PUT" && request.url === "/api/investment-criteria";
  const isAttentionEvaluation = request.method === "POST" && request.url === "/api/attention-evaluation";
  const isReviewsQuery = request.method === "POST" && request.url === "/api/listing-reviews/query";
  const isReviewPut = request.method === "PUT" && request.url === "/api/listing-reviews";
  if (!isPropertySearch && !isCriteriaGet && !isCriteriaPut && !isAttentionEvaluation && !isReviewsQuery && !isReviewPut) {
    sendJson(response, 404, { status: "not_found", message: "Not found." });
    return;
  }

  try {
    const endpointStartedAt = performance.now();
    const result = isCriteriaGet
      ? await handleInvestmentCriteria.get()
      : isCriteriaPut
        ? await handleInvestmentCriteria.put(await readJson(request))
        : isAttentionEvaluation
          ? await handleAttentionEvaluation(await readJson(request))
          : isReviewsQuery
            ? await handleListingReviews.get(await readJson(request))
            : isReviewPut
              ? await handleListingReviews.put(await readJson(request))
              : await handlePropertySearch(await readJson(request));
    if (isPropertySearch) console.log(`Live endpoint timing ${JSON.stringify({ totalMs: performance.now() - endpointStartedAt })}`);
    sendJson(response, result.statusCode, result.body);
  } catch (error) {
    const isBadRequest = error instanceof SyntaxError;
    console.error(`API request failed for ${request.url ?? "unknown endpoint"}: ${error instanceof Error ? error.message : "Unknown error"}`);
    sendJson(response, isBadRequest ? 400 : 500, {
      status: isBadRequest ? "invalid" : "unavailable",
      message: isBadRequest
        ? "The request was not valid."
        : isPropertySearch
          ? "Property search is temporarily unavailable. Please try again later."
          : "Investment criteria are temporarily unavailable. Please try again later.",
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
    if (size > 131_072) throw new SyntaxError("Request too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function sendJson(response: import("node:http").ServerResponse, statusCode: number, body: unknown) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}
