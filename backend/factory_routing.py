"""Versioned, explicit operation-level routing over the verified factory-1 CP-SAT core.

factory-2 work orders have globally unique operation IDs, declared intra-order
finish-to-start arcs and an explicit unlimited intermediate-buffer assumption.
The adapter does NOT invent transfer, inventory, transport or workforce behavior.
"""
from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from datetime import datetime
from typing import Literal

from pydantic import Field, ValidationError, field_validator, model_validator

from .factory_core import (FactoryAssignment, FactoryCapability, FactoryInput,
                           FactoryMachine, FactoryMetadata, FactoryTariff,
                           analyze_factory)
from .factory_constraints import FactoryPrecedence, FactoryResourcePool
from .schemas import Identifier, Model, Window


class RouteOperation(Model):
    id: Identifier
    eligible: dict[Identifier, FactoryCapability] = Field(min_length=1, max_length=5)
    setup_family: Identifier | None = None
    demands: dict[Identifier, int] = Field(default_factory=dict, max_length=8)


class WorkOrder(Model):
    id: Identifier
    release: datetime
    due: datetime
    operations: list[RouteOperation] = Field(min_length=1, max_length=12)
    # Required even for a one-operation order ([]); never inferred from list order.
    precedence: list[FactoryPrecedence] = Field(max_length=40)

    _timestamps = field_validator("release", "due", mode="before")(Window.timestamp.__func__)

    @model_validator(mode="after")
    def ordered(self):
        if self.due <= self.release:
            raise ValueError("Work-order due must be after release")
        return self


class RouteAssignment(Model):
    operation_id: Identifier
    machine_id: Identifier
    start: datetime

    _date = field_validator("start", mode="before")(Window.timestamp.__func__)


class RoutingInput(Model):
    schema_version: Literal["factory-2"]
    metadata: FactoryMetadata
    horizon: Window
    step_minutes: Literal[5, 10, 15, 30, 60]
    machines: list[FactoryMachine] = Field(min_length=1, max_length=5)
    work_orders: list[WorkOrder] = Field(min_length=1, max_length=8)
    current_schedule: list[RouteAssignment] = Field(min_length=1, max_length=12)
    tariffs: list[FactoryTariff] = Field(min_length=1, max_length=120)
    tariff_reference: str = Field(min_length=1, max_length=200)
    setup_assumption: Literal["NO_SETUP_REQUIRED_CONFIRMED", "DECLARED_CHANGEOVERS"]
    buffer_assumption: Literal["UNLIMITED_INTERSTAGE_BUFFER_CONFIRMED"]
    resources: list[FactoryResourcePool] = Field(default_factory=list, max_length=8)
    unsupported_constraints: list[str] = Field(max_length=30)


def _blocked(code, issues):
    return {"status": "BLOCKED", "code": code, "issues": issues,
            "cost": None, "verification": {"status": "NOT_RUN"}}


def _routing_issues(data):
    issues = []
    if len({o.id for o in data.work_orders}) != len(data.work_orders):
        issues.append({"code": "WORK_ORDER_DUPLICATE"})
    op_owner = {}
    multistage = False
    for order in data.work_orders:
        local = {op.id for op in order.operations}
        if len(local) != len(order.operations):
            issues.append({"code": "OPERATION_DUPLICATE", "work_order_id": order.id})
        if len(local) >= 2:
            multistage = True
        for op in order.operations:
            if op.id in op_owner:
                issues.append({"code": "OPERATION_NOT_GLOBAL_UNIQUE", "operation_id": op.id})
            op_owner[op.id] = order.id
        edges = [(edge.before, edge.after) for edge in order.precedence]
        if len(set(edges)) != len(edges):
            issues.append({"code": "ROUTE_EDGE_DUPLICATE", "work_order_id": order.id})
        if any(a not in local or b not in local or a == b for a, b in edges):
            issues.append({"code": "ROUTE_EDGE_INVALID", "work_order_id": order.id})
        if len(local) > 1:
            if not edges:
                issues.append({"code": "ROUTE_EDGES_REQUIRED", "work_order_id": order.id})
            else:
                linked = {k: set() for k in local}
                for a, b in edges:
                    if a in local and b in local and a != b:
                        linked[a].add(b)
                        linked[b].add(a)
                seen = set()
                stack = [next(iter(local))]
                while stack:
                    curr = stack.pop()
                    if curr not in seen:
                        seen.add(curr)
                        stack.extend(linked[curr] - seen)
                if seen != local:
                    issues.append({"code": "ROUTE_DISCONNECTED", "work_order_id": order.id})
    if not multistage:
        issues.append({"code": "ROUTING_REQUIRES_MULTISTAGE"})
    if len(op_owner) > 12:
        issues.append({"code": "OPERATION_LIMIT", "maximum": 12})
    assignment_ids = [a.operation_id for a in data.current_schedule]
    if sorted(assignment_ids) != sorted(op_owner):
        issues.append({"code": "ROUTING_BASELINE_COVERAGE"})
    return issues, op_owner


