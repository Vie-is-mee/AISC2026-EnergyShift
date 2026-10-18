"use strict";
const $ = (id) => document.getElementById(id);
let revision = 0,
  currentReport = null,
  sample = null,
  pending = false;
const labels = {
  CHANGE: "Có cơ sở đổi sang B1 trong giả định đã khai báo",
  KEEP_CURRENT: "Giữ lịch hiện tại",
  MEASURE_FIRST: "Cần xác nhận thêm trước khi đổi lịch",
};
const reasonLabels = {
  B2_NOT_EVALUATED: "B2 chưa được đánh giá",
  MODELED_COST_SCOPE_ONLY: "Phạm vi chi phí mô hình: điện chạy + setup",
  B1_SELECTED_BY_MODELED_BASE_COST: "B1 được chọn theo chi phí mô hình cơ sở",
  SEARCH_INCOMPLETE: "Chưa tìm hết miền do giới hạn candidate",
  EXCLUDED_COSTS_NOT_BOUNDED: "Còn chi phí ngoài mô hình chưa xác định",
  INDEPENDENT_POWER_OR_EXTRA_COST_RISK:
    "Rủi ro công suất hoặc chi phí có thể làm thay đổi việc đạt ngưỡng",
  SELECTED_B1_NOT_QUALIFIED_UNDER_DECLARED_BOUNDS:
    "B1 được chọn chưa đạt ngưỡng sau kiểm tra rủi ro",
  NO_QUALIFYING_MOVE_FOUND_IN_SEARCHED_DOMAIN:
    "Chưa tìm được move đạt ngưỡng trong miền đã xét",
  B1_QUALIFIES_OVER_DECLARED_POWER_AND_COST_BOUNDS:
    "B1 đạt ngưỡng trên các khoảng công suất và chi phí đã khai báo",
};
const money = (value) =>
  Number.isFinite(Number(value))
    ? new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(
        Number(value),
      ) + " đ"
    : "Ngoài phạm vi hiển thị";
