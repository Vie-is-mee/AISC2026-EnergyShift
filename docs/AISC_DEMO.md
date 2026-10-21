# AISC presentation demo

Slide-by-slide evidence, unresolved claims and post-edit QA: [AISC_SLIDE_ALIGNMENT.md](AISC_SLIDE_ALIGNMENT.md).

Open `http://127.0.0.1:8000/?demo=1` or choose **Demo AISC · Bằng chứng** in the navigation.

## Run locally

```powershell
.\.venv\Scripts\python.exe ops/run-demo.py
```

Two source files must be present at the repository root:

- `Input_JSON_Schedule_Optimization.json`
- `Output_JSON_Schedule_Optimization.json`

`S-I-JSP.zip` is optional for the separate benchmark catalog. It contains 500 JSON instances in a different schema. Nothing is extracted, executed or merged into the textile pair. The archive README's energy unit is ambiguous and must be clarified before a benchmark conversion.


## New feature branch: factory-1 generic one-stage lab (2026-10-20; verified locally in Brave)

Independent from the historical demo-3 injection-mold fixture and textile isolation, a **generic-factory scheduling prototype** is now available behind `GET /api/factory/example`, `POST /api/factory/analyze`, and the new **Factory Lab** section of `/?demo=1`.

It accepts jobs with eligibility/duration/power per machine, calendars, tariffs, and baseline assignments **without adding fictional molds**. It uses two distinct search scopes: `FIXED_MACHINE` versus `JOINT_MACHINE_TIME`. B0 is verified and priced, B1 searches one job's change, and B2 applies multiple verified improving moves in a bounded local search. This is **not** an OR-Tools CP-SAT implementation, nor does it complete the user's longer-term two independent operational modes.

A required `setup_assumption=NO_SETUP_REQUIRED_CONFIRMED` and explicit `unsupported_constraints` field prevent the engine from silently treating complex process restrictions as enforced. Any nonempty unsupported constraints block cost/schedule output. Every modeled price is recalculated from run electricity on declared tariffs; no measured ROI claims.

New files: `backend/factory_core.py`, `backend/fixtures/factory_generic_demo.json`, `factory-lab.js`, `backend/tests/test_factory_core.py`, `ops/factory-lab.test.cjs`, `docs/FACTORY_LAB_V1.md`. Existing `backend/demo_routes.py`, `index.html`, `demo-studio.css`, `ops/build-static.cjs`, and `ops/demo-studio-smoke.py` were extended.

**Current local result (20 Oct 2026):** Git Bash-backed CodexBridge terminal now runs tests on Windows. The full Python suite passed **263/263**, targeted JS suite passed **16/16**, and the updated local **Brave** browser smoke passed **56/56**, with 0 JavaScript exceptions. The old demo-only `apiFetch` rejected `/api/factory/*` and blocked loading CNC example; `factory-lab.js` now uses a dedicated two-route allowlist, with a new JS regression. The smoke uses headless Brave with an isolated temporary profile and simulated mobile/touch input; neither physical phone use nor actual factory rollout is verified. See `docs/FACTORY_LAB_V1.md`.

## Browser gate confirmed and AI evidence hardening — 20 October 2026

**Latest user-confirmed baseline:** extended Edge smoke **47/47 checks PASS**, **0 JavaScript exceptions**, including native mouse drag, emulated touch cancel/drop/undo, keyboard Enter/Space selection with focus retention, verified cost/export, and desktop/mobile layout. The last separate full regressions were **249 Python** and **13 JavaScript** PASS. These counts describe different test sets.

**Changes made after that passing browser run — fresh verification required:**
- `demo-interactive-gantt.js`: context report now displays engineer next actions and states explicitly that heuristic context detection **did not add solver constraints** and that human approval is required. The AI handoff action is relabeled **Chuyển ngữ cảnh sang AI**, records status separately, and preserves the deterministic report; handoff alone does not call the provider.
- `ops/demo-studio-smoke.py`: adds three real browser checks: staffing/inventory signals and human-review caveats, unchanged scheduling hash after context analysis, and handoff without consent or a model call. Captures `work/demo-evidence/studio-context-desktop.png`.
- `backend/demo_ai.py`: evidence facts include modeled plan costs only for plans whose independent verifier status is PASS; invalid/unverified plans are omitted from AI cost facts.
- `backend/tests/test_demo_studio.py`: adds isolated regressions for unverified-cost filtering and mock OpenRouter HTTP 429 returning a failure **without** narrative. No live token or external request is used.

