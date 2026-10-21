"""Isolated operation replay with profiled power, precedence and collision verification.

This does not infer product/lot identity or validate the incomplete factory schedule.
All unit and boundary assumptions require explicit operator confirmation.
"""
import hashlib
import json
from math import isfinite
from time import perf_counter

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view
from ortools.sat.python import cp_model
from pydantic import Field

from .schemas import Model
from .demo_sources import load_pair, source_audit, default_selection

SOURCE_DEFAULTS = {"step_minutes": 5, "power_unit": "W", "price_basis": "Wh", "currency": "SOURCE",
                   "solar_enabled": True, "solar_unit": "W", "extra_cost_per_move": None,
                   "confirmed": True, "subset_acknowledged": True}


class TextileRequest(Model):
    source_hash: str
    selected_ids: list[str] = Field(default_factory=list, max_length=256)
    step_minutes: int = Field(ge=1, le=60)
    power_unit: str = Field(pattern=r"^(W|kW)$")
    price_basis: str = Field(pattern=r"^(Wh|kWh)$")
    currency: str = Field(pattern=r"^[A-Z]{3,8}$")
    solar_enabled: bool = False
    solar_unit: str = Field(default="W", pattern=r"^(W|kW)$")
    extra_cost_per_move: float | None = Field(default=None, ge=0, le=1000000)
    confirmed: bool = False
    subset_acknowledged: bool = False


def prepare(request):
    if not request.confirmed or not request.subset_acknowledged:
        raise ValueError("Xác nhận đơn vị và phạm vi thử nghiệm độc lập trước khi tính.")
    audit = source_audit(request.source_hash)
    if audit["source_hash"] != request.source_hash:
        raise ValueError("Tệp nguồn đã đổi. Kiểm tra lại trước khi tính.")
    inp, _, _ = load_pair(request.source_hash)
    selected = request.selected_ids or default_selection(audit)
    if not 1 <= len(selected) <= 256 or len(set(selected)) != len(selected):
        raise ValueError("Chọn 1–256 dòng đủ điều kiện, không trùng nhau.")
    rows = {r["id"]: r for r in audit["rows"]}
    modes = {m["id"]: m for m in inp["task_modes"]}
    jobs = []
    for ident in selected:
        row = rows.get(ident)
        if row is None or row["classification"] != "COMPATIBLE_CANDIDATE":
            raise ValueError("Chỉ chọn dòng có chế độ đã biết và đúng máy.")
        profile = [float(p) / (1000 if request.power_unit == "W" else 1) for p in modes[row["task_mode"]]["power"]]
        if not profile or not all(isfinite(p) and p >= 0 for p in profile):
            raise ValueError("Công suất nguồn không hợp lệ.")
        jobs.append({**row, "power_kw": profile, "duration": len(profile), "release": 0,
                     "due": inp["configuration"]["time_window"]})
    horizon = inp["configuration"]["time_window"]
    if type(horizon) is not int or not 1 <= horizon <= 2000:
        raise ValueError("Chân trời thử nghiệm tối đa 2000 ô thời gian.")
    tariff = next(x["price"] for x in inp["energy_sources"] if "price" in x)
    price = [float(p) * (1000 if request.price_basis == "Wh" else 1) for p in tariff]
    solar = next((x.get("availability") for x in inp["energy_sources"] if "availability" in x), None)
    if request.solar_enabled and solar is None:
        raise ValueError("Không có chuỗi điện mặt trời trong nguồn.")
    solar = [float(v) / (1000 if request.solar_unit == "W" else 1) for v in solar] if request.solar_enabled else [0.] * horizon
    if len(price) != horizon or len(solar) != horizon or not all(isfinite(v) and v >= 0 for v in price + solar):
        raise ValueError("Chuỗi giá/điện mặt trời phải đủ chân trời và không âm.")
    # Explicit conservative class-level semantics, not inferred product relationships.
    edges, collisions = [], []
    for rule in inp.get("constraints", []):
        p = rule["parameter"]
        if rule["type"] == "Order":
            edges.extend((a["id"], b["id"]) for a in jobs for b in jobs
                         if a["task"] == p["first_task"] and b["task"] == p["second_task"])
        elif rule["type"] == "Collision":
            collisions.extend((a["id"], b["id"]) for a in jobs for b in jobs
                              if a["task"] == p["task1"] and b["task"] == p["task2"])
        else:
            raise ValueError("Có loại ràng buộc nguồn chưa hỗ trợ; không tự bỏ qua.")
    # Explicit demonstration proxy, NOT a measured labor/setup charge:
    # one minute of median selected-mode running power at median source tariff.
    # It is source-derived and positive when both source power/tariff are positive.
    auto_cost = float(np.median([np.mean(j["power_kw"]) for j in jobs]) * np.median(price) / 60)
    auto_mode = request.extra_cost_per_move is None
    effective_move_cost = auto_cost if auto_mode else float(request.extra_cost_per_move)
    if not isfinite(effective_move_cost) or effective_move_cost < 0:
        raise ValueError("Chi phí đổi lịch quy ước phải không âm và hữu hạn.")
    manifest = {"schema_version": "textile-demo-1", "source_hash": audit["source_hash"], "files": audit["files"],
                "selection_rule": "Explicit eligible source row IDs; default samples up to 18 compatible operations evenly across machines and across each machine time span; user may select 1–256 rows",
                "selected": [{k: j[k] for k in ("id", "pointer", "machine", "start", "task_mode")} for j in jobs],
                "mapping": request.model_dump(),
                "cost_policy": {
                    "move_cost_mode": "SOURCE_DERIVED_ONE_MINUTE_PROXY" if auto_mode else "OPERATOR_EXPLICIT",
                    "effective_cost_per_move": effective_move_cost,
                    "reference_minutes": 1 if auto_mode else None,
                    "reference_power_kw": float(np.median([np.mean(j["power_kw"]) for j in jobs])) if auto_mode else None,
                    "reference_tariff_per_kwh": float(np.median(price)) if auto_mode else None
                }, "assumptions": [
                    "Isolated operation subset; all other source operations are excluded, not rescheduled or validated.",
                    "Release=0 and due=source horizon are experiment boundaries, not original customer deadlines.",
                    "Order means all selected first-task operations finish before selected second-task operations.",
                    "Collision means selected task classes cannot overlap on any machine.",
                    "No physical mold, workforce, inventory or product-chain completeness is inferred.",
                    "Currency is an operator label; no exchange conversion. Move cost is an operator assumption."],
                "precedence": edges, "collisions": collisions, "factory_roi": False}
    manifest['assumptions'].append('Solar serves selected operations only: used=min(selected load, available solar); no storage or electricity export.')
    if auto_mode:
        manifest['assumptions'].append('DEMO PROXY ONLY: coordination cost per moved job = median selected-mode running power (kW) × median source tariff (SOURCE/kWh) × 1/60 hour. This is NOT measured staff, startup, maintenance or investment cost.')
    else:
        manifest['assumptions'].append('Operator explicitly supplied coordination cost per moved job; verify the value and units before any commercial claim.')
    run_hash = "sha256:" + hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest()
    return jobs, np.array(price), np.array(solar), horizon, manifest, run_hash


