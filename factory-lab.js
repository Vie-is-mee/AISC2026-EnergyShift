"use strict";
/* Independent, explicitly scoped factory-1 experiment; never converted to mold-based demo-3. */
(function (root) {
  if (typeof document === "undefined") return;
  document.addEventListener("DOMContentLoaded", () => {
    if (!root.DemoWorkspace) return;
    const section = document.createElement("section");
    section.className = "studio demo-edit-section";
    section.id = "factoryLab";
    section.innerHTML = `<div class="studio-section-head"><div>
      <h3>Factory Lab · Lập lịch đa ngành (thử nghiệm)</h3>
      <p>Hỗ trợ factory-1 (job đơn) và factory-2 (lệnh sản xuất gồm nhiều công đoạn), không bắt buộc khuôn. Hai phạm vi tìm kiếm: giữ máy hoặc phối hợp máy và giờ.</p></div></div>
      <p><strong>Phạm vi thực thi:</strong> factory-1 lập lịch job đơn; factory-2 lập lịch các công đoạn theo ràng buộc trước/sau khai báo. Phải xác nhận không cần setup hoặc khai báo đầy đủ ma trận setup; có thể khai báo nguồn lực và biểu giá. Factory-2 yêu cầu xác nhận bộ đệm trung gian không giới hạn; chưa mô hình hóa tồn kho hữu hạn, vận chuyển hay điện setup.</p>
      <div class="studio-actions">
        <button id="factoryExample" type="button">Nạp ví dụ CNC giả lập</button>
        <button id="factoryPackaging" type="button">Nạp ví dụ đóng gói giả lập (có nguồn lực + trước/sau)</button>
        <button id="factoryChangeover" type="button">Nạp ví dụ chuyển đổi máy + đội setup (giả lập)</button>
        <button id="factoryMultistage" type="button">Nạp ví dụ đa công đoạn · 2 lệnh sản xuất</button>
        <label class="factory-file-label">Đọc JSON của cơ sở <input id="factoryFile" type="file" accept=".json,application/json"></label>
        <label class="factory-file-label">Nhập bảng CSV / Excel <input id="factorySpreadsheet" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>
        <label for="factoryTemplateVersion">Mẫu bảng có dữ liệu SYNTHETIC</label>
        <select id="factoryTemplateVersion">
          <option value="factory-1">CNC · một công đoạn</option>
          <option value="factory-2">Đóng gói · đa công đoạn</option>
          <option value="changeover">Đóng gói · đổi máy và setup</option>
        </select>
        <button id="factoryTemplateCSV" type="button">Tải mẫu CSV</button>
        <button id="factoryTemplateXLSX" type="button">Tải mẫu Excel</button>
        <label for="factoryMode">Phạm vi tối ưu</label>
        <select id="factoryMode">
          <option value="FIXED_MACHINE">Giữ máy · dịch giờ theo biểu giá</option>
          <option value="JOINT_MACHINE_TIME">Phối hợp máy và thời gian</option>
        </select>
        <label for="factoryObjective">Mục tiêu nghiệp vụ độc lập</label>
        <select id="factoryObjective">
          <option value="ENERGY">Điện năng · giảm tổng chi phí mô hình</option>
          <option value="PRODUCTION">Sản xuất · ưu tiên hoàn thành sớm</option>
          <option value="COMBINED">Kết hợp · giảm chi phí trong giới hạn hoàn thành</option>
        </select>
        <label for="factoryMakespanSlack">Cho phép kéo dài thời gian hoàn thành so B0 (phút; chỉ chế độ Kết hợp)</label>
        <input id="factoryMakespanSlack" type="number" min="0" max="1440" step="5" value="0" disabled>
        <button id="factoryRun" type="button">Phân tích B0 / B1 / B2</button>
      </div>
      <details id="factoryInputDetails">
        <summary>Xem và chỉnh dữ liệu factory-1 / factory-2 (JSON)</summary>
        <label for="factoryJson">Hồ sơ máy, công việc, công suất, biểu giá, lịch B0 và xác nhận setup</label>
        <textarea id="factoryJson" rows="12" spellcheck="false" placeholder="Nạp ví dụ hoặc dán JSON factory-1 / factory-2. Không suy diễn công suất, thứ tự công đoạn, tài nguyên hay giờ giao hàng."></textarea>
      </details>
      <div id="factoryStatus" role="status" aria-live="polite">Chưa có dữ liệu. Bấm Nạp ví dụ hoặc nhập JSON, CSV hoặc Excel.</div>
      <div id="factoryImportPreview" class="factory-import-preview" aria-live="polite"></div>
      <div id="factoryResult" aria-live="polite"></div>
      <div class="studio-actions"><button id="factoryExport" type="button" disabled>Xuất báo cáo và bằng chứng JSON</button></div>`;

    // Impeccable: progressive disclosure, one primary decision at a time.
    const toolbar=section.querySelector(":scope > .studio-actions");
    const sampleGroup=document.createElement("details");
    sampleGroup.className="demo-factory-disclosure";
    sampleGroup.innerHTML="<summary>Ví dụ khác · đóng gói, setup và đa công đoạn</summary>";
    const sampleActions=document.createElement("div");sampleActions.className="studio-actions";
    for(const id of ["factoryPackaging","factoryChangeover","factoryMultistage"])
      sampleActions.append(section.querySelector("#"+id));
    sampleGroup.append(sampleActions);
    toolbar.querySelector("#factoryExample").after(sampleGroup);
    const importGroup=document.createElement("details");
    importGroup.id="factoryImportTools";importGroup.className="demo-factory-disclosure";
    importGroup.innerHTML="<summary>Nhập dữ liệu của tôi · CSV / Excel / JSON</summary>"+
      "<p>Tải file mẫu, chọn dữ liệu của cơ sở và duyệt trước khi chạy. Không tự điền thông số máy còn thiếu.</p>";
    const importActions=document.createElement("div");importActions.className="studio-actions";
    for(const id of ["factoryFile","factorySpreadsheet"]){
      const field=section.querySelector("#"+id);importActions.append(field.closest("label"));
    }
    const template=section.querySelector("#factoryTemplateVersion");
    importActions.append(template.previousElementSibling,template);
    for(const id of ["factoryTemplateCSV","factoryTemplateXLSX"])
      importActions.append(section.querySelector("#"+id));
    importGroup.append(importActions);
    toolbar.querySelector("#factoryExample").before(importGroup);

    const analyzeButton=toolbar.querySelector("#factoryRun");
    for(const id of ["factoryMode","factoryObjective","factoryMakespanSlack"]){
      const input=toolbar.querySelector("#"+id);
      const label=toolbar.querySelector('label[for="'+id+'"]');
      const field=document.createElement("div");
      field.className="demo-factory-field";
      field.append(label,input);
      analyzeButton.before(field);
    }
    const flow=document.createElement("p");
    flow.className="demo-factory-flow";
    flow.textContent="1 · Chọn ví dụ hoặc nhập file     →     2 · Chọn mục tiêu     →     3 · Phân tích     →     4 · Xem lịch & kiểm chứng";
    toolbar.before(flow);
    root.DemoWorkspace.mountSection("factory", section);
    const byId = id => document.getElementById(id);
    // The existing apiFetch deliberately permits only /api/demo/* paths.
    // Keep that guard intact: Factory Lab uses a separate explicit route allowlist.
    const factoryFetch = (path, options) => {
      if (!["/api/factory/example", "/api/factory/packaging-example", "/api/factory/changeover-example", "/api/factory/multistage-example", "/api/factory/import/template", "/api/factory/import/preview", "/api/factory/analyze"].includes(path.split("?")[0]))
        throw Error("Unsupported factory endpoint");
      return fetch((root.ENERGYSHIFT_CONFIG?.apiBaseUrl || "") + path,
        {...options, credentials: "omit"});
    };
    const add = (parent, tag, content, className) => {
      const item = document.createElement(tag);
      if (content !== undefined) item.textContent = String(content);
      if (className) item.className = className;
      parent.append(item);
      return item;
    };
    const fmt = n => Number(n).toLocaleString("vi-VN", {maximumFractionDigits: 2});
    let latest = null, busy = false, revision = 0, pendingImport = null;
    const clear = () => {
      revision++;
      latest = null;
      pendingImport = null;
      root.DemoWorkspace?.invalidateFactory?.();
      byId("factoryExport").disabled = true;
      byId("factoryResult").replaceChildren();
      byId("factoryImportPreview").replaceChildren();
    };
    byId("factoryJson").addEventListener("input", clear);
    byId("factoryMode").addEventListener("change", clear);
    byId("factoryObjective").addEventListener("change", () => {
      byId("factoryMakespanSlack").disabled = byId("factoryObjective").value !== "COMBINED";
      if (byId("factoryMakespanSlack").disabled) byId("factoryMakespanSlack").value = "0";
      clear();
    });
    byId("factoryMakespanSlack").addEventListener("input", clear);
    function draw(report, source) {
      const area = byId("factoryResult");
      area.replaceChildren();
      if (report.status !== "COMPLETED") {
        add(area, "h4", "Chưa thể lập lịch — " + (report.code || report.status));
        for (const problem of report.issues || report.plans?.B0?.verification?.issues || [])
          add(area, "p", [problem.code, problem.field, problem.constraint, problem.job_id].filter(Boolean).join(" · "));
        add(area, "p", report.message || "Sửa dữ liệu hoặc xác nhận các điều kiện chưa được mô hình hóa.");
        return;
      }
      add(area, "h4", source.metadata.industry + " · " + source.metadata.plant_alias);
      add(area, "p", "Schema " + report.schema_version + " · Nguồn " + report.source_type + " · " + report.mode +
        " · " + report.step_minutes + " phút/ô · hash " + report.input_hash);
      const objectiveLabel = report.objective_mode === "PRODUCTION"
        ? "Sản xuất: giảm makespan, sau đó tổng thời gian hoàn thành công đoạn; chi phí có thể tăng."
        : report.objective_mode === "COMBINED"
          ? "Kết hợp: giảm chi phí mô hình, makespan không vượt quá B0 + " +
            report.max_makespan_slack_minutes + " phút."
          : "Điện năng: giảm chi phí mô hình, không ràng buộc thời điểm hoàn thành ngoài due/release.";
      add(area, "p", "Mục tiêu nghiệp vụ: " + report.objective_mode + ". " + objectiveLabel);
      add(area, "p", "B1: CP-SAT thay tối đa 1 " +
        (report.schema_version === "factory-2" ? "công đoạn" : "job") +
        "; B2: CP-SAT tối ưu phối hợp trên lưới thời gian. " +
        (report.search.global_optimum_proven
          ? "Đã chứng minh tối ưu " + (report.objective_mode === "PRODUCTION" ? "chỉ số hoàn thành" : "chi phí") + " trong mô hình rời rạc."
          : "Chưa chứng minh tối ưu trong giới hạn thời gian solver.") +
        " Không suy rộng sang vận hành nhà máy thực.");
      add(area, "p", "Đã cưỡng chế: " + (report.enforced_constraints || []).join(", ") + ". B1: " +
        report.search.b1.status + "; B2: " + report.search.b2.status + ".");
      const table = add(area, "table", undefined, "factory-lab-table");
      const head = add(table, "thead"), hr = add(head, "tr");
      for (const key of ["Lịch", "Verifier", "Makespan (phút)", "Tổng mô hình (VND)", "Điện chạy máy (VND)", "Phí setup (VND)", "Chênh lệch B0 (VND)", "kWh"]) add(hr, "th", key);
      const body = add(table, "tbody"), b0 = report.plans.B0.cost.total_vnd;
      for (const code of ["B0", "B1", "B2"]) {
        const p = report.plans[code], row = add(body, "tr");
        for (const value of [code, p.verification.status, p.production ? fmt(p.production.makespan_minutes) : "Không xuất",
          p.cost ? fmt(p.cost.total_vnd) : "Không xuất",
          p.cost ? fmt(p.cost.total_vnd - p.cost.changeover_total_vnd) : "Không xuất",
          p.cost ? fmt(p.cost.changeover_total_vnd) : "Không xuất",
          p.cost ? fmt(b0 - p.cost.total_vnd) : "Không xuất",
          p.cost ? fmt(p.cost.energy_kwh) : "Không xuất"]) add(row, "td", value);
      }
      const cards = add(area, "div", undefined, "factory-lab-cards");
      for (const code of ["B0", "B1", "B2"]) {
        const p = report.plans[code], card = add(cards, "div", undefined, "factory-lab-plan-card");
        add(card, "strong", code + " · " + p.verification.status);
        add(card, "p", "Hoàn thành toàn bộ tính từ đầu kỳ: " + fmt(p.production.makespan_minutes) + " phút");
        if (report.objective_mode === "PRODUCTION")
          add(card, "p", "Tổng mốc hoàn thành công đoạn tính từ đầu kỳ: " +
            fmt(p.production.sum_completion_minutes) + " phút");
        add(card, "p", "Tổng mô hình: " + fmt(p.cost.total_vnd) + " VND");
        add(card, "p", "Điện chạy máy: " + fmt(p.cost.total_vnd - p.cost.changeover_total_vnd) +
          " VND · Setup khai báo: " + fmt(p.cost.changeover_total_vnd) + " VND");
        add(card, "p", "Chênh lệch so B0: " + fmt(b0 - p.cost.total_vnd) +
          " VND · Điện năng: " + fmt(p.cost.energy_kwh) + " kWh");
      }
      add(area, "p", "CP-SAT đã liệt kê " + report.search.evaluated + " lựa chọn rời rạc (giới hạn " +
        report.search.candidate_limit + "); thời gian giải B1 / B2: " +
        fmt(report.search.b1.wall_time_seconds) + " / " + fmt(report.search.b2.wall_time_seconds) + " giây.");
      const start = Date.parse(source.horizon.start), end = Date.parse(source.horizon.end), span = end - start;
      if (report.setup_assumption === "DECLARED_CHANGEOVERS") {
        add(area, "p", "Vạch setup màu hổ phách là khoảng chuyển đổi máy đã xác nhận, " +
          "đặt ngay trước job kế tiếp. Phí cố định setup có trong tổng mô hình; điện setup chưa được tính.");
      }
      for (const code of ["B0", "B1", "B2"]) {
        const plan = report.plans[code];
        add(area, "h4", code + " · " + plan.verification.status);
        const wrap = add(area, "div", undefined, "factory-lab-gantt");
        for (const machine of source.machines) {
          const lane = add(wrap, "div", undefined, "factory-lab-lane");
          add(lane, "strong", machine.id);
          const track = add(lane, "div", undefined, "factory-lab-track");
          for (const setup of (plan.verification.changeovers || []).filter(
            c => c.machine_id === machine.id && c.duration_minutes > 0)) {
            const leftPct = (Date.parse(setup.start) - start) * 100 / span;
            const widthPct = (Date.parse(setup.end) - Date.parse(setup.start)) * 100 / span;
            const marker = add(track, "span", "S", "factory-lab-setup");
            marker.style.left = leftPct + "%";
            marker.style.width = widthPct + "%";
            marker.title = setup.from_family + " → " + setup.to_family +
              " · " + setup.duration_minutes + " phút · " + fmt(setup.flat_cost_vnd) + " VND";
          }
          for (const job of plan.verification.jobs.filter(j => j.machine_id === machine.id)) {
            const startPct = (Date.parse(job.start) - start) * 100 / span;
            const widthPct = (Date.parse(job.end) - Date.parse(job.start)) * 100 / span;
            const bar = add(track, "span", job.job_id, "factory-lab-bar");
            bar.style.left = startPct + "%";
            bar.style.width = widthPct + "%";
            bar.title = (job.work_order_id ? job.work_order_id + " / " : "") + job.job_id +
              " · " + job.start + " → " + job.end;
          }
        }
      }
      if (report.schema_version === "factory-2") {
        add(area, "h4", "Luồng nhiều công đoạn · lịch B2 đã kiểm chứng");
        const routes = add(area, "div", undefined, "factory-lab-routes");
        const timestamp = value => new Date(value).toLocaleString("vi-VN", {
          timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit",
          hour: "2-digit", minute: "2-digit"
        });
        for (const work of report.plans.B2.work_orders) {
          const panel = add(routes, "div", undefined, "factory-lab-plan-card");
          add(panel, "strong", work.work_order_id + " · " + work.operation_count + " công đoạn");
          add(panel, "p", "Bắt đầu: " + timestamp(work.start) +
            " · hoàn thành: " + timestamp(work.completion));
          add(panel, "p", "Tổng mô hình: " + fmt(work.modeled_cost_vnd) + " VND");
          const declared = source.work_orders.find(o => o.id === work.work_order_id);
          const arcText = declared.precedence.map(edge => edge.before + " → " +
            edge.after + (edge.min_lag_minutes ? " (+" + edge.min_lag_minutes + " phút)" : ""));
          add(panel, "p", "Ràng buộc trước/sau: " + arcText.join("; "));
          const stages = add(panel, "ul");
          for (const operation of work.operations)
            add(stages, "li", operation.operation_id + " · " + operation.machine_id +
              " · " + timestamp(operation.start) + "–" + timestamp(operation.end) +
              " · " + fmt(operation.modeled_cost_vnd) + " VND");
        }
      }
      const limits = add(area, "div", undefined, "factory-lab-caveats");
      add(limits, "strong", "Chưa được kiểm chứng ngoài mô hình:");
      const notes = add(limits, "ul");
      for (const note of report.limitations) add(notes, "li", note);
      add(area, "p", "Chọn " + report.decision.selected_plan + " theo mục tiêu " +
        report.objective_mode + " đã khai báo. " +
        "Cần kỹ sư duyệt, không tự triển khai tại xưởng.");
    }
    const loadExample = async path => {
      if (busy) return;
      busy = true;
      try {
        const response = await factoryFetch(path);
        if (!response.ok) throw Error("Không lấy được ví dụ từ máy chủ");
        byId("factoryJson").value = JSON.stringify(await response.json(), null, 2);
        clear();
        byId("factoryInputDetails").open = false;
        byId("factoryStatus").textContent = "Đã nạp ví dụ SYNTHETIC. Chọn phạm vi, mục tiêu rồi bấm Phân tích. Mở JSON nâng cao nếu muốn chỉnh hồ sơ.";
      } catch (e) { byId("factoryStatus").textContent = e.message; }
      finally { busy = false; }
    };
    byId("factoryExample").addEventListener("click", () => loadExample("/api/factory/example"));
    byId("factoryPackaging").addEventListener("click", () => loadExample("/api/factory/packaging-example"));
    byId("factoryChangeover").addEventListener("click", () => loadExample("/api/factory/changeover-example"));
    byId("factoryMultistage").addEventListener("click", () => loadExample("/api/factory/multistage-example"));
    const importPreview = byId("factoryImportPreview");
    async function downloadTemplate(fileType) {
      if (busy) return;
      busy = true;
      try {
        const version = byId("factoryTemplateVersion").value;
        const response = await factoryFetch("/api/factory/import/template?file_type=" +
          encodeURIComponent(fileType) + "&version=" + encodeURIComponent(version));
        if (!response.ok) throw Error("Không tải được mẫu bảng.");
        const objectUrl = URL.createObjectURL(await response.blob());
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = "factory-" + version + "-example." + fileType;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
        byId("factoryStatus").textContent = "Mẫu SYNTHETIC: thay dữ liệu thật và xác nhận các giả định; chưa thể xem đây là dữ liệu đo.";
      } catch (error) {
        byId("factoryStatus").textContent = error.message;
      } finally { busy = false; }
    }
    byId("factoryTemplateCSV").addEventListener("click", () => downloadTemplate("csv"));
    byId("factoryTemplateXLSX").addEventListener("click", () => downloadTemplate("xlsx"));
    byId("factorySpreadsheet").addEventListener("change", async event => {
      if (busy) return;
      clear();
      const file = event.target.files?.[0];
      if (!file) return;
      const extension = file.name.toLowerCase().split(".").pop();
      if (!["csv", "xlsx"].includes(extension) || file.size > 350000 || file.size === 0) {
        byId("factoryStatus").textContent = "Chỉ nhận CSV UTF-8 / Excel .xlsx dung lượng không quá 350 KB.";
        return;
      }
      busy = true;
      const importRevision = revision;
      byId("factoryStatus").textContent = "Đang kiểm tra các bảng, hồ sơ máy, biểu giá và lịch gốc…";
      try {
        const response = await factoryFetch("/api/factory/import/preview?file_type=" + extension, {
          method: "POST", headers: {"Content-Type": "application/octet-stream"},
          body: await file.arrayBuffer()
        });
        const review = await response.json();
        if (revision !== importRevision) return;
        if (!response.ok && !review.code) throw Error("Máy chủ không nhận được bảng.");
        const manifest = review.manifest;
        add(importPreview, "h4", "Kiểm tra bảng · " + (review.status || "BLOCKED") +
          (review.code ? " · " + review.code : ""));
        if (manifest) {
          add(importPreview, "p", "Nguồn " + manifest.source_type +
            " · " + manifest.schema_version + " · " + manifest.file_type +
            " · " + manifest.sha256);
          const list = add(importPreview, "ul");
          for (const [sheet, count] of Object.entries(manifest.sections).filter(item => item[1]))
            add(list, "li", sheet + ": " + count + " dòng");
        }
        if (review.draft) {
          const draft = review.draft;
          add(importPreview, "h4", "Giá trị cần đối chiếu với dữ liệu gốc");
          const facts = add(importPreview, "ul", undefined, "factory-import-facts");
          add(facts, "li", "Cơ sở: " + draft.metadata.plant_alias +
            " · ngành: " + draft.metadata.industry);
          add(facts, "li", "Kỳ lập lịch: " + draft.horizon.start + " → " + draft.horizon.end +
            " · bước: " + draft.step_minutes + " phút");
          add(facts, "li", "Máy: " + draft.machines.map(m => m.id).join(", ") +
            " · ràng buộc setup: " + draft.setup_assumption);
          const tasks = draft.schema_version === "factory-2"
            ? draft.work_orders.flatMap(o => o.operations) : draft.jobs;
          if (draft.schema_version === "factory-2")
            add(facts, "li", "Đơn hàng: " + draft.work_orders.map(o => o.id).join(", ") +
              " · bộ đệm trung gian: " + draft.buffer_assumption);
          for (const tariff of draft.tariffs.slice(0, 5))
            add(facts, "li", "Giá điện: " + tariff.band + " · " +
              fmt(tariff.vnd_per_kwh) + " VND/kWh · " + tariff.start + " → " + tariff.end);
          for (const task of tasks.slice(0, 5)) {
            const capabilities = Object.entries(task.eligible).map(([mid, profile]) =>
              mid + " " + profile.duration_minutes + " phút / " + profile.average_kw +
              " kW (" + profile.reference + ")").join("; ");
            add(facts, "li", "Năng lực " + task.id + ": " + capabilities);
          }
          add(importPreview, "p", "Hiển thị mẫu tối đa 5 dòng mỗi nhóm; xem toàn bộ sau khi nạp JSON. Không có suy luận dữ liệu thiếu.");
        }
        for (const issue of (review.issues || []).slice(0, 30))
          add(importPreview, "p", [issue.code, issue.section, issue.row,
            issue.field, issue.job_id, issue.work_order_id].filter(v => v !== undefined).join(" · "));
        if (review.status === "READY_FOR_REVIEW" && review.ready_for_analysis && review.draft) {
          pendingImport = review.draft;
          add(importPreview, "p", "Chỉ kiểm tra cấu trúc và lịch B0; chưa chạy solver, chưa xác minh số đo thực tế.");
          const approve = add(importPreview, "button", "Chấp nhận bảng đã xem · nạp JSON", "factory-import-accept");
          approve.id = "factoryImportAccept";
          approve.type = "button";
          approve.addEventListener("click", () => {
            if (!pendingImport) return;
            const approved = pendingImport;
            byId("factoryJson").value = JSON.stringify(approved, null, 2);
            clear();
            byId("factoryInputDetails").open = true;
            byId("factoryStatus").textContent = "Đã nạp dữ liệu sau kiểm tra. Xem JSON, xác nhận nguồn và bấm Phân tích để chạy CP-SAT.";
          });
          byId("factoryStatus").textContent = "Bảng đã qua hậu kiểm lịch B0. Cần xác nhận thủ công trước khi lập lịch.";
        } else {
          byId("factoryStatus").textContent = "Bảng chưa đạt: sửa các lỗi được báo, không cấp quyền xuất bằng chứng.";
        }
      } catch (error) {
        if (revision === importRevision)
          byId("factoryStatus").textContent = "Không nhập được tệp: " + error.message;
      } finally { busy = false; }
    });
    byId("factoryFile").addEventListener("change", async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (file.size > 200000) {
        byId("factoryStatus").textContent = "Tệp vượt 200 KB."; return;
      }
      byId("factoryJson").value = await file.text();
      clear();
      byId("factoryInputDetails").open = true;
      byId("factoryStatus").textContent = "Đã đọc tệp tại trình duyệt. Dữ liệu chỉ được gửi khi bạn bấm phân tích.";
    });
    byId("factoryRun").addEventListener("click", async () => {
      if (busy) return;
      clear();
      let source;
      try { source = JSON.parse(byId("factoryJson").value); }
      catch { byId("factoryStatus").textContent = "Cần JSON hợp lệ. Không chạy solver."; return; }
      busy = true;
      const submittedRevision = revision;
      byId("factoryRun").disabled = true;
      byId("factoryStatus").textContent = "Đang kiểm tra dữ liệu và tìm lịch…";
      try {
        const response = await factoryFetch("/api/factory/analyze", {
          method: "POST", headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            mode: byId("factoryMode").value,
            objective_mode: byId("factoryObjective").value,
            max_makespan_slack_minutes: Number(byId("factoryMakespanSlack").value),
            factory: source
          })
        });
        const report = await response.json();
        if (submittedRevision !== revision) return; // edited input cannot publish stale schedules
        if (!response.ok) throw Error(report.message || "Máy chủ từ chối yêu cầu.");
        draw(report, source);
        if (report.status === "COMPLETED") {
          latest = {report, factory: source};
          byId("factoryExport").disabled = false;
          root.DemoWorkspace?.publishFactory?.(report,source);
          const next=document.createElement("div");next.className="studio-actions demo-factory-next";
          for(const [label,tab] of [["Xem quyết định","tab-overview"],["Mở Gantt này","tab-gantt"],["Kiểm chứng lịch","tab-validation"]]){
            const action=document.createElement("button");action.type="button";action.textContent=label;
            action.addEventListener("click",()=>root.Workspace.show(tab));next.append(action);
          }
          byId("factoryResult").prepend(next);
          byId("factoryStatus").textContent = "Đã tính và kiểm chứng 3 lịch. Đây chỉ là mô phỏng theo dữ liệu được khai báo.";
        } else byId("factoryStatus").textContent = "Dữ liệu hoặc ràng buộc bị chặn; không xuất chi phí thiếu kiểm chứng.";
      } catch(e) { byId("factoryStatus").textContent = e.message; }
      finally { busy = false; byId("factoryRun").disabled = false; }
    });
    byId("factoryExport").addEventListener("click", () => {
      if (!latest) return;
      const url = URL.createObjectURL(new Blob([JSON.stringify(latest, null, 2)], {type: "application/json"}));
      const a = document.createElement("a");
      a.href = url; a.download = "EnergyShift-factory-1-evidence.json";
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  });
})(typeof window !== "undefined" ? window : globalThis);
