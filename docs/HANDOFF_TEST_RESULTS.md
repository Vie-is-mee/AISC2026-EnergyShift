# EnergyShift: test investigation and continuation handoff

Date: 2026-10-20, Asia/Bangkok. Workspace: `D:\UI Demo - GitHub main`.

## Request and outcome

The user runs ChatGPT web through CodexBridge to control VS Code. They requested local execution of checks that bridge could not perform, plus investigation of the missing browser gate for pointer dragging, MANUAL synchronization, undo/reset, exported evidence, and native views.

JavaScript syntax and the requested unit tests pass. The original browser smoke passed after restarting an outdated backend. An extended smoke using actual Chromium mouse input reproduces a product bug on the first valid drag. The complete interaction gate is therefore **FAIL**, and subsequent undo/reset/export assertions are currently blocked.

No product fixes were made during this investigation. The browser smoke was extended to expose the bug and cover the remaining workflow once fixed.

## Commands and observed results

Run each command separately in PowerShell from the workspace root:

```powershell
node --check demo-interactive-gantt.js
node --check demo-workspace.js
node --test ops/demo-interactive-gantt.test.cjs ops/demo-view-model.test.cjs
.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -q
.\.venv\Scripts\python.exe ops/demo-studio-smoke.py
```

The user's pasted smoke command had two commands joined without a separator. Use the single command above.

| Check | Actual result |
| --- | --- |
| `node --check demo-interactive-gantt.js` | PASS, exit 0 |
| `node --check demo-workspace.js` | PASS, exit 0 |
| Requested two Node test files | PASS: 10 tests, 0 failures |
| Backend discovery | PASS: 248 tests in 18.227 seconds |
| Original browser smoke after restart | PASS: 16 checks, 0 uncaught JavaScript exceptions |
| Extended real pointer smoke | FAIL: MANUAL publication crashes in native verifier rendering |

Backend tests emitted a nonfatal `StarletteDeprecationWarning` about `httpx` and `httpx2`. This did not fail tests.

The original 16 browser checks covered source counts, source mapping and unit consent, textile charts and export, mapping invalidation, slide costs, mounted/selectable editor bars, native Gantt/verifier navigation, AI consent, and mobile overflow. They did **not** exercise actual pointer dragging or MANUAL history.

## Initial runtime problem: outdated backend

The running Uvicorn process predated the new Gantt routes. The first browser run failed `factory_context_and_manual_editor_mounted`. Current source already had `/demo-interactive-gantt.js`, but the old process did not serve the current router.

Stopped verified process 49948 and restarted with:

```powershell
.\.venv\Scripts\python.exe ops/run-demo.py
```

New Uvicorn process reported PID 34664, listening at `http://127.0.0.1:8000`. It was left running. Recheck PID and command line before any later restart; this PID is a historical observation.

After restart, the original smoke passed all 16 checks.

## Confirmed bug: MANUAL publication crashes

Reproduction added to `ops/demo-studio-smoke.py`:

1. Load `http://127.0.0.1:8000/?demo=1` in isolated headless Edge.
2. Audit sources and compute the textile experiment with explicit unit choices.
3. Run the synthetic slide replay. B1 is selected.
4. Use CDP `Input.dispatchMouseEvent` for mouse move, press, eight movement steps, and release. This exercises browser pointer capture and the application's actual pointer handlers.
5. Drag job J4 from B1 slot 44 to slot 16 on M2. Each slot is 30 minutes: 22:00 to 08:00.
6. The review-only ghost appears. The server accepts the draft and returns an updated MANUAL report; the PASS branch calls `DemoWorkspace.publishManual()`.
7. Native report hydration throws before the shared scene is committed.

Observed error stack:

```text
TypeError: Cannot read properties of undefined (reading 'verification')
    at renderValidation (http://127.0.0.1:8000/app.js:1554:35)
    at renderReport (http://127.0.0.1:8000/app.js:384:3)
    at renderReport (<anonymous>:3:60)
    at activate (http://127.0.0.1:8000/demo-workspace.js:138:139)
    at publish (http://127.0.0.1:8000/demo-workspace.js:141:152)
    at Object.publishManual (http://127.0.0.1:8000/demo-workspace.js:171:370)
    at http://127.0.0.1:8000/demo-interactive-gantt.js:308:28
    at async action (http://127.0.0.1:8000/demo-interactive-gantt.js:249:13)
```

The anonymous `renderReport` frame is a smoke-only wrapper that records the original exception stack and rethrows. It does not manufacture MANUAL state or call the scheduling API directly.

Root cause:

- `index.html`, around line 1287: `validationPlanSelect` declares only B0/B1/B2 options.
- `app.js:362`: `renderReport()` sets its value to `chosen.toLowerCase()`, which becomes `manual`.
- An HTML select with no matching option has an empty value.
- `app.js:1553-1554`: `renderValidation()` reads that value and dereferences `currentReport.plans[code].verification` without checking the plan exists.
- `demo-workspace.js:138`: hydration calls native `renderReport()` before assigning the new shared `scene`. The exception leaves native `currentReport` partly updated while the shared scene remains on the old report.