**Pending:** fresh `249+2=251` Python tests, `13` targeted JS tests, and approximately `47+3=50` Edge browser checks must pass before these latest edits count as verified. These totals are expected, not observed. Physical touch devices, successful live Gemma completion, real factory constraints, and screenshot-based visual inspection remain separate gates.

## Keyboard activation regression — 20 October 2026 (awaiting rerun)

After 249 Python, 13 Node and 38 prior browser checks passed, the new extended Chromium smoke passed its mouse, touch-cancel, touch-drop, native hash sync, and touch-undo checks. The subsequent `keyboard_selects_bar_without_publishing` check FAILED. This was a real failed browser gate: `work/demo-evidence/browser-checks.json` records the failed assertion and does not mark the run as passed.

Changes after that failure:
- `demo-interactive-gantt.js` now explicitly handles Enter and Space `keydown` on job-bar buttons (rather than relying solely on Chromium-synthesized click); prevents duplicate native activation and restores keyboard focus to the replacement bar after the Gantt redraw.
- `ops/demo-studio-smoke.py` now checks focus before keyboard dispatch, verifies Enter selects J5 and Space selects J6 without publishing a schedule or changing the hash, and retains focus after rerender. An event probe and `KEYBOARD_DIAGNOSTIC` are emitted if Enter fails, so the next failure can distinguish missing key events, selection issues, or focus loss.
- All prior tests and the touch checks are preserved; no backend scheduler or verifier changes were made.

**Validation pending:** rerun `.\\.venv\\Scripts\\python.exe ops/demo-studio-smoke.py` on local Windows. CodexBridge's terminal runner is still unusable due to its WSL shell launch. Do not claim this keyboard fix passed until the browser smoke reports `all_checks_pass: true`.

## Emulated touch and keyboard browser gate — 20 October 2026 (awaiting test execution)

Following the **confirmed 249 Python / 13 Node / 38 Edge check PASS** baseline, the existing `ops/demo-studio-smoke.py` was extended without weakening any previous assertions:

- Enable Chromium touch emulation at 390 px viewport, issue real `Input.dispatchTouchEvent` touchStart/move/cancel for J4, and confirm no MANUAL publication or ghost remains.
- Repeat touchStart/move/end from slot 44 to slot 40; require server-verified MANUAL PASS and native/shared hash parity; undo and confirm original hash restored.
- Issue Chromium `Input.dispatchKeyEvent` Enter on a focusable job bar; require job selection without changing/publishing the schedule.
- Capture `work/demo-evidence/studio-manual-desktop.png` and `work/demo-evidence/studio-manual-touch-emulated.png` for later UI review.
- `demo-studio.css`: switched Gantt track's final background shorthand to `background-color` so the existing time-slot stripe `background-image` is not inadvertently reset.

These are **new, unverified edits**; they do not change backend engine logic. A passing emulated touch gate will not prove behavior on physical iOS/Android devices. CC MCP command execution still fails in WSL; run `.\\.venv\\Scripts\\python.exe ops/demo-studio-smoke.py` in Windows CMD and inspect the screenshots. If it fails, preserve the failure log and fix the implementation/test according to real browser output rather than marking a false PASS.

## Cross-machine and rejection hardening — 20 October 2026 (changes awaiting fresh tests)

- In `demo-interactive-gantt.js`, destination machine profiles now determine job duration, snapped end time, ghost width, time-window validity, and editor maximum start slot. This fixes misleading previews when the same job takes 120 minutes on M2 but 135 minutes on M3. The frontend still never calls a preview PASS; the server owns verifier and cost output.
- A blank start slot is rejected before request submission. A publication exception also rolls back the local editor's undo history instead of recording a nonexistent published draft.
- `ops/demo-interactive-gantt.test.cjs`: new destination-specific duration, snapping, and horizon bounds regression.
- `backend/tests/test_demo_studio.py`: new native cross-machine PASS/repriced schedule and invalid collision FAIL/no-cost/no-mutation test.
- `ops/demo-studio-smoke.py`: extended with real server API path via form controls after the existing mouse drag tests; checks a J4 M2 → M3 move at slot 40 ends at 22:15 and an invalid M1 overlap does not publish MANUAL or alter baseline.
- The previous confirmed **248 Python / 12 JS / 35 Edge checks** apply **before these new edits**. Do not treat them as proof of this change. CodexBridge's local Windows shell still lacks usable command execution; rerun Windows tests and smoke, then inspect a current screenshot. AI was not called.

## Static deployment verification — 20 October 2026 (Windows CMD)

