import { useEffect, useRef, useState, type RefObject } from "react";
import { requestStrPotential, type PublicStrPotentialEvaluation } from "./str-potential-client";

type Props = Readonly<{
  listingUrl: string;
  onBack: () => void;
  requester?: (listingUrl: string, options?: { refresh?: boolean }) => Promise<PublicStrPotentialEvaluation>;
  initialEvaluation?: PublicStrPotentialEvaluation;
}>;

export function StrPotentialWorkspace({ listingUrl, onBack, requester = requestStrPotential, initialEvaluation }: Props) {
  const [result, setResult] = useState(initialEvaluation);
  const [state, setState] = useState<"loading" | "ready" | "error">(initialEvaluation ? "ready" : "loading");
  const [refreshing, setRefreshing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (initialEvaluation) return;
    let active = true;
    requester(listingUrl).then((value) => { if (active) { setResult(value); setState("ready"); } }).catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, [attempt, initialEvaluation, listingUrl, requester]);

  useEffect(() => { if (state === "ready") heading.current?.focus(); }, [state]);

  async function refresh() {
    setRefreshing(true);
    try { setResult(await requester(listingUrl, { refresh: true })); setState("ready"); }
    catch { setState("error"); }
    finally { setRefreshing(false); }
  }

  return <main className="str-potential-workspace">
    <button className="str-potential-back" type="button" onClick={onBack}>← Back to Financial Dashboard</button>
    {state === "loading" && <section className="str-potential-state" role="status" aria-busy="true"><h1>Evaluating STR potential</h1><p>Reviewing the property’s spaces, amenities, and guest appeal. This may take a moment.</p></section>}
    {state === "error" && <section className="str-potential-state" role="alert"><h1>Evaluation unavailable</h1><p>We couldn’t evaluate this property right now. Please try again.</p><button type="button" onClick={() => { setState("loading"); setResult(undefined); setAttempt((value) => value + 1); }}>Try again</button></section>}
    {state === "ready" && result && <StrPotentialResultView result={result} headingRef={heading} refreshing={refreshing} onRefresh={() => void refresh()} />}
  </main>;
}

export function StrPotentialResultView({ result, headingRef, refreshing = false, onRefresh }: Readonly<{ result: PublicStrPotentialEvaluation; headingRef?: RefObject<HTMLHeadingElement>; refreshing?: boolean; onRefresh?: () => void }>) {
  const { property, evaluation } = result;
  const insufficient = result.status === "insufficient_evidence" || evaluation.potential === "insufficient_evidence";
  return <>
    <header className="str-potential-header">
      <div><p className="str-potential-kicker">STR potential evaluation</p><h1 ref={headingRef} tabIndex={-1}>{property.title}</h1><p>{[property.address, property.location].filter(Boolean).join(" · ")}</p><p className="str-potential-property-facts">{propertyFacts(property)}</p></div>
      <div className="str-potential-header__actions"><a href={property.listingUrl} target="_blank" rel="noreferrer">View Zillow listing</a>{onRefresh && <button type="button" disabled={refreshing} aria-busy={refreshing} onClick={onRefresh}>{refreshing ? "Refreshing…" : "Refresh evaluation"}</button>}</div>
    </header>

    <section className={`str-potential-summary str-potential-summary--${evaluation.potential}`} aria-labelledby="str-potential-summary-title">
      <div><p className="str-potential-kicker">Overall potential</p><h2 id="str-potential-summary-title">{potentialLabel(evaluation.potential)}</h2><p>{evaluation.summary}</p></div>
      <dl><div><dt>Evidence confidence</dt><dd>{capitalize(evaluation.confidence)}</dd></div><div><dt>Estimated improvements</dt><dd>{currencyRange(evaluation.budget.estimatedCostLowUsd, evaluation.budget.estimatedCostHighUsd)}</dd></div></dl>
      <p className="str-potential-confidence">{evaluation.confidenceExplanation}</p>
    </section>

    {insufficient ? <section className="str-potential-insufficient" aria-labelledby="str-insufficient-title"><h2 id="str-insufficient-title">More evidence would improve this evaluation</h2><p>The available listing information is too limited for a confident assessment. The observations below only reflect what could be verified.</p></section> : null}

    <div className="str-potential-grid">
      <div>
        <Findings title="Existing strengths" empty="No clear strengths could be verified." findings={evaluation.strengths} />
        <Findings title="Risks and limitations" empty="No material risks were identified from the available evidence." findings={evaluation.risks} />
        {evaluation.missingEvidence.length > 0 && <section className="str-potential-section"><h2>Missing evidence</h2><ul className="str-potential-missing">{evaluation.missingEvidence.map((item) => <li key={item}>{item}</li>)}</ul></section>}
      </div>
      <div>
        <section className="str-potential-section" aria-labelledby="str-improvements-title"><h2 id="str-improvements-title">Improvement plan</h2>{evaluation.recommendations.length ? <ol className="str-improvement-list">{evaluation.recommendations.map((item) => <li key={item.code} className="str-improvement-card"><div><span className={`str-priority str-priority--${item.priority}`}>{capitalize(item.priority)}</span><span>{capitalize(item.expectedGuestImpact)} guest impact</span></div><h3>{item.title}</h3><p>{item.rationale}</p><strong>{currencyRange(item.estimatedCostLowUsd, item.estimatedCostHighUsd)}</strong>{item.requiresProfessionalReview && <p className="str-professional-review">Professional review may be required.</p>}</li>)}</ol> : <p>No improvements were recommended from the available evidence.</p>}</section>
        <BudgetSummary result={result} />
      </div>
    </div>
    <p className="str-potential-updated" role="status">Evaluated {formatDate(evaluation.evaluatedAt)}. Cost ranges are early planning estimates, not contractor quotes.</p>
  </>;
}

