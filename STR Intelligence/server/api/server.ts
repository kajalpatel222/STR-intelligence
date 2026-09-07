import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { createPropertySearchHandler } from "./property-search.js";
import { createListingRoutingGraph } from "../workflow/graph.js";
import type { IngestionTimings } from "../ingest/types.js";
import { CriteriaDefaultsRepository } from "../criteria/repository.js";
import { createInvestmentCriteriaHandler } from "./investment-criteria.js";
import { handleAttentionEvaluation } from "./attention-evaluation.js";
import { getServerEnvironment } from "../config/env.js";
import { AirbticsDatabaseComparatorProvider } from "../sources/str-comparator/airbtics-database-provider.js";
import { StrComparisonRepository } from "../str-comparator/repository.js";
import { createStrComparatorGraph } from "../workflow/str-comparator-graph.js";
import { createStrComparisonLinksHandler, createStrComparisonsHandler } from "./str-comparisons.js";
import { FinancialAnalysisRepository } from "../financial/repository.js";
import { createFinancialAnalysesHandler } from "./financial-analyses.js";
import { OpenRouterStrPotentialProvider } from "../str-potential/openrouter-provider.js";
import { StrPotentialRepository } from "../str-potential/repository.js";
import { createStrPotentialGraph } from "../workflow/str-potential-graph.js";
import { createStrPotentialHandler } from "./str-potential.js";
import { AirbticsProvider } from "../sources/airbtics/provider.js";
import { RevenueEstimateRepository } from "../revenue-estimate/repository.js";
import { createStrRevenueEstimateHandler } from "./str-revenue-estimate.js";
import { MarketListingRepository } from "../market-listings/repository.js";
import { createMarketListingsHandler } from "./market-listings.js";

const liveDependencies = {
  // These boundaries are emitted server-side for verification and never enter
  // the browser response DTO.
  onTiming: (timings: IngestionTimings) => console.log(`Live ingestion timing ${JSON.stringify(timings)}`),
};
const liveGraph = createListingRoutingGraph(liveDependencies, liveDependencies);
const criteriaRepository = new CriteriaDefaultsRepository();
const handlePropertySearch = createPropertySearchHandler(liveGraph, criteriaRepository);
const handleInvestmentCriteria = createInvestmentCriteriaHandler(criteriaRepository);
const environment = getServerEnvironment();
const comparisonRepository = new StrComparisonRepository();
const comparisonProvider = new AirbticsDatabaseComparatorProvider();
const handleStrComparisons = createStrComparisonsHandler(createStrComparatorGraph({ provider: comparisonProvider, repository: comparisonRepository }), comparisonRepository);
const handleStrComparisonLinks = createStrComparisonLinksHandler(comparisonRepository);
const handleFinancialAnalyses = createFinancialAnalysesHandler(new FinancialAnalysisRepository());
const strPotentialRepository = new StrPotentialRepository();
const strPotentialProvider = environment.openRouterApiKey && environment.openRouterModel
  ? new OpenRouterStrPotentialProvider({ apiKey: environment.openRouterApiKey, baseUrl: environment.openRouterBaseUrl, model: environment.openRouterModel })
  : { identity: { provider: "openrouter", model: "unconfigured", promptVersion: "str-potential-v1" }, async evaluate() { throw new Error("STR potential provider is not configured."); } };
const handleStrPotential = createStrPotentialHandler(createStrPotentialGraph({ repository: strPotentialRepository, provider: strPotentialProvider }));
const revenueEstimateRepository = new RevenueEstimateRepository();
const revenueEstimateProvider = environment.airbticsApiKey
  ? new AirbticsProvider({ apiKey: environment.airbticsApiKey })
  : { async startSummary() { throw new Error("Airbtics is not configured."); }, async readSummary() { throw new Error("Airbtics is not configured."); } };
const handleStrRevenueEstimate = createStrRevenueEstimateHandler(revenueEstimateRepository, revenueEstimateProvider);
const handleMarketListings = createMarketListingsHandler(new MarketListingRepository());
const port = 8787;

