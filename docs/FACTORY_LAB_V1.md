# Factory Lab / factory-1 + factory-2 — discrete CP-SAT, routing and business objectives

**Status (20 October 2026):** local experimental implementation, separate from mold-specific demo-3. Verified against the freshly restarted backend: **309/309 Python tests, 18/18 targeted Node tests, 82/82 headless Brave desktop/mobile checks, 0 JavaScript exceptions**. CSV/XLSX synthetic template round-trips and local review/accept/reject workflows verified. Mobile input is emulated, not a physical-device test.. Synthetic fixtures only; mobile input is emulated, not a physical-device test.

## Input: strict single-stage `factory-1`

The CNC fixture `backend/fixtures/factory_generic_demo.json` remains backward-compatible. The synthetic packaging fixture `backend/fixtures/factory_packaging_demo.json` demonstrates finish-to-start dependencies and shared crew capacity. The new synthetic fixture `backend/fixtures/factory_changeover_demo.json` demonstrates explicit family transitions, reserved setup time, fixed transition fees and a shared changeover crew. These are **not measured production data**. No `mold_id` is required.

Required top-level fields remain: `schema_version`, `metadata`, `horizon`, `step_minutes`, `machines`, `jobs`, `current_schedule`, `tariffs`, `tariff_reference`, `setup_assumption`, and `unsupported_constraints`. `setup_assumption` must be either `NO_SETUP_REQUIRED_CONFIRMED` (legacy, forbids setup policies) or `DECLARED_CHANGEOVERS` (requires every job's `setup_family` and every machine's complete `changeovers` policy). Any nonempty `unsupported_constraints` blocks all evidence.

Optional hard constraint fields (absent means not declared, **not** AI-inferred):

- `precedence: [{"before":"FORM","after":"SEAL","min_lag_minutes":0}]` — finish-to-start between *jobs*, not an arbitrary multistage routing engine. Edges must refer to known jobs, be unique, and form a DAG.
- `resources: [{"id":"CREW","capacity":1,"available":[{"start":"2026-10-19T08:00:00+07:00","end":"2026-10-19T12:00:00+07:00"}]}]` — nonpreemptive renewable pooled resource, bounded integer capacity and available windows. No labor identity, shift/overtime cost, skill matrix, stock depletion or inventory is inferred.
- Each job may specify `demands: {"CREW":1}`, where the resource must exist and the positive integer demand cannot exceed capacity.

The strict registry in `backend/factory_constraints.py` names `MACHINE_ELIGIBILITY`, `JOB_WINDOWS`, `MACHINE_CALENDAR`, `MACHINE_NO_OVERLAP`, `PRECEDENCE`, `RESOURCE_CAPACITY` and optional `SEQUENCE_CHANGEOVER`. Input semantic validation, CP-SAT compilation and an independent verifier implement these rules. Resource/setup intervals must fit within declared availability windows. Input B0 starts must align to the selected time grid; invalid baselines are not costed. Unregistered factory requirements belong in `unsupported_constraints` and block the run.

## Optional declared changeover contract

For `DECLARED_CHANGEOVERS`, every `jobs[]` entry must specify a stable `setup_family`, and every `machines[]` entry must have a complete `changeovers` matrix of every possible incoming family (including `initial_family`) to every family eligible on that machine:

```json
{
  "setup_assumption": "DECLARED_CHANGEOVERS",
  "machines": [{
    "id": "PACK-01",
    "available": [{"start": "2026-10-19T08:00:00+07:00", "end": "2026-10-19T12:00:00+07:00"}],
    "changeovers": {
      "initial_family": "FORM",
      "transitions": [{
        "from_family": "FORM", "to_family": "BOX",
        "duration_minutes": 30, "flat_cost_vnd": 7000,
        "reference": "synthetic-changeover-assumption",
        "demands": {"CREW": 1}
      }]
    }
  }]
}
```

The example is a **fragment**, not a complete input: the actual matrix also needs all other required pairs; the example file contains complete policies. Transitions must align to `step_minutes`, have declared evidence references and must not use unknown pools or workers. Zero-duration transitions cannot reserve a pool; any configured transition may still carry an explicitly declared fixed fee. Setup time is reserved **immediately before the successor job** in a single machine availability window, with optional crew calendar and Cumulative capacity checks. Initial setup occurs inside the horizon before the first job. The independent verifier reconstructs those same intervals from the final schedule. No unspecified setup energy consumption is inferred.