def _to_factory1(data):
    jobs = []
    edges = []
    for order in data.work_orders:
        for op in order.operations:
            jobs.append({"id": op.id, "release": order.release.isoformat(),
                         "due": order.due.isoformat(), "eligible": op.model_dump(mode="json")["eligible"],
                         "setup_family": op.setup_family, "demands": op.demands})
        edges.extend(edge.model_dump(mode="json") for edge in order.precedence)
    return {
        "schema_version": "factory-1", "metadata": data.metadata.model_dump(mode="json"),
        "horizon": data.horizon.model_dump(mode="json"),
        "step_minutes": data.step_minutes,
        "machines": [m.model_dump(mode="json") for m in data.machines],
        "jobs": jobs,
        "current_schedule": [
            {"job_id": a.operation_id, "machine_id": a.machine_id, "start": a.start.isoformat()}
            for a in data.current_schedule
        ],
        "tariffs": [t.model_dump(mode="json") for t in data.tariffs],
        "tariff_reference": data.tariff_reference, "setup_assumption": data.setup_assumption,
        "resources": [r.model_dump(mode="json") for r in data.resources],
        "precedence": edges,
        "unsupported_constraints": data.unsupported_constraints,
    }


def _annotate_plan(plan, data, owner):
    """Derive work-order reports ONLY from verified operations and published ledgers."""
    for row in plan["verification"]["jobs"]:
        row["operation_id"] = row["job_id"]
        row["work_order_id"] = owner[row["job_id"]]
    for row in plan["schedule"]:
        row["operation_id"] = row["job_id"]
        row["work_order_id"] = owner[row["job_id"]]
    if plan["verification"]["status"] != "PASS" or plan["cost"] is None:
        return
    for entry in plan["cost"]["ledger"]:
        entry["operation_id"] = entry["job_id"]
        entry["work_order_id"] = owner[entry["job_id"]]
    for entry in plan["cost"]["changeover_ledger"]:
        entry["operation_id"] = entry["job_id"]
        entry["work_order_id"] = owner[entry["job_id"]]
    by_id = {row["job_id"]: row for row in plan["verification"]["jobs"]}
    operation_cost = defaultdict(int)
    for entry in plan["cost"]["ledger"]:
        operation_cost[entry["job_id"]] += entry["vnd"]
    for entry in plan["cost"]["changeover_ledger"]:
        operation_cost[entry["job_id"]] += entry["flat_cost_vnd"]
    orders = []
    for work in data.work_orders:
        records = [by_id[op.id] for op in work.operations]
        orders.append({
            "work_order_id": work.id,
            "start": min(row["start"] for row in records),
            "completion": max(row["end"] for row in records),
            "operation_count": len(records),
            "operations": [{
                "operation_id": op.id, "machine_id": by_id[op.id]["machine_id"],
                "start": by_id[op.id]["start"], "end": by_id[op.id]["end"],
                "modeled_cost_vnd": operation_cost[op.id]
            } for op in work.operations],
            "modeled_cost_vnd": sum(operation_cost[op.id] for op in work.operations),
        })
    if sum(order["modeled_cost_vnd"] for order in orders) != plan["cost"]["total_vnd"]:
        raise AssertionError("Factory routing cost reconciliation failed")
    plan["work_orders"] = orders
    plan["verification"]["operations"] = plan["verification"]["jobs"]


def analyze_factory_routing(raw, *, mode="FIXED_MACHINE", objective_mode="ENERGY",
                            max_makespan_slack_minutes=0):
    """Strict adapter: no invalid routing receives a published cost or comparison."""
    if mode not in ("FIXED_MACHINE", "JOINT_MACHINE_TIME"):
        return _blocked("UNSUPPORTED_MODE", [])
    try:
        data = RoutingInput.model_validate(raw)
    except ValidationError as exc:
        return _blocked("SCHEMA_INVALID", [{"field": ".".join(map(str, e["loc"])),
                                            "code": e["type"]}
                                           for e in exc.errors(include_input=False, include_url=False)][:30])
    if data.unsupported_constraints:
        return _blocked("UNSUPPORTED_CONSTRAINTS",
                        [{"code": "NOT_ENFORCED", "constraint": name} for name in data.unsupported_constraints])
    problems, owner = _routing_issues(data)
    if problems:
        return _blocked("ROUTING_INVALID", problems)
    canonical = json.dumps(data.model_dump(mode="json"), sort_keys=True, ensure_ascii=False,
                           separators=(",", ":"))
    source_hash = "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    virtual_input = _to_factory1(data)
    report = analyze_factory(virtual_input, mode=mode, objective_mode=objective_mode,
                             max_makespan_slack_minutes=max_makespan_slack_minutes)
    report["compiled_input_hash"] = report.get("input_hash")
    report["schema_version"] = "factory-2"
    report["input_hash"] = source_hash
    if "enforced_constraints" in report:
        report["enforced_constraints"].append("OPERATION_ROUTING")
    report["operation_count"] = len(owner)
    report["work_order_count"] = len(data.work_orders)
    report["buffer_assumption"] = data.buffer_assumption
    report["routing_scope"] = "Explicit work-order operation DAG, renewable capacities and per-operation machine eligibility"
    if "limitations" in report:
        report["limitations"] = [
            "Each operation runs non-preemptively on one eligible machine; multi-operation routes enforce declared DAG arcs"
            if item.startswith("Non-preemptive one-stage jobs") else item
            for item in report["limitations"]
        ]
    report.setdefault("limitations", []).extend([
        "Interstage buffers explicitly assumed unlimited; no material inventory or transfer times inferred",
        "Work-order routing is a strict operation-level adapter over verified factory-1 CP-SAT",
    ])
    if "plans" in report:
        for plan in report["plans"].values():
            _annotate_plan(plan, data, owner)
    return report
