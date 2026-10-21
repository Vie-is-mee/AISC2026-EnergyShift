/* UI shell adapted from the supplied EnergyShift_Complete_UI_UX design. */
"use strict";
window.Workspace = (() => {
  const el = (id) => document.getElementById(id);
  const views = {
    "tab-overview": [
      "Quyết định & so sánh",
      "Lịch hiện tại và phương án đề xuất, cùng dữ liệu và phạm vi chi phí.",
    ],
    "tab-gantt": [
      "Tiến độ sản xuất",
      "So sánh lịch chạy máy, khuôn và thời gian chuyển đổi B0 / B1.",
    ],
    "tab-loadcurve": [
      "Phụ tải & biểu giá",
      "Điện năng và công suất trung bình được tổng hợp từ lịch đã kiểm chứng.",
    ],
    "tab-validation": [
      "Ràng buộc vật lý",
      "Kết quả kiểm định độc lập và phạm vi tìm kiếm phương án.",
    ],
    "tab-sensitivity": [
      "Độ nhạy & rủi ro",
      "Xem điều gì có thể làm thay đổi lợi ích và cần xác nhận thêm ở đâu.",
    ],
    "tab-dispatch": [
      "Lịch chạy & nhập liệu",
      "Chọn hồ sơ, kiểm tra bảng kế hoạch rồi bấm Phân tích kế hoạch.",
    ],
  };
  let active = "tab-overview";
  function closeMenu() {
    document.body.classList.remove("mobile-nav-open");
    el("menuToggle").setAttribute("aria-expanded", "false");
  }
  function show(id, focus = false) {
    if (!Object.hasOwn(views, id)) return;
    active = id;
    document.body.dataset.view = id;
    document.querySelectorAll(".tab-pane").forEach((pane) => {
      pane.hidden = pane.id !== id;
      pane.classList.toggle("active", pane.id === id);
    });
    document.querySelectorAll(".rail-item[data-tab], .quick-nav-item[data-tab]").forEach((button) => {
      const selected = button.dataset.tab === id;
      button.classList.toggle("active", selected);
      if (selected) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    el("workspaceTitle").textContent = views[id][0];
    el("workspaceSubtitle").textContent = views[id][1];
    el("viewEmpty").hidden = id === "tab-dispatch" || !el("results").hidden;
    closeMenu();
    if (focus) {
      el("workspaceMain").scrollTop = 0;
      el("workspaceMain").focus({ preventScroll: true });
    }
  }
  function openDetails(id) {
    show("tab-dispatch");
    const target = el(id);
    for (let p = target; p; p = p.parentElement)
      if (p.tagName === "DETAILS") p.open = true;
    target.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  document
    .querySelectorAll(".rail-item[data-tab], .quick-nav-item[data-tab]")
    .forEach((button) =>
      button.addEventListener("click", () => show(button.dataset.tab, true)),
    );
  for (const id of ["goInput", "startPlanning"])
    el(id).onclick = () => show("tab-dispatch", true);
  el("runSample").onclick = () => {
    el("loadFixture").click();
    el("analyze").click();
  };
  el("headerAnalyze").onclick = () => {
    show("tab-dispatch");
    el("analyze").click();
  };
  const mirrorAnalysis = () => {
    el("headerAnalyze").disabled = el("analyze").disabled;
  };
  new MutationObserver(mirrorAnalysis).observe(el("analyze"), {
    attributes: true,
    attributeFilter: ["disabled"],
  });
  mirrorAnalysis();
  el("openImport").onclick = () => openDetails("importSettings");
  el("openSettings").onclick = () => openDetails("workshopSettings");
  el("showPlanDetails").onchange = (e) =>
    el("inputDesk").classList.toggle("show-plan-details", e.target.checked);
  el("menuToggle").onclick = () => {
    const open = document.body.classList.toggle("mobile-nav-open");
    el("menuToggle").setAttribute("aria-expanded", String(open));
  };
  for (const id of ["railScrim", "closeMenu"]) el(id).onclick = closeMenu;
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeMenu();
      el("menuToggle").focus();
    }
  });
  let theme = "light";
  try {
    theme =
      localStorage.getItem("energyshift_theme") === "dark" ? "dark" : "light";
  } catch {
    /* Optional preference. */
  }
  function paintTheme() {
    document.documentElement.dataset.theme = theme;
    el("themeToggle").setAttribute("aria-pressed", String(theme === "dark"));
  }
  paintTheme();
  el("themeToggle").onclick = () => {
    theme = theme === "dark" ? "light" : "dark";
    paintTheme();
    try {
      localStorage.setItem("energyshift_theme", theme);
    } catch {
      /* UI still works. */
    }
  };
  show(active);
  return {
    show,
    changed() {
      show("tab-dispatch");
    },
    completed(report) {
      const grid = el("plansGrid");
      grid.replaceChildren();
      for (const [code, title] of [
        ["B0", "Lịch hiện tại"],
        ["B1", "Điều chỉnh một lô"],
        ["B2", "Phương án phối hợp"],
      ]) {
        const card = node("article", undefined, "plan-card");
        if (report.decision.selected_plan === code)
          card.classList.add("plan-recommended");
        const head = node("div", undefined, "plan-header-row");
        head.append(
          node("span", code, "plan-code-badge"),
          node(
            "span",
            code === "B2"
              ? "CHƯA CHẠY"
              : report.plans[code].verification.status,
            "live-pill",
          ),
        );
        card.append(
          head,
          node("h3", title, "plan-name"),
          node(
            "strong",
            code === "B2"
              ? "Chưa có kết quả"
              : money(report.plans[code].cost.total_vnd),
            "plan-cost-hero",
          ),
          node(
            "p",
            code === "B2"
              ? "Chưa triển khai bộ giải B2."
              : "Điện chạy + setup · " +
                  (report.decision.selected_plan === code
                    ? "Lịch đang được chọn theo policy"
                    : "Phương án đối chiếu"),
            "live-muted",
          ),
        );
        grid.append(card);
      }
      renderEnergy(report);
      show("tab-overview", true);
    },
    openDetails,
  };
})();