The UI catches this error inside the editor action. Consequently, zero `Runtime.exceptionThrown` events alone would incorrectly suggest success. The extended smoke captures the caught render error too.

Recommended fix: make the native verifier selector support every available report plan, including MANUAL, with a valid selection fallback. Ensure report publication cannot leave native and shared state on different hashes if any renderer fails. Audit other native selectors and risk calculations for assumptions that only B0/B1/B2 exist.

## Additional findings from source inspection

These are distinct from the reproduced runtime failure:

1. **MANUAL panels are hidden in native mode.** `demo-studio.css:97` sets `.demo-native-view { display: none; }`; line 99 only reveals those mounts in textile mode. `demo-workspace.js:84-116` appends native MANUAL overview, Gantt, and verifier content to those same mounts. Once publication succeeds, add a specific native MANUAL display rule or mount that content in visible native panels. The extended smoke includes a computed-style visibility assertion after successful publication; that assertion is currently unreachable because the earlier crash stops execution.
2. **Static deployment omits the editor script.** `index.html:25` loads `/demo-interactive-gantt.js`, but `ops/build-static.cjs:5` does not include it in `PUBLIC_FILES`. The FastAPI local route exists; the static artifact would omit the file. Add the asset to the allowlist and verify the resulting artifact. Public deployment was not performed.

## Smoke changes and evidence

Modified only `ops/demo-studio-smoke.py` during this investigation. It now includes:

- Real browser mouse dragging with a review-only preview assertion.
- J4 slot 16 MANUAL verification and native/shared hash checks.
- MANUAL content assertions for Gantt, verifier and EDA, plus verifier visibility.
- Downloaded active evidence assertions for hash, selected MANUAL plan, PASS, human review requirement, and J4 start time.
- Undo restoration, two consecutive moves, reset restoration, and stale MANUAL panel cleanup.
- Failure JSON and screenshot capture, replacing stale successful `browser-checks.json` after a failed run.
- Original caught rendering error stack capture.

**Coverage limit:** the first real drag reaches the publication crash. MANUAL export, undo, reset, and later mobile checks in the extended run have not yet been reached. Their assertions are written, but cannot be reported as passed. Current pointer coverage uses the native synthetic scenario, mouse input, and the same machine. Textile dragging, cross-machine moves, touch input, cancellation, and rejected-drop state preservation still need separate coverage if required.

Evidence files are local and ignored by Git:

```text
work/demo-evidence/browser-pointer-run.log
work/demo-evidence/browser-checks.json
work/demo-evidence/studio-failure.png
```

Existing evidence exports or screenshots may be from earlier runs. Use the current failure JSON and log to assess this run.

## Continuation steps for ChatGPT web

1. Fix the native verifier's MANUAL selection and safe plan lookup.
2. Ensure publication updates the native report, shared scene, editor history and active evidence consistently.
3. Reveal native MANUAL panels and add the editor script to the static build allowlist.
4. Rerun the commands above. The extended smoke must complete through export, undo/reset, native rendering and mobile checks.
5. Investigate any next failure from actual output. Do not weaken assertions to force a pass.
6. Validate exported MANUAL cost and schedule against the server report, and preserve the explicit human review requirement.
7. Refresh demo documentation and readiness evidence only after the browser gate passes.

## Other session context and constraints

- User wants demo working throughout all six existing tabs and aligned with `C:\Users\MODERN15\Downloads\AISC26-0080-Axiom_Slide.pdf`.
- Existing guides: `docs/AISC_DEMO.md`, `docs/AISC_SLIDE_ALIGNMENT.md`, and `docs/evaluation/aisc_demo_readiness_20261020.json`. Their older test totals may be stale.
- Actual source audit is 275 assignments, 108 known modes, 91 compatible rows; exclusions are 167 unknown modes plus 17 incompatible machines. The source textile subset and synthetic slide scenario have different units and assumptions.
- Synthetic slide replay costs are B0 1,485,222 VND, B1 1,352,304 VND, B2 944,598 VND, selected B1; B1 saving is 132,918 VND. Its energy is 464 kWh per plan, not slide 6's 25.72 kWh. Preserve accurate computed values.
- Earlier live HTTP 429 diagnosis confirmed Google AI Studio's upstream shared free pool limit, independent of the account's remaining OpenRouter quota. Metadata reported `upstream_provider_shared_pool`. No live AI calls were made during this investigation.
- Credentials already exist in ignored `.env`. Never copy credentials into this document, browser assets, test logs, or Git. `ops/run-demo.py` loads local settings.
- Many product files were already modified or untracked before this investigation. Preserve them. Existing deletions under `work/aisc_round2` and `work/aisc_round2_evidence.py` are user changes; do not restore them.
- No commit, push, public deployment, or external message was performed.
- User requests the `caveman` skill for concise chat responses. Skill location: `C:\Users\MODERN15\.codex\skills\caveman\SKILL.md`.
