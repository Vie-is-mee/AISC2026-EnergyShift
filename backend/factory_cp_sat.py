"""Bounded deterministic CP-SAT compiler for explicit factory-1 rules.

The candidate objective is integer VND computed from the same published segment
rounding convention; all solutions still require an independent verifier+ledger.
Sequence-dependent setups are charged as declared fixed fees and enforced as
reserved machine and shared-resource time. Setup energy is not assumed.
No unmodeled costs or factory-wide global optimality are inferred.
"""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from ortools.sat.python import cp_model
from .factory_constraints import active_rules, inside

MAX_OPTIONS = 16000
SOLVER_SECONDS = 3.0


def _candidate_cost(data, profile, start):
    end = start + timedelta(minutes=profile.duration_minutes)
    kw = Decimal(str(profile.average_kw))
    total = 0
    for band in data.tariffs:
        lo, hi = max(start, band.start), min(end, band.end)
        if hi > lo:
            minutes = Decimal(int((hi - lo).total_seconds() // 60))
            kwh = kw * minutes / Decimal(60)
            vnd = kwh * Decimal(str(band.vnd_per_kwh))
            total += int(vnd.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    return total


def build_options(data, mode, max_options=MAX_OPTIONS):
    """Enumerate feasible discrete starts. Domain bounds keep the solve reviewable."""
    machine_map = {m.id: m for m in data.machines}
    resource_map = {pool.id: pool for pool in data.resources}
    original = {a.job_id: a.machine_id for a in data.current_schedule}
    horizon_minutes = int((data.horizon.end - data.horizon.start).total_seconds() // 60)
    options = {}
    total = 0
    for job in sorted(data.jobs, key=lambda j: j.id):
        rows = []
        eligible = [original[job.id]] if mode == "FIXED_MACHINE" else sorted(job.eligible)
        for mid in eligible:
            if mid not in job.eligible or mid not in machine_map:
                continue
            profile = job.eligible[mid]
            duration = profile.duration_minutes
            for minute in range(0, horizon_minutes - duration + 1, data.step_minutes):
                start = data.horizon.start + timedelta(minutes=minute)
                end = start + timedelta(minutes=duration)
                if not (job.release <= start and end <= job.due):
                    continue
                if not inside(machine_map[mid].available, start, end):
                    continue
                if any(not inside(resource_map[pool_id].available, start, end) for pool_id in job.demands):
                    continue
                rows.append({"job_id": job.id, "machine_id": mid, "start": start,
                             "minute": minute, "end_minute": minute + duration,
                             "cost": _candidate_cost(data, profile, start)})
                total += 1
                if total > max_options:
                    return None, total
        options[job.id] = rows
    return options, total


def solve(data, options, *, baseline, cost_ceiling=None, production_ceiling=None,
          makespan_limit=None, objective_mode="ENERGY", at_most_one_change=False):
    """CP-SAT with optional fixed candidate intervals, cumulative resources and precedence.

    One-job B1 is a constrained exact search, not a local-search heuristic.
    A solver TIMEOUT/UNKNOWN never returns a fabricated candidate or proof.
    """
    rules = set(active_rules(data))
    assert {"MACHINE_ELIGIBILITY", "MACHINE_NO_OVERLAP", "JOB_WINDOWS", "MACHINE_CALENDAR"} <= rules
    model = cp_model.CpModel()
    by_job, by_machine, by_pool = {}, {m.id: [] for m in data.machines}, {p.id: [] for p in data.resources}
    costs = []
    changes = []
    baseline_map = {a["job_id"]: a for a in baseline}

    for job in sorted(data.jobs, key=lambda j: j.id):
        choices = []
        for i, opt in enumerate(options[job.id]):
            selected = model.NewBoolVar(f"{job.id}_{i}")
            choices.append((opt, selected))
            costs.append(opt["cost"] * selected)
            is_changed = opt["machine_id"] != baseline_map[job.id]["machine_id"] or opt["start"] != baseline_map[job.id]["start"]
            if is_changed:
                changes.append(selected)
            interval = model.NewOptionalFixedSizeIntervalVar(
                opt["minute"], opt["end_minute"] - opt["minute"], selected, f"run_{job.id}_{i}"
            )
            by_machine[opt["machine_id"]].append(interval)
            for rid, demand in job.demands.items():
                by_pool[rid].append((interval, demand))
        if not choices:
            return None, {"status": "INFEASIBLE", "wall_time_seconds": 0, "objective_vnd": None}
        model.AddExactlyOne(selected for _, selected in choices)
        by_job[job.id] = choices

    starts = {jid: sum(opt["minute"] * v for opt, v in choices) for jid, choices in by_job.items()}
    ends = {jid: sum(opt["end_minute"] * v for opt, v in choices) for jid, choices in by_job.items()}

    if "SEQUENCE_CHANGEOVER" in rules:
        from .factory_constraints import transition_lookup
        horizon_minutes = int((data.horizon.end - data.horizon.start).total_seconds() // 60)
        pools = {pool.id: pool for pool in data.resources}

        for machine in data.machines:
            mid = machine.id
            eligible = [j for j in sorted(data.jobs, key=lambda j: j.id)
                        if any(opt["machine_id"] == mid for opt, _ in by_job[j.id])]
            if not eligible:
                continue
            presence = {}
            for job in eligible:
                presence[job.id] = model.NewBoolVar(f"has_{mid}_{job.id}")
                model.Add(presence[job.id] == sum(
                    selected for opt, selected in by_job[job.id] if opt["machine_id"] == mid
                ))
            none = model.NewBoolVar(f"unused_{mid}")
            model.Add(sum(presence.values()) == 0).OnlyEnforceIf(none)
            model.Add(sum(presence.values()) >= 1).OnlyEnforceIf(none.Not())
            arcs = [(0, 0, none)]
            ids = {job.id: index for index, job in enumerate(eligible, 1)}
            transitions = transition_lookup(machine)

            def add_setup_arc(arc, predecessor, successor):
                from_family = (machine.changeovers.initial_family if predecessor is None
                               else predecessor.setup_family)
                rule = transitions[(from_family, successor.setup_family)]
                duration = rule.duration_minutes
                if predecessor is None:
                    model.Add(starts[successor.id] >= duration).OnlyEnforceIf(arc)
                else:
                    model.Add(starts[successor.id] >= ends[predecessor.id] + duration).OnlyEnforceIf(arc)
                costs.append(rule.flat_cost_vnd * arc)

                if duration:
                    setup_start = model.NewIntVar(0, horizon_minutes, f"setup_start_{mid}_{from_family}_{successor.id}")
                    model.Add(setup_start == starts[successor.id] - duration).OnlyEnforceIf(arc)
                    interval = model.NewOptionalFixedSizeIntervalVar(
                        setup_start, duration, arc, f"setup_{mid}_{from_family}_{successor.id}"
                    )
                    by_machine[mid].append(interval)
                    for rid, demand in rule.demands.items():
                        by_pool[rid].append((interval, demand))

                for opt, selected in by_job[successor.id]:
                    if opt["machine_id"] != mid:
                        continue
                    setup_from = opt["start"] - timedelta(minutes=duration)
                    fits = (setup_from >= data.horizon.start and
                            (duration == 0 or inside(machine.available, setup_from, opt["start"])) and
                            all(inside(pools[rid].available, setup_from, opt["start"])
                                for rid in rule.demands))
                    if not fits:
                        model.AddBoolOr([arc.Not(), selected.Not()])

            for target in eligible:
                jid = target.id
                arcs.append((ids[jid], ids[jid], presence[jid].Not()))
                first = model.NewBoolVar(f"first_{mid}_{jid}")
                arcs.append((0, ids[jid], first))
                add_setup_arc(first, None, target)
                last = model.NewBoolVar(f"last_{mid}_{jid}")
                arcs.append((ids[jid], 0, last))
            for earlier in eligible:
                for later in eligible:
                    if earlier.id == later.id:
                        continue
                    arc = model.NewBoolVar(f"next_{mid}_{earlier.id}_{later.id}")
                    arcs.append((ids[earlier.id], ids[later.id], arc))
                    add_setup_arc(arc, earlier, later)
            model.AddCircuit(arcs)

    for intervals in by_machine.values():
        model.AddNoOverlap(intervals)
    if "RESOURCE_CAPACITY" in rules:
        for pool in data.resources:
            pairings = by_pool[pool.id]
            if pairings:
                model.AddCumulative([item[0] for item in pairings],
                                    [item[1] for item in pairings], pool.capacity)
    if "PRECEDENCE" in rules:
        for edge in data.precedence:
            model.Add(ends[edge.before] + edge.min_lag_minutes <= starts[edge.after])
    if at_most_one_change:
        model.Add(sum(changes) <= 1)
    cost_expr = sum(costs)
    horizon_minutes = int((data.horizon.end - data.horizon.start).total_seconds() // 60)
    makespan = model.NewIntVar(0, horizon_minutes, "production_makespan")
    model.AddMaxEquality(makespan, list(ends.values()))
    # Makespan dominates aggregate completion time; neither is energy cost.
    production_weight = horizon_minutes * len(data.jobs) + 1
    production_expr = makespan * production_weight + sum(ends.values())
    if cost_ceiling is not None:
        model.Add(cost_expr <= cost_ceiling)
    if production_ceiling is not None:
        model.Add(production_expr <= production_ceiling)
    if makespan_limit is not None:
        model.Add(makespan <= makespan_limit)
    if objective_mode == "PRODUCTION":
        model.Minimize(production_expr)
    else:
        model.Minimize(cost_expr)
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = SOLVER_SECONDS
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = 0
    status = solver.Solve(model)
    state = solver.StatusName(status)
    details = {"status": state, "wall_time_seconds": round(solver.WallTime(), 4),
               "objective_vnd": None, "objective_value": None, "best_bound": None,
               "best_bound_vnd": None, "production_score": None, "makespan_minutes": None,
               "objective_kind": "PRODUCTION_SCORE" if objective_mode == "PRODUCTION" else "MODELED_COST_VND",
               "global_optimum_proven": status == cp_model.OPTIMAL}
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return None, details
    details["objective_value"] = int(round(solver.ObjectiveValue()))
    details["best_bound"] = int(round(solver.BestObjectiveBound()))
    details["objective_vnd"] = int(solver.Value(cost_expr))
    details["production_score"] = int(solver.Value(production_expr))
    details["makespan_minutes"] = int(solver.Value(makespan))
    if objective_mode != "PRODUCTION":
        details["best_bound_vnd"] = details["best_bound"]
    schedule = []
    for jid, choices in by_job.items():
        opt = next(opt for opt, v in choices if solver.BooleanValue(v))
        schedule.append({"job_id": jid, "machine_id": opt["machine_id"], "start": opt["start"]})
    return schedule, details