function renderEnergy(report) {
  const f = (n) =>
    new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(n);
  const data = report.input_snapshot,
    start = Date.parse(data.horizon.start),
    end = Date.parse(data.horizon.end);
  const rows = [];
  for (let left = start; left < end; left += 3600000) {
    const right = Math.min(left + 3600000, end),
      item = { start: left, end: right };
    for (const plan of ["B0", "B1"]) {
      item[plan] = report.plans[plan].cost.ledger
        .filter((r) => r.component === "RUN_ELECTRICITY")
        .reduce(
          (total, r) =>
            total +
            (Math.max(
              0,
              Math.min(right, Date.parse(r.end)) -
                Math.max(left, Date.parse(r.start)),
            ) /
              3600000) *
              r.avg_kw,
          0,
        );
    }
    rows.push(item);
  }
  table(
    "loadRows",
    rows.map((r) => [
      date(r.start) + " → " + date(r.end),
      f(r.B0),
      f(r.B1),
      f(r.B0 / ((r.end - r.start) / 3600000)),
      f(r.B1 / ((r.end - r.start) / 3600000)),
    ]),
  );
  table(
    "tariffRows",
    data.tariff.windows.map((w) => [
      date(w.start),
      date(w.end),
      { NORMAL: "Bình thường", PEAK: "Cao điểm", OFF_PEAK: "Thấp điểm" }[
        w.band
      ],
      money(w.vnd_per_kwh),
    ]),
  );
  document.getElementById("tariffSource").textContent = data.tariff.provenance;
  const root = document.getElementById("loadChart");
  root.replaceChildren();
  const ns = "http://www.w3.org/2000/svg",
    svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 900 225");
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    "Công suất trung bình từng khoảng giờ B0 và B1, kW. Số liệu chi tiết ở bảng bên dưới.",
  );
  const maximum = Math.max(
    1,
    ...rows.flatMap((r) =>
      [r.B0, r.B1].map((v) => v / ((r.end - r.start) / 3600000)),
    ),
  );
  for (const plan of ["B0", "B1"]) {
    const line = document.createElementNS(ns, "polyline");
    line.setAttribute(
      "points",
      rows
        .map(
          (r, i) =>
            `${40 + i * (820 / Math.max(1, rows.length - 1))},${185 - (150 * (r[plan] / ((r.end - r.start) / 3600000))) / maximum}`,
        )
        .join(" "),
    );
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", plan === "B0" ? "#38bdf8" : "#10b981");
    line.setAttribute("stroke-width", "3");
    svg.append(line);
  }
  const caption = document.createElementNS(ns, "text");
  caption.setAttribute("x", "40");
  caption.setAttribute("y", "215");
  caption.setAttribute("fill", "currentColor");
  caption.textContent =
    "B0: xanh dương · B1: xanh ngọc · kW trung bình theo giờ (không phải peak tức thời)";
  svg.append(caption);
  root.append(svg);
}
