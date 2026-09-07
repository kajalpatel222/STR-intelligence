# Financial Calculator Methodology

Phase 6.1 provides a shared, deterministic financial assumptions contract and the versioned `base-case-365-v4` calculator. It performs no external calls and does not use an LLM.

## Assumptions and Units

- Monetary inputs are USD. Insurance, HOA, and other operating costs are annual amounts; miscellaneous utilities are entered monthly and annualized by the calculator.
- Property tax is an editable percentage of purchase price. The user-selected default is 1.1%, an underwriting assumption informed by California's 1% statutory base, not a parcel-specific tax bill.
- Percentage inputs use human-readable values from `0` to `100`; for example, `20` means 20%.
- Purchase price and expected ADR must be greater than zero. Other monetary inputs must be non-negative.
- Loan term is a whole number from 1 to 50 years. Average stay is greater than zero and no more than 365 nights.
- Validated assumptions and calculator results are immutable snapshots.

The contract covers acquisition costs, financing, expected ADR and occupancy, stay and cleaning economics, owner expenses, guest-paid charges, and annual fixed operating costs. Defaults are editable starting points, not market claims.

## Base-Case Calculation

The model uses a fixed 365-night year. It retains full numeric precision; rounding belongs to future presentation code.

```text
Down payment = purchase price x down-payment percentage
Loan principal = purchase price - down payment
Total cash invested = down payment + closing costs + improvements + furnishing/setup

Occupied nights = 365 x expected occupancy
Guest stays = occupied nights / average stay
Room revenue = occupied nights x expected ADR
Cleaning-fee revenue = guest stays x cleaning fee charged
Gross booking revenue = room revenue + cleaning-fee revenue
```

Monthly principal and interest use the standard amortization formula. Zero-interest financing divides principal evenly over the loan term; an all-cash purchase has no mortgage payments. Annual mortgage payments are principal and interest only.

Fixed operating expenses retain an explicit breakdown:

```text
Property tax expense = purchase price x property-tax percentage
Miscellaneous utilities expense = monthly miscellaneous utilities x 12
Fixed operating expenses = property tax + home insurance + miscellaneous utilities + HOA + other operating costs
```

California State Board of Equalization March 2025 guidance describes the general property-tax rate as 1% of assessed value plus voter-approved debt. The calculator's editable default is 1.1%, providing a user-selected planning buffer above that base. It is not a verified local rate: voter-approved debt, parcel assessments, assessment timing, and other property-specific charges are not fully modeled, so an actual tax bill can differ.

Management fees and the maintenance reserve use **gross booking revenue** as their percentage base. Operating expenses combine those amounts with cleaning costs and annual fixed expenses.

## Guest-Paid Charges

Cleaning fees charged to guests remain owner booking revenue, while cleaning costs paid by the owner remain operating expenses. Guest platform fees and transient occupancy tax (TOT) are modeled separately as pass-through charges borne by the guest. They are neither included in owner gross booking revenue nor deducted as owner operating expenses.

Both percentage charges use the same deterministic booking subtotal base:

```text
Booking subtotal = room revenue + cleaning-fee revenue
Guest platform fees = booking subtotal x guest platform-fee percentage
Transient occupancy tax = booking subtotal x TOT percentage
Total guest-paid charges = cleaning-fee revenue + guest platform fees + transient occupancy tax

Nightly booking subtotal = room ADR + (cleaning fee charged / average stay)
Estimated guest-paid nightly total = nightly booking subtotal x (1 + guest platform-fee percentage + TOT percentage)
```

The initial TOT default is 9% for Oakhurst/Madera, and the guest platform-fee default is 15%. Both remain editable because local tax rules and platform collection, pricing, and remittance arrangements vary. The estimated guest-paid nightly total is an all-in planning estimate, not owner ADR or a guaranteed checkout price. The calculator does not determine which party remits a charge or whether a particular platform presents it separately at checkout.

```text
NOI = gross booking revenue - operating expenses
Annual pre-tax cash flow = NOI - annual mortgage payments
Cash-on-cash return = annual pre-tax cash flow / total cash invested
Cap rate = NOI / purchase price
DSCR = NOI / annual mortgage payments
```

Break-even occupancy includes fixed operating expenses and annual mortgage payments. Values above 100% remain visible and are marked unachievable rather than being clamped.

## Unavailable Ratios

When a ratio has a zero denominator, the calculator returns `null`, not zero, `Infinity`, or `NaN`. This applies to cash-on-cash return with no cash invested, DSCR with no debt service, and break-even occupancy when contribution per occupied night is non-positive.

## Comparator Boundary

Stored STR comparables are supporting evidence only. Saved Airbtics LTM ADR, occupancy, and revenue estimates may provide context, but Phase 6.1 does not infer or populate financial assumptions from comparator data. These third-party market estimates are not verified host financial statements.

## Saved Analysis Boundary

The React workspace sends the public Zillow URL and validated assumptions to the Node API. Node resolves the canonical property, reruns the deterministic calculator, and stores immutable property, assumptions, and result snapshots in `str_analysis_runs`. Migration `20260830_0008_financial_analysis_snapshots.sql` adds the versioned snapshot and dashboard summary columns while preserving closed RLS. The Financial Dashboard returns only safe snapshots and displays the latest version per property.

Scenario and sensitivity analysis, LangGraph/LangChain financial orchestration, and automatic comparator-to-assumption propagation remain deferred.
