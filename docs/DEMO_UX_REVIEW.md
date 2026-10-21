# Demo UX: critique, onboarding, motion and layout

21 October 2026. Target: `index.html` and the existing local EnergyShift demo.

## Critique baseline

Two independent assessments inspected source and fresh desktop/mobile browser pages. Assessment A reviewed design without detector evidence; Assessment B ran the detector and collected browser measurements. The baseline Nielsen score was **26/40**, with first-use hierarchy, editing consistency and guidance as the weakest areas. This is a baseline score, not a new score for the implemented changes.

The full critique is archived in `.impeccable/critique/2026-10-21T01-33-31Z__index-html.md`. The detector returned 94 candidates, largely contrast and small text. Its contrast counts combine some incompatible light/dark theme values and are not confirmed visible failure totals. App CSP prevented the detector script from executing in the browser, so there was no usable overlay. The temporary detector server and assessment browsers were stopped; the application backend stayed running.

## Implemented direction

The primary route is now **run a sample, understand the recommendation, inspect the schedule, verify, export**. The sample is a real engine run on the existing synthetic fixture, with no AI request required.

- Optional first-use guidance leads with a sample action and an own-data action. It can be collapsed, reopened, and remembers its open/closed state in local storage.
- First visit no longer claims that the user changed inputs and invalidated a report. Genuine report invalidation retains its own message.
- Advanced scenario controls and repeated destination links are disclosures. Source table/filter controls appear after an audit has loaded data.
- A verified sample opens Overview, transfers keyboard focus to the view, and offers contextual next actions after the recommendation.
- The verified MANUAL editor remains the primary Gantt task. The existing B0/B1/B2 comparison and source schedule editor are separately disclosed, with their save/recalculation behavior explained. Choosing a native Gantt plan opens that disclosure.
- The slot form shows a corresponding clock time, or minutes from the beginning of a textile experiment, using the active report's time basis.
- Solver-domain detail is available in a rationale disclosure. The synthetic provenance, cost-scope caveats, verification status and economic decision remain visible and unchanged.
- Selected functional labels were enlarged, and desktop/mobile grouping was adjusted within the existing industrial visual identity.

## Motion

The focal sequence is the arrival of a newly verified sample decision. Normal preference uses a bounded 360ms reveal of the recommendation; reduced motion uses 100ms opacity feedback without a spatial reveal. The default content remains visible if animation is unavailable. Evidence values, cost digits and pointer-drag geometry are not animated.

No motion dependency was added. Repeating the sample cancels an earlier result animation before starting the next one.

## Follow-up Impeccable legibility pass — 21 October 2026

This pass **preserves the earlier onboarding, layout, reduced-motion and source-editor changes** rather than replacing them. The shared Codex session URL was not readable in this execution environment, so implementation was based on the current local git diff, PRODUCT.md, this review, the retained critique, and the live browser walkthrough.

- Raised undersized **functional** text to at least 12px where relevant: schedule table headers, manual scheduling status/counts, verification form labels, scheduler conflict warnings, editor footnotes and Gantt legends. Decorative/dense SVG and quantitative chart elements were deliberately not scaled blindly.
- Enlarged mobile bottom-navigation labels to 12px, maintained 48px-or-larger target height and added visible keyboard-focus outlines on mobile/bottom and rail-navigation controls.
- Increased light-theme active mobile navigation text contrast using the established stronger blue (`#0369a1`). Replaced low-contrast dark-theme conflict-warning text with amber (`#fbbf24`), preserving warning semantics without relying on color alone.
- Tests verified computed mobile navigation text and target height, the active light-theme navigation color, and lack of new mobile horizontal overflow. Fresh **390px mobile screenshot** confirms the primary sample actions and bottom-navigation labels remain visible and not clipped.
- Final suite: **309/309 Python**, **63/63 Node**, **104/104 isolated Brave desktop/mobile checks**, **zero JavaScript exceptions**. The two new browser checks are specific to readability; this is not a measured user-study improvement or a full WCAG audit.

The original 26/40 critique score remains a **historical baseline**, not a rescored outcome. Color-contrast detector candidates outside the focused UI controls remain unconfirmed and require a dedicated theme-by-theme audit rather than bulk changes.

## Verification

- Syntax checks passed for the changed JavaScript files.
- All **63 Node tests** passed.
- The expanded local browser suite passed **102 checks**, including the sample route, its failure path, guide persistence across reload, own-data navigation, keyboard focus/activation, normal/reduced-motion branches, and the existing pointer/touch/export/undo/reset and Factory Lab workflows.
- Fresh desktop and mobile captures verified that the first sample action is visible without scrolling. Next actions follow the recommendation in DOM order; the advanced Gantt comparison does not compete with the primary editor.
- Final layout scan retained six candidates: three cramped-padding and three nested-card reports. They refer to existing full-width table/Gantt wrappers and grouped nested input/editor regions. Table cells provide their own insets, and scroll wrappers intentionally avoid a second inset. The source-editor disclosure groups an alternate task rather than a new decorative card. These inherited structures were retained instead of treating all six reports as proven visual defects.

Evidence is local and ignored by Git: `work/demo-evidence/browser-checks.json`, `impeccable-final-smoke.log`, `impeccable-layout-final.json`, `onboarding-*.png`, and `tab-*-desktop.png`.

This verifies local prototype behavior with emulated mobile/touch and reduced-motion preferences. It is not a physical-device test, live AI availability test, or measured usability study with production planners. Broader legacy contrast and typography candidates remain available for a separate focused audit.