def verify(jobs, schedule, horizon, edges, collisions):
    """Independent checks over concrete assignments, with no solver variables."""
    by_id = {j["id"]: j for j in jobs}
    issues = []
    expected = set(by_id)
    if set(schedule) != expected:
        issues.append({"group": "coverage", "code": "JOB_COVERAGE"})
    intervals = {}
    for ident, start in schedule.items():
        if ident not in by_id:
            continue
        job = by_id[ident]
        if type(start) is not int or not job["release"] <= start <= min(horizon, job["due"]) - job["duration"]:
            issues.append({"group": "timing", "code": "OUTSIDE_WINDOW", "job": ident})
            continue
        intervals[ident] = (start, start + job["duration"])
    for i, a in enumerate(jobs):
        for b in jobs[i + 1:]:
            if a["id"] in intervals and b["id"] in intervals and a["machine"] == b["machine"]:
                s, e = intervals[a["id"]]; t, u = intervals[b["id"]]
                if s < u and t < e:
                    issues.append({"group": "machines", "code": "MACHINE_OVERLAP", "jobs": [a["id"], b["id"]]})
    for a, b in edges:
        if a in intervals and b in intervals and intervals[a][1] > intervals[b][0]:
            issues.append({"group": "precedence", "code": "PRECEDENCE", "jobs": [a, b]})
    for a, b in collisions:
        if a in intervals and b in intervals and intervals[a][0] < intervals[b][1] and intervals[b][0] < intervals[a][1]:
            issues.append({"group": "collisions", "code": "TASK_COLLISION", "jobs": [a, b]})
    return {"status": "FAIL" if issues else "PASS", "issues": issues,
            "groups": [{"id": g, "status": "FAIL" if any(i["group"] == g for i in issues) else "PASS"}
                       for g in ("coverage", "machines", "timing", "precedence", "collisions")],
            "job_count": len(jobs), "scope": "ISOLATED_SELECTED_OPERATIONS_ONLY"}


