"""Reconstruct and recost assignments; never consume solver totals or verifier rows."""
from collections import defaultdict
from datetime import timedelta
from fractions import Fraction
from pydantic import TypeAdapter

from .schemas import Assignment, Dataset
from .validation import validate_input
from .verifier import verify_schedule


def round_vnd(amount):
    """Nonnegative exact rational -> integer VND, round half up."""
    return (2 * amount.numerator + amount.denominator) // (2 * amount.denominator)


def energy_string(amount):
    """Exact numerator/denominator in kWh; no binary float accumulation."""
    return f"{amount.numerator}/{amount.denominator}"


def cost_schedule(snapshot, schedule):
    gate = validate_input(snapshot)
    verification = verify_schedule(snapshot, schedule)
    if verification["status"] != "PASS":
        return {"status": "BLOCKED", "verification": verification, "cost": None}
    data = Dataset.model_validate(gate.snapshot)
    jobs = {j.id: j for j in data.jobs}
    transitions = {(t.machine_id, t.from_family, t.to_family): t for t in data.setup.transitions}
    # Re-read assignments from caller's JSON, not verifier's reconstructed jobs.
    by_machine = defaultdict(list)
    for assignment in TypeAdapter(list[Assignment]).validate_python(schedule, strict=True):
        by_machine[assignment.machine_id].append(assignment)
    ledger, job_costs = [], {}
    machine_costs, band_costs = defaultdict(int), defaultdict(int)
    band_energy = defaultdict(Fraction)
    total_energy = Fraction(0)
    for machine_id, assignments in sorted(by_machine.items()):
        family = data.setup.initial_family_by_machine[machine_id]
        for assignment in sorted(assignments, key=lambda a: (a.start, a.job_id)):
            job = jobs[assignment.job_id]
            profile = job.eligible[machine_id]
            start = assignment.start
            end = start + timedelta(minutes=profile.duration_min)
            electricity = 0
            energy = Fraction(0)
            for window in sorted(data.tariff.windows, key=lambda w: w.start):
                left, right = max(start, window.start), min(end, window.end)
                if left >= right:
                    continue
                minutes = (right - left) // timedelta(minutes=1)
                kwh = Fraction(str(profile.avg_kw)) * minutes / 60
                exact_vnd = kwh * Fraction(str(window.vnd_per_kwh))
                amount = round_vnd(exact_vnd)
                ledger.append({"job_id": job.id, "machine_id": machine_id, "component": "RUN_ELECTRICITY",
                               "start": left.isoformat(), "end": right.isoformat(), "minutes": minutes,
                               "avg_kw": profile.avg_kw, "band": window.band, "kwh_exact": energy_string(kwh),
                               "vnd_per_kwh": window.vnd_per_kwh, "exact_vnd": energy_string(exact_vnd), "cost_vnd": amount})
                electricity += amount
                energy += kwh
                band_costs[window.band] += amount
                band_energy[window.band] += kwh
            setup = transitions[machine_id, family, job.family]
            ledger.append({"job_id": job.id, "machine_id": machine_id, "component": "SETUP",
                           "from_family": family, "to_family": job.family, "minutes": setup.minutes,
                           "cost_vnd": setup.incremental_cost_vnd})
            total = electricity + setup.incremental_cost_vnd
            job_costs[job.id] = {"electricity_vnd": electricity, "setup_vnd": setup.incremental_cost_vnd,
                                "total_vnd": total, "kwh_exact": energy_string(energy)}
            machine_costs[machine_id] += total
            total_energy += energy
            family = job.family
    electric = sum(v["electricity_vnd"] for v in job_costs.values())
    setup_cost = sum(v["setup_vnd"] for v in job_costs.values())
    return {"status": "COSTED", "verification": verification, "input_hash": gate.input_hash,
            "source_type": data.metadata.source_type,
            "cost": {"label": "Modeled comparable operating cost", "currency": "VND",
                     "total_vnd": electric + setup_cost,
                     "total_kwh_exact": energy_string(total_energy),
                     "by_component": {"RUN_ELECTRICITY": electric, "SETUP": setup_cost},
                     "by_job": job_costs, "by_machine": dict(machine_costs),
                     "electricity_by_band": dict(band_costs), "ledger": ledger,
                     "kwh_by_band_exact": {band: energy_string(kwh) for band, kwh in band_energy.items()},
                     "excluded": data.cost_scope.excluded,
                     "rounding": "Exact rational arithmetic; HALF_UP to integer VND per job/tariff interval; sum rounded ledger entries"}}