User ran `node --test ops/demo-manual-static.test.cjs` **after the MANUAL UI/static build fix**. Result: **2/2 PASS**, 0 failures, 0 skipped. These tests verify (1) the native MANUAL verifier option is present and (2) the actual drag editor file is copied into the static deployment artifact. The corresponding 10 targeted JS tests, 248 Python tests, and 35 extended browser smoke checks have also passed separately. This totals **12 distinct targeted JavaScript tests**, **248 Python tests**, **35 browser checks**; counts reflect different test categories rather than one combined suite. This is build packaging verification, not a live cloud deployment.

Live Gemma completion, actual touch interactions, independent production rollout, visual screenshot review, and real factory savings remain unverified.

## Latest regression verification — 20 October 2026 (Windows CMD)

Following the MANUAL publication fix, the user reran the tests in Windows CMD:
- `node --test ops/demo-interactive-gantt.test.cjs ops/demo-view-model.test.cjs`: **10/10 passed**, 0 failed, 0 skipped.
- `.\\.venv\\Scripts\\python.exe -m unittest discover -s backend/tests -q`: **248/248 passed** in 16.441 s, with a non-blocking Starlette/httpx deprecation warning.

Together with the post-fix Edge smoke below (**35/35 passed, zero JavaScript exceptions**), the pointer drag → MANUAL verification → native/shared rendering → export → undo/reset local demo path has current regression evidence. The user pasted the same two test results multiple times; they count as the same 10 tests and 248 tests, not extra cases.

**Still unconfirmed:** the newly added static-artifact regression test `node --test ops/demo-manual-static.test.cjs`; live AI provider completion; touch/cross-machine/rejected-drop browser coverage; manual visual screenshot inspection; production/factory deployment. The synthetic and isolated textile cases remain separate and do not establish measured factory savings.

## Latest browser verification — 20 October 2026 (Windows CMD)

The user ran `.\\.venv\\Scripts\\python.exe ops/demo-studio-smoke.py` after the MANUAL publication fix against the local Edge/localhost backend. **Result: `all_checks_pass: true`, 35 checks, zero JavaScript exceptions.** This supersedes the prior failed extended browser smoke result; the older failure remains documented below for traceability.

The passed checks include real Chromium pointer drag preview and MANUAL publication, native/shared hash synchronization, verifier selecting MANUAL, displayed MANUAL overview/Gantt/EDA/verification, visibility in native mode, matching exported cost and schedule evidence, undo, two successive moves and reset with stale panels removed, synthetic reference costs, external source audit/isolated mapping, and mobile page overflow checks. This is **local Edge desktop/mobile browser smoke**, not live touch-drag confirmation or a deployed production audit. AI consent gating passed, but **a live model completion was not attempted or verified in this run**.

Separate static-build tests (`node --test ops/demo-manual-static.test.cjs`) and post-fix full Python/JS suites were not included in the pasted run; do not mark them passed on the basis of browser smoke. Prior recorded results: 248 Python and 10 targeted Node tests passed before the latest fix. The historical readiness JSON remains an archival pre-fix record.

## Post-investigation fix candidate — 20 October 2026

The uploaded `HANDOFF_TEST_RESULTS.md` reports 10/10 JavaScript tests, 248/248 Python tests and 16/16 original browser checks passing *before* the extended pointer smoke. The new CDP pointer smoke reproduced a crash after the server accepted MANUAL: native `validationPlanSelect` had no `manual` option. The extended smoke **did not pass**.

Changes applied after that report:

- Added `manual` to the native verifier select in `index.html`.
- Exposed verified native MANUAL overview/Gantt/verifier evidence in `demo-studio.css` (only when content exists).
- Added the Gantt script to `ops/build-static.cjs` and `ops/demo-manual-static.test.cjs` to check the public artifact.
- Added failure rollback in `demo-workspace.js` so an exception during native publication restores the previous native/shared report.
- Extended `ops/demo-studio-smoke.py` to require the native verifier to select MANUAL and to match exported MANUAL costs against both active view and native report.

**Not yet verified:** the updated smoke, new static tests and latest frontend syntax. CodexBridge file edit/read works but its WSL-based command runner still returns exit 1 without Node/Python output. Run tests from Windows PowerShell, against the current backend process, before declaring readiness. Never mark historical passes as proof of this patch.

## 20 October 2026 — drag/drop implementation (post-handoff, not yet browser validated)

