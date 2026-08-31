import type { SavedStrPotentialEvaluation } from "../../shared/str-potential.js";
import { initializeStrPotentialWorkflowState, type StrPotentialWorkflowState } from "../workflow/str-potential-graph.js";

type Graph = Readonly<{ invoke(input: { workflowState: StrPotentialWorkflowState }): Promise<{ workflowState: StrPotentialWorkflowState }> }>;

export function createStrPotentialHandler(graph: Graph) {
  const inFlight = new Map<string, Promise<ReturnType<typeof response>>>();
  return async (input: unknown) => {
    const body = record(input);
    if (!isZillowUrl(body.listingUrl) || (body.refresh !== undefined && typeof body.refresh !== "boolean")) {
      return response(400, { status: "invalid", message: "Choose a valid saved Home to evaluate." });
    }
    const key = `${body.listingUrl}:${body.refresh === true ? "refresh" : "standard"}`;
    const existing = inFlight.get(key);
    if (existing) return existing;
    const operation = (async () => {
      const result = await graph.invoke({ workflowState: initializeStrPotentialWorkflowState({ workflowId: crypto.randomUUID(), listingUrl: body.listingUrl as string, forceRefresh: body.refresh === true }) });
      if (!result.workflowState.saved) {
        return response(result.workflowState.failureCode === "unsupported_property" ? 404 : 503, {
          status: "unavailable",
          message: result.workflowState.failureCode === "unsupported_property"
            ? "This saved Home is not available for STR evaluation."
            : "STR potential could not be evaluated right now. Please try again.",
        });
      }
      return response(200, toPublicStrPotential(result.workflowState.saved));
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, operation);
    return operation;
  };
}

export function toPublicStrPotential(saved: SavedStrPotentialEvaluation) {
  const { evaluation, property } = saved;
  return {
    status: evaluation.status,
    property: {
      listingUrl: property.listingUrl, title: property.title, address: property.address, location: property.location,
      propertyType: property.propertyType, priceUsd: property.priceUsd, beds: property.beds, baths: property.baths,
      livingAreaSqft: property.livingAreaSqft, lotSqft: property.lotSqft, lotAcres: property.lotAcres,
    },
    evaluation: {
      potential: evaluation.potential, summary: evaluation.summary, confidence: evaluation.confidence,
      confidenceExplanation: evaluation.confidenceExplanation, strengths: evaluation.strengths, risks: evaluation.risks,
      missingEvidence: evaluation.missingEvidence, recommendations: evaluation.recommendations, budget: evaluation.budget,
      evaluatedAt: evaluation.evaluatedAt,
    },
    savedAt: saved.savedAt,
  };
}

function response(statusCode: number, body: Record<string, unknown>) { return { statusCode, body } as const; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function isZillowUrl(value: unknown): value is string { try { const url = new URL(String(value)); return url.protocol === "https:" && (url.hostname === "zillow.com" || url.hostname.endsWith(".zillow.com")); } catch { return false; } }
