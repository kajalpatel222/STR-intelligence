import { useState } from "react";
import {
  type FinancialAssumptions,
  type FinancialAssumptionsField,
  type FinancialAssumptionsValidationError,
} from "../shared/financial-assumptions";
import {
  calculateBaseCaseFinancials,
  FINANCIAL_CALCULATOR_METHODOLOGY_VERSION,
} from "../shared/financial-calculator";
import {
  createFinancialDraft,
  financialAssumptionsToDraft,
  formatFinancialCurrency,
  formatFinancialDscr,
  formatFinancialRatio,
  getPropertyTaxJurisdiction,
  getTransientOccupancyTaxProfile,
  parseFinancialDraft,
  type FinancialAssumptionsDraft,
  type FinancialListingContext,
} from "./financial-analysis-state";
import type { SavedFinancialAnalysis, SaveFinancialAnalysisRequest } from "../shared/financial-analysis";
import { saveFinancialAnalysis } from "./financial-analysis-client";

export type { FinancialListingContext } from "./financial-analysis-state";

type FinancialAnalysisWorkspaceProps = Readonly<{
  listing: FinancialListingContext;
  initialAssumptions?: FinancialAssumptions;
  saver?: (request: SaveFinancialAnalysisRequest) => Promise<SavedFinancialAnalysis>;
  onSaved?: (analysis: SavedFinancialAnalysis) => void;
  onBack: () => void;
}>;

type FieldDefinition = Readonly<{
  field: FinancialAssumptionsField;
  label: string;
  unit: string;
  step?: string;
  help?: string;
  guestPaid?: boolean;
}>;

const GROUPS: readonly Readonly<{
  title: string;
  description: string;
  open: boolean;
  fields: readonly FieldDefinition[];
}>[] = [
  {
    title: "Property investment",
    description: "One-time acquisition and launch costs.",
    open: true,
    fields: [
      { field: "purchasePriceUsd", label: "Purchase price", unit: "$", step: "1000" },
      { field: "improvementBudgetUsd", label: "Renovation and improvement budget", unit: "$", step: "1000" },
      { field: "furnishingSetupCostUsd", label: "Furnishing and launch costs", unit: "$", step: "1000" },
      { field: "closingCostsUsd", label: "Closing costs", unit: "$", step: "1000" },
    ],
  },
  {
    title: "Financing",
    description: "Fixed-rate financing assumptions.",
    open: true,
    fields: [
      { field: "downPaymentPercent", label: "Down payment", unit: "%", step: "0.1" },
      { field: "annualInterestRatePercent", label: "Annual interest rate", unit: "%", step: "0.01" },
      { field: "loanTermYears", label: "Loan term", unit: "years", step: "1" },
    ],
  },
  {
    title: "STR revenue",
    description: "Editable operating assumptions, not market projections.",
    open: true,
    fields: [
      { field: "expectedAdrUsd", label: "Expected average daily rate", unit: "$ / occupied night", step: "1" },
      { field: "expectedOccupancyPercent", label: "Expected occupancy", unit: "%", step: "0.1", help: "Applied to all 365 calendar nights; owner-blocked nights are not modeled separately." },
      { field: "averageStayNights", label: "Average length of stay", unit: "nights", step: "0.1" },
      { field: "cleaningFeeChargedUsd", label: "Cleaning fee charged to guest", unit: "$ / stay", step: "1", guestPaid: true },
      { field: "guestPlatformFeePercent", label: "Guest platform fee", unit: "%", step: "0.1", guestPaid: true, help: "Applied to room revenue and cleaning fees." },
      { field: "transientOccupancyTaxPercent", label: "Transient occupancy tax", unit: "%", step: "0.1", guestPaid: true, help: "Location-based planning rate applied to room revenue and cleaning fees." },
    ],
  },
  {
    title: "Operating expenses",
    description: "Property, per-stay, and percentage-based expenses.",
    open: false,
    fields: [
      { field: "propertyTaxRatePercent", label: "Property tax rate", unit: "%", step: "0.01" },
      { field: "annualInsuranceUsd", label: "Home insurance", unit: "$ / year", step: "100" },
      { field: "monthlyMiscUtilitiesUsd", label: "Miscellaneous utilities", unit: "$ / month", step: "10" },
      { field: "cleaningCostUsd", label: "Cleaning cost paid", unit: "$ / stay", step: "1" },
      { field: "managementFeePercent", label: "Property management fee", unit: "%", step: "0.1", help: "Applied to gross booking revenue, including cleaning fees." },
      { field: "maintenanceReservePercent", label: "Maintenance and replacement reserve", unit: "%", step: "0.1", help: "Applied to gross booking revenue, including cleaning fees." },
      { field: "annualHoaUsd", label: "HOA dues", unit: "$ / year", step: "100" },
      { field: "annualOtherOperatingCostsUsd", label: "Other operating costs", unit: "$ / year", step: "100" },
    ],
  },
];