def energy(jobs, schedule, price, solar, step_minutes, move_cost):
    load = np.zeros(len(price))
    for j in jobs:
        s = schedule[j["id"]]
        load[s:s + j["duration"]] += j["power_kw"]
    used_solar = np.minimum(load, solar)
    grid = load - used_solar
    hours = step_minutes / 60
    ledger = grid * price * hours
    changed = sum(schedule[j["id"]] != j["start"] for j in jobs)
    return {"electricity": float(ledger.sum()), "move_cost": changed * move_cost,
            "total": float(ledger.sum()) + changed * move_cost,
            "energy_kwh": float(load.sum() * hours), "grid_kwh": float(grid.sum() * hours),
            "solar_kwh": float(used_solar.sum() * hours), "changed_jobs": changed,
            "series": {"load_kw": load.tolist(), "grid_kw": grid.tolist(), "solar_used_kw": used_solar.tolist(),
                       "price_per_kwh": price.tolist(), "cost": ledger.tolist()}}


def coordinated_local_search(jobs, seed, price, solar, horizon, edges, collisions, request,
                             *, max_seconds=2.5):
    """Deterministic multi-job improvement over a verified seed schedule.

    Every move respects all declared machine, precedence and class-collision
    constraints. The scoring is an exact marginal of the independently
    recomputed solar-aware ledger, not a surrogate tariff. This is a feasible
    local search, not a globally optimal CP-SAT result.
    """
    started = perf_counter()
    if verify(jobs, seed, horizon, edges, collisions)["status"] != "PASS":
        return seed.copy(), {"moves": 0, "passes": 0, "timed_out": False,
                             "seconds": round(perf_counter()-started, 3)}
    current = seed.copy()
    jobs_by_id = {j["id"]: j for j in jobs}
    durations = {j["id"]: j["duration"] for j in jobs}
    neighbors = {j["id"]: set() for j in jobs}
    for a in jobs:
        for b in jobs:
            if a["id"] != b["id"] and a["machine"] == b["machine"]:
                neighbors[a["id"]].add(b["id"])
    for a, b in collisions:
        neighbors[a].add(b)
        neighbors[b].add(a)
    before = {j["id"]: [] for j in jobs}
    after = {j["id"]: [] for j in jobs}
    for a, b in edges:
        after[a].append(b)
        before[b].append(a)
    load = np.zeros(horizon)
    for j in jobs:
        s = current[j["id"]]
        load[s:s+j["duration"]] += j["power_kw"]
    hours = request.step_minutes / 60
    moved, passes, timed_out = 0, 0, False
    deadline = started + max_seconds
    max_moves = min(256, max(8, len(jobs)*4))
    while moved < max_moves:
        passes += 1
        best_move, best_gain = None, 1e-10
        for j in jobs:
            if perf_counter() > deadline:
                timed_out = True
                break
            ident, old, duration = j["id"], current[j["id"]], j["duration"]
            last = horizon-duration
            lower = max([0] + [current[a]+durations[a] for a in before[ident]])
            upper = min([last] + [current[b]-duration for b in after[ident]])
            if lower > upper:
                continue
            possible = np.zeros(last+1, dtype=bool)
            possible[max(0, lower):min(last, upper)+1] = True
            for other_id in neighbors[ident]:
                s = current[other_id]
                e = s+durations[other_id]
                possible[max(0, s-duration+1):min(last+1, e)] = False
            if not possible.any():
                continue
            remaining = load.copy()
            remaining[old:old+duration] -= j["power_kw"]
            gap = remaining-solar
            windows = sliding_window_view(gap, duration)
            price_windows = sliding_window_view(price, duration)
            marginal = np.sum((np.maximum(windows+j["power_kw"], 0)
                               - np.maximum(windows, 0))*price_windows, axis=1)*hours
            marginal += request.extra_cost_per_move * (np.arange(last+1) != j["start"])
            available = np.flatnonzero(possible)
            next_slot = int(available[np.argmin(marginal[available])])
            gain = float(marginal[old]-marginal[next_slot])
            if gain > best_gain:
                best_move, best_gain = (ident, old, next_slot), gain
        if best_move is None:
            break
        ident, old, next_slot = best_move
        job = jobs_by_id[ident]
        load[old:old+job["duration"]] -= job["power_kw"]
        load[next_slot:next_slot+job["duration"]] += job["power_kw"]
        current[ident] = next_slot
        moved += 1
    # Independent final verification/ledger protect against a mistaken fast
    # feasibility or marginal-cost computation.
    if verify(jobs, current, horizon, edges, collisions)["status"] != "PASS":
        raise ValueError("B2 coordinated search produced an invalid schedule.")
    seed_cost = energy(jobs, seed, price, solar, request.step_minutes, request.extra_cost_per_move)["total"]
    result_cost = energy(jobs, current, price, solar, request.step_minutes, request.extra_cost_per_move)["total"]
    if result_cost > seed_cost - 1e-10:
        current = seed.copy()
        moved = 0
    return current, {"moves": moved, "passes": passes, "timed_out": timed_out,
                     "seconds": round(perf_counter()-started, 3)}


