# Current demo compared with the slide deck

Reviewed 2026-10-20 against `C:\Users\MODERN15\Downloads\AISC26-0080-Axiom_Slide (1).pdf` (15 raster pages), the latest local deck copy. The original unsuffixed deck is also present. These findings supersede older readiness claims where they disagree with current evidence.

## Verdict

The application is suitable for a guided prototype demonstration of scheduling, independent verification, evidence export, and human review. It is not yet a fully reliable live demonstration of every slide. Resolve the live AI presentation path, correct the data/EDA slide figures, and guard the MANUAL selector before presenting without a rehearsed route.

## Fresh runtime evidence

`ops/demo-studio-smoke.py` completed **62 checks with zero uncaught JavaScript exceptions**, using isolated Brave on localhost. It covered real mouse dragging, verified MANUAL publication and export, undo/reset, native views, emulated mobile touch and keyboard selection, and the newer Factory Lab examples. No live model request was made by this run.

Fresh sequential `/api/demo/studio/replay` requests returned:

| Case | Decision | Selected plan |
| --- | --- | --- |
| base | CHANGE | B1 |
| extra_cost | MEASURE_FIRST | B0 |
| unknown_cost | MEASURE_FIRST | B0 |

For all three cases, the modeled schedule costs were B0 **1,485,222 VND**, B1 **1,352,304 VND**, B2 **944,598 VND**. All plans verified PASS for eight jobs. B1 changes one job; B2 changes eight jobs. Each plan consumes **464 kWh** in this synthetic fixture. Economic assumptions change the decision, rather than those modeled costs.

The base case reproduces the slide's B1 saving of **132,918 VND** and J4's M2 move from **08:00 to 22:00**. B2 remains a bounded-search result, not a proof of global factory optimality.

Evidence: `work/demo-evidence/browser-checks.json`, `slide-replay-current.json`, and the browser screenshots/exports in the same directory.

## Slide alignment

| Slides | Assessment | Required action |
| --- | --- | --- |
| 1–3: value proposition, constraints, workflow | The prototype demonstrates the intended decision process. | Present the six steps as the workflow, not as proof of deployed factory integration. |
| 4: sources and input data | Source audit and synthetic fixtures are available. | Keep textile source, benchmark ZIP and synthetic molding fixture separate. Zenodo record provenance and source units are not independently established here. |
| 5: cleaning | Funnel 275 → 108 → 91 → selected eight matches. | Replace the slide's issue counts 102/46/28/8. Actual audit reports 167 unknown modes and 17 additional machine-incompatible rows. Compatibility is not a full physical schedule approval. |
| 6: EDA | The demo has tariff, load, energy and comparison views. The numerical example does not match the tested source subset. | Replace the chart with exported evidence from a single clearly labeled scenario. Slide says 25.72 kWh, indices 98.73/95.69, and an 08:00–10:00 price peak; do not transfer these to the synthetic case. |
| 7: business insight | B1/B2 costs and conditional recommendation are reproducible. | Explain that a lower modeled B2 cost does not establish lower real operating cost when excluded costs are unknown. |
| 8: operator context | Deterministic reporting and optional AI handoff pass browser checks. | Context flags such as staffing/inventory are review items unless explicitly modeled; entering text does not add physical constraints. |
| 9: AI-generated interpretation | Consent and handoff work. Live interpretation remains a presentation risk. | Obtain and review a successful real response before presenting this as live AI. Otherwise disclose the provider failure and use an explicitly labeled engine memo or genuine cached API response. |
| 10: J4 move | Matches fresh runtime evidence. | Use the synthetic scenario and its actual Gantt. |
| 11: independent five-group verifier | Current deck's five-group model/review distinction fits the native verifier. | Show eight checked jobs and distinguish model PASS from factory approval. The latest deck has already replaced the older misleading verifier screenshot. |
| 12: B0/B1/B2 costs and B1 recommendation | Matches fresh base replay exactly. | Keep the modeled-cost and synthetic-data qualifications. |
| 13: solution positioning | Separate AI, solver, verifier and human review roles are demonstrable. | Avoid treating the prototype as a complete APS or an independently proven comparison with commercial systems. |
| 14: pilot and commercial model | Reasonable future deployment discussion. | Present pilot, ROI and operating costs as plans/assumptions, not measured benefits. |
| 15: conditional decisions and next steps | CHANGE and MEASURE_FIRST are reproduced by current presets. | If showing all three decision badges, add a verified KEEP_CURRENT case. Selecting B0 under MEASURE_FIRST is not the same verdict as KEEP_CURRENT. |

### Exact textile EDA mismatch observed

The browser's selected eight textile rows on MAQ119, with explicitly approved **5 min/slot, W, price per Wh, SOURCE currency, solar disabled**, exported:

- B0/B1/B2 energy: **1.612 kWh each**.
- Modeled costs: approximately **0.1086659742 / 0.1062492467 / 0.10152885 SOURCE**.
- Cost indices: approximately **100 / 97.78 / 93.43**.

These values differ from slide 6's 25.72 kWh and 100/98.73/95.69. They are experimental mapping results, not validated industrial units. Correct the slide to a defensible selected scenario rather than adjusting the application to force slide numbers.

## Remaining presentation risks

1. **Live AI availability:** the running backend's status reports its last AI attempt as HTTP 429, `provider_name: Google AI Studio`, `limit_source: upstream_provider_shared_pool`. The key is configured, but that does not establish successful current inference. This assessment did not send a new provider request.
2. **Missing MANUAL plan:** the verifier still allows selecting MANUAL when no draft exists. `renderValidation()` dereferences `currentReport.plans[code].verification` without an existence guard. This breaks the verifier action before a draft or after undo/reset. The additional browser probe records the exact failure.
3. **Demonstration focus:** Factory Lab, source mapping, the manual editor and AI memo add controls beyond the deck's simple screenshots. Use a rehearsed sequence and keep unrelated sections collapsed or out of the presentation route. Current screenshots show substantial vertical scrolling through these global sections.
4. **Readiness documentation:** older guides contain several historical test totals and pending/fixed statements. Use fresh JSON evidence and this assessment for the current presentation; avoid quoting older totals as current proof.

## Suggested presentation route

1. Briefly show the source funnel and its limitations.
2. Switch explicitly to the synthetic molding case.
3. Run base replay, show B1 and the exact cost comparison.
4. Show J4 on Gantt and the independent verifier.
5. Export the evidence package.
6. Enter context and show the deterministic review report.
7. Show AI only if a successful reviewed API response is available, with live/cached labeling.
8. Demonstrate one manual what-if and undo, avoiding an absent MANUAL selection until fixed.
9. Show the conditional economics case and explain why MEASURE_FIRST retains B0.

The tests establish local prototype behavior. They do not establish physical-device performance, real factory savings, production deployment, or live AI reliability.