export function FinancialAnalysisWorkspace({
  listing,
  initialAssumptions,
  saver = saveFinancialAnalysis,
  onSaved,
  onBack,
}: FinancialAnalysisWorkspaceProps) {
  const initialDraft = () => initialAssumptions
    ? financialAssumptionsToDraft(initialAssumptions)
    : createFinancialDraft(listing);
  const [draft, setDraft] = useState<FinancialAssumptionsDraft>(initialDraft);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const validation = parseFinancialDraft(draft);
  const result = validation.ok ? calculateBaseCaseFinancials(validation.value) : null;
  const expectedOccupancyPercent = validation.ok ? validation.value.expectedOccupancyPercent : null;
  const errors = validation.ok ? [] : validation.errors;
  const taxJurisdiction = getPropertyTaxJurisdiction(listing);
  const transientOccupancyTaxProfile = getTransientOccupancyTaxProfile(listing);
  const estimatedPropertyTaxUsd = validation.ok
    ? validation.value.purchasePriceUsd * validation.value.propertyTaxRatePercent / 100
    : null;

  function updateField(field: FinancialAssumptionsField, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setSaveStatus("idle");
  }

  async function handleSave() {
    if (!validation.ok || !listing.sourceUrl) return;
    const assumptions = validation.value;
    setSaveStatus("saving");
    try {
      const saved = await saver({
        property: {
          listingUrl: listing.sourceUrl,
          title: listing.title,
          ...(listing.address ? { address: listing.address } : {}),
          ...(listing.location ? { location: listing.location } : {}),
          ...(listing.imageUrl ? { imageUrl: listing.imageUrl } : {}),
          ...(typeof listing.priceUsd === "number" ? { priceUsd: listing.priceUsd } : {}),
          ...(typeof listing.beds === "number" ? { beds: listing.beds } : {}),
          ...(typeof listing.baths === "number" ? { baths: listing.baths } : {}),
          ...(typeof listing.livingAreaSqft === "number" ? { livingAreaSqft: listing.livingAreaSqft } : {}),
        },
        assumptions,
      });
      setSaveStatus("saved");
      onSaved?.(saved);
    } catch {
      setSaveStatus("error");
    }
  }

  return (
    <main className="financial-workspace">
      <button className="financial-back" type="button" onClick={onBack}>← Back to property results</button>

      <header className="financial-header">
        <div>
          <p className="financial-kicker">Base-case financial analysis</p>
          <h1>{listing.title}</h1>
          <p>{[listing.address, listing.location].filter(Boolean).join(" · ")}</p>
          <p className="financial-property-facts">
            {formatPropertyFacts(listing)}
          </p>
        </div>
        <div className="financial-header__actions">
          {listing.sourceUrl && <a href={listing.sourceUrl} target="_blank" rel="noreferrer">View source listing</a>}
          <button type="button" disabled={!result || !listing.sourceUrl || saveStatus === "saving"} onClick={() => void handleSave()}>
            {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved to dashboard" : "Save to dashboard"}
          </button>
          {saveStatus === "error" && <small role="alert">Analysis could not be saved. Confirm the local API is running and try again.</small>}
        </div>
      </header>

      <section className="financial-summary" aria-labelledby="financial-summary-title">
        <div className="financial-section-heading">
          <div>
            <p className="financial-kicker">Base case · 365 nights</p>
            <h2 id="financial-summary-title">Investment snapshot</h2>
          </div>
          <p>Editable estimates, not market projections.</p>
        </div>
        {result ? <>
          <dl className="financial-summary-grid">
            <Metric label="Monthly pre-tax cash flow" value={formatFinancialCurrency(result.returns.monthlyPreTaxCashFlowUsd)} />
            <Metric label="Cash-on-cash return" value={formatFinancialRatio(result.returns.cashOnCashReturnRatio)} />
            <Metric label="Total cash required" value={formatFinancialCurrency(result.acquisition.totalCashInvestedUsd)} />
            <Metric label="Break-even occupancy" value={formatFinancialRatio(result.returns.breakEvenOccupancyRatio)} />
          </dl>
          <FinancialWarnings result={result} expectedOccupancyPercent={expectedOccupancyPercent ?? 0} />
        </> : <p className="financial-invalid-summary" role="alert">Correct the highlighted assumptions to calculate this base case.</p>}
      </section>

      <div className="financial-layout">
        <section className="financial-assumptions" aria-labelledby="financial-assumptions-title">
          <div className="financial-section-heading">
            <div><p className="financial-kicker">Your inputs</p><h2 id="financial-assumptions-title">Assumptions</h2></div>
            <button type="button" onClick={() => { setDraft(initialDraft()); setSaveStatus("idle"); }}>Reset assumptions</button>
          </div>
          {GROUPS.map((group) => <FinancialGroup
            key={group.title}
            group={group}
            draft={draft}
            errors={errors}
            onChange={updateField}
            taxEstimate={group.title === "Operating expenses" ? {
              jurisdiction: taxJurisdiction,
              amountUsd: estimatedPropertyTaxUsd,
              rate: draft.propertyTaxRatePercent,
            } : null}
          />)}
        </section>

        <section className="financial-details" aria-labelledby="financial-details-title">
          <p className="financial-kicker">Calculation details</p>
          <h2 id="financial-details-title">How the base case adds up</h2>
          {result ? <>
            <MetricGroup title="Returns" items={[
              ["Net operating income", formatFinancialCurrency(result.returns.netOperatingIncomeUsd)],
              ["Annual pre-tax cash flow", formatFinancialCurrency(result.returns.annualPreTaxCashFlowUsd)],
              ["Cap rate", formatFinancialRatio(result.returns.capRateRatio)],
              ["Debt-service coverage", formatFinancialDscr(result.returns.debtServiceCoverageRatio)],
            ]} />
            <MetricGroup title="Acquisition and financing" items={[
              ["Purchase price", formatFinancialCurrency(result.acquisition.purchasePriceUsd)],
              ["Down payment", formatFinancialCurrency(result.acquisition.downPaymentUsd)],
              ["Loan amount", formatFinancialCurrency(result.financing.loanPrincipalUsd)],
              ["Monthly principal & interest", formatFinancialCurrency(result.financing.monthlyMortgagePaymentUsd, 2)],
              ["Annual mortgage payments", `${formatFinancialCurrency(result.financing.annualMortgagePaymentsUsd)} · principal & interest only`],
            ]} />
            <MetricGroup title="Revenue" items={[
              ["Occupied nights", result.revenue.occupiedNights.toFixed(1)],
              ["Estimated stays", result.revenue.guestStays.toFixed(1)],
              ["Room revenue", formatFinancialCurrency(result.revenue.roomRevenueUsd)],
              ["Cleaning-fee revenue", formatFinancialCurrency(result.revenue.cleaningFeeRevenueUsd)],
              ["Gross booking revenue", formatFinancialCurrency(result.revenue.grossBookingRevenueUsd)],
            ]} />
            <MetricGroup title="Operating expenses" items={[
              ["Property tax expense", formatFinancialCurrency(result.expenses.propertyTaxExpenseUsd)],
              ["Home insurance expense", formatFinancialCurrency(result.expenses.homeInsuranceExpenseUsd)],
              ["Miscellaneous utilities", formatFinancialCurrency(result.expenses.miscellaneousUtilitiesExpenseUsd)],
              ["HOA", formatFinancialCurrency(result.expenses.annualHoaExpenseUsd)],
              ["Other operating expenses", formatFinancialCurrency(result.expenses.otherOperatingExpensesUsd)],
              ["Cleaning expense", formatFinancialCurrency(result.expenses.cleaningExpenseUsd)],
              ["Property management fees", formatFinancialCurrency(result.expenses.managementExpenseUsd)],
              ["Maintenance reserve", formatFinancialCurrency(result.expenses.maintenanceReserveExpenseUsd)],
              ["Total operating expenses", formatFinancialCurrency(result.expenses.totalOperatingExpensesUsd)],
            ]} />
            <MetricGroup title="Guest-paid charges" items={[
              ["Cleaning fees charged", formatFinancialCurrency(result.guestCharges.cleaningFeesChargedUsd)],
              ["Guest platform fees", formatFinancialCurrency(result.guestCharges.guestPlatformFeesUsd)],
              ["Transient occupancy tax", formatFinancialCurrency(result.guestCharges.transientOccupancyTaxUsd)],
              ["Total guest-paid charges", formatFinancialCurrency(result.guestCharges.totalGuestPaidChargesUsd)],
            ]} />
            <GuestPaidNightlyEstimate estimate={result.guestCharges.nightlyEstimate} />
            <GuestPaidChargeContext profile={transientOccupancyTaxProfile} />
            <p className="financial-methodology">Method {FINANCIAL_CALCULATOR_METHODOLOGY_VERSION}. Full precision is retained until display. Income taxes, depreciation, appreciation, PMI, loan fees, seasonality, and owner-blocked nights are not modeled.</p>
          </> : <p>Details will appear after every assumption is valid.</p>}
        </section>
      </div>
    </main>
  );
}

function FinancialGroup({ group, draft, errors, onChange, taxEstimate }: Readonly<{
  group: (typeof GROUPS)[number];
  draft: FinancialAssumptionsDraft;
  errors: readonly FinancialAssumptionsValidationError[];
  onChange: (field: FinancialAssumptionsField, value: string) => void;
  taxEstimate: Readonly<{
    jurisdiction: ReturnType<typeof getPropertyTaxJurisdiction>;
    amountUsd: number | null;
    rate: string;
  }> | null;
}>) {
  const [isOpen, setIsOpen] = useState(group.open);
  return <details className="financial-group" open={isOpen} onToggle={(event) => setIsOpen(event.currentTarget.open)}>
    <summary>{group.title}<small>{group.description}</small></summary>
    <fieldset>
      <legend className="financial-visually-hidden">{group.title}</legend>
      {taxEstimate && <PropertyTaxEstimate {...taxEstimate} />}
      <div className="financial-fields">
        {group.fields.map((definition) => <FinancialField key={definition.field} definition={definition} value={draft[definition.field]} errors={errors} onChange={onChange} />)}
      </div>
    </fieldset>
  </details>;
}

function PropertyTaxEstimate({ jurisdiction, amountUsd, rate }: Readonly<{
  jurisdiction: ReturnType<typeof getPropertyTaxJurisdiction>;
  amountUsd: number | null;
  rate: string;
}>) {
  const place = jurisdiction.county ?? `${jurisdiction.state} · county unavailable`;
  return <aside className="financial-tax-estimate" aria-label="Estimated property tax">
    <p><strong>Estimated property tax</strong></p>
    <p>{amountUsd === null ? "Enter a valid purchase price and tax rate" : `${formatFinancialCurrency(amountUsd)} annually`}</p>
    <p>{place} · {rate || "—"}% rate used · Editable planning estimate</p>
    <p>Source as of March 2025: <a href="https://www.boe.ca.gov/proptaxes/pdf/pub29.pdf" target="_blank" rel="noreferrer">California Board of Equalization property tax guidance</a>.</p>
    <p>California's statutory base is 1%. The default includes a planning buffer, but local voter-approved debt and parcel assessments are not fully modeled; the actual bill may differ.</p>
  </aside>;
}

function FinancialField({ definition, value, errors, onChange }: Readonly<{
  definition: FieldDefinition;
  value: string;
  errors: readonly FinancialAssumptionsValidationError[];
  onChange: (field: FinancialAssumptionsField, value: string) => void;
}>) {
  const error = errors.find((item) => item.field === definition.field);
  const inputId = `financial-${definition.field}`;
  const helpId = definition.help ? `${inputId}-help` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  return <label className="financial-field" htmlFor={inputId}>
    <span>{definition.label}{definition.guestPaid && <small className="financial-field-marker">Guest paid</small>}</span>
    <span className="financial-input-wrap">
      <input id={inputId} type="number" inputMode="decimal" step={definition.step ?? "any"} value={value} aria-invalid={Boolean(error)} aria-describedby={[helpId, errorId].filter(Boolean).join(" ") || undefined} onChange={(event) => onChange(definition.field, event.target.value)} />
      <span>{definition.unit}</span>
    </span>
    {definition.help && <small id={helpId}>{definition.help}</small>}
    {error && <small className="financial-field-error" id={errorId}>{error.message}</small>}
  </label>;
}

function GuestPaidChargeContext({ profile }: Readonly<{
  profile: ReturnType<typeof getTransientOccupancyTaxProfile>;
}>) {
  const place = profile.county ?? "County unavailable";
  return <aside className="financial-methodology" aria-label="Guest-paid charge context">
    <p><strong>{place} · {profile.ratePercent}% TOT</strong> · {profile.statusLabel}</p>
    {profile.sourceUrl
      ? <p>Source: <a href={profile.sourceUrl} target="_blank" rel="noreferrer">{profile.sourceLabel}</a>.</p>
      : <p>{profile.sourceLabel}; the rate is an editable planning default.</p>}
    <p>These charges are collected from guests and excluded from owner operating expenses. Collection and remittance may be handled by the booking platform or operator.</p>
  </aside>;
}

function GuestPaidNightlyEstimate({ estimate }: Readonly<{
  estimate: ReturnType<typeof calculateBaseCaseFinancials>["guestCharges"]["nightlyEstimate"];
}>) {
  return <aside className="financial-guest-nightly" aria-label="Estimated guest-paid nightly total">
    <div>
      <p>Estimated guest-paid nightly total</p>
      <strong>{formatFinancialCurrency(estimate.estimatedGuestPaidTotalUsd, 2)}<small> / night</small></strong>
    </div>
    <dl>
      <Metric label="Room ADR" value={formatFinancialCurrency(estimate.roomAdrUsd, 2)} />
      <Metric label="Cleaning allocation" value={formatFinancialCurrency(estimate.cleaningFeeAllocationUsd, 2)} />
      <Metric label="Guest platform fee" value={formatFinancialCurrency(estimate.guestPlatformFeeUsd, 2)} />
      <Metric label="Transient occupancy tax" value={formatFinancialCurrency(estimate.transientOccupancyTaxUsd, 2)} />
    </dl>
    <p>Uses the editable {estimate.averageStayNights}-night average stay to spread the per-stay cleaning fee. Actual checkout totals can vary.</p>
  </aside>;
}

function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function MetricGroup({ title, items }: Readonly<{ title: string; items: readonly (readonly [string, string])[] }>) {
  return <section className="financial-detail-group"><h3>{title}</h3><dl>{items.map(([label, value]) => <Metric key={label} label={label} value={value} />)}</dl></section>;
}

function FinancialWarnings({ result, expectedOccupancyPercent }: Readonly<{
  result: ReturnType<typeof calculateBaseCaseFinancials>;
  expectedOccupancyPercent: number;
}>) {
  const warnings: string[] = [];
  if (result.returns.monthlyPreTaxCashFlowUsd < 0) warnings.push(`This base case projects a pre-tax cash loss of ${formatFinancialCurrency(Math.abs(result.returns.monthlyPreTaxCashFlowUsd))} per month.`);
  if (result.returns.debtServiceCoverageRatio !== null && result.returns.debtServiceCoverageRatio < 1) warnings.push("Projected NOI does not cover annual mortgage payments.");
  if (result.returns.breakEvenOccupancyUnachievable) warnings.push("Break-even occupancy exceeds 100% and is not achievable in this model.");
  if (result.returns.breakEvenOccupancyRatio === null) warnings.push("Break-even occupancy is not achievable because variable costs equal or exceed revenue from another occupied night.");
  if (result.returns.breakEvenOccupancyRatio !== null && expectedOccupancyPercent / 100 < result.returns.breakEvenOccupancyRatio) warnings.push("Expected occupancy is below the calculated break-even occupancy.");
  return warnings.length ? <div className="financial-warnings" role="note" aria-label="Base-case cautions"><ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null;
}

function formatPropertyFacts(listing: FinancialListingContext): string {
  return [
    typeof listing.priceUsd === "number" && listing.priceUsd > 0 ? formatFinancialCurrency(listing.priceUsd) : null,
    typeof listing.beds === "number" ? `${listing.beds} beds` : null,
    typeof listing.baths === "number" ? `${listing.baths} baths` : null,
    typeof listing.livingAreaSqft === "number" ? `${listing.livingAreaSqft.toLocaleString("en-US")} sq ft` : null,
  ].filter(Boolean).join(" · ");
}
