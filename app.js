"use strict";
// Approved cockpit, driven only by independently verified API results.
const $ = (id) => document.getElementById(id);
function node(tag, value, className) {
  const e = document.createElement(tag);
  if (value != null) e.textContent = value;
  if (className) e.className = className;
  return e;
}
const put = (id, value) => {
  if ($(id)) $(id).textContent = value;
};
const money = (value) => Number(value).toLocaleString("vi-VN") + " đ";
const exact = (value) => {
  const [a, b = 1] = String(value).split("/");
  return Number(a) / Number(b);
};
let currentReport = null,
  sample = null,
  pending = false,
  preparing = false,
  revision = 0,
  activeGanttPlan = "compare",
  activeMetric = "power",
  fixtureLoading = false,
  fixtureRequest = 0,
  lastFocus = null;
function switchMainTab(id) {
  document.body.dataset.view = id;
  document
    .querySelectorAll(".tab-pane")
    .forEach((e) => e.classList.toggle("active", e.id === id));
  document
    .querySelectorAll("[data-tab]")
    .forEach((e) => e.classList.toggle("active", e.dataset.tab === id));
  closeMobileNav();
}
window.Workspace = { show: switchMainTab };
function closeMobileNav() {
  document.body.classList.remove("mobile-nav-open");
  $("menuToggle")?.setAttribute("aria-expanded", "false");
  $("mainRail")?.setAttribute(
    "aria-hidden",
    String(matchMedia("(max-width:900px)").matches),
  );
}
function toggleMobileNav() {
  const open = !document.body.classList.contains("mobile-nav-open");
  document.body.classList.toggle("mobile-nav-open", open);
  $("menuToggle")?.setAttribute("aria-expanded", String(open));
  $("mainRail")?.setAttribute("aria-hidden", String(!open));
}
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  if ($("themeIconSun"))
    $("themeIconSun").style.display =
      theme === "dark" ? "none" : "inline-block";
  if ($("themeIconMoon"))
    $("themeIconMoon").style.display =
      theme === "dark" ? "inline-block" : "none";
}
function toggleAppTheme() {
  const theme =
    document.documentElement.dataset.theme === "light" ? "dark" : "light";
  applyTheme(theme);
  try {
    localStorage.setItem("energyshift_theme", theme);
  } catch {
    /* optional */
  }
}
function toast(message) {
  put("appToast", message);
  $("appToast")?.classList.add("show");
  setTimeout(() => $("appToast")?.classList.remove("show"), 4500);
}
function table(id, rows) {
  if ($(id))
    $(id).replaceChildren(
      ...rows.map((values) => {
        const tr = node("tr");
        values.forEach((v) => tr.append(node("td", v)));
        return tr;
      }),
    );
}
function clearResult() {
  humanReviews.clear();
  scheduleDraft = null;
  scheduleEditorState = null;
  if ($("scheduleEditForm")) $("scheduleEditForm").hidden = true;
  if ($("chartTooltip")) $("chartTooltip").style.display = "none";
  if ($("measurementConfirmed")) $("measurementConfirmed").checked = false;
  put("measurementResult", "Chưa có đối chiếu cho đầu vào hiện tại.");
  revision++;
  currentReport = null;
  if ($("verdictHeroCard"))
    $("verdictHeroCard").className = "command-verdict-card";
  put(
    "peakComparisonNote",
    "Chưa có kết quả cho đầu vào hiện tại. Chưa thể kết luận thay đổi đỉnh tải.",
  );
  put("loadComparisonTitle", "Phụ tải và tiền điện của lịch đề xuất");
  put("chartSelectedLabel", "Chưa có lịch đề xuất");
  closeModal();
  [
    "hourlyDetails",
    "validationEvidence",
    "plansGrid",
    "costBreakdownContent",
    "touDistContent",
    "ganttLanes",
    "scheduleJobRows",
    "validationList",
    "sensitivityTbody",
    "transformerMonitorContent",
    "memoContent",
    "elecLineChartSvg",
  ].forEach((id) => $(id)?.replaceChildren());
  [
    "kpiTotalCost",
    "kpiDeltaCost",
    "kpiElectricitySaved",
    "kpiPeakKwhReduced",
    "kpiSetupCostChange",
    "kpiJobsShifted",
    "hudHourVal",
    "hudTariffVal",
    "hudB0Val",
    "hudB2Val",
    "hudSavingVal",
    "circuitPmaxLive",
    "kpiVerification",
  ].forEach((id) => put(id, "—"));
  put("verdictBadgeText", "Chưa phân tích");
  put("verdictHeading", "Chuẩn bị dữ liệu và phân tích kế hoạch");
  put(
    "verdictExplanation",
    "Mở Điều chuyển đơn hàng để nhập hoặc chọn dữ liệu mẫu. Kết quả chỉ xuất hiện sau khi backend kiểm tra lịch và tính lại chi phí.",
  );
  put("kpiPlanTag", "Chưa có kết quả");
  put("sensitivityNote", "Chưa có kết quả cho đầu vào hiện tại.");
  put("validationConfirmNotice", "Chưa kiểm tra đầu vào hiện tại.");
  put("confirmationProgress", "Chưa kiểm tra");
  put(
    "scheduleConflictReport",
    "Chưa có lịch đã được kiểm tra cho đầu vào hiện tại.",
  );
  put("scheduleListCount", "0");
  put("status", "Chưa có kết quả tính toán.");
  put("ganttChangeFeedback", "Chưa có lịch đã kiểm chứng.");
  put("transSafetyBadge", "Chưa xác định");
  put("circuitModeBadge", "Mô hình · chưa phân tích");
  for (let i = 1; i <= 5; i++) put("kwM" + i, "—");
}
function syncQuick(data) {
  $("minSaving").value = data.policy.min_net_saving_vnd;
  $("power").value = data.jobs[0]?.eligible.M1?.avg_kw ?? "";
}
function setDataset(data) {
  clearResult();
  $("dataset").value = JSON.stringify(data, null, 2);
  syncQuick(data);
  document.dispatchEvent(
    new CustomEvent("energyshift:dataset", { detail: data }),
  );
  $("analyze").disabled = false;
  put("qualityNumber", `${data.jobs.length} lô`);
  put("liveTariffBadge", data.metadata.source_type);
  const labels = document.querySelectorAll(
    ".plant-context-ribbon .ribbon-text",
  );
  labels[0].textContent = `${data.metadata.plant_alias} · ${data.metadata.source_type}`;
  labels[1].textContent = `${data.jobs.length} lô / ${data.machines.length} máy`;
  scheduleDraft = structuredClone(data);
  activeGanttPlan = "b0";
  renderGantt();
}
function errors(items) {
  $("errors").replaceChildren(
    ...items.map((v) =>
      node("li", typeof v === "string" ? v : JSON.stringify(v)),
    ),
  );
  $("errors").hidden = !items.length;
  if (items.length) {
    switchMainTab("tab-dispatch");
    $("errors").scrollIntoView({ block: "center" });
  }
}
function referencePlan() {
  return currentReport?.decision.selected_plan || "B0";
}
function peak(plan) {
  const events = new Map();
  plan.cost.ledger
    .filter((r) => r.component === "RUN_ELECTRICITY")
    .forEach((r) => {
      for (const [time, sign] of [
        [r.start, 1],
        [r.end, -1],
      ]) {
        const t = Date.parse(time);
        events.set(t, (events.get(t) || 0) + sign * r.avg_kw);
      }
    });
  let sum = 0,
    max = 0;
  [...events]
    .sort((a, b) => a[0] - b[0])
    .forEach(([, v]) => {
      sum += v;
      max = Math.max(max, sum);
    });
  return max;
}
function renderReport(report) {
  scheduleDraft = null;
  scheduleEditorState = null;
  activeGanttPlan = "compare";
  if (report.input_preparation === undefined) {
    const evidence = window.InputDesk?.evidence();
    report.input_preparation =
      evidence?.input_hash === report.input_hash ? evidence : null;
  }
  currentReport = report;
  const plans = report.plans,
    chosen = report.decision.selected_plan,
    ref = referencePlan(),
    base = plans.B0.cost,
    selected = plans[chosen].cost;
  const labels = {
    CHANGE: "Có phương án đạt ngưỡng",
    USE_SIMPLE_RULE: "Ưu tiên quy tắc đơn giản",
    KEEP_CURRENT: "Giữ lịch hiện tại",
    MEASURE_FIRST: "Cần bổ sung bằng chứng",
  };
  $("verdictHeroCard").className =
    "command-verdict-card verdict-" +
    ({
      CHANGE: "change",
      USE_SIMPLE_RULE: "simple",
      KEEP_CURRENT: "keep",
      MEASURE_FIRST: "measure",
    }[report.decision.kind] || "measure");
  const reasons = {
    B2_COST_REVIEW_REQUIRED:
      "B2 chưa được xác nhận đầy đủ chi phí ngoài mô hình.",
    B2_INCREMENTAL_VALUE_ROBUST:
      "B2 có lợi ích tăng thêm đạt ngưỡng ngay cả ở biên bất lợi.",
    B2_INCREMENTAL_VALUE_NOT_ESTABLISHED:
      "Chưa chứng minh được lợi ích tăng thêm B2 đủ lớn; ưu tiên B1.",
    CANDIDATES_NEED_MORE_EVIDENCE:
      "Cần rà soát chi phí hoặc độ bất định trước khi đổi lịch.",
    NO_QUALIFYING_CANDIDATE_IN_SEARCHED_DOMAIN:
      "Chưa tìm được lịch đạt ngưỡng trong phạm vi đã tìm.",
    B2_SEARCH_INCOMPLETE:
      "B2 chưa hoàn tất tìm kiếm; giữ ứng viên tốt nhất đã kiểm tra.",
  };
  put("verdictBadgeText", report.decision.kind);
  put("verdictHeading", labels[report.decision.kind] || report.decision.kind);
  put(
    "verdictExplanation",
    `Đề xuất ${chosen}. Nguồn ${report.source_type}; chi phí gồm điện và chuyển đổi đã khai báo. ${report.decision.reason_codes
      .map((c) => reasons[c])
      .filter(Boolean)
      .join(" ")} ${solverScope(report)}`,
  );
  put("kpiPlanTag", `Đề xuất ${chosen}`);
  put("kpiTotalCost", money(selected.total_vnd));
  put("kpiDeltaCost", money(base.total_vnd - selected.total_vnd));
  put(
    "kpiElectricitySaved",
    money(
      base.by_component.RUN_ELECTRICITY - selected.by_component.RUN_ELECTRICITY,
    ),
  );
  put(
    "kpiPeakKwhReduced",
    `${(exact(base.kwh_by_band_exact.PEAK || 0) - exact(selected.kwh_by_band_exact.PEAK || 0)).toFixed(2)} kWh cao điểm`,
  );
  put(
    "kpiSetupCostChange",
    money(selected.by_component.SETUP - base.by_component.SETUP),
  );
  put("kpiJobsShifted", plans[chosen].changes?.length || 0);
  put("kpiVerification", plans[chosen].verification.status);
  put("status", `${report.run_id} · ${report.input_hash}`);
  $("plansGrid").replaceChildren(
    ...["B0", "B1", "B2"].map((code) => {
      const p = plans[code],
        card = node(
          "div",
          null,
          "plan-card" + (chosen === code ? " plan-recommended" : ""),
        ),
        header = node("div", null, "plan-header-row"),
        hero = node("div", null, "plan-cost-hero");
      header.append(
        node("span", code, "plan-code-badge"),
        node(
          "span",
          chosen === code ? "Đề xuất" : "Đối chứng",
          "plan-status-pill",
        ),
      );
      hero.append(
        node("div", "Điện + chuyển đổi mô hình", "cost-hero-label"),
        node("div", money(p.cost.total_vnd), "cost-hero-number"),
      );
      card.append(
        header,
        node(
          "h3",
          code === "B0"
            ? "Lịch hiện tại"
            : code === "B1"
              ? "Dịch một công việc"
              : "Dịch phối hợp",
          "plan-name",
        ),
        hero,
        node(
          "p",
          `Kiểm tra lịch: ${p.verification.status} · ${p.changes?.length || 0} công việc đổi lịch`,
          "plan-desc",
        ),
      );
      if (code === "B2")
        card.append(
          node(
            "p",
            `${p.solver_status === "OPTIMAL" ? "Đã tìm tối ưu trong miền giới hạn" : "Chưa chứng minh tối ưu; có thể giữ lịch B0/B1"}. ${report.coordinated_economics.B2.status === "UNKNOWN_SCOPE" ? "Cần xác nhận chi phí phối hợp." : "Xem Độ nhạy & Rủi ro trước khi áp dụng."}`,
            "plan-desc",
          ),
        );
      return card;
    }),
  );
  $("costBreakdownContent").replaceChildren(
    ...["RUN_ELECTRICITY", "SETUP"].map((c) =>
      node(
        "p",
        `${c === "SETUP" ? "Chuyển đổi" : "Điện"}: B0 ${money(base.by_component[c])} → ${ref} ${money(plans[ref].cost.by_component[c])}`,
      ),
    ),
  );
  $("touDistContent").replaceChildren(
    ...["B0", "B1", "B2"].map((code) =>
      node(
        "p",
        `${code}: ${Object.entries(plans[code].cost.kwh_by_band_exact)
          .map(([band, v]) => `${band} ${exact(v).toFixed(2)} kWh`)
          .join(" · ")}`,
      ),
    ),
  );
  $("validationPlanSelect").value = chosen.toLowerCase();
  $("btnViewCompare").textContent = `B0 và lịch đề xuất ${chosen}`;
  put(
    "loadComparisonTitle",
    `Phụ tải và tiền điện: B0 so với lịch đề xuất ${chosen}`,
  );
  put("chartBaselineLabel", "Lịch gốc B0");
  put("chartSelectedLabel", `Lịch đề xuất ${chosen}`);
  const deltaPeak = peak(plans[chosen]) - peak(plans.B0);
  put(
    "peakComparisonNote",
    `Đỉnh công suất chạy: B0 ${peak(plans.B0).toFixed(2)} kW → ${chosen} ${peak(plans[chosen]).toFixed(2)} kW (${deltaPeak > 0 ? "tăng" : "giảm"} ${Math.abs(deltaPeak).toFixed(2)} kW). Mục tiêu hiện tại là giảm chi phí điện và chuyển đổi, không phải cắt đỉnh. Chưa gồm phụ tải nền/chờ/setup.`,
  );
  document.querySelectorAll(".circuit-machine-text").forEach((element, i) => {
    const m = report.input_snapshot.machines[i];
    element.replaceChildren(
      document.createTextNode(
        m ? `${m.id}: theo hồ sơ` : "Không có máy trong hồ sơ",
      ),
    );
  });
  renderGantt();
  renderValidation();
  renderRisk();
  renderChart();
  put("circuitModeBadge", "Tính từ lịch · không phải IoT");
  put("circuitPmaxLive", `${peak(plans[ref]).toFixed(2)} kW`);
  put("transSafetyBadge", "Chưa có định mức TBA");
  $("transformerMonitorContent").replaceChildren(
    node(
      "p",
      `Đỉnh phụ tải chạy theo lịch ${ref}: ${peak(plans[ref]).toFixed(2)} kW. Chưa có công suất nền và định mức TBA để kết luận an toàn.`,
    ),
  );
}
async function selectGanttPlan(value) {
  if (scheduleEditorState) {
    toast("Lưu hoặc đóng chỉnh sửa trước khi đổi phương án.");
    return;
  }
  if (!currentReport && value !== "b0") {
    if (pending || preparing || fixtureLoading) {
      toast("Đang tính lịch. Chờ hoàn thành rồi chọn phương án.");
      return;
    }
    toast("Đang tính B0/B1/B2 từ bản nháp hiện tại…");
    await revalidateDashboard();
    switchMainTab("tab-gantt");
    if (!currentReport) return;
  }
  activeGanttPlan = value;
  renderGantt();
}
function switchChartMetric(value) {
  activeMetric = value;
  renderChart();
}
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type })),
    a = node("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function openModal(id) {
  lastFocus = document.activeElement;
  $(id).classList.add("open");
  document.body.classList.add("modal-open");
  $(id).querySelector("button")?.focus();
}
function closeModal() {
  document
    .querySelectorAll(".modal-backdrop")
    .forEach((e) => e.classList.remove("open"));
  document.body.classList.remove("modal-open");
  lastFocus?.focus();
  lastFocus = null;
}
// Drafts share the canonical input model. Only the backend can certify a schedule.
let scheduleDraft = null;
let scheduleEditorState = null;
const humanReviews = new Map();
function localMinute(value) {
  return new Date(Date.parse(value) + 7 * 3600000).toISOString().slice(0, 16);
}
function inputTimestamp(value) {
  if (!value || !Number.isFinite(Date.parse(value + "+07:00")))
    throw Error("Nhập đầy đủ ngày và giờ.");
  return value + ":00+07:00";
}
function scheduleInput(code) {
  const data = structuredClone(
    currentReport?.input_snapshot ||
      scheduleDraft ||
      JSON.parse($("dataset").value),
  );
  if (currentReport) {
    const plan = currentReport.plans[code];
    if (!plan?.schedule?.length)
      throw Error("Phương án chưa có lịch để chỉnh sửa.");
    data.current_schedule = structuredClone(plan.schedule);
  }
  return data;
}
function bindScheduleDrag(pill, job, code, track, data) {
  let dragged = false;
  pill.dataset.jobId = job.job_id;
  pill.dataset.planCode = code;
  pill.style.touchAction = "pan-y";
  pill.setAttribute("aria-label", `${code} · ${job.job_id}. Kéo ngang để dời giờ; Alt và phím trái/phải để dời 30 phút.`);
  const shiftedData = (minutes) => {
    const candidate = scheduleInput(code);
    const assignment = candidate.current_schedule.find(a => a.job_id === job.job_id);
    assignment.start = localMinute(new Date(Date.parse(assignment.start) + minutes * 60000).toISOString()) + ":00+07:00";
    return candidate;
  };
  const boundDelta = minutes => {
    const lower = Math.ceil((Date.parse(data.horizon.start) - Date.parse(job.start) + job.setup_minutes * 60000) / 1800000) * 30;
    const upper = Math.floor((Date.parse(data.horizon.end) - Date.parse(job.end)) / 1800000) * 30;
    return lower <= upper ? Math.max(lower, Math.min(upper, minutes)) : 0;
  };
  pill.onclick = () => {
    if (dragged) { dragged = false; return; }
    openScheduleEditor(job.job_id, false, code);
  };
  pill.onkeydown = event => {
    if (!event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    if (scheduleEditorState) { toast("Lưu hoặc đóng chỉnh sửa trước khi dời lô."); return; }
    const minutes = boundDelta(event.key === "ArrowLeft" ? -30 : 30);
    if (!minutes) return;
    commitScheduleDraft(shiftedData(minutes));
    document.querySelector(`[data-job-id="${job.job_id}"]`)?.focus();
  };
  pill.onpointerdown = event => {
    if (event.button !== 0 || !event.isPrimary) return;
    if (scheduleEditorState) { toast("Lưu hoặc đóng chỉnh sửa trước khi kéo lô."); return; }
    const originX = event.clientX, width = track.getBoundingClientRect().width;
    if (!width) return;
    const spanMinutes = (Date.parse(data.horizon.end) - Date.parse(data.horizon.start)) / 60000;
    let minutes = 0;
    dragged = false;
    pill.setPointerCapture(event.pointerId);
    const move = next => {
      if (next.pointerId !== event.pointerId) return;
      if (Math.abs(next.clientX - originX) < 5 && !dragged) return;
      dragged = true;
      minutes = boundDelta(Math.round((next.clientX - originX) / width * spanMinutes / 30) * 30);
      pill.classList.add("job-dragging");
      pill.style.transform = `translateX(${minutes / spanMinutes * width}px)`;
      put("ganttChangeFeedback", `${job.job_id}: ${localMinute(new Date(Date.parse(job.start) + minutes * 60000).toISOString()).replace("T", " ")} · thả chuột để lưu bản nháp (${minutes >= 0 ? "+" : ""}${minutes} phút).`);
    };
    const finish = next => {
      if (next.pointerId !== event.pointerId) return;
      pill.removeEventListener("pointermove", move);
      pill.removeEventListener("pointerup", finish);
      pill.removeEventListener("pointercancel", cancel);
      if (pill.hasPointerCapture(event.pointerId)) pill.releasePointerCapture(event.pointerId);
      pill.classList.remove("job-dragging"); pill.style.transform = "";
      if (dragged && minutes) commitScheduleDraft(shiftedData(minutes));
      else if (dragged) renderGantt();
    };
    const cancel = next => {
      if (next.pointerId !== event.pointerId) return;
      minutes = 0; dragged = false;
      finish(next);
      renderGantt();
    };
    pill.addEventListener("pointermove", move);
    pill.addEventListener("pointerup", finish);
    pill.addEventListener("pointercancel", cancel);
  };
}
function previewJobs(data) {
  const rows = [];
  for (const machine of data.machines) {
    let family = data.setup.initial_family_by_machine[machine.id];
    let mold = data.setup.initial_mold_by_machine[machine.id];
    for (const a of data.current_schedule
      .filter((a) => a.machine_id === machine.id)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))) {
      const job = data.jobs.find((j) => j.id === a.job_id);
      const process = job?.eligible[machine.id];
      if (!process) continue;
      const transition = data.setup.transitions.find(
        (t) =>
          t.machine_id === machine.id &&
          t.from_family === family &&
          t.to_family === job.family,
      );
      const setup =
        (transition?.minutes || 0) +
        (mold !== job.mold_id
          ? data.setup.mold_change_by_machine[machine.id].minutes
          : 0);
      rows.push({
        job_id: job.id,
        machine_id: machine.id,
        start: a.start,
        end: new Date(
          Date.parse(a.start) + process.duration_min * 60000,
        ).toISOString(),
        setup_start: new Date(
          Date.parse(a.start) - setup * 60000,
        ).toISOString(),
        setup_minutes: setup,
      });
      family = job.family;
      mold = job.mold_id;
    }
  }
  return rows;
}
function draftWarnings(data, jobs) {
  const warnings = [];
  for (const job of jobs) {
    if (
      Date.parse(job.setup_start) < Date.parse(data.horizon.start) ||
      Date.parse(job.end) > Date.parse(data.horizon.end)
    )
      warnings.push(job.job_id + ": ngoài chân trời lập lịch.");
    const source = data.jobs.find((j) => j.id === job.job_id);
    if (
      Date.parse(job.start) < Date.parse(source.release) ||
      Date.parse(job.end) > Date.parse(source.due)
    )
      warnings.push(job.job_id + ": ngoài thời gian cho phép hoặc quá hạn.");
    for (const other of jobs) {
      if (other.job_id >= job.job_id || other.machine_id !== job.machine_id)
        continue;
      if (
        Date.parse(job.setup_start) < Date.parse(other.end) &&
        Date.parse(other.setup_start) < Date.parse(job.end)
      )
        warnings.push(
          job.job_id + " / " + other.job_id + ": trùng máy kể cả setup.",
        );
    }
  }
  return warnings;
}
function renderGantt() {
  let data,
    draft = !currentReport,
    codes,
    previews = null;
  if (scheduleEditorState) {
    try {
      data = readScheduleEditor(false);
      draft = true;
    } catch {
      data = scheduleEditorState.data;
    }
    draft = true;
  } else data = currentReport?.input_snapshot || scheduleDraft;
  if (!data) return;
  codes = draft
    ? ["B0"]
    : activeGanttPlan === "compare"
      ? [...new Set(["B0", referencePlan()])]
      : [activeGanttPlan.toUpperCase()];
  if (draft) previews = previewJobs(data);
  document.querySelectorAll("[data-plan]").forEach((e) => {
    e.classList.toggle(
      "active",
      e.dataset.plan === (draft ? "b0" : activeGanttPlan),
    );
    e.disabled = pending || preparing;
  });
  const start = Date.parse(data.horizon.start),
    span = Date.parse(data.horizon.end) - start;
  const percent = (value) =>
    Math.max(0, Math.min(100, ((Date.parse(value) - start) * 100) / span));
  document
    .querySelector(".gantt-hours-track")
    .replaceChildren(
      ...Array.from({ length: 13 }, (_, i) =>
        node(
          "span",
          timeLabel(new Date(start + (span * i) / 12).toISOString()),
          "hour-mark",
        ),
      ),
    );
  $("ganttLanes").replaceChildren(
    ...data.machines.map((machine) => {
      const row = node("div", null, "gantt-lane-row"),
        track = node("div", null, "gantt-lane-track");
      row.append(node("div", machine.id, "gantt-lane-machine-meta"), track);
      for (const code of codes) {
        const jobs = (
          draft ? previews : currentReport.plans[code].verification.jobs
        ).filter((j) => j.machine_id === machine.id);
        const sub = node("div", null, "gantt-subtrack");
        const layers = [];
        sub.style.position = "relative";
        data.tariff.windows.forEach((w) => {
          const stripe = node(
            "div",
            null,
            "evn-stripe stripe-" +
              { OFF_PEAK: "offpeak", NORMAL: "normal", PEAK: "peak" }[w.band],
          );
          Object.assign(stripe.style, {
            position: "absolute",
            left: percent(w.start) + "%",
            width: percent(w.end) - percent(w.start) + "%",
            height: "100%",
          });
          sub.append(stripe);
        });
        [...jobs]
          .sort((a, b) => Date.parse(a.setup_start) - Date.parse(b.setup_start))
          .forEach((job) => {
            let layer = layers.findIndex(
              (end) => end <= Date.parse(job.setup_start),
            );
            if (layer < 0) layer = layers.length;
            layers[layer] = Date.parse(job.end);
            if (job.setup_minutes) {
              const wedge = node("div", null, "gantt-setup-wedge");
              Object.assign(wedge.style, {
                position: "absolute",
                top: layer * 36 + 4 + "px",
                left: percent(job.setup_start) + "%",
                width: percent(job.start) - percent(job.setup_start) + "%",
                height: "28px",
              });
              wedge.title =
                job.job_id + ": setup " + job.setup_minutes + " phút";
              sub.append(wedge);
            }
            const pill = node(
              "button",
              (draft ? "Nháp" : code) + " · " + job.job_id,
              "gantt-job-pill job-pill-" +
                code.toLowerCase() +
                (draft ? " draft-job" : ""),
            );
            pill.type = "button";
            Object.assign(pill.style, {
              top: layer * 36 + 4 + "px",
              left: percent(job.start) + "%",
              width:
                Math.max(0.25, percent(job.end) - percent(job.start)) + "%",
            });
            const conflict =
              draft &&
              jobs.some(
                (other) =>
                  other !== job &&
                  Date.parse(job.setup_start) < Date.parse(other.end) &&
                  Date.parse(other.setup_start) < Date.parse(job.end),
              );
            if (conflict) {
              pill.classList.add("draft-conflict");
              pill.textContent += " !";
            }
            pill.title =
              job.job_id +
              ": " +
              timeLabel(job.start) +
              " → " +
              timeLabel(job.end) +
              (conflict
                ? " · Trùng máy kể cả setup"
                : draft
                  ? " · Chưa kiểm định"
                  : " · Nhấn để chỉnh bản nháp");
            bindScheduleDrag(pill, job, code, sub, data);
            sub.append(pill);
          });
        sub.style.height = Math.max(38, layers.length * 36 + 4) + "px";
        track.append(sub);
      }
      return row;
    }),
  );
  const code = codes.at(-1),
    jobs = draft ? previews : currentReport.plans[code].verification.jobs;
  $("scheduleJobRows").replaceChildren(
    ...jobs.map((j) => {
      const row = node("tr");
      [
        j.job_id,
        j.machine_id,
        timeLabel(j.start),
        timeLabel(j.end),
        j.setup_minutes + " phút",
      ].forEach((text) => row.append(node("td", text)));
      const cell = node("td"),
        button = node("button", "Sửa", "manual-btn");
      button.type = "button";
      button.onclick = () => openScheduleEditor(j.job_id, false, code);
      cell.append(button);
      row.append(cell);
      return row;
    }),
  );
  put(
    "scheduleListCount",
    jobs.length + " lô · " + (draft ? "Bản nháp B0" : code),
  );
  const warnings = draft ? draftWarnings(data, jobs) : [];
  put(
    "scheduleConflictReport",
    draft
      ? (warnings.length
          ? warnings.join("\n")
          : "Chưa phát hiện trùng máy trong xem trước.") +
          "\nĐây là chẩn đoán sơ bộ. Bấm Tính lại để kiểm định đầy đủ máy, khuôn, thời hạn và chi phí."
      : code +
          ": verifier " +
          currentReport.plans[code].verification.status +
          ". Chọn Sửa để tạo bản nháp từ phương án này.",
  );
  put(
    "scheduleEditStatus",
    draft
      ? "BẢN NHÁP · chưa kiểm định / chưa tính chi phí"
      : "Đang xem " + code + " · dữ liệu đã phân tích",
  );
  put(
    "manualScheduleNotice",
    scheduleEditorState
      ? "Đang xem trước thay đổi chưa lưu. Lưu bản nháp sẽ xóa kết quả và xác nhận cũ."
      : draft
        ? "Lưu thay đổi vào B0 rồi bấm Tính lại. B1/B2 sẽ được tạo lại từ đầu vào mới."
        : "Chỉnh một phương án sẽ tạo đầu vào B0 mới để phân tích; kết quả cũ sẽ mất hiệu lực khi lưu.",
  );
  put(
    "ganttChangeFeedback",
    scheduleEditorState
      ? "Xem trước chưa lưu · nét đứt"
      : draft
        ? "Bản nháp đang chờ tính lại."
        : "Lịch trong chân trời " +
          data.horizon.start +
          " → " +
          data.horizon.end,
  );
  $("ganttChangeFeedback").hidden = false;
  const nextDay = jobs.filter(
    (j) =>
      localMinute(j.start).slice(0, 10) !== localMinute(j.end).slice(0, 10),
  );
  put(
    "ganttNextDayPreview",
    nextDay.length
      ? "Qua ngày: " +
          nextDay
            .map(
              (j) => j.job_id + " đến " + localMinute(j.end).replace("T", " "),
            )
            .join(" · ")
      : "Không có lô chạy qua ngày trong lịch đang xem.",
  );
  $("ganttNextDayPreview").hidden = nextDay.length === 0;
  $("recalculateScheduleBtn").disabled =
    pending || preparing || !!scheduleEditorState;
  $("exportScheduleBtn").disabled = !!scheduleEditorState;
}
function openScheduleEditor(jobId = null, isNew = false, planCode = null) {
  if (scheduleEditorState && !isNew && !jobId) return;
  try {
    const code =
      planCode ||
      (activeGanttPlan === "compare"
        ? referencePlan()
        : activeGanttPlan.toUpperCase());
    const data = scheduleInput(code),
      assignment = isNew
        ? null
        : data.current_schedule.find(
            (a) => a.job_id === (jobId || data.jobs[0]?.id),
          );
    const job = assignment
      ? data.jobs.find((j) => j.id === assignment.job_id)
      : null;
    if (!isNew && !job) throw Error("Chọn lô cần sửa.");
    if (isNew && data.jobs.length >= 8)
      throw Error("Demo hỗ trợ tối đa 8 lô. Xóa lô trước khi thêm.");
    scheduleEditorState = { data, jobId: job?.id || null, source: code };
    const fill = (id, value) => ($(id).value = value);
    const options = (id, values, value) => {
      $(id).replaceChildren(
        ...values.map((v) => {
          const o = node("option", v);
          o.value = v;
          return o;
        }),
      );
      $(id).value = value || values[0];
    };
    fill("editJobName", job?.id || "");
    $("editJobName").readOnly = !!job;
    options(
      "editJobMachine",
      job ? Object.keys(job.eligible) : data.machines.map((m) => m.id),
      assignment?.machine_id,
    );
    const process = job?.eligible[$("editJobMachine").value];
    fill("editJobStart", localMinute(assignment?.start || data.horizon.start));
    fill("editJobDuration", process?.duration_min || 60);
    fill("editJobQuantity", job?.quantity || 1);
    $("editJobQuantity").readOnly = !!job;
    fill("editJobPower", process?.avg_kw ?? 0);
    options(
      "editJobFamily",
      [...new Set(data.jobs.map((j) => j.family))],
      job?.family,
    );
    options(
      "editJobMold",
      data.molds.map((m) => m.id),
      job?.mold_id,
    );
    fill("editJobRelease", localMinute(job?.release || data.horizon.start));
    fill("editJobDue", localMinute(job?.due || data.horizon.end));
    fill("editJobReference", process?.lot_confirmation.reference || "");
    $("editProcessingConfirmed").checked = !!job;
    $("deleteScheduleJobBtn").hidden = !job;
    put(
      "scheduleEditorTitle",
      job
        ? "Chỉnh bản nháp · " + code + " · " + job.id
        : "Thêm lô vào bản nháp B0",
    );
    put("scheduleEditorError", "");
    $("scheduleEditForm").hidden = false;
    switchMainTab("tab-gantt");
    renderGantt();
    $("editJobName").focus();
    $("scheduleEditForm").scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  } catch (e) {
    toast(e.message);
  }
}
function readScheduleEditor(strict = true) {
  if (!scheduleEditorState) throw Error("Chưa mở bản nháp.");
  const data = structuredClone(scheduleEditorState.data),
    existing = data.jobs.find((j) => j.id === scheduleEditorState.jobId);
  const id = $("editJobName").value.trim(),
    machine = $("editJobMachine").value,
    duration = Number($("editJobDuration").value),
    quantity = Number($("editJobQuantity").value),
    power = Number($("editJobPower").value),
    reference = $("editJobReference").value.trim();
  if (
    !/^[A-Za-z0-9_-]+$/.test(id) ||
    (!existing && data.jobs.some((j) => j.id === id))
  )
    throw Error("Mã lô phải duy nhất, dùng chữ, số, _ hoặc -.");
  if (
    !Number.isInteger(duration) ||
    duration < 1 ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    !Number.isFinite(power) ||
    power < 0
  )
    throw Error("Kiểm tra sản lượng, thời lượng và công suất.");
  if (strict && (!$("editProcessingConfirmed").checked || !reference))
    throw Error("Xác nhận định mức và ghi nguồn trước khi lưu.");
  const original = existing?.eligible[machine];
  const changed = !original || duration !== original.duration_min;
  const process = {
    ...(original || {}),
    duration_min: duration,
    avg_kw: power,
    power_source:
      data.metadata.source_type === "SYNTHETIC"
        ? "SYNTHETIC"
        : original && power === original.avg_kw
          ? original.power_source
          : "ESTIMATED",
    lot_confirmation: changed
      ? {
          quantity,
          duration_min: duration,
          source_type:
            data.metadata.source_type === "SYNTHETIC"
              ? "SYNTHETIC"
              : "ESTIMATED",
          reference: reference || "UNCONFIRMED_DRAFT",
        }
      : {
          ...original.lot_confirmation,
          reference: reference || original.lot_confirmation.reference,
        },
  };
  const job = {
    ...(existing || {}),
    id,
    quantity,
    family: $("editJobFamily").value,
    mold_id: $("editJobMold").value,
    release: inputTimestamp($("editJobRelease").value),
    due: inputTimestamp($("editJobDue").value),
    eligible: { ...(existing?.eligible || {}), [machine]: process },
  };
  if (Date.parse(job.due) <= Date.parse(job.release))
    throw Error("Hạn hoàn thành phải sau thời điểm được bắt đầu.");
  if (existing)
    data.jobs[data.jobs.findIndex((j) => j.id === existing.id)] = job;
  else data.jobs.push(job);
  const assignment = {
    job_id: id,
    machine_id: machine,
    start: inputTimestamp($("editJobStart").value),
  };
  const index = data.current_schedule.findIndex((a) => a.job_id === id);
  if (index < 0) data.current_schedule.push(assignment);
  else data.current_schedule[index] = assignment;
  return data;
}
function previewScheduleEditor() {
  try {
    readScheduleEditor(false);
    put(
      "schedulePreviewHint",
      "Xem trước đang cập nhật · chưa lưu / chưa kiểm định.",
    );
    put("scheduleEditorError", "");
    renderGantt();
  } catch (e) {
    put("schedulePreviewHint", e.message);
  }
}
function commitScheduleDraft(data) {
  for (const review of Object.values(data.cost_scope.excluded_review)) {
    Object.assign(review, {
      status: "UNKNOWN",
      incremental_min_vnd: null,
      incremental_max_vnd: null,
      source_type:
        data.metadata.source_type === "SYNTHETIC" ? "SYNTHETIC" : "ESTIMATED",
      reference: "Cần rà soát lại chi phí sau khi chỉnh lịch.",
    });
  }
  setDataset(data);
  try {
    localStorage.setItem(
      "energyshift.inline-schedule-draft.v1",
      JSON.stringify({ saved_at: new Date().toISOString(), data }),
    );
  } catch {
    /* Storage is optional. */
  }
  put("schedulePreviewHint", "");
  toast("Đã lưu bản nháp. Tính lại để cập nhật kiểm định và chi phí.");
}
function saveScheduleJob(event) {
  event.preventDefault();
  try {
    commitScheduleDraft(readScheduleEditor());
  } catch (e) {
    put("scheduleEditorError", e.message);
  }
}
function closeScheduleEditor() {
  scheduleEditorState = null;
  $("scheduleEditForm").hidden = true;
  renderGantt();
}
function deleteScheduleJob() {
  if (!scheduleEditorState?.jobId) return;
  const data = structuredClone(scheduleEditorState.data),
    id = scheduleEditorState.jobId;
  if (data.jobs.length <= 1) {
    put("scheduleEditorError", "Kế hoạch phải có ít nhất một lô.");
    return;
  }
  data.jobs = data.jobs.filter((j) => j.id !== id);
  data.current_schedule = data.current_schedule.filter((a) => a.job_id !== id);
  const families = new Set([
    ...data.jobs.map((job) => job.family),
    ...Object.values(data.setup.initial_family_by_machine),
  ]);
  data.setup.transitions = data.setup.transitions.filter(
    (transition) => families.has(transition.from_family) && families.has(transition.to_family),
  );
  commitScheduleDraft(data);
}
function resetManualSchedule() {
  if (sample) setDataset(structuredClone(sample));
}
async function restoreScheduleDraft() {
  try {
    const saved = JSON.parse(
      localStorage.getItem("energyshift.inline-schedule-draft.v1") || "null",
    );
    if (!saved?.data) throw Error("Chưa có bản nháp đã lưu.");
    const token = revision;
    const response = await apiFetch("/api/demo/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(saved.data),
    });
    const result = await response.json();
    if (!response.ok) throw Error("Bản nháp không hợp lệ. Kiểm tra dữ liệu trước khi khôi phục.");
    if (token !== revision) throw Error("Đầu vào đã đổi. Bấm khôi phục lại nếu vẫn muốn dùng bản nháp.");
    setDataset(result.snapshot);
    toast("Đã khôi phục bản nháp. Cần tính lại.");
  } catch (e) {
    toast(e.message);
  }
}
function clearManualConfirmations() {
  if (!currentReport) return;
  humanReviews.delete(
    currentReport.input_hash + ":" + $("validationPlanSelect").value,
  );
  renderValidation();
}

