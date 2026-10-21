# Validation of ChatGPT's demo changes

Date: 2026-10-20. Workspace: `D:\UI Demo - GitHub main`.

## Verdict

The previous MANUAL publication failure is fixed. The original extended browser workflow now completes successfully, including actual mouse dragging, verified MANUAL export, undo/reset, native views, emulated touch, and keyboard selection.

One verifier edge case remains reproducibly broken: selecting MANUAL when the current report has no MANUAL plan throws a TypeError. The additional validation gate exits with status 1 for this finding. The demo is therefore not fully clear of failures.

No product code was changed during this validation. Added `ops/demo-extra-probes.py` and this report.

## Executed checks

| Check | Result |
| --- | --- |
| `node --check demo-interactive-gantt.js` | PASS |
| `node --check demo-workspace.js` | PASS |
| `node --check app.js` | PASS |
| All `ops/*.test.cjs` using Node's test runner | 58 passed; 0 failed |
| Backend unittest discovery | 251 passed; 0 failed; 23.906 seconds |
| `ops/demo-studio-smoke.py` | 50 checks passed; 0 uncaught JavaScript exceptions |
| Additional six textile tab visibility/content checks | 6 passed |
| Native MANUAL decision memo | PASS |
| Forced render failure and report rollback | PASS |
| Select MANUAL without a draft | FAIL |
| `git diff --check` | PASS; informational LF/CRLF warning for index.html |

Backend tests still emit a nonfatal Starlette deprecation warning concerning `httpx`/`httpx2`.

## Confirmed fixes and behavior

- The verifier selects MANUAL successfully after a draft exists.
- Native MANUAL verifier content is visible through the new CSS rule.
- The static builder includes `demo-interactive-gantt.js`; tests build a real temporary artifact and compare its bytes with the source file.
- Mouse dragging J4 from slot 44 to slot 16 produces a server-verified MANUAL report and synchronizes native/shared report hashes.
- Export includes the correct MANUAL hash, schedule, PASS verification, and required human review.
- Undo restores the original report. Multiple moves followed by reset restore the complete original shared report and remove stale MANUAL panels.
- A cross-machine form move uses the destination machine's duration: J4 on M3 lasts 135 minutes, ending at slot 44.5 when started at slot 40.
- A rejected cross-machine collision preserves the original report and does not publish a draft cost.
- Context reporting flags staffing/inventory concerns without adding unsupported engine constraints. AI handoff preserves that report and does not call a provider without consent.
- At a 390px viewport, the tested mobile source view has no page overflow. Emulated touch cancel preserves the report; touch release publishes a verified draft; touch undo restores the original.
- Actual Chromium Enter and Space input select job bars, preserve keyboard focus, and do not publish a draft.
- All six textile mounts are visible and contain content when their tabs are activated: dispatch, overview, gantt, loadcurve, validation, sensitivity.
- The native MANUAL decision memo renders successfully.
- Injecting a one-shot failure into native rendering during publication restores both the native and shared report hashes.

## Remaining defect: MANUAL selector remains available without a plan

Severity: medium. It breaks a user-accessible verifier action, including after otherwise successful undo/reset.

Reproduction:

1. Run the synthetic slide replay and leave the original report active, or create a MANUAL draft and undo/reset it.
2. Open the verifier tab.
3. Select `MANUAL · Cần rà soát` in the plan dropdown.
4. The current report has only B0/B1/B2, but the static dropdown still permits MANUAL.

Observed error:

```text
TypeError: Cannot read properties of undefined (reading 'verification')
    at renderValidation (http://127.0.0.1:8000/app.js:1554:35)
```

The added browser probe assigns the real select value and calls the same `renderValidation` function registered as its change handler. The error is caught by the probe to preserve the rest of the walkthrough. Its separate summary records the failure and the probe runner exits 1.

Relevant source:

- `index.html`, around line 1293: MANUAL is always present in `validationPlanSelect`.
- `app.js:1553-1554`: the selected code is dereferenced without checking that `currentReport.plans[code]` exists.
- `app.js:2368`: the select's change handler is `renderValidation`.

Recommended correction: populate or enable verifier options from the current report's available plans, refresh them after undo/reset, and guard the renderer against an absent plan. Test both the initial replay and removal of an existing draft. Merely adding a static MANUAL option fixes publication but leaves this invalid selection possible.

## Evidence and commands

Local evidence, ignored by Git:

```text
work/demo-evidence/browser-checks.json
work/demo-evidence/browser-extra-checks.json
work/demo-evidence/extra-manual-probes.json
work/demo-evidence/extra-missing-manual-probe.json
work/demo-evidence/extra-probes-summary.json
work/demo-evidence/extra-probes-run.log
work/demo-evidence/EnergyShift-active-demo.json
work/demo-evidence/studio-manual-touch-emulated.png
```

`browser-extra-checks.json` reports the underlying smoke assertions. The overall extra-probe verdict, including caught failures, is in `extra-probes-summary.json`; consult that file before declaring the full validation passed.

Reproduce:

```powershell
node --check demo-interactive-gantt.js
node --check demo-workspace.js
node --check app.js
node --test (Get-ChildItem ops -Filter '*.test.cjs').FullName
.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -q
.\.venv\Scripts\python.exe ops/demo-studio-smoke.py
.\.venv\Scripts\python.exe ops/demo-extra-probes.py
```

The last command is expected to exit 1 until the absent-MANUAL selection is fixed. The extra runner layers probes on the current smoke harness, so run it again if that harness changes.

## Practical limits

This validation used local FastAPI and isolated headless Edge. Touch input was emulated, not tested on a physical device. Cross-machine movement was tested through the form; the actual pointer drag stayed on the same machine. Textile tabs were inspected for visibility/content; the real pointer publication/history path exercised the native synthetic scenario. No live AI request, remote deployment, or physical factory execution was performed. Existing source/slide provenance caveats still apply.

The older `docs/HANDOFF_TEST_RESULTS.md` describes the previous failing state. This report supersedes its validation verdict for the current code.
