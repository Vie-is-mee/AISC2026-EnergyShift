"""Bounded, deterministic single-job search; every candidate is independently checked."""
from copy import deepcopy
from datetime import datetime, timedelta
from time import perf_counter
from heapq import merge

from .costing import cost_schedule
from .schemas import Dataset
from .validation import validate_input


def search_b1(snapshot, *, grid_minutes=30, max_candidates=5000):
    if type(grid_minutes) is not int or grid_minutes <= 0:
        raise ValueError("grid_minutes must be a positive integer")
    if type(max_candidates) is not int or max_candidates <= 0:
        raise ValueError("max_candidates must be a positive integer")
    started = perf_counter()
    gate = validate_input(snapshot)
    if gate.status != "READY":
        return {"status": "BLOCKED_INVALID", "errors": [vars(e) for e in gate.errors]}
    data = Dataset.model_validate(gate.snapshot)
    baseline = deepcopy(gate.snapshot["current_schedule"])
    baseline.sort(key=lambda a: a["job_id"])
    b0 = cost_schedule(gate.snapshot, baseline)
    if b0["status"] != "COSTED":
        return {"status": "BASELINE_INVALID", "B0": {"schedule": baseline, **b0}}
    best, best_report = baseline, b0
    evaluated = rejected = valid = 0
    completed = True
    step = timedelta(minutes=grid_minutes)
    for job in sorted(data.jobs, key=lambda j: j.id):
        index = next(i for i, a in enumerate(baseline) if a["job_id"] == job.id)
        for machine_id, profile in sorted(job.eligible.items()):
            if profile.duration_min > (job.due - job.release) // timedelta(minutes=1):
                continue
            latest = job.due - timedelta(minutes=profile.duration_min)
            first_slot = max(0, (job.release - data.horizon.start + step - timedelta(microseconds=1)) // step)
            slots = range(first_slot, max(first_slot, (latest - data.horizon.start) // step + 1))
            # Preserve off-grid baseline starts when trying an alternative machine.
            times = (data.horizon.start + slot * step for slot in slots)
            current_start = datetime.fromisoformat(baseline[index]["start"])
            extra = [current_start] if job.release <= current_start <= latest else []
            previous_start = None
            for start in merge(times, extra):
                if start == previous_start:
                    continue
                previous_start = start
                replacement = {"job_id": job.id, "machine_id": machine_id, "start": start.isoformat()}
                if replacement == baseline[index]:
                    continue
                if evaluated >= max_candidates:
                    completed = False
                    break
                candidate = deepcopy(baseline)
                candidate[index] = replacement
                report = cost_schedule(gate.snapshot, candidate)
                evaluated += 1
                if report["status"] != "COSTED":
                    rejected += 1
                    continue
                valid += 1
                # Keep B0 on equal cost; otherwise first equal-cost move wins
                # in stable job/machine/start order. Never accumulate moves.
                if report["cost"]["total_vnd"] < best_report["cost"]["total_vnd"]:
                    best, best_report = candidate, report
            if not completed:
                break
        if not completed:
            break
    changed = [{"job_id": old["job_id"], "from": old, "to": new}
               for old, new in zip(baseline, best) if old != new]
    return {"status": "COMPLETED", "B0": {"schedule": baseline, **b0},
            "B1": {"schedule": best, **best_report, "changes": changed},
            "search": {"algorithm": "single-job exhaustive grid search with baseline-start alternatives",
                       "grid_minutes": grid_minutes, "max_candidates": max_candidates,
                       "evaluated_candidates": evaluated, "rejected_candidates": rejected,
                       "valid_candidates": valid, "search_complete": completed,
                       "termination": "GRID_EXHAUSTED" if completed else "CANDIDATE_LIMIT",
                       "runtime_seconds": round(perf_counter() - started, 6),
                       "optimality": "NOT_PROVEN_GLOBAL_OPTIMAL"}}
