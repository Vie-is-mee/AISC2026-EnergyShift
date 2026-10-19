"""Versioned input models. No schedules, prices or verdicts are invented here."""
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


class Window(Model):
    start: datetime
    end: datetime

    @field_validator("start", "end", mode="before")
    @classmethod
    def timestamp(cls, value):
        if isinstance(value, str):
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Use an ISO timestamp with an explicit UTC offset")
        if value.second or value.microsecond:
            raise ValueError("demo input requires whole-minute timestamps")
        return value

    @model_validator(mode="after")
    def ordered(self):
        if self.end <= self.start:
            raise ValueError("end must be after start")
        return self


Identifier = Annotated[str, Field(min_length=1, pattern=r"^[A-Za-z0-9_-]+$")]
Nonnegative = Annotated[float, Field(ge=0)]
EvidenceReference = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class Metadata(Model):
    dataset_id: Identifier
    source_type: Literal["SYNTHETIC", "MEASURED", "PARTNER_EXPORT", "ESTIMATED"]
    plant_alias: Identifier
    timezone: Literal["Asia/Ho_Chi_Minh"]
    currency: Literal["VND"]


class Machine(Model):
    id: Identifier
    available: Annotated[list[Window], Field(min_length=1)]


class Mold(Model):
    id: Identifier
    # Each ID represents one physical mold; shared use is exclusive.


class LotConfirmation(Model):
    quantity: Annotated[int, Field(gt=0)]
    duration_min: Annotated[int, Field(gt=0)]
    source_type: Literal["SYNTHETIC", "MEASURED", "ESTIMATED", "PARTNER_CONFIRMED"]
    reference: EvidenceReference


class Processing(Model):
    duration_min: Annotated[int, Field(gt=0)]
    avg_kw: Nonnegative
    power_source: Literal["SYNTHETIC", "MEASURED", "ESTIMATED"]
    lot_confirmation: LotConfirmation
    power_uncertainty_pct: Annotated[float | None, Field(ge=0, le=1)] = None


class Job(Model):
    id: Identifier
    quantity: Annotated[int, Field(gt=0)]
    family: Identifier
    mold_id: Identifier
    release: datetime
    due: datetime
    eligible: Annotated[dict[Identifier, Processing], Field(min_length=1)]

    _dates = field_validator("release", "due", mode="before")(Window.timestamp.__func__)

    @model_validator(mode="after")
    def ordered(self):
        if self.due <= self.release:
            raise ValueError("due must be after release")
        return self


class Assignment(Model):
    job_id: Identifier
    machine_id: Identifier
    start: datetime

    _date = field_validator("start", mode="before")(Window.timestamp.__func__)


class Transition(Model):
    machine_id: Identifier
    from_family: Identifier
    to_family: Identifier
    minutes: Annotated[int, Field(ge=0)]
    incremental_cost_vnd: Annotated[int, Field(ge=0)]


class MoldChange(Model):
    minutes: Annotated[int, Field(gt=0)]
    incremental_cost_vnd: Annotated[int, Field(ge=0)]
    source_type: Literal["SYNTHETIC", "MEASURED", "ESTIMATED", "PARTNER_CONFIRMED"]
    reference: EvidenceReference


class Setup(Model):
    family_transition_scope: Literal["ADDITIONAL_CLEANING_ONLY"]
    mold_occupancy_policy: Literal["HOLD_UNTIL_REPLACEMENT_COMPLETE"]
    initial_family_by_machine: dict[Identifier, Identifier]
    initial_mold_by_machine: dict[Identifier, Identifier | None]
    mold_change_by_machine: dict[Identifier, MoldChange]
    transitions: list[Transition]


class TariffWindow(Window):
    band: Literal["OFF_PEAK", "NORMAL", "PEAK"]
    vnd_per_kwh: Nonnegative


class Tariff(Model):
    provenance: Annotated[str, Field(min_length=1)]
    coverage_requirement: Literal["FULL_HORIZON"]
    windows: Annotated[list[TariffWindow], Field(min_length=1)]


class ExcludedCostReview(Model):
    status: Literal["BOUNDED", "UNKNOWN"]
    incremental_min_vnd: int | None
    incremental_max_vnd: int | None
    source_type: Literal["SYNTHETIC", "MEASURED", "ESTIMATED", "PARTNER_CONFIRMED"]
    reference: EvidenceReference

    @model_validator(mode="after")
    def consistent(self):
        low, high = self.incremental_min_vnd, self.incremental_max_vnd
        if self.status == "UNKNOWN":
            if low is not None or high is not None:
                raise ValueError("UNKNOWN costs must have null bounds")
        elif low is None or high is None or low > high:
            raise ValueError("BOUNDED costs require ordered integer VND bounds")
        return self


class CostScope(Model):
    included: Literal["RUN_ELECTRICITY_AND_SETUP"]
    excluded: list[Literal["LABOR_OVERTIME", "IDLE_ENERGY", "SETUP_ENERGY", "OTHER_COSTS"]]
    review_scope: Literal["ALL_SINGLE_JOB_MOVES_IN_HORIZON", "ALL_CANDIDATE_SCHEDULES_IN_HORIZON"]
    excluded_review: dict[str, ExcludedCostReview]


class Policy(Model):
    version: Literal["policy-1"]
    min_net_saving_vnd: Annotated[int, Field(ge=0)]
    min_net_saving_pct: Annotated[float, Field(ge=0, le=100)]
    min_b2_incremental_vnd: Annotated[int, Field(ge=0)]
    power_uncertainty_pct: Annotated[float, Field(ge=0, le=1)]
    require_all_hard_constraints_pass: Literal[True]


class Dataset(Model):
    schema_version: Literal["demo-3"]
    metadata: Metadata
    horizon: Window
    machines: Annotated[list[Machine], Field(min_length=1)]
    molds: Annotated[list[Mold], Field(min_length=1)]
    jobs: Annotated[list[Job], Field(min_length=1)]
    current_schedule: Annotated[list[Assignment], Field(min_length=1)]
    setup: Setup
    tariff: Tariff
    cost_scope: CostScope
    policy: Policy