## Optimization — now OR-Tools CP-SAT

Both existing **search scopes** are preserved (separate from the business objective):

- `FIXED_MACHINE`: each job remains on its baseline machine.
- `JOINT_MACHINE_TIME`: jointly select eligible machines and discrete start times; per-machine job durations and kW remain binding.

`B0` is the input baseline, independently verified. `B1` uses CP-SAT with **at most one job changed** relative to B0. `B2` uses CP-SAT with all declared choices enabled. All plans are independently verified and repriced using per-job, per-tariff Decimal HALF_UP VND electricity ledger plus *declared* flat transition fees. The verifier reconstructs actual machine successor transitions, checks reserved setup intervals and crew use, and prices those transitions independently of solver arcs. Any solver/verifier cost or production-score disagreement blocks publication. For ENERGY and COMBINED, modeled cost is non-worsening. For PRODUCTION, the production completion score is non-worsening, but electricity/setup cost may increase. If the bounded solver returns no candidate, the preceding verified plan is retained.

CP-SAT creates one optional interval per job/machine/start, enforces exactly one assignment per job, machine NoOverlap, shared-resource Cumulative capacities and precedence. With changeovers, machine-specific `AddCircuit` successor arcs enforce the **actual adjacent** family transition; optional setup intervals reserve machine time immediately before the next job and, if declared, shared crew capacity. Initial machine family is explicit. It does not use incorrect pairwise precedence assumptions for non-adjacent jobs. Deterministic single-worker search has a **3-second limit per B1/B2 solve**. Default maximum candidate count is 16,000; beyond the cap it returns `MODEL_TOO_LARGE`. `OPTIMAL` proves only the chosen declared objective (either modeled cost or the production completion score) on the bounded discrete grid, not real-world efficiency. `FEASIBLE` and timeout/unknown are not proof.

Output adds `enforced_constraints`, `search.b1` / `search.b2` CP-SAT status, objective and bound when available, and `search.global_optimum_proven`. The existing B0/B1/B2, verification, cost ledger, comparison, input_hash, mode and evidence export contracts remain compatible. `search.evaluated` now counts enumerated **start/machine candidate options** (not exhaustive tree nodes); `max_evaluations` remains a bounded legacy request parameter for compatibility.

## Business objectives (independent of search scope)

The system now separates **what to optimize** (`objective_mode`) from **which machines may change** (`mode`). Both `factory-1` and `factory-2` support all three objectives using the same CP-SAT hard constraints and verifier.

- `ENERGY` (default): minimize verified **running-electricity VND + declared fixed setup fees**. No makespan constraint beyond per-job/operation windows and hard factory constraints. Thus energy-only optimization can finish later than the reference schedule.
- `PRODUCTION`: minimize `makespan_minutes` (latest operation end measured from `horizon.start`), then **sum of all operation completion minutes** as a deterministic secondary score. The implemented CP-SAT integer score is `makespan * (horizon_minutes * N + 1) + sum(operation_end_minutes)`; makespan always dominates. The `production` metric on every verified plan is calculated independently from operation timestamps; solver `production_score`, `makespan_minutes`, and cost must all reconcile. Cost is **not** constrained to decrease; B1 can have higher VND than B0.
- `COMBINED`: minimize modeled VND subject to a **baseline-relative completion deadline** `makespan <= B0_makespan + max_makespan_slack_minutes`. A 0-minute slack guarantees no later *overall completion* than B0 (not necessarily earlier individual work-order completion). Positive slack allows an explicitly limited production compromise for cheaper electricity. Both B1 and B2 must satisfy the guard and be no more expensive than their verified predecessors.

`max_makespan_slack_minutes` defaults to 0, is only nonzero in COMBINED, and must be an integer number of minutes 0–1440 divisible by `step_minutes`. An unsupported objective, invalid guard, mismatched verifier, or off-grid guard is **blocked** without evidence. `comparison.makespan_change_b1_minutes` and `comparison.makespan_change_b2_minutes` are signed changes from B0. `search.objective_kind` distinguishes `PRODUCTION_SCORE` from `MODELED_COST_VND`; `global_optimum_proven` only certifies the selected objective if CP-SAT actually reports `OPTIMAL`.

An illustrative request (use with either version of `factory`):

