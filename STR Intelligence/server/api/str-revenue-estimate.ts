import { AIRBTICS_SUMMARY_COST_USD } from "../../shared/str-revenue-estimate.js";
import type { RevenueEstimateRepository } from "../revenue-estimate/repository.js";
import type { StrRevenueEstimateProvider } from "../sources/airbtics/provider.js";

export function createStrRevenueEstimateHandler(repository: RevenueEstimateRepository, provider: StrRevenueEstimateProvider) {
  return async (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return invalid("Choose a Home before requesting an estimate.");
    const body = value as Record<string, unknown>;
    if (!isZillowUrl(body.listingUrl)) return invalid("A valid Zillow Home URL is required.");
    if (body.action !== "lookup" && body.action !== "purchase" && body.action !== "status") return invalid("Choose whether to view saved data or request a new estimate.");
    const target = await repository.resolve(body.listingUrl);
    if (!target) return invalid("This Home does not have enough saved property information for an STR estimate.");
    const saved = await repository.latest(target.canonicalPropertyId);
    if (saved?.freshness === "fresh") return ok({ status: "available", estimate: saved });
    const job = await repository.latestJob(target.canonicalPropertyId);
    if (body.action === "lookup") return ok(job?.status === "pending" ? { status: "preparing" } : saved ? { status: "available", estimate: saved } : { status: "not_requested" });
    if (body.action === "status") {
      if (!job || job.status === "failed") return ok({ status: "failed", message: "The estimate could not be completed. Try again later." });
      if (job.status === "completed") return ok(saved ? { status: "available", estimate: saved } : { status: "failed", message: "The saved estimate was incomplete." });
      const report = await provider.readSummary(job.providerReference);
      if (report.status === "pending") return ok({ status: "preparing" });
      if (report.status === "failed") { await repository.failJob(job.id, report.reason); return ok({ status: "failed", message: "The estimate could not be completed. Try again later." }); }
      const estimate = await repository.save(target, { estimate: report.estimate, providerReference: job.providerReference, rawPayload: report.rawPayload });
      await repository.completeJob(job.id);
      return ok({ status: "available", estimate });
    }
    if (job?.status === "pending") return ok({ status: "preparing" });
    if (body.confirmedCostUsd !== AIRBTICS_SUMMARY_COST_USD) return invalid("Confirm the $0.10 provider charge before requesting a new estimate.");
    const providerReference = await provider.startSummary(target.input);
    await repository.startJob(target, providerReference);
    return ok({ status: "preparing" });
  };
}
function isZillowUrl(value: unknown): value is string { if (typeof value !== "string") return false; try { const url = new URL(value); return url.protocol === "https:" && /(^|\.)zillow\.com$/i.test(url.hostname); } catch { return false; } }
function invalid(message: string) { return { statusCode: 400, body: { status: "invalid", message } } as const; }
function ok(body: Record<string, unknown>) { return { statusCode: 200, body } as const; }
