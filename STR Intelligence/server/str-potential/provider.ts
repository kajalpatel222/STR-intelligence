import type { StrPotentialEvidence, StrPotentialFinding, StrImprovementRecommendation, StrPotentialLevel } from "../../shared/str-potential.js";

export type StrPotentialModelOutput = Readonly<{
  potential: Exclude<StrPotentialLevel, "insufficient_evidence">;
  summary: string;
  confidence: "high" | "moderate" | "low";
  confidenceExplanation: string;
  strengths: readonly StrPotentialFinding[];
  risks: readonly StrPotentialFinding[];
  missingEvidence: readonly string[];
  recommendations: readonly StrImprovementRecommendation[];
}>;

export interface StrPotentialProvider {
  readonly identity: Readonly<{ provider: string; model: string; promptVersion: string }>;
  evaluate(evidence: StrPotentialEvidence): Promise<StrPotentialModelOutput>;
}
