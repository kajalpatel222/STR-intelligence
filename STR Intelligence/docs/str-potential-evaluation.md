# STR Potential Evaluation

Phase 7 adds an explicit evaluation action to each saved Home on the Financial Dashboard. It does not run during page load and does not affect financial calculations.

## Conditional flow

1. A user chooses **Evaluate STR potential** for one saved Zillow property.
2. A LangChain cache tool asks Supabase for a fresh immutable evaluation.
3. On a cache miss, an evidence tool assembles canonical facts, the latest listing text and photos, the saved improvement reserve, and available comparable characteristics.
4. If evidence is too sparse, LangGraph returns an honest insufficient-evidence result without calling a model.
5. Otherwise, an OpenRouter-backed multimodal evaluator returns a strict structured result.
6. Deterministic server code calculates recommendation totals and reserve gaps, then stores a new immutable evaluation version.

This is a **tool-using, conditional sequential workflow**. LangGraph controls the branches and LangChain defines the bounded tools; the model is used only for qualitative interpretation of supplied evidence. It never controls routing, persistence, or budget arithmetic.

## Evidence and safety

- Up to ten sanitized listing images are supplied with text first and images afterward.
- Listing content is treated as untrusted evidence, not as instructions.
- The evaluator must cite supplied evidence and cannot claim verified condition, privacy, views, legality, revenue, occupancy, or contractor pricing when those facts are absent.
- Provider keys, provider responses, raw Zillow payloads, internal database IDs, model identifiers, and workflow state are excluded from the browser DTO.
- Cost ranges are early planning estimates. Recommendations that may involve permitting, structure, utilities, or safety are marked for professional review.

## Persistence

Migration `20260831_0009_str_potential_evaluations.sql` creates a server-managed, RLS-closed table. Rows are immutable and versioned per canonical property. Each row keeps the sanitized evidence snapshot, structured evaluation, provider metadata, source listing/financial references, and freshness timestamps for auditability.

The current cache window is 30 days. **Refresh evaluation** explicitly bypasses the cache and creates another immutable version.