- Added Pointer Events drag/drop to `demo-interactive-gantt.js`, slot snapping, provisional machine eligibility/time overlap warnings, touch targeting, keyboard-compatible form, undo/reset history and server-only PASS/cost decisions.
- Added scrollable timeline and drop/ghost indicators in `demo-studio.css`.
- Added `ops/demo-interactive-gantt.test.cjs` for snapping, compatibility, overlap and provisional-status invariants.
- Native overview/Gantt/verifier additionally surface MANUAL evidence in `demo-workspace.js`. The native legacy widgets still primarily render B0/B1/B2; inspect integration carefully in Edge.
- CodexBridge file access was restored; its `task_verify` shell process still exits 1 with no useful program stdout, so the newly added JS tests, browser automation, and the complete Python suite **are not newly verified**. Prior confirmed results (before this edit): 248 Python and 7 JS passing.
- On Windows from the repository folder run `node --check demo-interactive-gantt.js`, `node --check demo-workspace.js`, `node --test ops/demo-interactive-gantt.test.cjs ops/demo-view-model.test.cjs`, and `.\\.venv\\Scripts\\python.exe -m unittest discover -s backend/tests -q`.
- Check `http://127.0.0.1:8000/?demo=1` before launching a second server; port 8000 might already be occupied. Use `netstat -ano | findstr :8000` first. Then run `.\\.venv\\Scripts\\python.exe ops/demo-studio-smoke.py` and manually exercise real mouse and touch dragging plus export, follow-up MANUAL edits, and undo/reset. The existing smoke script does not yet automate physical pointer dragging.

## Context report, interactive Gantt and manual verifier

The shared tab workspace now has **Phân tích bối cảnh & lập báo cáo** and an interactive Gantt with selectable job bars. Select B0/B1/B2, select a job (by bar or drop-down), change its starting slot and compatible machine where permitted, and choose **Thử dịch & kiểm chứng**. The backend reconstructs the draft from server-registered evidence, independently verifies all declared constraints and only returns costs after PASS. Successful previews appear as a separate MANUAL scenario in the shared views, with decision REVIEW_REQUIRED/MEASURE_FIRST; they never overwrite B0 or approve production. Invalid drafts show issues without costs. The current editor supports pointer drag-and-drop with time-slot snapping and a keyboard-accessible select-and-enter alternative; all proposals require server verification. The context textarea generates a deterministic report; supported constraint detection is heuristic and does not add physical constraints. Use the explicit AI consent controls for provider-based explanations; errors/rate limits must not be presented as a successful AI completion.

## Presentation sequence

1. **Nguồn & làm sạch:** read the source pair. The supplied version has 275 assignments, 108 with a known input mode, 91 compatible with the assigned machine. Exclusions are 167 missing modes and 17 additional incompatible assignments. Each row retains its source JSON pointer. These are compatibility counts, not a complete schedule validation.
2. **Thử nghiệm ngành dệt:** select at most eight compatible rows. The default selection is the earliest eight on the machine with most compatible candidates, with stable machine/row tie breaking. Explicitly choose minutes per slot, W/kW, price per Wh/kWh, currency label, move cost and optional solar interpretation. No default unit is silently assumed. `SOURCE` is an experiment label, not an exchange conversion. Approval records the mapping and boundary assumptions in the manifest.
3. **Kịch bản slide:** reset and run the existing, separate eight-job/three-machine SYNTHETIC injection-molding case. Expected reference values: B0 1,485,222 VND; B1 1,352,304 VND; B2 944,598 VND with the bounded 12-neighborhood search. B1 moves J4 on M2 from 08:00 to 22:00. Search is time bounded, so B2 may return a different verified incumbent on another machine/load. Show the current report, not a hardcoded number.
4. **AI & báo cáo:** choose the evidence scenario, enter the context, consent to transmission and request context interpretation or a result explanation. Export the evidence package after reviewing the narrative.

The presentation button reduces the navigation frame. Escape exits presentation mode. The synthetic buttons open the application's existing Gantt, verifier and decision views using the same server-generated input/report.

## Scope of textile optimization

The textile engine is a separate `textile-demo-1` experiment, not a conversion to the mold-specific `demo-3` model.

- Full per-operation power profiles are integrated against the chosen tariff units and step duration.
- Machine assignment is fixed to the compatible source machine. Every integer start slot is a candidate.
- B0 is the original start schedule for selected rows. An invalid B0 blocks costs and optimization.
- B1 exhaustively tests one operation's start at a time against B0.
- B2 coordinates starts with CP-SAT, fixed machines and a six-second budget. A solver incumbent is accepted only after independent verification and ledger recalculation. If no cheaper verified incumbent is found, it retains B1. Rounding in the solver objective is disclosed; exported costs are recalculated from the original numeric profiles.
- Five independent verification groups cover job coverage, machine overlaps, time boundaries, selected task-class precedence and selected task-class collisions.
- Order is explicitly interpreted conservatively: all selected first-task operations finish before selected second-task operations. Collision prevents selected task classes from overlapping on any machine. These assumptions are visible before approval and in the manifest.
- Solar, when enabled, offsets aggregate selected-operation consumption per slot. It does not supply excluded operations and has no storage or export revenue. Load, grid, solar and cost series are exported.
- Releases of zero and deadlines at the source horizon are experimental boundaries. The source schedule does not identify complete product chains for every assignment. Unselected operations, true customer deadlines, labor, inventory, molds, product completeness and factory ROI are outside the experiment.

