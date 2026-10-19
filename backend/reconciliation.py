"""Compare supplied measurements to an explicitly attested executed schedule.

This checks model error, never counterfactual savings or meter authenticity.
"""
from datetime import timedelta
from fractions import Fraction
import hashlib
import json
from typing import Annotated, Literal

from pydantic import Field

from .schemas import Model, Window, Assignment, EvidenceReference, Identifier
from .costing import cost_schedule
from .validation import validate_input


class Observation(Window):
    machine_id: Identifier | None
    kwh: Annotated[float, Field(ge=0)]
    scope: Literal["RUN_ONLY", "TOTAL_MACHINE", "TOTAL_PLANT"]
    source_type: Literal["SYNTHETIC", "MEASURED"]
    reference: EvidenceReference


class ReconciliationRequest(Model):
    snapshot: dict
    executed_schedule: Annotated[list[Assignment], Field(min_length=1, max_length=8)]
    executed_schedule_confirmed: Literal[True]
    observations: Annotated[list[Observation], Field(min_length=1, max_length=500)]


def reconcile(raw):
    request = ReconciliationRequest.model_validate(raw)
    gate = validate_input(request.snapshot)
    if gate.status != "READY":
        raise ValueError("Snapshot invalid; correct the planning input first")
    schedule = [a.model_dump(mode="json") for a in request.executed_schedule]
    checked = cost_schedule(gate.snapshot, schedule)
    if checked["status"] != "COSTED":
        raise ValueError("Executed schedule must pass the independent verifier")
    machines = {m["id"] for m in gate.snapshot["machines"]}
    horizon = Window.model_validate(gate.snapshot["horizon"])
    if len(machines) > 3 or len(gate.snapshot["jobs"]) > 8 or horizon.end-horizon.start > timedelta(hours=48):
        raise ValueError("Reconciliation demo supports 8 jobs, 3 machines, 48 hours")
    observations = sorted(request.observations, key=lambda o: (o.machine_id or "", o.start, o.end))
    groups = {}
    for row in observations:
        if row.start.utcoffset() != timedelta(hours=7) or row.end.utcoffset() != timedelta(hours=7):
            raise ValueError("Measurements require +07:00 timestamps")
        if row.start < horizon.start or row.end > horizon.end:
            raise ValueError("Measurement lies outside the executed schedule horizon")
        if row.scope != "TOTAL_PLANT" and row.machine_id not in machines:
            raise ValueError("Machine measurement needs a known machine_id")
        if row.scope == "TOTAL_PLANT" and row.machine_id is not None:
            raise ValueError("Plant meter must use null machine_id")
        key = row.machine_id
        if key in groups and row.start < groups[key]:
            raise ValueError("Overlapping observations would double-count energy")
        groups[key] = row.end
    ledger = [row for row in checked["cost"]["ledger"] if row["component"] == "RUN_ELECTRICITY"]
    from datetime import datetime
    results, errors, measured, modeled, covered = [], [], Fraction(), Fraction(), Fraction()
    for obs in observations:
        prediction = Fraction()
        for row in ledger:
            if obs.machine_id is not None and row["machine_id"] != obs.machine_id:
                continue
            start, end = datetime.fromisoformat(row["start"]), datetime.fromisoformat(row["end"])
            minutes = max(0, (min(end, obs.end)-max(start, obs.start))//timedelta(minutes=1))
            prediction += Fraction(str(row["avg_kw"]))*minutes/60
        comparable = obs.scope == "RUN_ONLY"
        value = Fraction(str(obs.kwh))
        result = {**obs.model_dump(mode="json"), "modeled_run_kwh_exact": str(prediction),
                  "status": "COMPARABLE_RUN_ONLY" if comparable else "NOT_COMPARABLE_SCOPE",
                  "note": "User-supplied measurement; meter/reference not authenticated"}
        if comparable:
            error = prediction-value
            result["error_kwh_exact"] = str(error)
            errors.append(error); measured += value; modeled += prediction; covered += prediction
        else:
            result["note"] += "; total meter includes unmodeled loads, so no accuracy score is reported"
        results.append(result)
    total_run = Fraction(checked["cost"]["total_kwh_exact"])
    metrics = None
    if errors:
        absolute = sum(map(abs, errors), Fraction())
        metrics = {"comparable_intervals": len(errors), "measured_kwh_exact": str(measured),
                   "modeled_kwh_exact": str(modeled), "mae_kwh_exact": str(absolute/len(errors)),
                   "bias_kwh_exact": str(sum(errors, Fraction())/len(errors)),
                   "wape_pct_exact": str(100*absolute/measured) if measured else None,
                   "modeled_run_energy_coverage_pct_exact": str(100*covered/total_run) if total_run else None}
    canonical = request.model_dump(mode="json")
    digest = hashlib.sha256(json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return {"status": "RECONCILED" if metrics else "NOT_COMPARABLE", "input_hash": gate.input_hash,
            "prediction_source_type": gate.snapshot["metadata"]["source_type"],
            "observation_hash": "sha256:"+digest, "source_type": "SYNTHETIC" if any(o.source_type == "SYNTHETIC" for o in observations) else "USER_SUPPLIED_MEASURED",
            "metrics": metrics, "intervals": results, "executed_schedule": schedule,
            "limitations": "Descriptive model-error checks on supplied run-only measurements; no meter authentication, calibration guarantee, statistical confidence or measured savings claim. Partial coverage does not validate the full plant."}