def finalize_experiment(result, baseline_valid, baseline_issues):
    """Select a verified plan without treating an invalid source schedule as a baseline."""
    plans = result["plans"]
    preferred = ("B2" if plans["B2"]["cost"] is not None and
                 (plans["B1"]["cost"] is None or
                  plans["B2"]["cost"]["total"] < plans["B1"]["cost"]["total"] - 1e-10)
                 else "B1" if plans["B1"]["cost"] is not None else "B0")
    result["decision"] = {
        "kind": "REVIEW_REQUIRED" if baseline_valid else "INVALID_ORIGINAL_SCHEDULE",
        "selected_plan": preferred,
        "reason": ("B0 nguồn vi phạm ràng buộc. B1/B2 (nếu PASS) là lịch sửa khả thi, không được công bố tiết kiệm so với B0 lỗi. Cần người vận hành xác minh."
                   if not baseline_valid else
                   "Kết quả nhóm độc lập; cần xác minh các công việc bị loại, chuỗi sản phẩm và điều kiện vận hành trước áp dụng.")
    }
    if not baseline_valid:
        result["message"] = ("Lịch nguồn B0 có " + str(len(baseline_issues)) +
                             " vi phạm; đã giữ nguyên lịch gốc, thử sửa trong B1/B2. Không xuất chi phí B0.")
    return result