All external-subset decisions remain `REVIEW_REQUIRED`; a low isolated cost does not authorize changing a factory schedule. Source files are never overwritten. Source hashes, row pointers, transformations and approvals accompany the report. Editing a selection or mapping invalidates its displayed report and AI explanation; source changes invalidate the old mapping on the server.

## AI configuration and request budget

Backend-only `.env`:

```dotenv
OPENROUTER_API_KEY=<your-local-key>
OPENROUTER_MODEL=google/gemma-4-26b-a4b-it:free
```

Use `ops/run-demo.py` for this local presentation. It explicitly loads these local values over inherited OpenRouter environment variables, which may contain a different account's old credentials. Restart the launcher after changing credentials. The ordinary deployment loader retains environment-variable precedence.

The presentation assistant pins this free model. It has no paid fallback or automatic retries. It permits one in-flight presentation AI request, three seconds between new calls, and 60 new calls per server process. Source cleaning, optimization, verification, charts and exports use zero model requests. Existing intake/CSV routes have their own service limits; the 60-call presentation counter is not an account-wide OpenRouter counter.

Validated responses are cached locally under ignored `work/demo-evidence/ai/`, keyed by model, prompt version, evidence and question. Replays are explicitly labeled as cached API responses. They are not fabricated offline answers. Changes in evidence, question or prompt use a new cache key. Failed/mismatched responses are not cached. Restarting the server resets the in-memory request budget; provider/account quotas still apply.

AI receives server-generated facts, scope and context, not API credentials or the ZIP. It cannot submit replacement facts or modify schedules. A strict local narrative schema checks the returned fact object exactly. This does not prove every sentence of prose; human review remains required. Cached/generated evidence contains no credentials.

## Slide corrections

- Slide 5: use actual exclusion counts 167 and 17; retain source audit evidence for the 275 → 108 → 91 funnel.
- Slide 6: charts belong to a specific scenario. Do not attach textile energy results to synthetic VND savings. Units and source subset selection must be documented before quoting energy values.
- Slides 9 and 12: identify live versus cached AI output; AI interprets server facts and never approves a plan.
- Slide 11: replace the 128/128 screenshot with the actual eight-job verifier result.
- Slides 10–12: the injection-molding costs and J4 move are SYNTHETIC. The external textile experiment has its own results and currency.

## Evidence and validation

The downloaded JSON package includes the source audit, source hashes, selected row manifest, approved units, assumptions, B0/B1/B2 schedules, verifier results, tariff/load/grid/solar/cost series, solver status, synthetic reference report and reviewed AI responses available in the browser session.

New regression checks live in `backend/tests/test_demo_studio.py`. They cover source lineage and stale hashes, rejected unknown modes, explicit confirmation, independent feasibility checks, baseline failure, optimizer/ledger agreement, solar accounting, AI consent, fabricated evidence rejection and validated cache replay. The existing demo-3 and CSV suites remain applicable.

### Local verification, 20 October 2026

- Python and JavaScript regression suites pass. The Edge walkthrough exercises the real source funnel, unit approval gate, selected textile experiment, report invalidation, actual evidence download, synthetic result replay, existing Gantt/verifier links, AI consent and desktop/mobile sizing without JavaScript exceptions.
- Local artifacts and screenshots are under ignored `work/demo-evidence/`; `browser-checks.json` records the walkthrough. A downloaded `EnergyShift-AISC-evidence.json` records an explicitly assumed 5-minute/W/per-Wh experiment, not independently established source units.
- The supplied OpenRouter key passed account authentication and reported a 1,000-request free daily allowance remaining. Two explicit calls to the Gemma free model returned HTTP 429 before completion. This confirms neither a successful live narrative nor a warmed narrative cache. No paid model was called. The presentation UI reports the provider failure and retains independently computed engine evidence.
- Use the launch command above: an inherited different API key was present in the environment. The launcher ensures the local presentation uses the intended `.env` credentials.
