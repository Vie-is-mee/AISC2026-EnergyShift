/* Shared numerical view model. Both source contracts keep their own units and scope. */
(function (root) {
  "use strict";
  const exact = value => {
    const [a,b=1] = String(value || 0).split("/"); return Number(a) / Number(b);
  };
  function fromReport(report) {
    if (!report?.plans) return null;
    const textile = report.schema_version === "textile-demo-1";
    const horizonStart = textile ? 0 : Date.parse(report.input_snapshot.horizon.start);
    const stepMinutes = textile ? report.step_minutes : 30;
    const horizon = textile ? report.horizon_slots : Math.ceil((Date.parse(report.input_snapshot.horizon.end) - horizonStart) / (stepMinutes * 60000));
    const currency = textile ? report.currency : report.input_snapshot.metadata.currency;
    const tariff = textile ? Object.values(report.plans).find(p => p.cost)?.cost.series.price_per_kwh || [] :
      Array.from({length: horizon}, (_,i) => {
        const time = horizonStart + i * stepMinutes * 60000;
        return report.input_snapshot.tariff.windows.find(w => Date.parse(w.start) <= time && Date.parse(w.end) > time)?.vnd_per_kwh || 0;
      });
    const plans = {};
    for (const [code,p] of Object.entries(report.plans)) {
      const jobs = textile ? p.schedule.map(j => ({...j, id:j.job_id, machine:j.machine_id, start:j.start_slot,end:j.end_slot,setupStart:j.start_slot})) :
        p.verification.jobs.map(j => ({...j,id:j.job_id,machine:j.machine_id,start:(Date.parse(j.start)-horizonStart)/(stepMinutes*60000),end:(Date.parse(j.end)-horizonStart)/(stepMinutes*60000),setupStart:(Date.parse(j.setup_start)-horizonStart)/(stepMinutes*60000)}));
      const power = textile ? p.cost?.series.load_kw || [] : Array.from({length:horizon},(_,i) => {
        const a = horizonStart+i*stepMinutes*60000, b=a+stepMinutes*60000;
        return (p.cost?.ledger || []).filter(r => r.component === "RUN_ELECTRICITY").reduce((sum,r) => sum + Math.max(0,Math.min(b,Date.parse(r.end))-Math.max(a,Date.parse(r.start)))/(stepMinutes*60000)*r.avg_kw,0);
      });
      plans[code] = {code,jobs,power,verification:p.verification,total:p.cost ? (textile ? p.cost.total : p.cost.total_vnd) : null,
        electricity:p.cost ? (textile ? p.cost.electricity : p.cost.by_component.RUN_ELECTRICITY) : null,
        extra:p.cost ? (textile ? p.cost.move_cost : p.cost.by_component.SETUP) : null,
        energy:p.cost ? (textile ? p.cost.energy_kwh : exact(p.cost.total_kwh_exact)) : null,
        changed:textile ? p.cost?.changed_jobs || 0 : p.changes?.length || 0,
        grid:textile ? p.cost?.grid_kwh : exact(p.cost?.total_kwh_exact),solar:textile ? p.cost?.solar_kwh : 0};
    }
    return {report,textile,kind:textile ? "textile" : report.source_type === "SYNTHETIC" ? "synthetic" : "core",currency,horizon,horizonStart,stepMinutes,tariff,plans,
      hash:report.input_hash,sourceType:report.source_type,selected:report.decision.selected_plan,decision:report.decision.kind,
      count:plans.B0.jobs.length,machines:[...new Set(plans.B0.jobs.map(j=>j.machine))],
      index:code => plans.B0.total > 0 && plans[code].total !== null ? plans[code].total/plans.B0.total*100 : null};
  }
  function loadForJob(scene, code, job, left, right) {
    if (scene.textile) {
      const profile = scene.report.operations?.find(o=>o.id===job.id)?.power_kw || [];
      let sum=0;
      for(let t=Math.max(left,job.start);t<Math.min(right,job.end);t++) sum += profile[t-job.start] || 0;
      return sum / (right-left);
    }
    const source=scene.report.input_snapshot.jobs.find(j=>j.id===job.id);
    const kw=source?.eligible[job.machine]?.avg_kw || 0;
    return kw*Math.max(0,Math.min(right,job.end)-Math.max(left,job.start))/(right-left);
  }
  function moveSensitivity(scene, perMove) {
    if (!scene?.textile || !Number.isFinite(perMove) || perMove<0) return [];
    return Object.values(scene.plans).map(p=>({code:p.code,changed:p.changed,
      total:p.total===null ? null : p.electricity+p.changed*perMove,
      saving:p.total===null ? null : scene.plans.B0.total-p.electricity-p.changed*perMove,
      breakEven:p.changed ? (scene.plans.B0.total-p.electricity)/p.changed : null}));
  }
  // Slide facts are derived from independently verified engine plans, never typed into UI copy.
  function presentationEvidence(report) {
    if (report?.source_type !== "SYNTHETIC" || !report?.input_snapshot?.jobs || !report?.plans) return null;
    const expectedJobs = report.input_snapshot.jobs.length;
    const checked = code => {
      const p = report.plans[code];
      const verifiedJobs = p?.verification?.jobs?.length ?? 0;
      return {status: p?.verification?.status || "NOT_RUN", verifiedJobs,
        valid: p?.verification?.status === "PASS" && verifiedJobs === expectedJobs &&
          Number.isFinite(p?.cost?.total_vnd),
        cost: Number.isFinite(p?.cost?.total_vnd) ? p.cost.total_vnd : null};
    };
    const b0 = checked("B0"), b1 = checked("B1"), b2 = checked("B2"), manual = report.plans.MANUAL ? checked("MANUAL") : null;
    const savingB1 = b0.valid && b1.valid ? b0.cost - b1.cost : null;
    const savingB2 = b0.valid && b2.valid ? b0.cost - b2.cost : null;
    const b2Difference = b1.valid && b2.valid ? b1.cost - b2.cost : null;
    return {expectedJobs, b0, b1, b2, manual, savingB1, savingB2, b2Difference,
      b1Changes: report.plans.B1?.changes || [],
      decision: report.decision?.kind || "UNKNOWN",
      selectedPlan: report.decision?.selected_plan || null};
  }
  const api={fromReport,loadForJob,moveSensitivity,presentationEvidence};
  if(typeof module!=="undefined" && module.exports) module.exports=api;
  else root.DemoViewModel=api;
})(typeof window!=="undefined" ? window : globalThis);
