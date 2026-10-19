"""Coordinated start times in the union of B0/B1 fixed machine/order domains."""
from collections import defaultdict
from copy import deepcopy
from datetime import datetime, timedelta
from fractions import Fraction
from importlib.metadata import version
from time import perf_counter

from ortools.sat.python import cp_model

from .costing import cost_schedule, round_vnd
from .schemas import Dataset


def _energy(data, job, machine, start):
    profile = job.eligible[machine]
    end = start + timedelta(minutes=profile.duration_min)
    total = 0
    for window in data.tariff.windows:
        left, right = max(start, window.start), min(end, window.end)
        if right > left:
            minutes = (right - left) // timedelta(minutes=1)
            total += round_vnd(Fraction(str(profile.avg_kw)) * minutes * Fraction(str(window.vnd_per_kwh)) / 60)
    return total


def _model(data, seed, anchors, grid):
    model = cp_model.CpModel()
    horizon = (data.horizon.end - data.horizon.start) // timedelta(minutes=1)
    jobs = {j.id: j for j in data.jobs}
    transitions = {(t.machine_id, t.from_family, t.to_family): t for t in data.setup.transitions}
    starts, costs, reservations = {}, [], defaultdict(list)
    constant = 0

    def hold(left, right, label):
        size = model.new_int_var(0, horizon, label + "_size")
        model.add(size == right - left)
        return model.new_interval_var(left, size, right, label)

    for machine in data.machines:
        mid = machine.id
        windows = []
        for window in sorted(machine.available, key=lambda w: w.start):
            if windows and window.start <= windows[-1][1]:
                windows[-1][1] = max(windows[-1][1], window.end)
            else:
                windows.append([window.start, window.end])
        sequence = sorted((a for a in seed if a["machine_id"] == mid), key=lambda a: (a["start"], a["job_id"]))
        family = data.setup.initial_family_by_machine[mid]
        mold = data.setup.initial_mold_by_machine[mid]
        since, previous_end = 0, None
        for assignment in sequence:
            job = jobs[assignment["job_id"]]
            profile = job.eligible[mid]
            transition = transitions[mid, family, job.family]
            changed = mold != job.mold_id
            change = data.setup.mold_change_by_machine[mid]
            setup = transition.minutes + (change.minutes if changed else 0)
            constant += transition.incremental_cost_vnd + (change.incremental_cost_vnd if changed else 0)
            allowed = []
            for minute in sorted(set(range(0, horizon + 1, grid)) | anchors[job.id]):
                start = data.horizon.start + timedelta(minutes=minute)
                end = start + timedelta(minutes=profile.duration_min)
                if start < job.release or end > job.due or end > data.horizon.end:
                    continue
                if any(left <= start - timedelta(minutes=setup) and end <= right for left, right in windows):
                    allowed.append((minute, _energy(data, job, mid, start)))
            if not allowed or max(v for _, v in allowed) >= 2**50:
                raise ValueError("Empty or unsafe integer cost domain")
            start_var = model.new_int_var(0, horizon, job.id + "_start")
            cost_var = model.new_int_var(0, max(v for _, v in allowed), job.id + "_cost")
            model.add_allowed_assignments([start_var, cost_var], allowed)
            model.add_hint(start_var, (datetime.fromisoformat(assignment["start"]) - data.horizon.start) // timedelta(minutes=1))
            starts[job.id] = start_var
            costs.append(cost_var)
            if previous_end is not None:
                model.add(start_var - setup >= previous_end)
            if changed:
                if mold is not None:
                    reservations[mold].append(hold(since, start_var, mid + "_" + job.id))
                mold, since = job.mold_id, start_var - setup
            previous_end = start_var + profile.duration_min
            family = job.family
        if mold is not None:
            reservations[mold].append(hold(since, horizon, mid + "_final"))
    if constant >= 2**50:
        raise ValueError("Unsafe setup integer range")
    for intervals in reservations.values():
        model.add_no_overlap(intervals)
    model.minimize(sum(costs) + constant)
    return model, starts, costs, constant


def search_b2(snapshot, b0, b1, *, grid_minutes=30, time_limit_seconds=6):
    if type(grid_minutes) is not int or grid_minutes <= 0:
        raise ValueError("Positive integer grid required")
    if isinstance(time_limit_seconds, bool) or not isinstance(time_limit_seconds, (int, float)) or not 0 <= time_limit_seconds <= 30:
        raise ValueError("Budget must be 0..30 seconds")
    begun = perf_counter()
    data = Dataset.model_validate(snapshot)
    incumbents = []
    for name, plan in (("B0", b0), ("B1", b1)):
        checked = cost_schedule(snapshot, plan["schedule"])
        if checked["status"] != "COSTED":
            raise ValueError("Valid B0 and B1 required")
        incumbents.append((name, {**checked, "schedule": deepcopy(plan["schedule"])}))
    origin, best = min(incumbents, key=lambda item: item[1]["cost"]["total_vnd"])
    horizon = (data.horizon.end - data.horizon.start) // timedelta(minutes=1)
    anchors = {job.id: set() for job in data.jobs}
    for _, plan in incumbents:
        for assignment in plan["schedule"]:
            anchors[assignment["job_id"]].add((datetime.fromisoformat(assignment["start"]) - data.horizon.start) // timedelta(minutes=1))
    records, seen = [], set()
    for name, seed in incumbents:
        signature = tuple((a["job_id"], a["machine_id"]) for a in sorted(seed["schedule"], key=lambda a: (a["machine_id"], a["start"], a["job_id"])))
        if signature in seen:
            continue
        seen.add(signature)
        if perf_counter() - begun >= time_limit_seconds or len(data.jobs) > 8 or len(data.machines) > 3 or horizon > 2880:
            records.append({"seed": name, "status": "NOT_RUN", "reason": "BUDGET_OR_DOMAIN_LIMIT"})
            continue
        try:
            model, starts, costs, constant = _model(data, seed["schedule"], anchors, grid_minutes)
            remaining = time_limit_seconds - (perf_counter() - begun)
            if remaining <= 0:
                records.append({"seed": name, "status": "NOT_RUN", "reason": "BUILD_BUDGET_EXHAUSTED"})
                continue
            solver = cp_model.CpSolver()
            solver.parameters.max_time_in_seconds = remaining / max(1, 2 - len(records))
            solver.parameters.num_search_workers = 1
            solver.parameters.random_seed = 0
            status = solver.solve(model)
            record = {"seed": name, "status": solver.status_name(status), "solver_seconds": solver.wall_time,
                      "branches": solver.num_branches, "conflicts": solver.num_conflicts}
            if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
                schedule = [{**a, "start": (data.horizon.start + timedelta(minutes=solver.value(starts[a["job_id"]]))).isoformat()} for a in seed["schedule"]]
                checked = cost_schedule(snapshot, schedule)
                objective = sum(solver.value(v) for v in costs) + constant
                record.update(objective_vnd=objective, best_bound_vnd=solver.best_objective_bound)
                if checked["status"] != "COSTED" or checked["cost"]["total_vnd"] != objective:
                    record["status"] = "REJECTED_BY_INDEPENDENT_CHECK"
                elif objective < best["cost"]["total_vnd"]:
                    origin, best = "CP_SAT_" + name, {**checked, "schedule": schedule}
            elif status == cp_model.INFEASIBLE:
                record["status"] = "MODEL_INCONSISTENT_WITH_VALID_SEED"
            records.append(record)
        except (ValueError, OverflowError):
            records.append({"seed": name, "status": "MODEL_REJECTED"})
    proven = bool(records) and all(r["status"] == "OPTIMAL" for r in records)
    status = "OPTIMAL" if proven else "FEASIBLE" if any(r["status"] in ("OPTIMAL", "FEASIBLE") for r in records) else "UNKNOWN"
    before = {a["job_id"]: a for a in b0["schedule"]}
    return {**best, "origin": origin, "solver_status": status,
            "changes": [{"job_id": a["job_id"], "from": before[a["job_id"]], "to": a} for a in best["schedule"] if a != before[a["job_id"]]],
            "solver": {"algorithm": "OR-Tools CP-SAT", "version": version("ortools"), "models": records,
                       "grid_minutes": grid_minutes, "time_limit_seconds": time_limit_seconds,
                       "runtime_seconds": round(perf_counter() - begun, 6),
                       "domain": "Union of B0/B1 fixed machine assignments and job orders; grid plus incumbent anchors",
                       "optimality": "PROVEN_IN_DECLARED_DOMAIN" if proven else "NOT_PROVEN",
                       "global_optimum_proven": False,
                       "fallback": "Retain independently verified best B0/B1 on timeout/rejection; origin identifies source"}}