function dismissScheduleConflictToast() {
  if ($("scheduleConflictToast")) $("scheduleConflictToast").hidden = true;
}
function exportScheduleCSV() {
  if (!currentReport && scheduleDraft) {
    download(
      "DRAFT_B0.csv",
      "job_id,machine_id,start\n" +
        scheduleDraft.current_schedule
          .map((a) => [a.job_id, a.machine_id, a.start].join(","))
          .join("\n"),
      "text/csv",
    );
    return;
  }
  if (!currentReport) return;
  const code =
    activeGanttPlan === "compare" ? "B2" : activeGanttPlan.toUpperCase();
  download(
    `${code}.csv`,
    "job_id,machine_id,start\n" +
      currentReport.plans[code].schedule
        .map((a) => [a.job_id, a.machine_id, a.start].join(","))
        .join("\n"),
    "text/csv",
  );
}
async function revalidateDashboard() {
  if (scheduleEditorState) {
    toast("Lưu hoặc đóng chỉnh sửa trước khi tính lại.");
    return;
  }
  if (pending || preparing || fixtureLoading) return;
  preparing = true;
  try {
    if (window.InputDesk && !(await InputDesk.prepareForAnalysis())) return;
  } finally {
    preparing = false;
  }
  clearResult();
  errors([]);
  const token = revision;
  pending = true;
  $("analyze").disabled = true;
  $("recalculateScheduleBtn").disabled = true;
  put("analyze", "Đang kiểm tra và tối ưu…");
  try {
    let report;
    const snapshot = JSON.parse($("dataset").value);
    if ($("teamMode").checked) {
      report = await TeamDemo.run(
        snapshot,
        window.InputDesk?.evidence(),
        token,
      );
      if (!report) return;
    } else {
      const response = await apiFetch("/api/demo/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });
      report = await response.json();
      if (!response.ok)
        throw Error(
          report.errors?.map((e) => e.why).join("; ") ||
            report.detail ||
            "Không phân tích được đầu vào.",
        );
    }
    if (token !== revision) return;
    if (report.status !== "COMPLETED") {
      errors(
        report.errors || report.B0?.verification?.issues || [report.status],
      );
      return;
    }
    renderReport(report);
    switchMainTab("tab-overview");
  } catch (e) {
    if (token === revision) errors([e.message]);
  } finally {
    pending = false;
    $("analyze").disabled = false;
    $("recalculateScheduleBtn").disabled = false;
    document.querySelectorAll("[data-plan]").forEach(button => { button.disabled = false; });
    put("analyze", "Phân tích kế hoạch");
  }
}
async function loadFixture(id = "editable-cell") {
  const request = ++fixtureRequest;
  fixtureLoading = true;
  clearResult();
  const token = revision;
  try {
    const response = await apiFetch(
      "/api/demo/fixtures/" + encodeURIComponent(id),
    );
    if (!response.ok) throw Error("Không tải được dữ liệu mẫu");
    const incoming = await response.json();
    if (request !== fixtureRequest || token !== revision) return;
    sample = incoming;
    setDataset(structuredClone(sample));
  } finally {
    if (request === fixtureRequest) fixtureLoading = false;
  }
}
function hourlySeries(report, metric = "power") {
  const start = Date.parse(report.input_snapshot.horizon.start),
    end = Date.parse(report.input_snapshot.horizon.end);
  const codes = [...new Set(["B0", report.decision.selected_plan])];
  return codes.map((code) => ({
    code,
    values: Array.from(
      { length: Math.ceil((end - start) / 3600000) },
      (_, i) => {
        const left = start + i * 3600000,
          right = Math.min(end, left + 3600000);
        const value = report.plans[code].cost.ledger
          .filter((row) => row.component === "RUN_ELECTRICITY")
          .reduce(
            (sum, row) =>
              sum +
              (Math.max(
                0,
                Math.min(right, Date.parse(row.end)) -
                  Math.max(left, Date.parse(row.start)),
              ) /
                3600000) *
                row.avg_kw *
                (metric === "cost" ? row.vnd_per_kwh : 1),
            0,
          );
        return {
          start: new Date(left).toISOString(),
          end: new Date(right).toISOString(),
          value:
            metric === "power" ? value / ((right - left) / 3600000) : value,
        };
      },
    ),
  }));
}
function timeLabel(value) {
  return new Date(value).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function dataTable(headers, rows) {
  const wrap = node("div", null, "table-responsive"),
    t = node("table", null, "industrial-table"),
    head = node("thead"),
    tr = node("tr"),
    body = node("tbody");
  headers.forEach((h) => tr.append(node("th", h)));
  head.append(tr);
  rows.forEach((values) => {
    const row = node("tr");
    values.forEach((v) => row.append(node("td", v)));
    body.append(row);
  });
  t.append(head, body);
  wrap.append(t);
  return wrap;
}
function renderChart() {
  if (!currentReport) return;
  const series = hourlySeries(currentReport, activeMetric),
    hours = series[0].values.length,
    max = Math.max(1, ...series.flatMap((s) => s.values.map((v) => v.value))),
    svg = $("elecLineChartSvg"),
    ns = "http://www.w3.org/2000/svg",
    unit = activeMetric === "power" ? "kW trung bình" : "đ / khoảng giờ";
  $("chartTooltip").style.display = "none";
  svg.replaceChildren();
  svg.setAttribute("viewBox", "0 0 960 360");
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    `So sánh B0 với ${referencePlan()}, đơn vị ${unit}. Bảng số liệu chi tiết ở bên dưới.`,
  );
  const add = (tag, attrs, text) => {
    const e = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, String(v)));
    if (text != null) e.textContent = text;
    svg.append(e);
    return e;
  };
  const horizonStart = Date.parse(currentReport.input_snapshot.horizon.start),
    horizonSpan =
      Date.parse(currentReport.input_snapshot.horizon.end) - horizonStart;
  currentReport.input_snapshot.tariff.windows.forEach((w) => {
    const left = Math.max(
      64,
      64 + ((Date.parse(w.start) - horizonStart) * 856) / horizonSpan,
    );
    const right = Math.min(
      920,
      64 + ((Date.parse(w.end) - horizonStart) * 856) / horizonSpan,
    );
    if (right > left)
      add("rect", {
        x: left,
        y: 42,
        width: right - left,
        height: 248,
        fill: { PEAK: "#ef4444", NORMAL: "#64748b", OFF_PEAK: "#10b981" }[
          w.band
        ],
        opacity: 0.07,
      });
  });
  add("text", { x: 64, y: 18, fill: "currentColor", "font-size": 12 }, unit);
  for (let i = 0; i <= 4; i++) {
    const y = 290 - i * 62;
    add("line", {
      x1: 64,
      x2: 920,
      y1: y,
      y2: y,
      stroke: "currentColor",
      opacity: 0.16,
    });
    add(
      "text",
      {
        x: 57,
        y: y + 4,
        fill: "currentColor",
        "text-anchor": "end",
        "font-size": 11,
      },
      ((max * i) / 4).toLocaleString("vi-VN", { maximumFractionDigits: 1 }),
    );
  }
  for (let i = 0; i < hours; i += Math.max(1, Math.ceil(hours / 6))) {
    const x = 64 + ((i + 0.5) * 856) / hours;
    add(
      "text",
      {
        x,
        y: 317,
        fill: "currentColor",
        "text-anchor": "middle",
        "font-size": 11,
      },
      timeLabel(series[0].values[i].start),
    );
  }
  const tooltip = $("chartTooltip");
  const cursor = add("line", {
    y1: 42,
    y2: 290,
    stroke: "currentColor",
    "stroke-width": 1,
    "stroke-dasharray": "4 4",
    "data-chart-cursor": "true",
  });
  cursor.style.display = "none";
  const highlights = series.map((s, index) => {
    const circle = add("circle", {
      r: 5,
      fill: index ? "#10b981" : "#2563eb",
      stroke: "var(--bg-surface)",
      "stroke-width": 2,
      "pointer-events": "none",
    });
    circle.style.display = "none";
    return circle;
  });
  const hideTooltip = () => {
    tooltip.style.display = "none";
    cursor.style.display = "none";
    highlights.forEach((circle) => (circle.style.display = "none"));
  };
  const showHour = (i) => {
    const interval = series[0].values[i],
      x = 64 + ((i + 0.5) * 856) / hours;
    cursor.setAttribute("x1", x);
    cursor.setAttribute("x2", x);
    cursor.style.display = "block";
    highlights.forEach((circle, index) => {
      circle.setAttribute("cx", x);
      circle.setAttribute(
        "cy",
        290 - (series[index].values[i].value / max) * 248,
      );
      circle.style.display = "block";
      svg.append(circle);
    });
    const tariffs = currentReport.input_snapshot.tariff.windows.filter(
      (w) =>
        Date.parse(w.start) < Date.parse(interval.end) &&
        Date.parse(w.end) > Date.parse(interval.start),
    );
    const tariffText = [
      ...new Set(
        tariffs.map(
          (w) =>
            ({
              PEAK: "Cao điểm",
              OFF_PEAK: "Thấp điểm",
              NORMAL: "Bình thường",
            })[w.band] +
            " · " +
            money(w.vnd_per_kwh) +
            "/kWh",
        ),
      ),
    ].join(" / ");
    const title = node(
      "strong",
      timeLabel(interval.start) + " → " + timeLabel(interval.end),
    );
    tooltip.replaceChildren(
      title,
      node("div", "Biểu giá: " + tariffText, "hover-tariff"),
    );
    series.forEach((s, index) =>
      tooltip.append(
        node(
          "div",
          s.code +
            ": " +
            s.values[i].value.toLocaleString("vi-VN", {
              maximumFractionDigits: 2,
            }) +
            " " +
            unit,
          index ? "hover-selected" : "hover-baseline",
        ),
      ),
    );
    if (series.length > 1) {
      const delta = series[1].values[i].value - series[0].values[i].value;
      tooltip.append(
        node(
          "div",
          "Chênh lệch " +
            series[1].code +
            " − B0: " +
            (delta > 0 ? "+" : "") +
            delta.toLocaleString("vi-VN", { maximumFractionDigits: 2 }) +
            " " +
            unit,
          "hover-delta",
        ),
      );
    }
    Object.assign(tooltip.style, {
      display: "block",
      opacity: 1,
      whiteSpace: "normal",
      minWidth: "180px",
      maxWidth: "min(300px, calc(100% - 24px))",
    });
    const matrix = svg.getScreenCTM(),
      container = tooltip.parentElement.getBoundingClientRect();
    const anchor = matrix
      ? new DOMPoint(x, 42).matrixTransform(matrix)
      : { x: container.left + 12, y: container.top + 12 };
    const left = Math.max(
      8,
      Math.min(
        container.width - tooltip.offsetWidth - 8,
        anchor.x - container.left + 14,
      ),
    );
    tooltip.style.left = left + "px";
    tooltip.style.top = Math.max(8, anchor.y - container.top + 10) + "px";
    tooltip.dataset.hourIndex = String(i);
  };
  svg.onpointermove = (event) => {
    // SVG letterboxing changes with viewport size: invert its actual screen transform.
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    if (point.x < 64 || point.x > 920 || point.y < 42 || point.y > 290) {
      hideTooltip();
      return;
    }
    showHour(Math.min(hours - 1, Math.floor(((point.x - 64) * hours) / 856)));
  };
  svg.onpointerleave = svg.onpointercancel = hideTooltip;
  series.forEach((s, index) => {
    const color = index ? "#10b981" : "#2563eb";
    add("polyline", {
      points: s.values
        .map(
          (v, i) =>
            `${64 + ((i + 0.5) * 856) / hours},${290 - (v.value / max) * 248}`,
        )
        .join(" "),
      fill: "none",
      stroke: color,
      "stroke-width": 3,
    });
    s.values.forEach((v, i) => {
      const label = `${s.code} · ${timeLabel(v.start)} → ${timeLabel(v.end)}: ${v.value.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} ${unit}`,
        circle = add("circle", {
          cx: 64 + ((i + 0.5) * 856) / hours,
          cy: 290 - (v.value / max) * 248,
          r: 4,
          fill: color,
          tabindex: 0,
          role: "img",
          "aria-label": label,
        });
      const title = document.createElementNS(ns, "title");
      title.textContent = label;
      circle.append(title);
      circle.onfocus = circle.onmouseenter = () => showHour(i);
      circle.onblur = hideTooltip;
    });
  });
  add(
    "text",
    { x: 64, y: 347, fill: "currentColor", "font-size": 11 },
    `B0 xanh dương${series.length > 1 ? ` · ${referencePlan()} xanh` : " · giữ lịch B0"}. Tính theo lịch; chưa gồm điện nền/chờ/setup.`,
  );
  const details = $("hourlyDetails");
  details.replaceChildren(
    node("summary", "Xem bảng số liệu theo giờ và tải CSV"),
    dataTable(
      ["Khoảng giờ", ...series.map((s) => `${s.code} (${unit})`)],
      series[0].values.map((v, i) => [
        `${timeLabel(v.start)} → ${timeLabel(v.end)}`,
        ...series.map((s) =>
          s.values[i].value.toLocaleString("vi-VN", {
            maximumFractionDigits: 3,
          }),
        ),
      ]),
    ),
  );
  const button = node("button", "Tải CSV theo giờ", "manual-btn");
  button.onclick = () =>
    download(
      "EnergyShift_hourly.csv",
      [
        "start,end," + series.map((s) => s.code).join(","),
        ...series[0].values.map((v, i) =>
          [v.start, v.end, ...series.map((s) => s.values[i].value)].join(","),
        ),
      ].join("\r\n"),
      "text/csv",
    );
  details.append(button);
  put("hudHourVal", "Theo lịch");
  put("hudTariffVal", "Theo đầu vào");
  put("hudB0Val", `${peak(currentReport.plans.B0).toFixed(2)} kW đỉnh`);
  put(
    "hudB2Val",
    `${peak(currentReport.plans[referencePlan()]).toFixed(2)} kW đỉnh`,
  );
  put(
    "hudSavingVal",
    `${(peak(currentReport.plans[referencePlan()]) - peak(currentReport.plans.B0)).toFixed(2)} kW so B0`,
  );
  $("btnMetricCost").classList.toggle("active", activeMetric === "cost");
  $("btnMetricPower").classList.toggle("active", activeMetric === "power");
}
function renderValidation() {
  if (!currentReport) return;
  const code = $("validationPlanSelect").value.toUpperCase(),
    v = currentReport.plans[code].verification;
  const rules = [
    ["Đủ công việc", ["JOB_CONSERVATION", "UNKNOWN_JOB"]],
    ["Máy phù hợp", ["UNKNOWN_MACHINE", "INELIGIBLE_MACHINE"]],
    [
      "Lịch máy và chuẩn bị",
      ["MACHINE_UNAVAILABLE", "MACHINE_OVERLAP", "INSUFFICIENT_SETUP"],
    ],
    [
      "Release, hạn giao và chân trời",
      [
        "BEFORE_RELEASE",
        "LATE_DUE",
        "OUTSIDE_HORIZON",
        "TIME_OVERFLOW",
        "OFFSET_MISMATCH",
      ],
    ],
    ["Khuôn vật lý", ["MOLD_OVERLAP"]],
  ];
  const reviewKey = currentReport.input_hash + ":" + code.toLowerCase();
  const reviews = humanReviews.get(reviewKey) || {};
  humanReviews.set(reviewKey, reviews);
  const covered = new Set(rules.flatMap(([, codes]) => codes));
  const extra = v.issues.filter((issue) => !covered.has(issue.code));
  if (extra.length)
    rules.push([
      "Các kiểm tra bổ sung",
      [...new Set(extra.map((issue) => issue.code))],
    ]);
  const updateReviewProgress = () =>
    put(
      "confirmationProgress",
      `${code}: tự động ${v.status} · rà soát thủ công ${Object.values(reviews).filter(Boolean).length}/${rules.length}`,
    );
  $("validationList").replaceChildren(
    ...rules.map(([label, codes], index) => {
      const issues = v.issues.filter((i) => codes.includes(i.code)),
        card = node("article", null, "analytics-card");
      card.append(
        node("h3", label),
        node(
          "p",
          issues.length
            ? "Không đạt"
            : v.status === "PASS"
              ? "Đạt trong mô hình đã khai báo"
              : "Chưa đủ kết luận",
        ),
      );
      issues.forEach((i) =>
        card.append(node("p", `${i.job_id || i.mold_id || ""}: ${i.code}`)),
      );
      const automatic = node(
        "span",
        issues.length
          ? "Tự động: FAIL"
          : v.status === "PASS"
            ? "Tự động: PASS"
            : "Tự động: chưa đủ kết luận",
        "status-chip " +
          (issues.length
            ? "chip-fail"
            : v.status === "PASS"
              ? "chip-pass"
              : "chip-warn"),
      );
      card.prepend(automatic);
      const labelElement = node("label", null, "gate-confirm-checkbox"),
        checkbox = node("input");
      checkbox.type = "checkbox";
      checkbox.checked = !!reviews[index];
      labelElement.append(
        checkbox,
        node("span", "Tôi đã rà soát điều kiện này tại hiện trường."),
      );
      checkbox.onchange = () => {
        reviews[index] = checkbox.checked;
        card.classList.toggle("gate-user-checked", checkbox.checked);
        updateReviewProgress();
      };
      card.classList.toggle("gate-user-checked", checkbox.checked);
      card.append(labelElement);
      return card;
    }),
  );
  $("validationEvidence").replaceChildren(
    node("summary", "Xem bằng chứng setup, hạn giao và khuôn"),
    node("h3", `${code}: thời gian chuẩn bị và dư hạn giao`),
    dataTable(
      [
        "Lô",
        "Máy",
        "Chuẩn bị từ",
        "Chạy từ",
        "Kết thúc",
        "Hạn giao",
        "Dư hạn (phút)",
      ],
      v.jobs.map((j) => [
        j.job_id,
        j.machine_id,
        timeLabel(j.setup_start),
        timeLabel(j.start),
        timeLabel(j.end),
        timeLabel(j.due),
        Math.floor((Date.parse(j.due) - Date.parse(j.end)) / 60000),
      ]),
    ),
    node("h3", "Các khoảng giữ khuôn vật lý"),
    dataTable(
      ["Khuôn", "Máy", "Giữ từ", "Giữ đến"],
      (v.mold_reservations || []).map((r) => [
        r.mold_id,
        r.machine_id,
        timeLabel(r.start),
        timeLabel(r.end),
      ]),
    ),
  );
  updateReviewProgress();
  put(
    "validationConfirmNotice",
    "PASS/FAIL do backend tính. Ô chọn chỉ ghi nhận rà soát thủ công, không thay đổi kết quả tự động. Xác nhận được xóa khi đầu vào thay đổi; chỉ lưu trong phiên hiện tại.",
  );
}
function riskLabel(risk) {
  return (
    {
      BOUNDED: "Đã khai báo khoảng chi phí",
      UNKNOWN_SCOPE: "Chưa xác nhận chi phí dịch nhiều lô",
      UNKNOWN_COSTS: "Còn chi phí chưa xác định",
    }[risk.status] || "Chưa đủ dữ liệu"
  );
}
function renderRisk() {
  const r = currentReport,
    risks = r.coordinated_economics;
  table(
    "sensitivityTbody",
    ["B1", "B2"].map((code) => {
      const risk = risks[code],
        bounds = risk.net_saving_bounds_exact_vnd;
      return [
        code,
        riskLabel(risk),
        bounds ? money(Math.floor(exact(bounds[0]))) : "Chưa xác định",
        bounds ? money(Math.ceil(exact(bounds[1]))) : "Chưa xác định",
        risk.all_declared_values_qualify
          ? "Đạt ngưỡng ở cả biên bất lợi"
          : risk.no_declared_values_qualify
            ? "Không đạt ngưỡng trong khoảng"
            : "Cần bổ sung bằng chứng",
      ];
    }),
  );
  const bounds = risks.incremental_B2_over_B1.net_incremental_bounds_exact_vnd;
  $("sensitivityNote").replaceChildren(
    node(
      "p",
      `Lợi ích tăng thêm B2 so với B1: ${bounds ? bounds.map((v, i) => money(i ? Math.ceil(exact(v)) : Math.floor(exact(v)))).join(" → ") : "Chưa xác định"}. Đây là biên theo giả định công suất/chi phí, không phải khoảng tin cậy thống kê.`,
    ),
  );
  for (const code of ["B1", "B2"]) {
    const risk = risks[code];
    if (!risk.all_declared_values_qualify) {
      const text =
        risk.status === "UNKNOWN_SCOPE"
          ? "Rà soát chi phí cho mọi phương án B0/B1/B2, gồm nhân công, điện chờ/chuẩn bị và chi phí khác."
          : risk.status === "UNKNOWN_COSTS"
            ? `Bổ sung khoảng chi phí: ${(risk.unknown_components || []).map((x) => ({ LABOR_OVERTIME: "làm thêm giờ", IDLE_ENERGY: "điện chờ", SETUP_ENERGY: "điện chuẩn bị", OTHER_COSTS: "chi phí khác" })[x] || x).join(", ")}.`
            : "Kiểm tra ngưỡng lợi ích và đo lại các định mức có sai số lớn; không tự hạ ngưỡng để lấy kết quả đẹp.";
      $("sensitivityNote").append(node("p", `${code}: ${text}`));
    }
  }
  const edit = node("button", "Mở dữ liệu và rà soát chi phí", "manual-btn");
  edit.onclick = () => {
    switchMainTab("tab-dispatch");
    $("openSettings").click();
    $("confirmCosts").scrollIntoView({ block: "center" });
  };
  $("sensitivityNote").append(edit);
}
function showDecisionMemo() {
  if (!currentReport) {
    toast("Hãy phân tích kế hoạch trước.");
    return;
  }
  const r = currentReport,
    code = referencePlan(),
    risk = r.coordinated_economics[code],
    selected = r.plans[code],
    labels = {
      CHANGE: "Đề xuất đổi lịch",
      USE_SIMPLE_RULE: "Ưu tiên quy tắc đơn giản",
      KEEP_CURRENT: "Giữ lịch hiện tại",
      MEASURE_FIRST: "Bổ sung bằng chứng trước khi đổi",
    },
    box = $("memoContent");
  const button = node("button", "Tải báo cáo JSON", "btn-action-primary");
  button.onclick = () =>
    download(
      "EnergyShift_report.json",
      JSON.stringify(r, null, 2),
      "application/json",
    );
  box.replaceChildren(
    node("h2", labels[r.decision.kind]),
    node(
      "p",
      `Phương án ${code} · nguồn ${r.source_type} · ${r.input_snapshot.metadata.plant_alias}`,
    ),
    dataTable(
      ["Chỉ tiêu", "Giá trị"],
      [
        ["B0: điện + chuyển đổi", money(r.plans.B0.cost.total_vnd)],
        [`${code}: điện + chuyển đổi`, money(selected.cost.total_vnd)],
        [
          "Chênh lệch nominal",
          money(r.plans.B0.cost.total_vnd - selected.cost.total_vnd),
        ],
        [
          "Lợi ích sau biên công suất/chi phí",
          risk?.net_saving_bounds_exact_vnd
            ? risk.net_saving_bounds_exact_vnd
                .map((v, i) =>
                  money(i ? Math.ceil(exact(v)) : Math.floor(exact(v))),
                )
                .join(" → ")
            : code === "B0"
              ? "Giữ B0; chưa khuyến nghị phương án khác"
              : "Chưa đủ dữ liệu",
        ],
        ["Kiểm tra lịch", selected.verification.status],
        ["Số lô đổi lịch", selected.changes?.length || 0],
      ],
    ),
    node("h3", "Công việc cần thực hiện"),
    node(
      "p",
      code === "B0"
        ? "Giữ lịch đang có. Xem Độ nhạy & Rủi ro để biết thông tin cần bổ sung."
        : "Đối chiếu các lô dưới đây với nhân sự, vật tư và hiện trường; cần phê duyệt của người phụ trách trước khi thực hiện.",
    ),
    dataTable(
      ["Lô", "Máy cũ → mới", "Giờ cũ → mới"],
      (selected.changes || []).map((c) => [
        c.job_id,
        `${c.from.machine_id} → ${c.to.machine_id}`,
        `${timeLabel(c.from.start)} → ${timeLabel(c.to.start)}`,
      ]),
    ),
    node(
      "p",
      "Giới hạn: chỉ điện chạy và chuyển đổi đã khai báo. Chưa xác thực nguồn số liệu, chưa bảo đảm công suất TBA hoặc mọi điều kiện thực tế. Tối ưu B2 chỉ trong miền tìm kiếm được công bố.",
    ),
    node("p", `Mã lượt: ${r.run_id} · dấu vết đầu vào: ${r.input_hash}`),
    button,
  );
  const details = node("details"),
    pre = node("pre", JSON.stringify(r, null, 2));
  pre.style.whiteSpace = "pre-wrap";
  details.append(node("summary", "Chi tiết kỹ thuật và ledger"), pre);
  box.append(details);
  openModal("memoModal");
}