const rational = (value) => {
  if (value === undefined || value === null) return null;
  const parts = String(value).split("/");
  return Number(parts[0]) / (parts.length > 1 ? Number(parts[1]) : 1);
};
const date = (value) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = String(text);
  if (className) el.className = className;
  return el;
}
function clearResult() {
  revision++;
  currentReport = null;
  $("results").hidden = true;
  $("results").removeAttribute("data-run-id");
  $("errors").hidden = true;
  $("errors").replaceChildren();
  $("status").textContent = pending
    ? "Input đã đổi. Kết quả lượt đang chạy sẽ được bỏ qua."
    : "Input đã đổi — cần chạy phân tích.";
}
function syncQuick() {
  try {
    const d = JSON.parse($("dataset").value);
    $("minSaving").value = d.policy?.min_net_saving_vnd ?? "";
    $("power").value =
      d.jobs?.find((j) => j.id === "J1")?.eligible?.M1?.avg_kw ?? "";
  } catch {
    $("minSaving").value = "";
    $("power").value = "";
  }
}
function setDataset(data) {
  clearResult();
  $("dataset").value = JSON.stringify(data, null, 2);
  syncQuick();
  $("analyze").disabled = pending;
}
function errors(items) {
  $("errors").replaceChildren();
  for (const item of items) {
    $("errors").append(
      node(
        "p",
        [
          item.field || item.job_id || item.machine_id || "",
          item.code,
          item.why || "",
          item.how_to_fix || "",
        ]
          .filter(Boolean)
          .join(" · "),
      ),
    );
  }
  $("errors").hidden = false;
}
function table(id, rows, classes = []) {
  const body = $(id);
  body.replaceChildren();
  rows.forEach((cells, i) => {
    const tr = node("tr", undefined, classes[i]);
    for (const value of cells) tr.append(node("td", value));
    body.append(tr);
  });
}
function lines(id, entries) {
  $(id).replaceChildren();
  for (const [name, value] of entries) {
    const row = node("div", undefined, "live-line");
    row.append(node("span", name), node("strong", value));
    $(id).append(row);
  }
}
function edit(mutator) {
  try {
    const d = JSON.parse($("dataset").value);
    mutator(d);
    setDataset(d);
  } catch {
    errors([
      {
        code: "EDIT_JSON_FIRST",
        why: "Cần sửa JSON hợp lệ trước khi dùng ô chỉnh nhanh.",
      },
    ]);
  }
}
$("dataset").addEventListener("input", () => {
  clearResult();
  syncQuick();
});
$("minSaving").addEventListener("change", () =>
  edit((d) => {
    d.policy.min_net_saving_vnd = Number($("minSaving").value);
  }),
);
$("power").addEventListener("change", () =>
  edit((d) => {
    const job = d.jobs.find((j) => j.id === "J1");
    if (!job?.eligible?.M1) throw Error();
    job.eligible.M1.avg_kw = Number($("power").value);
  }),
);
$("unknownCost").addEventListener("click", () =>
  edit((d) => {
    d.cost_scope.excluded_review.LABOR_OVERTIME = {
      status: "UNKNOWN",
      incremental_min_vnd: null,
      incremental_max_vnd: null,
      source_type: "SYNTHETIC",
      reference: "user-demo-unknown-overtime",
    };
  }),
);
$("extraCost").addEventListener("click", () =>
  edit((d) => {
    d.cost_scope.excluded_review.LABOR_OVERTIME = {
      status: "BOUNDED",
      incremental_min_vnd: 200000,
      incremental_max_vnd: 200000,
      source_type: "SYNTHETIC",
      reference: "user-demo-extra-overtime-200000",
    };
  }),
);
$("loadFixture").addEventListener("click", () => {
  if (sample) setDataset(structuredClone(sample));
});
$("upload").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  clearResult();
  const stamp = revision;
  if (file.size > 512 * 1024) {
    errors([{ code: "INPUT_TOO_LARGE", why: "Tối đa 512 KiB." }]);
    return;
  }
  try {
    const text = await file.text();
    if (stamp !== revision) return;
    $("dataset").value = text;
    syncQuick();
    $("analyze").disabled = pending;
  } catch {
    errors([{ code: "READ_ERROR", why: "Không đọc được file JSON." }]);
  }
  event.target.value = "";
});
function renderGantt(report) {
  const input = report.input_snapshot,
    start = Date.parse(input.horizon.start),
    duration = Date.parse(input.horizon.end) - start;
  const root = $("gantt");
  root.replaceChildren();
  const axis = node("div", undefined, "live-axis");
  for (let i = 0; i <= 4; i++)
    axis.append(
      node("span", date(new Date(start + (duration * i) / 4).toISOString())),
    );
  root.append(axis);
  for (const machine of input.machines) {
    const row = node("div", undefined, "live-machine"),
      tracks = node("div", undefined, "live-tracks");
    row.append(node("strong", machine.id + " · B0/B1"));
    for (const planId of ["B0", "B1"]) {
      const track = node("div", undefined, "live-track");
      track.setAttribute("aria-label", machine.id + " " + planId);
      for (const job of report.plans[planId].verification.jobs.filter(
        (j) => j.machine_id === machine.id,
      )) {
        const left = ((Date.parse(job.start) - start) / duration) * 100,
          width =
            ((Date.parse(job.end) - Date.parse(job.start)) / duration) * 100;
        const setupWidth =
          ((Date.parse(job.start) - Date.parse(job.setup_start)) / duration) *
          100;
        if (setupWidth > 0) {
          const setup = node("div", undefined, "live-setup");
          setup.style.left = left - setupWidth + "%";
          setup.style.width = setupWidth + "%";
          setup.title = job.job_id + " · setup " + job.setup_minutes + " phút";
          track.append(setup);
        }
        const bar = node("div", job.job_id + " · " + planId, "live-bar");
        bar.dataset.plan = planId;
        bar.style.left = left + "%";
        bar.style.width = width + "%";
        bar.title = [
          job.job_id,
          job.mold_id,
          date(job.start) + " → " + date(job.end),
          "Hạn " + date(job.due),
          "Setup " + job.setup_minutes + " phút",
        ].join(" · ");
        track.append(bar);
      }
      tracks.append(track);
    }
    row.append(tracks);
    root.append(row);
  }
}
function render(report) {
  currentReport = report;
  const b0 = report.plans.B0,
    b1 = report.plans.B1,
    risk = report.economic_assessment;
  $("results").dataset.runId = report.run_id;
  $("results").hidden = false;
  $("verdict").textContent =
    labels[report.decision.kind] || report.decision.kind;
  document.querySelector(".live-verdict").dataset.kind = report.decision.kind;
  $("verdictDetail").textContent =
    "Lịch được đề xuất: " +
    report.decision.selected_plan +
    " · " +
    report.comparison.changed_assignments +
    " công việc thay đổi giữa B0 và B1.";
  $("reasons").textContent = report.decision.reason_codes
    .map((r) => reasonLabels[r] || r)
    .join(" · ");
  $("saving").textContent = money(report.comparison.saving_vnd);
  $("netRange").textContent = risk.net_saving_bounds_exact_vnd
    ? risk.net_saving_bounds_exact_vnd
        .map((v) => money(rational(v)))
        .join(" → ")
    : "Chưa đủ dữ liệu chi phí";
  $("headroom").textContent = money(
    risk.max_total_extra_cost_vnd_for_robust_change,
  );
  $("netRange").dataset.tone = !risk.net_saving_bounds_exact_vnd
    ? "unknown"
    : rational(risk.net_saving_bounds_exact_vnd[1]) < 0
      ? "negative"
      : rational(risk.net_saving_bounds_exact_vnd[0]) <= 0
        ? "uncertain"
        : "positive";
  table(
    "costRows",
    [
      [
        "Điện chạy",
        money(b0.cost.by_component.RUN_ELECTRICITY),
        money(b1.cost.by_component.RUN_ELECTRICITY),
        money(report.comparison.saving_by_component_vnd.RUN_ELECTRICITY),
      ],
      [
        "Setup cơ khí + family",
        money(b0.cost.by_component.SETUP),
        money(b1.cost.by_component.SETUP),
        money(report.comparison.saving_by_component_vnd.SETUP),
      ],
      [
        "Tổng chi phí mô hình",
        money(b0.cost.total_vnd),
        money(b1.cost.total_vnd),
        money(report.comparison.saving_vnd),
      ],
    ],
    ["", "", "live-total"],
  );
  const left = new Map(b0.verification.jobs.map((j) => [j.job_id, j])),
    right = new Map(b1.verification.jobs.map((j) => [j.job_id, j]));
  const changed = new Set(b1.changes.map((c) => c.job_id));
  table(
    "jobRows",
    report.input_snapshot.jobs.map((j) => {
      const a = left.get(j.id),
        b = right.get(j.id);
      return [
        j.id + " / " + j.mold_id,
        new Intl.NumberFormat("vi-VN").format(j.quantity),
        a.machine_id + " · " + date(a.start),
        b.machine_id + " · " + date(b.start),
        a.setup_minutes + " → " + b.setup_minutes + " phút",
      ];
    }),
    report.input_snapshot.jobs.map((j) =>
      changed.has(j.id) ? "live-changed" : "",
    ),
  );
  renderGantt(report);
  lines("verification", [
    [
      "B0",
      b0.verification.status + " · " + b0.verification.jobs.length + " job",
    ],
    [
      "B1",
      b1.verification.status + " · " + b1.verification.jobs.length + " job",
    ],
    [
      "Điện năng B0 / B1",
      rational(b0.cost.total_kwh_exact) +
        " / " +
        rational(b1.cost.total_kwh_exact) +
        " kWh",
    ],
    ["Nguồn khai báo", report.source_type],
    ["Schema", report.schema_version],
  ]);
  const s = report.search;
  lines("search", [
    [
      "Candidate đã xét / hợp lệ",
      s.evaluated_candidates + " / " + s.valid_candidates,
    ],
    ["Bị loại", s.rejected_candidates],
    ["Grid", s.grid_minutes + " phút"],
    [
      "Kết thúc",
      s.search_complete
        ? "Đã xét hết grid single-move"
        : "Đạt giới hạn — chưa xét hết",
    ],
    ["Thời gian search", s.runtime_seconds + " giây"],
  ]);
  table(
    "reviewRows",
    Object.entries(report.cost_scope.excluded_review).map(([name, v]) => [
      name,
      v.status,
      v.status === "UNKNOWN"
        ? "Chưa biết"
        : money(v.incremental_min_vnd) + " → " + money(v.incremental_max_vnd),
      v.source_type + " · " + v.reference,
    ]),
  );
  $("riskNote").textContent =
    risk.status === "UNKNOWN_COSTS"
      ? "Cần xác nhận: " + risk.unknown_components.join(", ")
      : "Bounds được tính cho sai số độc lập của từng profile công suất; có dự phòng sai số làm tròn. Đây là bảo đảm trong giả định đã khai báo.";
  table(
    "scenarioRows",
    Object.entries(report.sensitivity.scenarios).map(([name, s]) => [
      name,
      money(s.b0_vnd),
      money(s.b1_vnd),
      money(s.saving_vnd),
    ]),
  );
  $("runMeta").textContent =
    "Run: " + report.run_id + " · Nguồn khai báo: " + report.source_type;
  $("hashMeta").textContent = "Input: " + report.input_hash;
  $("status").textContent =
    "Hoàn tất. Các kết quả bên dưới thuộc cùng một lần chạy.";
}
$("analyze").addEventListener("click", async () => {
  if (pending) return;
  clearResult();
  const stamp = revision,
    payload = $("dataset").value;
  pending = true;
  $("analyze").disabled = true;
  $("analyze").textContent = "Đang tính toán…";
  $("status").textContent =
    "Engine đang kiểm chứng và tìm B1. Có thể mất khoảng 10–30 giây.";
  try {
    const response = await fetch("/api/demo/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
    const report = await response.json();
    if (stamp !== revision) {
      $("status").textContent =
        "Đã bỏ kết quả cũ vì input thay đổi. Hãy chạy lại.";
      return;
    }
    if (!response.ok) {
      errors(
        report.errors || [
          { code: "REQUEST_FAILED", why: "Không chạy được phân tích." },
        ],
      );
      $("status").textContent = "Phân tích bị chặn. Xem lỗi đầu vào.";
      return;
    }
    if (report.status !== "COMPLETED") {
      errors(
        report.B0?.verification?.issues ||
          report.errors || [
            {
              code: report.status,
              why: "Lịch gốc chưa hợp lệ; chưa có khuyến nghị.",
            },
          ],
      );
      $("status").textContent = "Baseline không hợp lệ; không xuất lợi ích.";
      return;
    }
    render(report);
  } catch {
    if (stamp === revision) {
      errors([
        {
          code: "CONNECTION_ERROR",
          why: "Không kết nối được API local. Hãy kiểm tra server và chạy lại.",
        },
      ]);
      $("status").textContent = "Chưa có kết quả.";
    }
  } finally {
    pending = false;
    $("analyze").disabled = false;
    $("analyze").textContent = "Chạy phân tích B0 / B1";
  }
});
$("export").addEventListener("click", () => {
  if (!currentReport) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(currentReport, null, 2)], {
      type: "application/json",
    }),
  );
  const link = node("a");
  link.href = url;
  link.download = "EnergyShift_" + currentReport.run_id + ".json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
async function initialize() {
  const stamp = revision;
  try {
    const [health, data] = await Promise.all([
      fetch("/api/demo/health").then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      }),
      fetch("/api/demo/fixtures/editable-cell").then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      }),
    ]);
    sample = data;
    if (stamp === revision) setDataset(data);
    else $("analyze").disabled = pending;
    $("health").textContent = "Engine local · build " + health.build_sha;
    $("status").textContent = "Đã nạp dữ liệu giả lập. Chưa chạy phân tích.";
  } catch {
    $("health").textContent = "Chưa kết nối API local";
    errors([
      {
        code: "START_SERVER",
        why: "Chạy python -m uvicorn backend.app:app --host 127.0.0.1 --port 8765 rồi mở http://127.0.0.1:8765.",
      },
    ]);
  }
}
initialize();