function Findings({ title, empty, findings }: Readonly<{ title: string; empty: string; findings: PublicStrPotentialEvaluation["evaluation"]["strengths"] }>) { return <section className="str-potential-section"><h2>{title}</h2>{findings.length ? <ul className="str-finding-list">{findings.map((finding) => <li key={finding.code}><h3>{finding.title}</h3><p>{finding.explanation}</p>{finding.evidence.length > 0 && <p className="str-evidence-tags" aria-label="Supporting evidence">{finding.evidence.map((evidence) => <span key={`${evidence.code}-${evidence.label}`}>{evidence.label}</span>)}</p>}</li>)}</ul> : <p>{empty}</p>}</section>; }
function BudgetSummary({ result }: Readonly<{ result: PublicStrPotentialEvaluation }>) { const budget = result.evaluation.budget; const hasGap = budget.reserveGapHighUsd > 0; return <section className="str-potential-budget" aria-labelledby="str-budget-title"><h2 id="str-budget-title">Improvement budget</h2><dl><div><dt>Estimated range</dt><dd>{currencyRange(budget.estimatedCostLowUsd, budget.estimatedCostHighUsd)}</dd></div><div><dt>Saved reserve</dt><dd>{currency(budget.improvementReserveUsd)}</dd></div><div><dt>{hasGap ? "Potential reserve gap" : "Reserve position"}</dt><dd>{hasGap ? currencyRange(budget.reserveGapLowUsd, budget.reserveGapHighUsd) : "Within the saved reserve"}</dd></div></dl></section>; }
function propertyFacts(property: PublicStrPotentialEvaluation["property"]) { return [property.propertyType?.replaceAll("_", " "), property.beds !== undefined ? `${property.beds} beds` : undefined, property.baths !== undefined ? `${property.baths} baths` : undefined, property.livingAreaSqft ? `${property.livingAreaSqft.toLocaleString()} sq ft` : undefined, property.lotAcres ? `${property.lotAcres.toLocaleString()} acres` : undefined].filter(Boolean).join(" · "); }
function potentialLabel(value: PublicStrPotentialEvaluation["evaluation"]["potential"]) { return value === "insufficient_evidence" ? "Insufficient evidence" : `${capitalize(value)} potential`; }
function currency(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value); }
function currencyRange(low: number, high: number) { return low === high ? currency(low) : `${currency(low)}–${currency(high)}`; }
function capitalize(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value)); }