function measurementRows(text) {
  const parsed = InputModel.parseTable(text, { maxRows: 500 }),
    required = [
      "start",
      "end",
      "machine_id",
      "kwh",
      "scope",
      "source_type",
      "reference",
    ];
  if (
    parsed.headers.length !== required.length ||
    required.some((k) => !parsed.headers.includes(k))
  )
    throw Error(
      "CSV cần đúng các cột: " +
        required.join(", ") +
        ". Không tự bỏ cột thừa.",
    );
  return parsed.rows.map((values, index) => {
    const row = Object.fromEntries(
      parsed.headers.map((k, i) => [k, values[i].trim()]),
    );
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(row.kwh))
      throw Error(
        `Dòng ${index + 2}: nhập kWh không âm, dấu thập phân là dấu chấm; ô trống không được xem là 0.`,
      );
    row.kwh = Number(row.kwh);
    row.machine_id = row.machine_id || null;
    return row;
  });
}
function initializeMeasurements() {
  const reset = () => {
    if (currentReport) delete currentReport.reconciliation;
    $("measurementConfirmed").checked = false;
    put("measurementResult", "Chưa đối chiếu cho bảng số đo hiện tại.");
  };
  $("measurementCsv").oninput = reset;
  $("executedPlan").onchange = reset;
  $("measurementConfirmed").onchange = () => {
    if (currentReport) delete currentReport.reconciliation;
    put(
      "measurementResult",
      "Xác nhận đã đổi; đối chiếu lại để có báo cáo mới.",
    );
  };
  $("measurementFile").onchange = async (e) => {
    try {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 128 * 1024) throw Error("CSV tối đa 128 KiB.");
      $("measurementCsv").value = await file.text();
      reset();
    } catch (error) {
      put("measurementResult", error.message);
    }
  };
  $("measurementTemplate").onclick = () =>
    download(
      "EnergyShift_meter_template.csv",
      "start,end,machine_id,kwh,scope,source_type,reference\r\n2026-10-19T09:30:00+07:00,2026-10-19T10:30:00+07:00,M1,,RUN_ONLY,MEASURED,replace-with-meter-file-reference\r\n",
      "text/csv",
    );
  $("measurementExample").onclick = () => {
    if (!currentReport) {
      toast("Phân tích một kế hoạch trước.");
      return;
    }
    const plan = currentReport.plans[$("executedPlan").value],
      row = plan.cost.ledger.find((r) => r.component === "RUN_ELECTRICITY");
    $("measurementCsv").value =
      "start,end,machine_id,kwh,scope,source_type,reference\n" +
      [
        row.start,
        row.end,
        row.machine_id,
        exact(row.kwh_exact) * 1.05,
        "RUN_ONLY",
        "SYNTHETIC",
        "constructed-5-percent-example-NOT-REAL",
      ].join(",");
    reset();
  };
  $("runMeasurementCheck").onclick = async () => {
    if (!currentReport) {
      put(
        "measurementResult",
        "Phân tích kế hoạch trước để có lịch và dấu vết đầu vào.",
      );
      return;
    }
    if (!$("measurementConfirmed").checked) {
      put(
        "measurementResult",
        "Xác nhận lịch được chọn đúng là lịch đã thực hiện và số đo có phạm vi như khai báo.",
      );
      return;
    }
    const report = currentReport,
      token = revision,
      raw = $("measurementCsv").value,
      code = $("executedPlan").value;
    $("runMeasurementCheck").disabled = true;
    try {
      const rows = measurementRows(raw),
        response = await apiFetch("/api/demo/reconcile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            snapshot: report.input_snapshot,
            executed_schedule: report.plans[code].schedule,
            executed_schedule_confirmed: true,
            observations: rows,
          }),
        }),
        result = await response.json();
      if (
        currentReport !== report ||
        revision !== token ||
        raw !== $("measurementCsv").value ||
        code !== $("executedPlan").value ||
        !$("measurementConfirmed").checked
      )
        return;
      if (!response.ok)
        throw Error(
          result.errors?.map((e) => e.why).join("; ") ||
            result.detail ||
            "Không đối chiếu được số đo.",
        );
      report.reconciliation = {
        ...result,
        measurement_input_csv: raw,
        executed_plan: code,
      };
      const box = $("measurementResult");
      box.replaceChildren(
        node(
          "p",
          `${result.source_type === "SYNTHETIC" ? "DỮ LIỆU GIẢ LẬP — chỉ kiểm tra luồng" : "Số đo người dùng cung cấp — chưa xác thực đồng hồ"}. Nguồn dự báo: ${result.prediction_source_type}. Không phải chứng minh tiết kiệm thực tế.`,
        ),
      );
      if (result.metrics) {
        const m = result.metrics;
        box.append(
          dataTable(
            ["Chỉ tiêu", "Giá trị"],
            [
              ["Khoảng đo so sánh được", m.comparable_intervals],
              [
                "kWh đo / dự báo",
                `${exact(m.measured_kwh_exact).toFixed(3)} / ${exact(m.modeled_kwh_exact).toFixed(3)}`,
              ],
              [
                "Sai lệch tuyệt đối trung bình (kWh)",
                exact(m.mae_kwh_exact).toFixed(3),
              ],
              [
                "Độ lệch dự báo − đo trung bình (kWh)",
                exact(m.bias_kwh_exact).toFixed(3),
              ],
              [
                "Tổng sai lệch tuyệt đối / tổng kWh đo",
                m.wape_pct_exact == null
                  ? "Không xác định khi tổng đo bằng 0"
                  : exact(m.wape_pct_exact).toFixed(2) + "%",
              ],
              [
                "Phần điện chạy mô hình được phủ bởi số đo",
                m.modeled_run_energy_coverage_pct_exact == null
                  ? "Không xác định"
                  : exact(m.modeled_run_energy_coverage_pct_exact).toFixed(2) +
                    "%",
              ],
            ],
          ),
        );
      } else
        box.append(
          node(
            "p",
            "Không chấm độ chính xác: đồng hồ tổng máy/xưởng có tải chưa nằm trong mô hình điện chạy. Cần tách tải hoặc bổ sung mô hình trước khi so sánh.",
          ),
        );
      box.append(
        dataTable(
          ["Máy", "Bắt đầu", "Phạm vi", "Trạng thái"],
          result.intervals.map((r) => [
            r.machine_id || "Toàn xưởng",
            timeLabel(r.start),
            r.scope,
            r.status === "COMPARABLE_RUN_ONLY"
              ? "Cùng phạm vi điện chạy"
              : "Khác phạm vi, không chấm điểm",
          ]),
        ),
      );
      const exportButton = node(
        "button",
        "Tải báo cáo đối chiếu",
        "manual-btn",
      );
      exportButton.onclick = () => {
        if (currentReport === report && report.reconciliation)
          download(
            "EnergyShift_measurement_check.json",
            JSON.stringify(report.reconciliation, null, 2),
            "application/json",
          );
      };
      box.append(exportButton);
    } catch (error) {
      if (currentReport === report) put("measurementResult", error.message);
    } finally {
      $("runMeasurementCheck").disabled = false;
    }
  };
}

