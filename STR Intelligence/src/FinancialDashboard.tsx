import { useEffect, useState, type ReactNode } from "react";
import type { SavedFinancialAnalysis } from "../shared/financial-analysis.js";
import { FinancialAnalysisWorkspace } from "./FinancialAnalysisWorkspace.js";
import { loadFinancialAnalyses } from "./financial-analysis-client.js";
import { formatFinancialCurrency, formatFinancialRatio } from "./financial-analysis-state.js";
import { ProductHeader, type ProductView } from "./ProductHeader.js";
import { StrPotentialWorkspace } from "./StrPotentialWorkspace.js";
import { StrComparatorWorkspace } from "./StrComparatorWorkspace.js";
import { loadSavedStrComparison, loadSavedStrComparisonLinks, type StrComparisonDto } from "./str-comparator-client.js";

export type FinancialDashboardSort = "cash-on-cash" | "cash-flow" | "recent";

export function FinancialDashboard({ onNavigate, loader = loadFinancialAnalyses }: Readonly<{
  onNavigate(view: ProductView): void;
  loader?: () => Promise<readonly SavedFinancialAnalysis[]>;
}>) {
  const [items, setItems] = useState<readonly SavedFinancialAnalysis[]>([]);
  const [sort, setSort] = useState<FinancialDashboardSort>("cash-on-cash");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selected, setSelected] = useState<SavedFinancialAnalysis | null>(null);
  const [potentialListingUrl, setPotentialListingUrl] = useState<string | null>(null);
  const [comparisonLinks, setComparisonLinks] = useState<Readonly<Record<string, string>>>({});
  const [savedComparison, setSavedComparison] = useState<StrComparisonDto | null>(null);
  const [comparisonLoadingUrl, setComparisonLoadingUrl] = useState<string | null>(null);
  const [comparisonErrorUrl, setComparisonErrorUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loader().then((result) => { if (active) { setItems(result); setStatus("ready"); void loadSavedStrComparisonLinks(result.map((item) => item.property.listingUrl)).then((links) => { if (active) setComparisonLinks(links); }).catch(() => undefined); } })
      .catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [loader]);

  if (potentialListingUrl) return <StrPotentialWorkspace listingUrl={potentialListingUrl} onBack={() => setPotentialListingUrl(null)} />;
  if (savedComparison) return <StrComparatorWorkspace listingUrl={savedComparison.target.listingUrl} propertyLabel={savedComparison.target.address} initialComparison={savedComparison} onBack={() => setSavedComparison(null)} />;

  async function openSavedComparison(listingUrl: string) {
    const reference = comparisonLinks[listingUrl];
    if (!reference || comparisonLoadingUrl) return;
    setComparisonLoadingUrl(listingUrl);
    setComparisonErrorUrl(null);
    try { setSavedComparison(await loadSavedStrComparison(reference)); }
    catch { setComparisonErrorUrl(listingUrl); }
    finally { setComparisonLoadingUrl(null); }
  }

  if (selected) return <FinancialAnalysisWorkspace
    listing={{
      title: selected.property.title,
      address: selected.property.address,
      location: selected.property.location,
      imageUrl: selected.property.imageUrl,
      priceUsd: selected.property.priceUsd,
      beds: selected.property.beds,
      baths: selected.property.baths,
      livingAreaSqft: selected.property.livingAreaSqft,
      sourceUrl: selected.property.listingUrl,
    }}
    initialAssumptions={selected.assumptions}
    onSaved={(saved) => {
      setSelected(saved);
      setItems((current) => Object.freeze([saved, ...current.filter((item) => item.property.listingUrl !== saved.property.listingUrl)]));
    }}
    onBack={() => setSelected(null)}
  />;

  const sorted = sortFinancialAnalyses(items, sort);
  return <main className="str-library financial-dashboard" aria-labelledby="financial-dashboard-title" aria-busy={status === "loading"}>
    <ProductHeader activeView="financials" onNavigate={onNavigate} />
    <header className="str-library__header">
      <p className="eyebrow">Saved underwriting</p>
      <div className="str-library__heading-row">
        <div><h1 id="financial-dashboard-title">Financial dashboard</h1><p>Compare the latest saved base case for every analyzed Home.</p></div>
        {status === "ready" && <strong>{items.length} {items.length === 1 ? "property" : "properties"}</strong>}
      </div>
    </header>

    <section className="str-library__toolbar" aria-label="Financial analysis sorting controls">
      <label htmlFor="financial-dashboard-sort">Sort by</label>
      <select id="financial-dashboard-sort" value={sort} onChange={(event) => setSort(event.target.value as FinancialDashboardSort)}>
        <option value="cash-on-cash">Highest cash-on-cash return</option>
        <option value="cash-flow">Highest monthly cash flow</option>
        <option value="recent">Recently saved</option>
      </select>
      <p>Each card shows the latest saved version for that property.</p>
    </section>

    {status === "loading" && <DashboardState><span className="loading-spinner" aria-hidden="true" /><strong>Loading saved analyses…</strong></DashboardState>}
    {status === "error" && <DashboardState error><strong>We could not load the financial dashboard.</strong><span>Try again after confirming the local API is running.</span></DashboardState>}
    {status === "ready" && sorted.length === 0 && <DashboardState><strong>No saved financial analyses yet.</strong><span>Open a Home's financial analysis and choose Save to dashboard.</span></DashboardState>}
    {status === "ready" && sorted.length > 0 && <section className="financial-dashboard__cards" aria-label="Saved property financial analyses">
      {sorted.map((analysis) => <FinancialDashboardCard key={analysis.property.listingUrl} analysis={analysis} onOpen={() => setSelected(analysis)} onEvaluate={() => setPotentialListingUrl(analysis.property.listingUrl)} onOpenComparison={comparisonLinks[analysis.property.listingUrl] ? () => void openSavedComparison(analysis.property.listingUrl) : undefined} comparisonLoading={comparisonLoadingUrl === analysis.property.listingUrl} comparisonError={comparisonErrorUrl === analysis.property.listingUrl} />)}
    </section>}
  </main>;
}