```json
{
  "factory": {"schema_version": "factory-2", "...": "complete verified input omitted"},
  "mode": "JOINT_MACHINE_TIME",
  "objective_mode": "COMBINED",
  "max_makespan_slack_minutes": 30
}
```

This is a **shape example, not a valid complete factory input**; use a fixture or a validated input in practice. The two business objectives still share the same scheduling engine, not two unrelated heuristics. PRODUCTION does not model material inventory, yield or throughput outside the declared finite job list. COMBINED does not automatically enforce **each** work order's historical completion target, only its declared due date and the explicitly stated **global** B0 makespan guard.

## API and UI

- `GET /api/factory/example`: CNC synthetic `factory-1` baseline.
- `GET /api/factory/packaging-example`: packaging synthetic scenario with precedence and shared renewable crew capacity.
- `GET /api/factory/changeover-example`: packaging synthetic scenario with explicit sequence-dependent changeover, setup fees and shared crew.
- `POST /api/factory/analyze`: JSON object requiring `factory` and `mode`, with optional `objective_mode` (`ENERGY` default, `PRODUCTION`, `COMBINED`) and `max_makespan_slack_minutes` (integer 0–1440, aligned to the scheduling grid; nonzero only in COMBINED). Unknown fields are blocked.
- Factory Lab at `http://127.0.0.1:8000/?demo=1`: choose CNC, packaging, changeover or multistage samples, or import JSON; select the business objective independently of machine scope; compare verified B0/B1/B2 cost and makespan, inspect the Gantt and export evidence. Desktop uses a table; mobile uses stacked cards. Totals explicitly distinguish running electricity and declared fixed setup fees; setup intervals appear as amber Gantt segments.

## Not implemented (must be declared unsupported when relevant)

**Not supported:** setup electricity, sequence-dependent setup *energy* or non-flat costs, tools consumed during changes, setup operations decoupled from the immediately following job, staffing identities/skills/shift pay, finite interstage buffer constraints or inventory consumption/replenishment, demand charges, renewables and idle energy. Setup resource reservations are renewable pool capacities, not a full workforce model. `unsupported_constraints` must name any needed unmodeled requirements.

## factory-2 — versioned operation-level multistage routing

**Implementation:** `backend/factory_routing.py`, intentionally separate from `factory-1` and demo-3. `factory-2` is a strict adapter: it compiles each declared operation into one machine-eligible scheduling unit and each declared work-order arc into CP-SAT finish-to-start precedence. The established factory-1 machine/resource/setup calendars, optional changeovers, solver and independent verifier are reused unchanged. It does **not** infer missing operations, precedence, machine capabilities, duration, kW, transport or inventory.

- `work_orders[]`: up to 8 orders with unique IDs, explicit `release`, `due`, `operations[]` and a **required** `precedence[]` array. Operations have globally unique IDs, machine-specific `eligible` profiles, optional `demands` and `setup_family`. At least one order has multiple operations, and every multi-operation order must declare a weakly connected, cycle-free precedence DAG. Independent operations on different orders can run concurrently if resources allow.
- `current_schedule[]` uses `operation_id` (not `job_id`), `machine_id` and `start`. B0 must cover each operation exactly once and pass the verifier. Operation-level B1 changes **at most one operation**, while B2 jointly optimizes all eligible machines/times.
- `buffer_assumption: "UNLIMITED_INTERSTAGE_BUFFER_CONFIRMED"` is mandatory. This allows waiting between operations; **finite intermediate inventory/buffer constraints, transfer handling and material availability are not implemented**. Factories that need these must state them in `unsupported_constraints` and be blocked.
- `setup_assumption`, machine `changeovers`, `resources`, `tariffs` and `unsupported_constraints` retain factory-1 meanings. Setup time and fixed fees are independently verified and allocated to the successor operation and its work order, without estimating setup energy.
- `GET /api/factory/multistage-example` supplies two synthetic packaging work orders, with four operations, explicitly declared dependency arcs and separately costed operations. The same `POST /api/factory/analyze` dispatches on `schema_version` to the versioned core.
- Plans retain `B0/B1/B2` contracts and include `verification.operations`, `plan.work_orders[]` (operation start/end/machine, completion and per-order modeled cost) and original `ledger`. All order costs must sum exactly to the verified plan total. The report's `input_hash` identifies the original factory-2 input; `compiled_input_hash` records the internal factory-1 adapter input for audit. `OPERATION_ROUTING` names the additional enforced layer.

