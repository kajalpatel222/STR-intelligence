import { useEffect, useState } from "react";
import { AIRBTICS_SUMMARY_COST_USD, type StrRevenueEstimate } from "../shared/str-revenue-estimate.js";
import { checkStrRevenueEstimate, lookupStrRevenueEstimate, purchaseStrRevenueEstimate } from "./str-revenue-estimate-client.js";

export function StrRevenueEstimatePanel({ listingUrl, onUseEstimate, lookup = lookupStrRevenueEstimate, purchase = purchaseStrRevenueEstimate, check = checkStrRevenueEstimate }: Readonly<{
  listingUrl: string;
  onUseEstimate(estimate: StrRevenueEstimate): void;
  lookup?: typeof lookupStrRevenueEstimate;
  purchase?: typeof purchaseStrRevenueEstimate;
  check?: typeof checkStrRevenueEstimate;
}>) {
  const [status, setStatus] = useState<"loading" | "empty" | "ready" | "confirm" | "purchasing" | "error">("loading");
  const [estimate, setEstimate] = useState<StrRevenueEstimate>();
  useEffect(() => { let active = true; void lookup(listingUrl).then((result) => { if (!active) return; if (result.status === "available") { setEstimate(result.estimate); setStatus("ready"); } else setStatus(result.status === "preparing" ? "purchasing" : result.status === "failed" ? "error" : "empty"); }).catch(() => { if (active) setStatus("error"); }); return () => { active = false; }; }, [listingUrl, lookup]);
  useEffect(() => { if (status !== "purchasing") return; let active = true; const startedAt = Date.now(); const poll = async () => { try { const result = await check(listingUrl); if (!active) return; if (result.status === "available" && result.estimate) { setEstimate(result.estimate); setStatus("ready"); return; } if (result.status === "failed" || Date.now() - startedAt > 10 * 60_000) { setStatus("error"); return; } setTimeout(poll, 3_000); } catch { if (active) setStatus("error"); } }; const timer = setTimeout(poll, 1_000); return () => { active = false; clearTimeout(timer); }; }, [status, listingUrl, check]);
  async function runEstimate() { setStatus("purchasing"); try { const result = await purchase(listingUrl); if (result.status === "available" && result.estimate) { setEstimate(result.estimate); setStatus("ready"); } else if (result.status !== "preparing") setStatus("error"); } catch { setStatus("error"); } }
  return <section className="str-estimate" aria-labelledby="str-estimate-title" aria-busy={status === "loading" || status === "purchasing"}>
    <div><p className="financial-kicker">Optional market evidence</p><h2 id="str-estimate-title">STR revenue estimate</h2></div>
    {status === "loading" && <p role="status">Checking for a saved estimate…</p>}
    {status === "empty" && <div className="str-estimate__offer"><p>Estimate ADR, occupancy, and annual revenue for this Home.</p><button type="button" onClick={() => setStatus("confirm")}>Estimate STR revenue · ${AIRBTICS_SUMMARY_COST_USD.toFixed(2)}</button></div>}
    {status === "confirm" && <div className="str-estimate__confirm" role="group" aria-label="Confirm paid STR estimate"><p><strong>Run a new STR estimate?</strong><span>This creates one Airbtics summary report. The saved result can be reopened without another charge.</span></p><div><button type="button" onClick={() => setStatus("empty")}>Cancel</button><button type="button" className="is-primary" onClick={() => void runEstimate()}>Run estimate · ${AIRBTICS_SUMMARY_COST_USD.toFixed(2)}</button></div></div>}
    {status === "purchasing" && <p role="status">Preparing the estimate. You can keep this page open while the report completes…</p>}
    {status === "error" && <div className="str-estimate__error" role="alert"><p>The STR estimate could not be loaded right now.</p><button type="button" onClick={() => setStatus("empty")}>Try again</button></div>}
    {status === "ready" && estimate && <div className="str-estimate__result"><dl><div><dt>Estimated ADR</dt><dd>{currency(estimate.estimatedAdrUsd)}</dd></div><div><dt>Estimated occupancy</dt><dd>{estimate.estimatedOccupancyPercent.toFixed(1)}%</dd></div><div><dt>Annual gross revenue</dt><dd>{currency(estimate.estimatedAnnualRevenueUsd)}</dd></div></dl><div className="str-estimate__actions"><small>Saved estimate · {new Date(estimate.collectedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</small><button type="button" onClick={() => onUseEstimate(estimate)}>Use in assumptions</button>{estimate.freshness === "stale" && <button type="button" onClick={() => setStatus("confirm")}>Refresh · ${AIRBTICS_SUMMARY_COST_USD.toFixed(2)}</button>}</div></div>}
  </section>;
}
function currency(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value); }
