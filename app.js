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
  revision++;
  currentReport = null;
  closeModal();
  [
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
  return currentReport?.decision.selected_plan === "B1" ? "B1" : "B2";
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
  report.input_preparation = window.InputDesk?.evidence();
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
      .join(
        " ",
      )} B2 chỉ dịch thời điểm trong cấu hình máy/thứ tự của B0 và B1.`,
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
function selectGanttPlan(value) {
  activeGanttPlan = value;
  renderGantt();
}
function renderGantt() {
  if (!currentReport) return;
  document
    .querySelectorAll("[data-plan]")
    .forEach((e) =>
      e.classList.toggle("active", e.dataset.plan === activeGanttPlan),
    );
  const data = currentReport.input_snapshot,
    start = Date.parse(data.horizon.start),
    span = Date.parse(data.horizon.end) - start,
    codes =
      activeGanttPlan === "compare"
        ? ["B0", "B2"]
        : [activeGanttPlan.toUpperCase()];
  document
    .querySelector(".gantt-hours-track")
    .replaceChildren(
      ...Array.from({ length: 13 }, (_, i) =>
        node(
          "span",
          new Date(start + (span * i) / 12).toLocaleTimeString("vi-VN", {
            timeZone: "Asia/Ho_Chi_Minh",
            hour: "2-digit",
            minute: "2-digit",
          }),
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
        const sub = node("div", null, "gantt-subtrack");
        Object.assign(sub.style, { position: "relative", height: "38px" });
        const bg = node("div", null, "evn-band-stripes-bg");
        data.tariff.windows.forEach((w) => {
          const stripe = node(
            "div",
            null,
            "evn-stripe stripe-" +
              { OFF_PEAK: "offpeak", NORMAL: "normal", PEAK: "peak" }[w.band],
          );
          Object.assign(stripe.style, {
            position: "absolute",
            left: ((Date.parse(w.start) - start) * 100) / span + "%",
            width:
              ((Date.parse(w.end) - Date.parse(w.start)) * 100) / span + "%",
          });
          bg.append(stripe);
        });
        sub.append(bg);
        currentReport.plans[code].verification.jobs
          .filter((j) => j.machine_id === machine.id)
          .forEach((job) => {
            if (job.setup_minutes) {
              const setup = node("div", null, "gantt-setup-wedge");
              Object.assign(setup.style, {
                position: "absolute",
                left:
                  ((Date.parse(job.setup_start) - start) * 100) / span + "%",
                width:
                  ((Date.parse(job.start) - Date.parse(job.setup_start)) *
                    100) /
                    span +
                  "%",
                height: "28px",
              });
              setup.title = `Chuẩn bị ${job.job_id}: ${job.setup_minutes} phút`;
              sub.append(setup);
            }
            const pill = node(
              "button",
              `${code} · ${job.job_id}`,
              `gantt-job-pill job-pill-${code.toLowerCase()}`,
            );
            Object.assign(pill.style, {
              left: ((Date.parse(job.start) - start) * 100) / span + "%",
              width:
                ((Date.parse(job.end) - Date.parse(job.start)) * 100) / span +
                "%",
            });
            pill.title = `${job.job_id}: chuẩn bị ${job.setup_start}; chạy ${job.start} → ${job.end}`;
            pill.onclick = () => {
              put("modalJobTitle", `${code} · ${job.job_id}`);
              put("modalJobBody", JSON.stringify(job, null, 2));
              openModal("jobDetailModal");
            };
            sub.append(pill);
          });
        track.append(sub);
      }
      return row;
    }),
  );
  const code = codes.at(-1),
    jobs = currentReport.plans[code].verification.jobs;
  table(
    "scheduleJobRows",
    jobs.map((j) => [
      j.job_id,
      j.machine_id,
      j.start,
      j.end,
      j.setup_start,
      code,
      "PASS",
    ]),
  );
  put("scheduleListCount", `${jobs.length} lô · ${code}`);
  put(
    "scheduleEditStatus",
    "Sửa bảng tại Điều chuyển đơn hàng rồi phân tích lại để cập nhật cả lịch và chi phí.",
  );
  put(
    "ganttChangeFeedback",
    `Chân trời ${data.horizon.start} → ${data.horizon.end}. Nhấn lô để xem thời gian chuẩn bị.`,
  );
  $("ganttChangeFeedback").hidden = false;
  put("ganttNextDayPreview", "Chỉ hiển thị lịch trong chân trời đã khai báo.");
}
function renderValidation() {
  if (!currentReport) return;
  const code = ($("validationPlanSelect")?.value || "b2").toUpperCase(),
    plan = currentReport.plans[code];
  $("validationList").replaceChildren(
    node("h3", `${code}: ${plan.verification.status}`),
    node(
      "p",
      "Verifier kiểm tra độc lập: đủ công việc, máy phù hợp, lịch máy, chuẩn bị, hạn giao và giữ khuôn vật lý.",
    ),
    node(
      "p",
      `B2: ${currentReport.plans.B2.solver_status}; giữ máy/thứ tự B0 hoặc B1, không chứng minh tối ưu toàn nhà máy.`,
    ),
  );
  put("confirmationProgress", "3 lịch đã được kiểm tra độc lập");
  put(
    "validationConfirmNotice",
    "PASS áp dụng cho ràng buộc đã khai báo; chưa thay thế kiểm tra hiện trường.",
  );
}
function renderRisk() {
  const r = currentReport,
    risks = r.coordinated_economics;
  table(
    "sensitivityTbody",
    ["B1", "B2"].map((code) => {
      const risk = risks[code],
        b = risk.net_saving_bounds_exact_vnd;
      return [
        code,
        risk.status,
        b ? money(exact(b[0])) : "Chưa xác định",
        b ? money(exact(b[1])) : "Chưa xác định",
        risk.all_declared_values_qualify
          ? "Đạt mọi giá trị trong khoảng"
          : "Chưa đạt / chưa đủ dữ liệu",
      ];
    }),
  );
  put(
    "sensitivityNote",
    `Khoảng độc lập theo công suất và chi phí loại trừ, không phải khoảng tin cậy thống kê. Lợi ích tăng thêm B2 so với B1: ${risks.incremental_B2_over_B1.net_incremental_bounds_exact_vnd?.map((v) => money(exact(v))).join(" → ") || "Chưa xác định"}. Phạm vi xác nhận: ${r.cost_scope.review_scope}.`,
  );
}
function switchChartMetric(value) {
  activeMetric = value;
  renderChart();
}
function renderChart() {
  if (!currentReport) return;
  const data = currentReport.input_snapshot,
    start = Date.parse(data.horizon.start),
    end = Date.parse(data.horizon.end),
    hours = Math.ceil((end - start) / 3600000),
    series = ["B0", "B2"].map((code) => ({
      code,
      values: Array.from({ length: hours }, (_, i) => {
        const a = start + i * 3600000,
          b = Math.min(end, a + 3600000);
        return (
          currentReport.plans[code].cost.ledger
            .filter((r) => r.component === "RUN_ELECTRICITY")
            .reduce(
              (sum, r) =>
                sum +
                (Math.max(
                  0,
                  Math.min(b, Date.parse(r.end)) -
                    Math.max(a, Date.parse(r.start)),
                ) /
                  3600000) *
                  r.avg_kw *
                  (activeMetric === "cost" ? r.vnd_per_kwh : 1),
              0,
            ) / (activeMetric === "power" ? (b - a) / 3600000 : 1)
        );
      }),
    })),
    max = Math.max(1, ...series.flatMap((s) => s.values)),
    svg = $("elecLineChartSvg"),
    ns = "http://www.w3.org/2000/svg";
  svg.replaceChildren();
  svg.setAttribute("viewBox", "0 0 900 300");
  series.forEach((s, index) => {
    const line = document.createElementNS(ns, "polyline");
    line.setAttribute(
      "points",
      s.values
        .map(
          (v, i) =>
            `${40 + ((i + 0.5) * 820) / hours},${260 - (v / max) * 220}`,
        )
        .join(" "),
    );
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", index ? "#22d3ee" : "#a78bfa");
    line.setAttribute("stroke-width", "3");
    svg.append(line);
  });
  const caption = document.createElementNS(ns, "text");
  caption.setAttribute("x", "40");
  caption.setAttribute("y", "290");
  caption.setAttribute("fill", "currentColor");
  caption.textContent = `B0 tím · B2 xanh | ${hours} giờ | ${activeMetric === "power" ? "kW trung bình mỗi giờ" : "điện năng theo giá từng giờ (đ)"} | mô hình`;
  svg.append(caption);
  put("hudHourVal", "Theo lịch");
  put("hudTariffVal", "Theo đầu vào");
  put("hudB0Val", `${peak(currentReport.plans.B0).toFixed(2)} kW đỉnh`);
  put("hudB2Val", `${peak(currentReport.plans.B2).toFixed(2)} kW đỉnh`);
  put("hudSavingVal", "Không phải IoT");
  $("btnMetricCost")?.classList.toggle("active", activeMetric === "cost");
  $("btnMetricPower")?.classList.toggle("active", activeMetric === "power");
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
function showDecisionMemo() {
  if (!currentReport) {
    toast("Hãy phân tích kế hoạch trước.");
    return;
  }
  const button = node("button", "Tải báo cáo JSON", "btn-action-primary"),
    pre = node("pre", JSON.stringify(currentReport, null, 2));
  pre.style.whiteSpace = "pre-wrap";
  button.onclick = () =>
    download(
      "EnergyShift_report.json",
      JSON.stringify(currentReport, null, 2),
      "application/json",
    );
  $("memoContent").replaceChildren(button, pre);
  openModal("memoModal");
}
function openScheduleEditor() {
  switchMainTab("tab-dispatch");
  toast("Sửa lô trong bảng kế hoạch, sau đó phân tích lại.");
}
function closeScheduleEditor() {
  if ($("scheduleEditForm")) $("scheduleEditForm").hidden = true;
}
function deleteScheduleJob() {
  openScheduleEditor();
}
function resetManualSchedule() {
  if (sample) setDataset(structuredClone(sample));
  switchMainTab("tab-dispatch");
}
function dismissScheduleConflictToast() {
  if ($("scheduleConflictToast")) $("scheduleConflictToast").hidden = true;
}
function clearManualConfirmations() {
  toast("Các kiểm tra được tính tự động từ lịch.");
}
function exportScheduleCSV() {
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
  put("analyze", "Đang kiểm tra và tối ưu…");
  try {
    const response = await apiFetch("/api/demo/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(JSON.parse($("dataset").value)),
      }),
      report = await response.json();
    if (token !== revision) return;
    if (!response.ok) throw Error(JSON.stringify(report));
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