def optimize(request):
    started = perf_counter()
    jobs, price, solar, horizon, manifest, run_hash = prepare(request)
    request = request.model_copy(update={"extra_cost_per_move": manifest["cost_policy"]["effective_cost_per_move"]})
    edges, collisions = manifest["precedence"], manifest["collisions"]
    initial = {j["id"]: j["start"] for j in jobs}

    def check(schedule):
        return verify(jobs, schedule, horizon, edges, collisions)

    def cost(schedule):
        return energy(jobs, schedule, price, solar, request.step_minutes, request.extra_cost_per_move)

    def plan(schedule):
        v = check(schedule)
        return {"schedule": [{"job_id": j["id"], "task": j["task"], "machine_id": j["machine"],
                              "start_slot": schedule[j["id"]], "end_slot": schedule[j["id"]] + j["duration"],
                              "original_start_slot": j["start"]} for j in jobs],
                "verification": v, "cost": cost(schedule) if v["status"] == "PASS" else None}

    baseline = plan(initial)
    result = {"schema_version": "textile-demo-1", "input_hash": run_hash, "source_type": "EXTERNAL_ISOLATED_SUBSET",
              "operations": [{"id": j["id"], "machine_id": j["machine"], "task": j["task"], "task_mode": j["task_mode"], "power_kw": j["power_kw"], "pointer": j["pointer"]} for j in jobs],
              "manifest": manifest, "horizon_slots": horizon, "step_minutes": request.step_minutes,
              "currency": request.currency, "plans": {"B0": baseline}, "factory_roi": False,
              "decision": {"kind": "REVIEW_REQUIRED", "selected_plan": "B0"}}
    baseline_valid = baseline["verification"]["status"] == "PASS"
    # B0 remains immutable; never claim savings relative to an invalid B0.
    result["baseline_valid"] = baseline_valid
    best = initial.copy()
    best_cost = baseline["cost"]["total"] if baseline_valid else float("inf")
    baseline_issues = baseline["verification"]["issues"]
    single_repair_ids = (set.intersection(*[
        set(issue.get("jobs") or [issue.get("job")]) for issue in baseline_issues
    ])) if baseline_issues else set(initial)
    candidates = 0
    baseline_load = np.zeros(horizon)
    for job in jobs:
        baseline_load[job["start"]:job["start"] + job["duration"]] += job["power_kw"]
    hours = request.step_minutes / 60
    durations = {j["id"]: j["duration"] for j in jobs}
    collision_lookup = {j["id"]: set() for j in jobs}
    for a, b in collisions:
        collision_lookup[a].add(b)
        collision_lookup[b].add(a)
    ranked_starts = {}
    for j in jobs:
        ident, old, duration = j["id"], j["start"], j["duration"]
        last = horizon - duration
        lower, upper = 0, last
        for a, b in edges:
            if a == ident: upper = min(upper, initial[b] - duration)
            if b == ident: lower = max(lower, initial[a] + durations[a])
        feasible = np.zeros(last + 1, dtype=bool)
        if lower <= upper:
            feasible[max(0, lower):min(last, upper) + 1] = True
        for other in jobs:
            if other["id"] == ident or (other["machine"] != j["machine"] and other["id"] not in collision_lookup[ident]):
                continue
            start, end = initial[other["id"]], initial[other["id"]] + other["duration"]
            feasible[max(0, start - duration + 1):min(last + 1, end)] = False
        load_without = baseline_load.copy()
        load_without[old:old + duration] -= j["power_kw"]
        gap = load_without - solar
        windows = sliding_window_view(gap, duration)
        price_windows = sliding_window_view(price, duration)
        extra = np.sum((np.maximum(windows + j["power_kw"], 0) - np.maximum(windows, 0)) * price_windows, axis=1) * hours
        totals = float(np.dot(np.maximum(gap, 0), price) * hours) + extra
        totals += request.extra_cost_per_move * (np.arange(last + 1) != old)
        candidates += int(feasible.sum())
        ranked_starts[ident] = np.argsort(np.where(feasible, totals, np.inf), kind="stable")[:16].tolist()
        valid = np.flatnonzero(feasible)
        if valid.size and (baseline_valid or ident in single_repair_ids):
            slot = int(valid[np.argmin(totals[valid])])
            if totals[slot] < best_cost - 1e-10:
                trial = {**initial, ident: slot}
                if check(trial)["status"] == "PASS":
                    best, best_cost = trial, cost(trial)["total"]
    result["plans"]["B1"] = plan(best)

    # CP-SAT's full time-indexed solar model is too large for many operations.
    # For larger groups use a deterministic, full-slot coordinated improvement
    # that independently verifies the result, rather than reporting UNKNOWN
    # and silently copying B1 as B2.
    if len(jobs) > 8:
        valid_seed = result["plans"]["B1"]["verification"]["status"] == "PASS"
        coordinated, search = (
            coordinated_local_search(jobs, best, price, solar, horizon, edges, collisions, request)
            if valid_seed else
            (best.copy(), {"moves": 0, "passes": 0, "seconds": 0.0, "timed_out": False}))
        result["plans"]["B2"] = plan(coordinated)
        has_valid = result["plans"]["B1"]["cost"] is not None or result["plans"]["B2"]["cost"] is not None
        result.update(
            status=("COMPLETED" if baseline_valid else
                    "REPAIRED_WITH_INVALID_BASELINE" if has_valid else "BASELINE_INVALID"),
            solver={
                "status": "HEURISTIC_FEASIBLE" if valid_seed else "NO_FEASIBLE_SEED",
                "algorithm": "SOLAR_AWARE_COORDINATED_LOCAL_SEARCH",
                "seconds": search["seconds"], "time_limit_seconds": 2.5,
                "scope": "Multiple verified start-time changes, fixed machines, full feasible integer-slot search per move; no global optimality guarantee",
                "domain": "ALL_FEASIBLE_INTEGER_SLOTS",
                "b2_used_fallback": coordinated == best,
                "b2_proven_optimal": False,
                "moves": search["moves"], "passes": search["passes"],
                "timed_out": search["timed_out"]
            },
            candidates=candidates,
            elapsed_seconds=round(perf_counter() - started, 3)
        )
        return finalize_experiment(result, baseline_valid, baseline_issues)

    # Coordinated starts: every legal slot, fixed machines, explicit source constraints.
    # Integer objective at 1e-6 currency units; exported ledger is recomputed independently.
    model = cp_model.CpModel()
    starts, intervals = {}, {}
    cost_terms = []
    slot_loads = [[] for _ in range(horizon)] if request.solar_enabled else None
    restricted = len(jobs) > 8
    domain_choices = {}
    for j in jobs:
        ident = j["id"]
        last = horizon - j["duration"]
        if restricted:
            options = {j["start"], best[ident]}
            options.update(s for s in ranked_starts[ident][:12] if 0 <= s <= last)
            options.update(s for s in (j["start"]-j["duration"], j["start"]+j["duration"]) if 0 <= s <= last)
            domain_choices[ident] = sorted(options)
            starts[ident] = model.new_int_var_from_domain(cp_model.Domain.from_values(domain_choices[ident]), ident)
        else:
            starts[ident] = model.new_int_var(0, last, ident)
        intervals[ident] = model.new_fixed_size_interval_var(starts[ident], j["duration"], ident + "_interval")
        changed = model.new_bool_var(ident + "_changed")
        model.add(starts[ident] != j["start"]).only_enforce_if(changed)
        model.add(starts[ident] == j["start"]).only_enforce_if(changed.Not())
        cost_terms.append(round(request.extra_cost_per_move * 1e6) * changed)
        if slot_loads is None:
            values = [round(float(np.dot(j["power_kw"], price[s:s + j["duration"]])) * request.step_minutes / 60 * 1e6)
                      for s in range(last + 1)]
            cv = model.new_int_var(min(values), max(values), ident + "_cost")
            model.add_element(starts[ident], values, cv)
            cost_terms.append(cv)
        else:
            options = domain_choices[ident] if restricted else range(last + 1)
            choices = [model.new_bool_var(ident + "_at_" + str(s)) for s in options]
            model.add_exactly_one(choices)
            model.add(starts[ident] == sum(s * choice for s, choice in zip(options, choices)))
            for s, choice in zip(options, choices):
                for offset, kw in enumerate(j["power_kw"]):
                    watts = round(kw * 10000)
                    if watts:
                        slot_loads[s + offset].append(watts * choice)
        model.add_hint(starts[ident], best[ident])
    for mid in {j["machine"] for j in jobs}:
        model.add_no_overlap([intervals[j["id"]] for j in jobs if j["machine"] == mid])
    for a, b in edges:
        model.add(starts[a] + next(j["duration"] for j in jobs if j["id"] == a) <= starts[b])
    for a, b in collisions:
        model.add_no_overlap([intervals[a], intervals[b]])
    if slot_loads is not None:
        maximum = sum(round(max(j["power_kw"]) * 10000) for j in jobs)
        for s, terms in enumerate(slot_loads):
            grid = model.new_int_var(0, maximum, "grid_" + str(s))
            model.add_max_equality(grid, [0, sum(terms) - round(solar[s] * 10000)])
            cost_terms.append(round(price[s] * request.step_minutes / 60 * 100000) * grid)
        # Solar objective scale: 1e4 power * 1e5 price = 1e9 currency.
        cost_terms = [t * 1000 if i < len(jobs) else t for i, t in enumerate(cost_terms)]
    model.minimize(sum(cost_terms))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 6
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = 0
    status = solver.solve(model)
    coordinated = best
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        trial = {k: solver.value(v) for k, v in starts.items()}
        if check(trial)["status"] == "PASS" and cost(trial)["total"] < best_cost - 1e-10:
            coordinated = trial
    result["plans"]["B2"] = plan(coordinated)
    repair_found = result["plans"]["B1"]["cost"] is not None or result["plans"]["B2"]["cost"] is not None
    result.update(status=("COMPLETED" if baseline_valid else
                          "REPAIRED_WITH_INVALID_BASELINE" if repair_found else "BASELINE_INVALID"), solver={"status": solver.status_name(status), "seconds": round(solver.wall_time, 3),
                  "time_limit_seconds": 6, "scope": ("Selected operations; fixed machines; bounded candidate start slots including original and B1 for groups larger than eight; rounded objective, independently recomputed ledger"
                    if restricted else "Selected operations; fixed machines; all integer start slots; rounded objective, independently recomputed floating-point ledger"),
                  "domain": "BOUNDED_CANDIDATES" if restricted else "ALL_SLOTS",
                  "b2_used_fallback": coordinated is best,
                  "b2_proven_optimal": status == cp_model.OPTIMAL},
                  candidates=candidates, elapsed_seconds=round(perf_counter() - started, 3))
    return finalize_experiment(result, baseline_valid, baseline_issues)
