import type { AttentionEvaluationResult } from "./attention-evaluator.js";
import type { AttentionExplanation } from "./attention-reasons.js";
import type { AttentionPriority } from "./attention-priority.js";

export type AttentionListingInput = Readonly<{
  price?: number;
  propertyType?: string;
  address?: string;
  city?: string;
  state?: string;
  beds?: number;
  baths?: number;
  sqft?: number;
  lotSqft?: number;
  lotAcres?: number;
  imageUrl?: string;
  description?: string;
  amenities?: readonly string[];
  statusText?: string;
}>;
export type PublicAttentionEvaluation = Readonly<{
  listingIndex: number;
  result: AttentionEvaluationResult;
  explanation: AttentionExplanation;
  priority: AttentionPriority;
}>;