**Limitations:** This is explicit multi-operation precedence scheduling, **not** an ERP/MES execution system or a general manufacturing flow simulator. No finite WIP, transport, yields, batch splitting/merging, rework, intermediate storage, material consumption, staffing skill qualification or production/supply-chain stock planning. Each operation is non-preemptive. Solver optimality, when proved, is limited to the selected modeled business objective on the declared discrete machine/time grid; production objectives do not prove least cost.

**Browser:** use the fourth sample button (“Nạp ví dụ đa công đoạn”), inspect two work-order completion/cost summaries and the Gantt, switch the two machine/time search scopes, or import your own strict factory-2 JSON. Changing the input invalidates prior evidence.

## CSV/Excel import and user review

Factory Lab supports **.xlsx and .csv** uploads without calling the optimizer at import time. Download a synthetic CSV or Excel template from the UI (CNC `factory-1`, multistage `factory-2`, or a changeover scenario) and replace its values with supported factory information. A workbook uses explicit named sheets: `Settings`, `Machines`, `Orders`, `Tasks`, `Capabilities`, `Schedule`, `Tariffs`, `Precedence`, `Resources`, `Demands`, `SetupPolicy`, `Transitions`, `SetupDemands`. Optional sheets may be empty but existing sheet headers must match. CSV is **one structured flat file** with a `section` column and the union of the same field names, **not an arbitrary industrial CSV auto-mapper**.

The adapter `backend/factory_import.py` enforces exact headers, explicit IDs, VND rates, duration/kW provenance, machine calendars, baseline assignments, time zones, routing edges, and setup/resource declarations. It rejects unknown sheet/column data, duplicates, unsupported constraints, incomplete base scheduling inputs, invalid baseline schedules, Excel formulas and missing required assumptions. **No missing kW, production times, tariffs, precedence or inventory data are automatically inferred.** Uploads use bounded streaming (max 350 KB, Excel expanded ZIP contents limited to 5 MB, max 1,600 data rows) and are handled locally by the FastAPI service. Excel processing requires the pinned `openpyxl` dependency.

- `GET /api/factory/import/template?file_type=xlsx&version=factory-2` downloads a synthetic workbook. Variants `file_type=csv` and `version=factory-1|factory-2|changeover` are supported.
- `POST /api/factory/import/preview?file_type=xlsx` receives the raw binary file with `Content-Type: application/octet-stream`. It returns `READY_FOR_REVIEW` with an editable draft, input file SHA-256, counts per sheet, and `review_required=true`, or `BLOCKED` with a specific error code and issues. **No solver is run**, and no plan/evidence/cost calculation is returned.
- Users **explicitly click "Chấp nhận bảng đã xem · nạp JSON"** to copy the reviewed draft into the existing editor. That action also does not solve; they must separately press the B0/B1/B2 analysis button. A blocked preview never enables acceptance. Any import or input modification invalidates prior schedule evidence.

The `source_type` column is **user-supplied provenance metadata**; even a claimed `MEASURED` source is *not independently authenticated*. Templates are `SYNTHETIC` and cannot imply external industrial results. We currently **do not** support freeform CSV auto-detection, fuzzy field mapping, legacy `.xls`, Excel formula evaluation or model training on uploaded spreadsheets.

## Local verification

```cmd
.\.venv\Scripts\python.exe -m unittest backend.tests.test_factory_core -q
.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -q
node --test ops/factory-lab.test.cjs ops/demo-manual-static.test.cjs ops/demo-interactive-gantt.test.cjs ops/demo-view-model.test.cjs
node --check factory-lab.js
.\.venv\Scripts\python.exe ops/demo-studio-smoke.py
```

**Operational detail:** restart `ops/run-demo.py` when backend Python files change; `ops/refresh-local-server.py` provides a workspace- and process-verified refresh on port 8000 (requires `psutil` from `requirements-dev.txt`). Re-run the browser smoke after refreshing. Screenshots are produced under `work/demo-evidence/studio-generic-factory-{desktop,results-desktop,mobile,results-mobile}.png`, `studio-packaging-results-mobile.png`, `studio-changeover-results-mobile.png`, and `studio-multistage-results-{desktop,mobile}.png`. The smoke uses an isolated Brave profile and mobile/touch emulation, not a physical mobile device. Do not deploy or commit unreviewed uncommitted work.