// Secrets are read only by server-side graph dependencies; this HTTP boundary
// returns a deliberately narrow DTO and never serializes workflow state.
export async function handleApiRequest(request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  const isPropertySearch = request.method === "POST" && pathname === "/api/property-search";
  const isCriteriaGet = request.method === "GET" && pathname === "/api/investment-criteria";
  const isCriteriaPut = request.method === "PUT" && pathname === "/api/investment-criteria";
  const isAttentionEvaluation = request.method === "POST" && pathname === "/api/attention-evaluation";
  const comparisonMatch = pathname.match(/^\/api\/str-comparisons\/([0-9a-f-]+)(?:\/(selections|evidence|refresh))?$/i);
  const isComparisonCreate = request.method === "POST" && pathname === "/api/str-comparisons";
  const isComparisonLinks = request.method === "POST" && pathname === "/api/str-comparison-links";
  const isSavedComparisonGet = request.method === "POST" && pathname === "/api/saved-str-comparison";
  const isCalendarRefresh = request.method === "POST" && pathname === "/api/refresh-str-calendar";
  const isFinancialAnalysesGet = request.method === "GET" && pathname === "/api/financial-analyses";
  const isFinancialAnalysesPost = request.method === "POST" && pathname === "/api/financial-analyses";
  const isStrPotential = request.method === "POST" && pathname === "/api/str-potential";
  const isStrRevenueEstimate = request.method === "POST" && pathname === "/api/str-revenue-estimate";
  const isMarketListingsGet = request.method === "GET" && pathname === "/api/market-listings";
  const isComparisonGet = request.method === "GET" && Boolean(comparisonMatch) && !comparisonMatch?.[2];
  const isComparisonSelect = request.method === "PUT" && comparisonMatch?.[2] === "selections";
  const isComparisonEvidence = request.method === "POST" && comparisonMatch?.[2] === "evidence";
  const isComparisonRefresh = request.method === "POST" && comparisonMatch?.[2] === "refresh";
  if (!isPropertySearch && !isCriteriaGet && !isCriteriaPut && !isAttentionEvaluation && !isComparisonCreate && !isComparisonLinks && !isSavedComparisonGet && !isCalendarRefresh && !isFinancialAnalysesGet && !isFinancialAnalysesPost && !isStrPotential && !isStrRevenueEstimate && !isMarketListingsGet && !isComparisonGet && !isComparisonSelect && !isComparisonEvidence && !isComparisonRefresh) {
    sendJson(response, 404, { status: "not_found", message: "Not found." });
    return;
  }

  try {
    const endpointStartedAt = performance.now();
    const result = isMarketListingsGet
      ? await handleMarketListings()
      : isStrRevenueEstimate
      ? await handleStrRevenueEstimate(await readJson(request))
      : isStrPotential
      ? await handleStrPotential(await readJson(request))
      : isFinancialAnalysesGet
        ? await handleFinancialAnalyses.get()
        : isFinancialAnalysesPost
          ? await handleFinancialAnalyses.post(await readJson(request))
      : isComparisonLinks
      ? await handleStrComparisonLinks(await readJson(request))
      : isSavedComparisonGet
      ? await handleStrComparisons.get(String((await readJson(request)).reference ?? ""))
      : isCalendarRefresh
      ? await handleStrComparisons.refreshCalendar(await readJson(request))
      : isComparisonCreate
      ? await handleStrComparisons.create(await readJson(request))
      : isComparisonGet
        ? await handleStrComparisons.get(comparisonMatch![1]!)
        : isComparisonSelect
          ? await handleStrComparisons.select(comparisonMatch![1]!, await readJson(request))
          : isComparisonEvidence
            ? await handleStrComparisons.enrich(comparisonMatch![1]!, await readJson(request))
            : isComparisonRefresh
              ? await handleStrComparisons.create({ ...(await readJson(request)), listingUrl: (await comparisonRepository.loadComparison(comparisonMatch![1]!))?.target.listingUrl }, true)
    : isCriteriaGet
      ? await handleInvestmentCriteria.get()
      : isCriteriaPut
        ? await handleInvestmentCriteria.put(await readJson(request))
        : isAttentionEvaluation
          ? await handleAttentionEvaluation(await readJson(request))
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
          : isComparisonCreate || isComparisonGet || isComparisonSelect || isComparisonEvidence || isComparisonRefresh
            ? "STR comparison data is temporarily unavailable. Please try again later."
          : isFinancialAnalysesGet || isFinancialAnalysesPost
            ? "Financial analyses are temporarily unavailable. Please try again later."
          : isStrRevenueEstimate
            ? "The STR revenue estimate is temporarily unavailable. Please try again."
          : isMarketListingsGet
            ? "Market listings are temporarily unavailable. Please try again later."
          : isStrPotential
            ? "STR potential could not be evaluated right now. Please try again."
          : "Investment criteria are temporarily unavailable. Please try again later.",
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createServer(handleApiRequest);
  server.requestTimeout = 295_000;
  server.listen(port, "127.0.0.1", () => console.log(`STR Intelligence API listening on http://127.0.0.1:${port}`));
}

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
