# EnergyShift AISC 2026 — slide-to-live-demo alignment

Reviewed against the 15-page `AISC26-0080-Axiom_Slide(1).pdf` shared for the 20 October 2026 session and the local `feat/ai-csv-assistant` workspace. This is an evidence checklist, **not** a claim that the factory has been validated. The old local test record in `docs/evaluation/aisc_demo_readiness_20261020.json` is historical; rerun the commands below after edits.

## Two intentionally separate cases

- **EXTERNAL_ISOLATED_SUBSET:** The two source JSON files are audited. On the supplied copy, 275 assignments produce 108 known modes, of which 91 also have compatible machine IDs (167 unknown + 17 incompatible). These are *code/compatibility* counts, not 91 verified executable jobs. Select up to eight, explicitly approve time/power/price/currency/move/solar assumptions, then independently verify the resulting isolated experiment. Results are not a full-factory schedule; the original source unit, start date, currency, and Zenodo record remain unverified.
- **SYNTHETIC injection-molding `demo-3`:** Separate eight-job/three-machine fixture. The existing baseline/B1 reference costs are B0 1,485,222 VND and B1 1,352,304 VND, with J4 on M2 shifted 08:00 → 22:00. Reference bounded-search B2 is 944,598 VND, but runs must display **actual** verified costs and decision from API, never insert a reference number into a report. No numbers are transferable from this case to the external textile source.

## Page-by-page presenter check

| PDF page | Claim/example | Demo action | Required qualification or action |
| --- | --- | --- | --- |
| 1 | Product supports auditable schedule decisions | `?demo=1` | Value proposition, not a measured plant outcome. |
| 2 | Tariff variation, technical constraints and implementation risk | Replay SYNTHETIC then Gantt/Verifier | Fixture models only declared constraints and part of costs. |
| 3 | Six data-driven steps | Walk Source → Textile → Synthetic → AI | UI is four demo stages mapped to the six conceptual steps, not six distinct backend modules. |
| 4 | Zenodo production-line source + synthetic demo | Source → provenance hashes and archive info | **Do not assert Zenodo record provenance** until verified; source JSONs, benchmark ZIP and synthetic fixture are distinct. |
| 5 | 275 → 108 → 91 cleaning funnel | Source → warning/row filtering | 167 missing modes plus 17 incompatible *additional* rows; no imputation. These are not complete physical schedule checks. |
| 6 | EDA tariffs, load, cost index and heatmap | Textile → run with confirmed units, or Synthetic → EDA | Never place textile energy charts and synthetic VND savings under one source label. Numeric units in textile are assumptions. |
| 7 | Peak tariff, simple move, uncertain B2 | Replay SYNTHETIC + decision panel | A recommendation requires verified B0/B1 and declared economic boundary. B2 may be cheaper *in modeled cost* but not actionable under missing costs. |
| 8 | User supplies factory context | AI stage / existing intake | Context is unverified user input, not a sensor reading or proof. |
| 9 | AI interprets evidence | AI stage (only with consent) | OpenRouter Gemma free model last produced HTTP 429 in the recorded local evaluation. Live completion has **not** been verified. Use engine memo as clearly labeled non-AI backup. |
| 10 | B1 moves J4 from 08:00 to 22:00 | Synthetic replay → Gantt | Show exact job/time/cost only if freshly computed and verified. Fixture is synthetic. |
| 11 | Five verifier groups; screenshot 128/128 | Synthetic → 'Mở kiểm chứng độc lập' | **Replace screenshot 128/128.** Native verifier returns PASS/FAIL, checked rows and issues, not a native five-group PASS counter. The eight-job scenario must show its actual checked-job count. Textile's five verification groups are a separate verifier/model. |
| 12 | B0/B1/B2 1,485,222 / 1,352,304 / 944,598 VND | Synthetic replay → result, overview + export | Cost values must come from the run. B2 is a bounded solver incumbent, not a global factory optimum; economic policy can retain B1 or request more measurement. |
| 13 | Difference between LLM, solver and EnergyShift | Show deterministic report and optional AI | Claims about other commercial products' inability are not established by this demo. Here the verifier and scheduler, not the LLM, own the result. |
| 14 | Commercial and operational gains/architecture | Show input, evidence export, decision review | Factory ROI, 20–30% cost claims, measured speed gains, production rollout and data integration are **not established**. Also replace first-person team wording if slide-deck style forbids it. |
| 15 | Now/Next/Scale and conditional change | Demo three outcomes (CHANGE / KEEP_CURRENT / MEASURE_FIRST) via native fixture variants | Roadmap is prospective. No measured plant pilot or verified multi-industry deployment. |

## Interactive what-if additions (implementation, not post-edit verified)

- Shared context form returns a deterministic report keyed to the active server report; hints for staffing/inventory/precedence are not physical constraints.
- Select a job bar in the new Gantt and enter a different start slot. Verify the independent server response. A passing candidate becomes a distinct MANUAL view and can be compared to the same B0; a failing candidate has **no cost**.
- On textile subset, machine selection remains fixed to the compatible source machine; on demo-3, only declared eligible machines may be selected. This is select-and-enter interaction, not drag-and-drop.
- A valid MANUAL draft is REVIEW_REQUIRED or MEASURE_FIRST, never an approval. Provider AI is optional; use deterministic memo when the free pool returns 429.
- Post-edit runtime tests and browser walkthrough still required because CodexBridge command execution currently fails through WSL /bin/bash.

