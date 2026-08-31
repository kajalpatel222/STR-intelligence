import type { FinancialAssumptions } from "./financial-assumptions.js";
import type { FinancialCalculationResult } from "./financial-calculator.js";

export type FinancialPropertySnapshot = Readonly<{
  listingUrl: string;
  title: string;
  address?: string;
  location?: string;
  imageUrl?: string;
  priceUsd?: number;
  beds?: number;
  baths?: number;
  livingAreaSqft?: number;
}>;

export type SavedFinancialAnalysis = Readonly<{
  property: FinancialPropertySnapshot;
  assumptions: FinancialAssumptions;
  result: FinancialCalculationResult;
  savedAt: string;
}>;

export type SaveFinancialAnalysisRequest = Readonly<{
  property: FinancialPropertySnapshot;
  assumptions: FinancialAssumptions;
}>;