export function sortFinancialAnalyses(items: readonly SavedFinancialAnalysis[], sort: FinancialDashboardSort) {
  return [...items].sort((left, right) => {
    if (sort === "cash-flow") return right.result.returns.monthlyPreTaxCashFlowUsd - left.result.returns.monthlyPreTaxCashFlowUsd;
    if (sort === "recent") return right.savedAt.localeCompare(left.savedAt);
    return finite(right.result.returns.cashOnCashReturnRatio, -Infinity) - finite(left.result.returns.cashOnCashReturnRatio, -Infinity)
      || right.result.returns.monthlyPreTaxCashFlowUsd - left.result.returns.monthlyPreTaxCashFlowUsd;
  });
}

export function FinancialDashboardCard({ analysis, onOpen, onEvaluate, onOpenComparison, comparisonLoading = false, comparisonError = false }: Readonly<{
  analysis: SavedFinancialAnalysis;
  onOpen(): void;
  onEvaluate?(): void;
  onOpenComparison?(): void;
  comparisonLoading?: boolean;
  comparisonError?: boolean;
}>) {
  const { property, result, assumptions } = analysis;
  return <article className="financial-dashboard-card">
    {property.imageUrl
      ? <img src={property.imageUrl} alt={`Property at ${property.address ?? property.title}`} loading="lazy" />
      : <div className="financial-dashboard-card__fallback" role="img" aria-label="Property image unavailable">⌂</div>}
    <div className="financial-dashboard-card__identity">
      <p className="financial-kicker">Saved {formatSavedDate(analysis.savedAt)}</p>
      <h2><a href={property.listingUrl} target="_blank" rel="noreferrer">{property.title}</a></h2>
      <p>{[property.address, property.location].filter(Boolean).join(" · ")}</p>
      <p className="financial-dashboard-card__facts">{[
        property.beds !== undefined ? `${property.beds} beds` : null,
        property.baths !== undefined ? `${property.baths} baths` : null,
        property.livingAreaSqft !== undefined ? `${property.livingAreaSqft.toLocaleString("en-US")} sq ft` : null,
      ].filter(Boolean).join(" · ")}</p>
      <div className="financial-dashboard-card__actions">
        <button type="button" onClick={onOpen}>View financial analysis</button>
        {onOpenComparison && <button type="button" className="financial-dashboard-card__comparison" onClick={onOpenComparison} disabled={comparisonLoading}>{comparisonLoading ? "Opening nearby STRs…" : "View nearby STRs"}</button>}
        {onEvaluate && <button type="button" className="financial-dashboard-card__evaluate" onClick={onEvaluate}>Evaluate STR potential</button>}
      </div>
      {comparisonError && <p className="financial-dashboard-card__comparison-error" role="alert">Saved comparison could not be opened. Please try again.</p>}
    </div>
    <div className="financial-dashboard-card__lead">
      <span>Cash-on-cash return</span>
      <strong>{formatFinancialRatio(result.returns.cashOnCashReturnRatio)}</strong>
      <small>{formatFinancialCurrency(result.returns.monthlyPreTaxCashFlowUsd)} monthly cash flow</small>
    </div>
    <dl className="financial-dashboard-card__metrics">
      <div><dt>Purchase price</dt><dd>{formatFinancialCurrency(result.acquisition.purchasePriceUsd)}</dd></div>
      <div><dt>Total cash required</dt><dd>{formatFinancialCurrency(result.acquisition.totalCashInvestedUsd)}</dd></div>
      <div><dt>Net operating income</dt><dd>{formatFinancialCurrency(result.returns.netOperatingIncomeUsd)}</dd></div>
      <div><dt>ADR / occupancy</dt><dd>{formatFinancialCurrency(assumptions.expectedAdrUsd)} · {formatFinancialRatio(assumptions.expectedOccupancyPercent / 100)}</dd></div>
    </dl>
  </article>;
}

function DashboardState({ children, error = false }: Readonly<{ children: ReactNode; error?: boolean }>) {
  return <div className={`str-library__state${error ? " str-library__state--error" : ""}`} role={error ? "alert" : "status"}>{children}</div>;
}
function finite(value: number | null, fallback: number) { return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
function formatSavedDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
