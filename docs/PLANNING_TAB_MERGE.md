# Integrated schedule, energy and review tabs

The current GitHub application remains the calculation and input foundation. Tabs 2–4 use the earlier standalone demo's planning layout, connected to the current backend.

## Tab 2: draft scheduling

- Jobs appear above the Gantt. Edit a row or timeline bar, or add/delete a job inline.
- Drag a timeline bar horizontally to move its start in 30-minute steps, or use Alt+Left/Right. Dropping saves a draft and invalidates previous results; a normal click still opens the inline editor. Dragging stays within the declared horizon, including setup and duration.
- B1/B2 and comparison remain selectable when only a draft exists. Selecting them runs analysis first, then displays the requested plan. While editing an unsaved form, save or close it before switching plans or dragging.
- Editing B1/B2 starts a new B0 input draft from that schedule. It does not mutate an already verified optimizer result.
- The dashed preview shows unsaved or unverified jobs. Preliminary warnings cover machine/setup overlap, horizon bounds and release/deadline limits. The backend remains responsible for full verification, including molds and availability.
- Saving updates the canonical input model and the input workspace. It clears charts, costs, recommendations, measurement confirmations and human review acknowledgments. Excluded-cost reviews become UNKNOWN until reviewed again.
- **Tính lại lịch & chi phí** analyzes that input and generates fresh B0/B1/B2 results. Invalid schedules cannot acquire a verified result through manual acknowledgment.
- Setup is derived from declared machine/mold/family rules, not a free per-job field. Existing quantities remain editable through the input workspace. Processing duration changes require an explicit lot confirmation and reference.
- The demo's eight-job limit applies to inline additions. New jobs require machine, mold, family, quantity, duration, power and timing information.
- Inline drafts are saved in browser localStorage when available and restored explicitly. Human review is kept only for the current analysis session.

## Tab 3: original chart interaction with calculated data

- Retains the blue baseline/green selected-plan chart, cost/power toggle, tariff background, shared vertical cursor, highlighted points and moving tooltip.
- Hover or keyboard focus shows the interval, applicable tariff(s), both available plan values and their signed difference. A KEEP decision correctly displays only B0.
- The chart uses backend ledger-derived hourly values, including a partial last hour. It follows the actual selected plan and declared horizon.
- Hourly detail/CSV export and meter reconciliation remain available below the chart as expandable sections.
- Power values describe modeled running load. Transformer safety stays undetermined without real capacity and background-load information.

## Tab 4: automatic verification and human review

- Each constraint card displays backend PASS/FAIL/unknown independently from its human review checkbox.
- Acknowledgments are scoped to input hash and plan. Switching tabs/plans preserves them; any input invalidation clears them.
- Additional verifier issue types appear in a separate card so issues cannot disappear from the review.
- Expandable evidence retains setup, deadlines and physical mold reservations. Human acknowledgment never overrides a failed or unknown automatic result.

## Validation

Verified with the existing seven view-contract tests and a real Edge/API walkthrough of fixture loading, analysis, inline preview/save/recalculation, invalidation, add/delete, the eight-job limit, backend contract validation, plan-specific review, pointer tooltip and mobile overflow. Desktop and mobile captures are under `work/ui-qa/merged-tabs/` (local artifacts).
