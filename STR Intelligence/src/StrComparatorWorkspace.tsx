import React, { useState, type CSSProperties } from "react";
import {
  strComparatorClient,
  type StrComparatorClient,
  type StrComparisonDto,
} from "./str-comparator-client.js";
import { formatBedroomBathroomCount, formatComparatorCurrency, formatComparatorDate } from "./str-comparator-format.js";
import { StrComparableCard } from "./StrComparableCard.js";

export type StrComparatorWorkspaceProps = Readonly<{
  listingUrl: string;
  propertyLabel?: string;
  initialComparison?: StrComparisonDto;
  client?: StrComparatorClient;
  onBack(): void;
}>;

type Activity = "idle" | "discovering";

export function StrComparatorWorkspace({
  listingUrl,
  propertyLabel,
  initialComparison,
  client = strComparatorClient,
  onBack,
}: StrComparatorWorkspaceProps) {
  const [comparison, setComparison] = useState(initialComparison);
  const [activity, setActivity] = useState<Activity>("idle");
  const [error, setError] = useState("");

  async function discover() {
    setActivity("discovering");
    setError("");
    try {
      const result = await client.discover(listingUrl);
      setComparison(result);
    } catch (reason) {
      setError(message(reason, "We could not find comparable stays. Try discovery again."));
    } finally {
      setActivity("idle");
    }
  }

  const target = comparison?.target;
  const displayLabel = target?.address ?? propertyLabel ?? "Selected home";
  const cachedAt = formatComparatorDate(comparison?.completedAt ?? comparison?.cachedAt);

  return (
    <main className="str-comparator" style={styles.workspace} aria-labelledby="comparator-title" aria-busy={activity !== "idle"}>
      <header className="str-comparator__header" style={styles.header}>
        <button type="button" onClick={onBack} style={styles.back} aria-label="Back to attention screen">← Back</button>
        {target?.imageUrl && <a className="str-comparator__target-link" href={target.listingUrl} target="_blank" rel="noreferrer" aria-label={`Open Zillow listing for ${displayLabel}`}>
          <img className="str-comparator__target-image" src={target.imageUrl} alt={`Target property at ${displayLabel}`} />
        </a>}
        <div style={styles.targetHeading}>
          <p style={styles.eyebrow}>STR comparator</p>
          <h1 id="comparator-title" style={styles.title}>{displayLabel}</h1>
          <p style={styles.targetMeta}>
            {[target?.city, target?.state, target?.propertyType,
              target?.bedrooms === undefined ? undefined : formatBedroomBathroomCount(target.bedrooms, "bedroom"),
              target?.bathrooms === undefined ? undefined : formatBedroomBathroomCount(target.bathrooms, "bathroom")]
              .filter(Boolean).join(" · ") || "Compare this home with nearby entire-home stays."}
          </p>
        </div>
        {target?.price !== undefined && <div style={styles.targetPrice}><span>Asking</span><strong>{formatComparatorCurrency(target.price)}</strong></div>}
      </header>

      {!comparison && <section style={styles.startPanel} aria-labelledby="discovery-title">
        <h2 id="discovery-title" style={styles.sectionTitle}>Find the five strongest comparables</h2>
        <p style={styles.lede}>Find nearby entire-home stays ranked by location, capacity, and property fit.</p>
        <button type="button" style={styles.primaryButton} onClick={discover} disabled={activity !== "idle"}>
          {activity === "discovering" ? "Finding comparables…" : "Find comparables"}
        </button>
      </section>}

      {error && <div role="alert" style={styles.error}>
        <strong>Comparator unavailable.</strong> {error}
      </div>}
      {activity !== "idle" && <p role="status" aria-live="polite" style={styles.hint}>Reviewing nearby stays and selecting the strongest matches…</p>}

      {comparison && <>
        <section className="str-comparator__stage-header" style={styles.stageHeader} aria-labelledby="shortlist-title">
          <div>
            <p style={styles.step}>Nearby stays</p>
            <h2 id="shortlist-title" style={styles.sectionTitle}>STR comparables</h2>
            <p style={styles.hint}>{Math.min(comparison.candidates.length, 5)} strongest property matches.</p>
          </div>
          {cachedAt && <p style={styles.cache}>Cached {cachedAt}</p>}
        </section>

        {comparison.candidates.length === 0 ? <div style={styles.empty} role="status">
          <strong>No eligible comparables found.</strong>
          <span>Try discovery again later as nearby listing inventory changes.</span>
          <button type="button" style={styles.secondaryButton} onClick={discover} disabled={activity !== "idle"}>Run discovery again</button>
        </div> : <div style={styles.grid}>
          {comparison.candidates.slice(0, 5).map((candidate, index) => <StrComparableCard key={candidate.providerListingKey ?? candidate.listingUrl} candidate={candidate} rank={index + 1} onRefreshCalendar={async () => setComparison(await client.refreshCalendar(comparison.publicReference, candidate.listingUrl))} />)}
        </div>}
      </>}
    </main>
  );
}