## Presentation gate

- Open `http://127.0.0.1:8000/?demo=1`.
- Validate external source and its classification counts. Confirm all unit, interval and subset limitations before running the external experiment.
- Replay SYNTHETIC and check returned input hash, B0 and B1 costs, J4 move, B2 actual cost, native verifier status and checked-job count. Don't claim PASS if the verifier isn't PASS.
- Navigate Gantt, Verifier and Overview with the same run. B2 status may change when search is bounded.
- Enter operator context and opt into AI **only** if the provider is available. Distinguish fresh AI, cached AI, and deterministic engine-written memo. Don't present an HTTP 429 as a successful AI demonstration.
- Export the JSON evidence package. It must disclose source hashes, mapping assumptions, scenario boundaries and verifier results.
- Never put the synthetic VND savings beside the external textile source as a single industrial case study.

## Local browser interaction gate — 20 October 2026

A Windows CMD run confirmed the extended Edge smoke **47/47 PASS, 0 JavaScript exceptions** with emulated touch cancellation/drop/undo and real keyboard Enter/Space selection. Prior independently reported unit suites were 249 Python and 13 Node tests PASS. This does not prove physical phone behavior, live AI completion, measured plant savings, or factory deployment.

Additional **untested** changes after that PASS improve deterministic factory-context reporting, preserve its text during optional AI handoff, omit verifier-FAIL plan costs from AI facts, and add offline simulated provider-429 failure tests. Rerun the full tests and updated browser smoke before calling those changes ready.

## Post-fix static packaging test — 20 October 2026

Windows CMD output confirms `node --test ops/demo-manual-static.test.cjs`: **2/2 passed**. The native MANUAL option exists and the static build includes `demo-interactive-gantt.js`. Totals currently verified by user-provided outputs: **12 targeted JavaScript tests (10+2), 248 Python tests, 35 extended local browser checks**. No cloud deployment was conducted and live AI completion remains unverified. The archival readiness JSON and older below-section warnings concern prior test runs.

## Post-fix local regression record — 20 October 2026

The user ran in Windows CMD (the same outputs were pasted repeatedly, not distinct test cases):
- `node --test ops/demo-interactive-gantt.test.cjs ops/demo-view-model.test.cjs`: **10/10 pass; 0 failures**.
- `.\\.venv\\Scripts\\python.exe -m unittest discover -s backend/tests -q`: **248/248 pass**, nonfatal Starlette/httpx deprecation warning.
- Extended Edge browser smoke (reported separately): **35/35 pass, 0 JavaScript exceptions**.

The local pointer MANUAL workflow is evidenced through verifier selection, native/shared hash consistency, export, undo/reset, and mobile overflow. Do not attribute that to live AI success, production readiness, or measured factory ROI. Latest static build regression `ops/demo-manual-static.test.cjs` has not been reported passing.

## Current local browser gate — 20 October 2026

After native MANUAL selector, panel-visibility and publication-recovery fixes, the user ran the **extended** `ops/demo-studio-smoke.py` in Windows CMD against the local server: **35/35 browser checks passed; zero uncaught JavaScript exceptions**. This includes real browser pointer drag, MANUAL verifier and export, hash synchronization, undo/reset, and mobile overflow checks. This supersedes the prior pointer-crash observation and the historical pre-fix browser gate below. The run did not invoke live AI, confirm real touch dragging, or exercise factory deployment. Separate latest static build and full-suite checks are not confirmed by this output.

## Outstanding gates

1. **Live AI narrative remains unproven** using the configured free Gemma provider (historically 429); a deterministic engine memo is available, but is not an LLM response.
2. **External source is still incomplete for a whole-plant rollout**: 167 assignments lack known mode IDs, units are not established, product/release/due/workforce chains are absent.
3. **Generic dual independent/coupled modes, real multi-industry production readiness, ERP integration and measured plant outcomes** are not complete in this specific AISC walkthrough.
4. **Remaining terminal coverage:** the extended local Edge smoke now passes all 35 checks through Windows CMD. The CodexBridge terminal still cannot reliably launch Windows Node/Python checks; the latest static-build tests and complete post-fix Python/JS regression suite should be run separately in **Windows PowerShell**. The archival readiness JSON contains pre-fix counts (245 Python, 45 JS) and must not be misread as this run:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -q
node --test ops/demo-view-model.test.cjs
node --check demo-view-model.js
node --check demo-studio.js
.\.venv\Scripts\python.exe ops/run-demo.py
```

In a second terminal with server running:

```powershell
.\.venv\Scripts\python.exe ops/demo-studio-smoke.py
```

Only mark presentation ready after the fresh tests, smoke screenshot review and a successful, correctly labeled AI result **or** explicit AI-unavailable fallback.
