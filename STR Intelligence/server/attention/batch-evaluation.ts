import type { PublicAttentionEvaluation } from "../../shared/attention-api.js";
import {
  createAttentionEvaluationInput,
  type AttentionEvidenceCode,
  type AttentionHistoryEvent,
} from "../../shared/attention-evaluator.js";
import { explainAttentionEvaluation } from "../../shared/attention-reasons.js";
import { evaluateAttention } from "../../shared/attention-scoring.js";
import { classifyAttentionPriority } from "../../shared/attention-priority.js";
import type { InvestmentCriteriaRepository } from "../criteria/repository.js";
import type { InvestmentCriteria } from "../../shared/investment-criteria.js";
import type { StoredHome, StoredHomeRepositoryPort } from "./stored-home-repository.js";

const ALL_EVIDENCE: readonly AttentionEvidenceCode[] = [
  "listing_price", "property_type", "location", "beds", "baths", "living_area", "lot_area",
  "description", "photos", "amenities", "view_signals", "listing_history", "price_history",
];
const VIEW_TERMS = ["mountain view", "forest view", "scenic view", "valley view", "yosemite view"] as const;

export type StoredHomeEvaluation = Readonly<{
  canonicalPropertyId: string;
  latestSnapshotId: string;
  evaluation: PublicAttentionEvaluation;
}>;

export type StoredHomeEvaluationFailure = Readonly<{
  canonicalPropertyId: string;
  latestSnapshotId: string;
  message: string;
}>;

export type StoredHomeBatchResult = Readonly<{
  criteria: InvestmentCriteria;
  totalHomes: number;
  evaluatedCount: number;
  unscorableCount: number;
  failedCount: number;
  evaluations: readonly StoredHomeEvaluation[];
  failures: readonly StoredHomeEvaluationFailure[];
}>;

export async function evaluateStoredHomesBatch(dependencies: {
  homes: StoredHomeRepositoryPort;
  criteria: Pick<InvestmentCriteriaRepository, "getDefaults">;
}): Promise<StoredHomeBatchResult> {
  const [homes, criteria] = await Promise.all([
    dependencies.homes.listStoredHomes(),
    dependencies.criteria.getDefaults(),
  ]);
  const evaluations: StoredHomeEvaluation[] = [];
  const failures: StoredHomeEvaluationFailure[] = [];

  // Per-property containment keeps one malformed historical record from discarding the rest of the batch.
  for (const [listingIndex, home] of homes.entries()) {
    try {
      const input = createAttentionEvaluationInput(toEvaluationInput(home, criteria));
      const result = evaluateAttention(input);
      evaluations.push(Object.freeze({
        canonicalPropertyId: home.canonicalPropertyId,
        latestSnapshotId: home.latest.snapshotId,
        evaluation: Object.freeze({
          listingIndex,
          result,
          explanation: explainAttentionEvaluation(input, result),
          priority: classifyAttentionPriority(result),
        }),
      }));
    } catch {
      failures.push(Object.freeze({
        canonicalPropertyId: home.canonicalPropertyId,
        latestSnapshotId: home.latest.snapshotId,
        message: "This stored home could not be evaluated.",
      }));
    }
  }

  return Object.freeze({
    criteria,
    totalHomes: homes.length,
    evaluatedCount: evaluations.filter((item) => item.evaluation.result.evaluability.status === "evaluable").length,
    unscorableCount: evaluations.filter((item) => item.evaluation.result.evaluability.status === "unscorable").length,
    failedCount: failures.length,
    evaluations: Object.freeze(evaluations),
    failures: Object.freeze(failures),
  });
}

function toEvaluationInput(home: StoredHome, criteria: Awaited<ReturnType<InvestmentCriteriaRepository["getDefaults"]>>) {
  const latest = home.latest;
  const description = latest.description?.trim();
  const viewSignals = description ? VIEW_TERMS.filter((term) => description.toLowerCase().includes(term)) : [];
  const history = buildHistory(home);
  const available: AttentionEvidenceCode[] = [];
  if (latest.price !== undefined) available.push("listing_price");
  if (latest.propertyType) available.push("property_type");
  if (latest.address || latest.city || latest.state) available.push("location");
  if (latest.beds !== undefined) available.push("beds");
  if (latest.baths !== undefined) available.push("baths");
  if (latest.livingAreaSqft !== undefined) available.push("living_area");
  if (latest.lotAreaSqft !== undefined) available.push("lot_area");
  if (description) available.push("description");
  if (latest.amenities.length > 0) available.push("amenities");
  if (viewSignals.length > 0) available.push("view_signals");
  if (history.length > 0) available.push("listing_history");
  if (history.some((event) => event.eventType === "price_change")) available.push("price_history");
  const missing = ALL_EVIDENCE.filter((code) => !available.includes(code));

  return {
    criteria,
    facts: {
      listingPriceUsd: latest.price,
      propertyKind: "existing_home" as const,
      propertyType: latest.propertyType,
      location: {
        address: latest.address,
        city: latest.city,
        county: latest.county,
        state: latest.state,
        postalCode: latest.postalCode,
      },
      beds: latest.beds,
      baths: latest.baths,
      livingAreaSqft: latest.livingAreaSqft,
      lotAreaSqft: latest.lotAreaSqft,
      description,
      photoUrls: [],
      hasPrimaryImage: false,
      amenities: latest.amenities,
      viewSignals,
      history,
    },
    evidence: {
      available,
      missing,
      completeness: missing.length <= 3 ? "complete" as const : missing.length <= 8 ? "partial" as const : "minimal" as const,
    },
  };
}

function buildHistory(home: StoredHome): AttentionHistoryEvent[] {
  return home.history.map((snapshot, index) => {
    const previous = home.history[index - 1];
    const priceChanged = previous?.price !== undefined && snapshot.price !== previous.price;
    const statusChanged = previous?.statusText !== undefined && snapshot.statusText !== previous.statusText;
    return Object.freeze({
      occurredAt: snapshot.observedAt,
      eventType: index === 0 ? "listed" as const : priceChanged ? "price_change" as const : statusChanged ? "status_change" as const : "other" as const,
      priceUsd: snapshot.price,
      description: snapshot.statusText,
    });
  });
}