function solverScope(report) {
  const s = report.plans.B2.solver;
  return s.neighborhood_limit
    ? `B2 xét ${s.declared_domains} miền máy/thứ tự, gồm tối đa ${s.neighborhood_limit} láng giềng đổi thứ tự/chuyển một lô; tối ưu phối hợp thời điểm trong từng miền. Không phải tối ưu toàn nhà máy.`
    : "B2 chỉ dịch phối hợp thời điểm trong cấu hình máy/thứ tự của B0 và B1.";
}
const TeamDemo = (() => {
  let token = "",
    creating = null,
    activeJob = null;
  const key = "energyshift.team.session.v1";
  const labels = {
    QUEUED: "Đang chờ đến lượt",
    RUNNING: "Đang tính và kiểm tra lịch",
    COMPLETED: "Đã tính",
    CANCELLED: "Đã hủy lượt chờ",
    ERROR: "Tính toán lỗi",
    INTERRUPTED: "Server đã khởi động lại, cần gửi lại",
  };
  function save(value) {
    token = value;
    try {
      if (value) sessionStorage.setItem(key, value);
      else sessionStorage.removeItem(key);
    } catch {
      put(
        "teamStatus",
        "Không lưu được phiên trên trình duyệt; phiên chỉ còn trong lần mở trang này.",
      );
    }
  }
  async function request(path, options = {}) {
    const response = await apiFetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(options.headers || {}),
      },
    });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401) save("");
      throw Error(
        result.errors?.map((e) => e.why).join("; ") ||
          result.detail ||
          "Không truy cập được hàng đợi demo.",
      );
    }
    return result;
  }
  async function ensure() {
    if (token) return;
    if (!creating)
      creating = (async () => {
        const response = await apiFetch("/api/demo/workspaces", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          }),
          result = await response.json();
        if (!response.ok)
          throw Error(
            result.errors?.map((e) => e.why).join("; ") ||
              "Chưa tạo được phiên demo.",
          );
        save(result.workspace_token);
        put(
          "teamStatus",
          "Đã tạo phiên riêng. Giữ tối đa 10 lượt trong 7 ngày; ổ đĩa máy chủ miễn phí có thể bị xóa khi redeploy.",
        );
      })();
    try {
      await creating;
    } finally {
      creating = null;
    }
  }
  async function history() {
    if (!token) {
      put("teamHistory", "Bật hàng đợi hoặc tạo phiên để có lịch sử riêng.");
      return;
    }
    const session = token;
    const result = await request("/api/demo/jobs");
    if (session !== token) return;
    const box = $("teamHistory");
    box.replaceChildren();
    if (!result.jobs.length)
      box.append(node("p", "Chưa có lượt trong phiên này."));
    result.jobs.forEach((job) => {
      const row = node("div", null, "live-actions");
      row.append(
        node(
          "span",
          `${new Date(job.created * 1000).toLocaleString("vi-VN")} · ${labels[job.status] || job.status}`,
        ),
      );
      if (job.status === "COMPLETED") {
        const open = node("button", "Mở kết quả", "manual-btn");
        open.onclick = async () => {
          try {
            const expectedRevision = revision;
            const value = await request("/api/demo/jobs/" + job.job_id);
            if (session !== token || expectedRevision !== revision) {
              put(
                "teamStatus",
                "Đầu vào hoặc phiên đã đổi trong khi tải lịch sử. Mở lại nếu vẫn muốn thay kế hoạch hiện tại.",
              );
              return;
            }
            if (value.report?.status !== "COMPLETED") {
              errors(
                value.report?.B0?.verification?.issues ||
                  value.report?.errors || [
                    "Lượt tính đã kết thúc nhưng chưa có đề xuất hợp lệ.",
                  ],
              );
              return;
            }
            setDataset(value.report.input_snapshot);
            value.report.team_job_id = job.job_id;
            renderReport(value.report);
            switchMainTab("tab-overview");
          } catch (e) {
            put("teamStatus", e.message);
          }
        };
        row.append(open);
      }
      box.append(row);
    });
  }
  async function run(snapshot, preparation, expectedRevision) {
    await ensure();
    if (revision !== expectedRevision) return null;
    const submitted = await request("/api/demo/jobs", {
      method: "POST",
      body: JSON.stringify({ snapshot, input_preparation: preparation }),
    });
    activeJob = submitted.job_id;
    $("cancelTeamJob").disabled = false;
    const deadline = Date.now() + 180000;
    try {
      while (Date.now() < deadline) {
        if (revision !== expectedRevision) {
          put(
            "teamStatus",
            "Đầu vào đã đổi; lượt cũ vẫn có thể hoàn tất trong lịch sử.",
          );
          return null;
        }
        const job = await request("/api/demo/jobs/" + submitted.job_id);
        put("teamStatus", labels[job.status] || job.status);
        if (job.status === "COMPLETED") {
          job.report.team_job_id = job.job_id;
          return job.report;
        }
        if (["ERROR", "CANCELLED", "INTERRUPTED"].includes(job.status))
          throw Error(labels[job.status]);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      throw Error(
        "Đã dừng chờ trên trình duyệt; lượt có thể còn chạy. Làm mới lịch sử để xem kết quả, không tự gửi lại.",
      );
    } finally {
      activeJob = null;
      $("cancelTeamJob").disabled = true;
      history().catch((e) => put("teamStatus", e.message));
    }
  }
  function init() {
    try {
      token = sessionStorage.getItem(key) || "";
    } catch {
      /* memory-only fallback */
    }
    $("teamMode").onchange = async () => {
      if ($("teamMode").checked) {
        try {
          await ensure();
          await history();
        } catch (e) {
          put("teamStatus", e.message);
        }
      }
    };
    $("teamRefresh").onclick = async () => {
      try {
        await ensure();
        await history();
      } catch (e) {
        put("teamStatus", e.message);
      }
    };
    $("cancelTeamJob").onclick = async () => {
      if (activeJob)
        try {
          await request("/api/demo/jobs/" + activeJob + "/cancel", {
            method: "POST",
            body: "{}",
          });
          put("teamStatus", "Đã hủy lượt chờ.");
        } catch (e) {
          put("teamStatus", e.message);
        }
    };
    $("teamForget").onclick = async () => {
      try {
        if (token)
          await request("/api/demo/workspaces/current", { method: "DELETE" });
        save("");
        $("teamMode").checked = false;
        $("teamHistory").replaceChildren();
        put(
          "teamStatus",
          "Đã xóa phiên và lịch sử trên máy chủ. Công việc đang chạy có thể kết thúc nhưng không lưu báo cáo.",
        );
      } catch (e) {
        put("teamStatus", e.message);
      }
    };
    history().catch((e) => put("teamStatus", e.message));
  }
  return { init, run, history, hasSession: () => Boolean(token) };
})();