function message(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

const colors = { ink: "#17211b", muted: "#5d6b61", paper: "#f7f4ec", white: "#fffdf8", green: "#234b35", line: "#d8d3c7", rust: "#9a3f25" } as const;
const styles: Record<string, CSSProperties> = {
  workspace: { maxWidth: 1180, margin: "0 auto", padding: "28px clamp(18px, 4vw, 54px) 64px", color: colors.ink, background: `radial-gradient(circle at 92% 2%, #d9e5d7 0, transparent 24%), ${colors.paper}`, minHeight: "100vh", fontFamily: '"Avenir Next", "Gill Sans", sans-serif' },
  header: { display: "flex", alignItems: "center", gap: 20, paddingBottom: 22, borderBottom: `1px solid ${colors.line}` },
  back: { border: 0, background: "transparent", color: colors.green, font: "inherit", fontWeight: 700, cursor: "pointer", padding: "10px 4px" },
  targetHeading: { flex: 1, minWidth: 0 }, eyebrow: { margin: "0 0 4px", color: colors.green, fontSize: 12, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase" },
  title: { margin: 0, fontFamily: 'Georgia, "Times New Roman", serif', fontSize: "clamp(27px, 3.2vw, 35px)", lineHeight: 1.08 },
  targetMeta: { margin: "7px 0 0", color: colors.muted, fontSize: 14 }, targetPrice: { display: "grid", gap: 2, textAlign: "right" },
  startPanel: { maxWidth: 720, margin: "80px auto", padding: "clamp(26px, 5vw, 52px)", background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 22, boxShadow: "0 18px 50px rgba(39,54,43,.09)" },
  step: { margin: "0 0 7px", color: colors.rust, fontSize: 12, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase" },
  sectionTitle: { margin: 0, fontFamily: 'Georgia, "Times New Roman", serif', fontSize: "clamp(22px, 2.4vw, 27px)", lineHeight: 1.15 },
  lede: { color: colors.muted, lineHeight: 1.55, maxWidth: 680 }, hint: { margin: "6px 0 0", color: colors.muted, fontSize: 14 },
  primaryButton: { border: 0, borderRadius: 999, padding: "12px 19px", background: colors.green, color: "white", font: "inherit", fontWeight: 800, cursor: "pointer" },
  secondaryButton: { border: `1px solid ${colors.green}`, borderRadius: 999, padding: "10px 16px", background: "transparent", color: colors.green, font: "inherit", fontWeight: 800 },
  error: { margin: "20px 0", padding: 16, borderLeft: `4px solid ${colors.rust}`, background: "#fff2ed", color: "#6f2d1d" },
  stageHeader: { display: "flex", justifyContent: "space-between", alignItems: "end", gap: 20, margin: "34px 0 18px" }, cache: { color: colors.muted, fontSize: 12, whiteSpace: "nowrap" },
  grid: { display: "grid", gridTemplateColumns: "1fr", gap: 13 },
  card: { minWidth: 0, border: `1px solid ${colors.line}`, borderRadius: 16, background: colors.white, overflow: "hidden" },
  cardSelected: { borderColor: "#74917d", boxShadow: "inset 0 3px 0 #4d755a" }, cardTop: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  rank: { color: colors.rust, fontSize: 12, fontWeight: 900 }, includeLabel: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700 },
  cardTitle: { margin: "9px 0 4px", fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 19, lineHeight: 1.25 }, cardMeta: { margin: "0 0 15px", color: colors.muted, fontSize: 13 },
  observedPrice: { display: "grid", gap: 3, padding: "12px 0", borderTop: `1px solid ${colors.line}`, borderBottom: `1px solid ${colors.line}` },
  metricPair: { display: "grid", gridTemplateColumns: "1fr", gap: 8, marginTop: 12 }, metric: { display: "grid", alignContent: "start", gap: 3 },
  details: { marginTop: "auto", paddingTop: 14, color: colors.muted, fontSize: 12 },
  analysisPanel: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, marginTop: 26, padding: "24px clamp(18px, 4vw, 34px)", borderRadius: 18, color: colors.ink, background: "#e7eadf" },
  summary: { display: "grid", gridTemplateColumns: "minmax(190px, 1.5fr) repeat(2, minmax(140px, 1fr))", gap: 18, marginTop: 14, padding: 24, border: `1px solid ${colors.line}`, borderRadius: 18, background: colors.white },
  empty: { display: "grid", justifyItems: "start", gap: 10, padding: 28, border: `1px dashed ${colors.line}`, borderRadius: 16, color: colors.muted },
};