document.addEventListener("DOMContentLoaded", async () => {
  try {
    applyTheme(localStorage.getItem("energyshift_theme") || "dark");
  } catch {
    applyTheme("dark");
  }
  const actions = {
    switchMainTab,
    toggleMobileNav,
    closeMobileNav,
    toggleAppTheme,
    revalidateDashboard,
    showDecisionMemo,
    selectGanttPlan,
    switchChartMetric,
    closeModal,
    openScheduleEditor,
    closeScheduleEditor,
    deleteScheduleJob,
    resetManualSchedule,
    clearManualConfirmations,
    dismissScheduleConflictToast,
    exportScheduleCSV,
    restoreScheduleDraft,
  };
  document.querySelectorAll("[data-action]").forEach((e) =>
    e.addEventListener("click", () => {
      if (e.dataset.action === "window.print()") {
        window.print();
        return;
      }
      const match = e.dataset.action.match(/^(\w+)\((.*)\)$/);
      if (match && actions[match[1]])
        actions[match[1]](
          ...JSON.parse("[" + match[2].replace(/'/g, '"') + "]"),
        );
    }),
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
      closeMobileNav();
    }
    if (
      e.key.toLowerCase() === "m" &&
      !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
    )
      showDecisionMemo();
    if (e.key === "Tab") {
      const modal = document.querySelector(".modal-backdrop.open");
      if (modal) {
        const focusable = [
            ...modal.querySelectorAll("button,a[href],input,select,textarea"),
          ].filter((x) => !x.disabled && x.getClientRects().length),
          first = focusable[0],
          last = focusable.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  });
  document.querySelectorAll(".modal-backdrop").forEach((e) =>
    e.addEventListener("click", (event) => {
      if (event.target === e) closeModal();
    }),
  );
  $("analyze").onclick = revalidateDashboard;
  $("scheduleEditForm").addEventListener("submit", saveScheduleJob);
  $("scheduleEditForm").addEventListener("input", (event) => {
    if (["editJobDuration", "editJobQuantity"].includes(event.target.id))
      $("editProcessingConfirmed").checked = false;
    previewScheduleEditor();
  });
  $("editJobMachine").addEventListener("change", () => {
    const p = scheduleEditorState?.data.jobs.find(
      (j) => j.id === scheduleEditorState.jobId,
    )?.eligible[$("editJobMachine").value];
    if (p) {
      $("editJobDuration").value = p.duration_min;
      $("editJobPower").value = p.avg_kw;
      $("editJobReference").value = p.lot_confirmation.reference;
      $("editProcessingConfirmed").checked = true;
    }
    previewScheduleEditor();
  });
  $("dataset").addEventListener("input", () => {
    clearResult();
    InputDesk.externalEdit();
  });
  $("loadFixture").onclick = () =>
    loadFixture($("scenarioSelect").value).catch((e) => errors([e.message]));
  $("scenarioSelect").onchange = () =>
    loadFixture($("scenarioSelect").value).catch((e) => errors([e.message]));
  $("validationPlanSelect").onchange = renderValidation;
  $("upload").onchange = async (e) => {
    try {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 524288) throw Error("JSON tối đa 512 KiB");
      setDataset(JSON.parse(await file.text()));
    } catch (err) {
      errors([err.message]);
    }
  };
  ["minSaving", "power"].forEach((id) =>
    $(id).addEventListener("input", () => {
      try {
        const d = JSON.parse($("dataset").value);
        if (id === "power") d.jobs[0].eligible.M1.avg_kw = Number($(id).value);
        else d.policy.min_net_saving_vnd = Number($(id).value);
        $("dataset").value = JSON.stringify(d, null, 2);
        clearResult();
        InputDesk.externalEdit();
      } catch (e) {
        errors([e.message]);
      }
    }),
  );
  for (const [id, unknown] of [
    ["unknownCost", true],
    ["extraCost", false],
  ])
    $(id).onclick = () => {
      const d = JSON.parse($("dataset").value);
      Object.assign(d.cost_scope.excluded_review.LABOR_OVERTIME, {
        status: unknown ? "UNKNOWN" : "BOUNDED",
        incremental_min_vnd: unknown ? null : 200000,
        incremental_max_vnd: unknown ? null : 200000,
      });
      setDataset(d);
    };
  TeamDemo.init();
  initializeMeasurements();
  clearResult();
  closeScheduleEditor();
  closeMobileNav();
  document
    .querySelectorAll(".demo-ribbon")
    .forEach(
      (e) =>
        (e.textContent =
          "Demo: số liệu mô hình từ đầu vào; B0/B1/B2 được kiểm tra độc lập. Không phải dữ liệu vận hành thực tế."),
    );
  try {
    const response = await apiFetch("/api/demo/fixtures");
    if (!response.ok) throw Error("Backend chưa sẵn sàng");
    const fixtures = await response.json();
    $("scenarioSelect").replaceChildren(
      ...fixtures.map((f) => {
        const o = node("option", f.name || f.id);
        o.value = f.id;
        return o;
      }),
    );
    await loadFixture(fixtures[0].id);
  } catch (e) {
    errors([
      `Không kết nối backend: ${e.message}. Với Render miễn phí, thử lại khi dịch vụ khởi động xong.`,
    ]);
  }
});
