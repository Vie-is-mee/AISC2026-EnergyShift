"use strict";
// AI proposes text and cell edits. The operator approves; the engine verifies plans.
document.addEventListener("DOMContentLoaded", () => {
  const get = (id) => document.getElementById(id);
  const el = (tag, text, className) => {
    const item = document.createElement(tag);
    if (text != null) item.textContent = text;
    if (className) item.className = className;
    return item;
  };
  let inspected = null,
    applied = null,
    planReport = null,
    original = "",
    fileName = "EnergyShift.csv";
  let version = 0,
    reading = 0,
    page = 0,
    busy = false,
    configured = false,
    patches = [];
  const message = (text) => {
    get("aiStatusMessage").textContent = text;
  };
  const countChecked = () => patches.filter((patch) => patch.checked).length;
  function refreshActions() {
    get("aiInspectLocal").disabled = busy || !get("aiCsvText").value.trim();
    get("aiInspectModel").disabled =
      busy ||
      !configured ||
      !get("aiConsent").checked ||
      !get("aiCsvText").value.trim();
    get("aiPlanExplain").disabled =
      busy || !configured || !get("aiConsent").checked;
    get("aiApplyChanges").disabled = busy || !inspected || !countChecked();
    get("aiDownloadEdited").disabled = !applied || busy;
    get("aiDownloadOriginal").disabled = !original;
    get("aiDownloadCsvReport").disabled = !inspected;
    get("aiDownloadPlanReport").disabled = !planReport;
    get("aiImportCsv").disabled = busy || !inspected;
    get("aiAddManual").disabled = busy || !inspected;
    get("aiWorkbench").setAttribute("aria-busy", String(busy));
  }
  function invalidateEdits() {
    applied = null;
    refreshActions();
  }
  function invalidateCsv() {
    version++;
    inspected = null;
    applied = null;
    patches = [];
    page = 0;
    get("aiFactsConfirmed").checked = false;
    get("aiCsvResults").hidden = true;
    get("aiPatchRows").replaceChildren();
    refreshActions();
  }
  function invalidatePlan() {
    planReport = null;
    get("aiPlanResults").replaceChildren();
    refreshActions();
  }
  async function request(path, payload) {
    const response = await apiFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok)
      throw Error(
        result.errors?.map((error) => error.why).join("; ") ||
          result.detail ||
          "Không xử lý được yêu cầu.",
      );
    return result;
  }
  function aiFailure(status, category) {
    if (category === "AUTH")
      return "OpenRouter từ chối API key (401/403). Cập nhật API key hợp lệ trong cấu hình backend rồi thử lại; không nhập key vào CSV hoặc gửi qua chat.";
    if (category === "RATE_LIMIT" || category === "DAILY_QUOTA")
      return "Model miễn phí đã hết quota hoặc đang giới hạn lượt gọi. Thử lại sau; không tự chuyển sang trả phí.";
    return (
      {
        CONFIG_MISSING:
          "Chưa có API key OpenRouter ở backend. Kiểm tra CSV bằng quy tắc vẫn hoạt động.",
        INPUT_LIMIT:
          "AI nhận tối đa 100 dòng và 32 KiB. Chưa gửi dữ liệu; kiểm tra quy tắc vẫn dùng toàn bộ CSV.",
        INVALID_RESPONSE:
          "AI trả định dạng không hợp lệ. Chưa dùng nội dung này để sửa dữ liệu.",
        EVIDENCE_MISMATCH:
          "AI diễn giải sai bằng chứng. Báo cáo AI đã bị chặn; kết quả engine vẫn hiển thị riêng.",
        TRANSPORT_ERROR:
          "Không kết nối được OpenRouter. Có thể thử lại; bản gốc vẫn được giữ.",
        HTTP_ERROR:
          "OpenRouter chưa xử lý được yêu cầu. Kiểm tra quota và cấu hình tài khoản.",
      }[status] || "Chưa có báo cáo AI hợp lệ."
    );
  }
  function findingsList(parent, items) {
    const list = el("ul");
    for (const item of items) {
      const location =
        item.row == null
          ? ""
          : `Dòng CSV ${item.row + 1}${item.column == null ? "" : `, cột ${item.column + 1}`}: `;
      list.append(el("li", location + (item.message || item)));
    }
    parent.append(list);
  }
  function drawPreview() {
    const data = applied || inspected;
    if (!data) return;
    const header = el("tr");
    header.append(el("th", "Dòng CSV"));
    data.headers.forEach((name) => header.append(el("th", name)));
    get("aiPreviewHead").replaceChildren(header);
    const from = page * 25;
    get("aiPreviewRows").replaceChildren(
      ...data.rows.slice(from, from + 25).map((values, index) => {
        const row = el("tr");
        row.append(el("th", String(from + index + 2)));
        values.forEach((value) => row.append(el("td", value)));
        return row;
      }),
    );
    get("aiPreviewCount").textContent =
      `${applied ? "Bản đã sửa" : "Bản đang kiểm tra"}: dòng ${from + 1}–${Math.min(from + 25, data.row_count)}/${data.row_count} · ${data.column_count} cột`;
    get("aiPreviousPage").disabled = page === 0;
    get("aiNextPage").disabled = from + 25 >= data.row_count;
    const after = get("aiAppliedStatus");
    after.textContent = applied
      ? `Đã áp dụng ${applied.applied.length} ô vào bản sao. Còn ${applied.findings.filter((f) => f.severity === "error").length} vấn đề cần kiểm tra; chưa chạy engine.`
      : "Chưa áp dụng thay đổi. Bản gốc vẫn được giữ.";
  }
  function drawPatches() {
    get("aiPatchRows").replaceChildren(
      ...patches.map((patch, index) => {
        const row = el("tr"),
          select = el("input");
        select.type = "checkbox";
        select.checked = patch.checked;
        select.setAttribute("aria-label", `Duyệt thay đổi ${index + 1}`);
        select.onchange = () => {
          patch.checked = select.checked;
          invalidateEdits();
          drawPreview();
        };
        const choice = el("td");
        choice.append(select);
        row.append(choice);
        row.append(
          el(
            "td",
            `Dòng ${patch.row + 1}, cột ${patch.column + 1} (${inspected.headers[patch.column]})`,
          ),
          el("td", patch.before),
        );
        const cell = el("td"),
          replacement = el("input");
        replacement.type = "text";
        replacement.maxLength = 4096;
        replacement.value = patch.after;
        replacement.setAttribute(
          "aria-label",
          `Giá trị mới, thay đổi ${index + 1}`,
        );
        replacement.oninput = () => {
          patch.after = replacement.value;
          patch.source = "manual";
          patch.checked = false;
          select.checked = false;
          get("aiFactsConfirmed").checked = false;
          row.lastElementChild.textContent = "Người dùng: " + patch.reason;
          invalidateEdits();
          drawPreview();
        };
        cell.append(replacement);
        row.append(
          cell,
          el(
            "td",
            `${patch.source === "manual" ? "Người dùng" : patch.source === "ai" ? "AI" : "Quy tắc"}: ${patch.reason}`,
          ),
        );
        return row;
      }),
    );
    get("aiNoPatches").hidden = patches.length > 0;
    refreshActions();
  }
  function renderAudit(result) {
    inspected = result;
    applied = null;
    patches = result.suggestions.map((patch) => ({ ...patch, checked: false }));
    page = 0;
    get("aiCsvResults").hidden = false;
    const rules = get("aiRuleFindings");
    rules.replaceChildren();
    findingsList(
      rules,
      result.findings.length
        ? result.findings
        : [
            "Chưa phát hiện lỗi định dạng trong phạm vi kiểm tra. Cần engine để kiểm tra lịch và chi phí.",
          ],
    );
    if (result.issue_limit_reached)
      rules.append(
        el(
          "p",
          "Đã đạt giới hạn 200 thông báo; cần sửa và kiểm tra lại để xem các vấn đề còn lại.",
        ),
      );
    if (result.suggestion_limit_reached)
      rules.append(
        el(
          "p",
          "Đã đạt giới hạn 200 gợi ý; không có dòng dữ liệu nào bị cắt bỏ.",
        ),
      );
    const narrative = get("aiCsvNarrative");
    narrative.replaceChildren();
    if (result.ai.status === "OK") {
      narrative.append(
        el(
          "h4",
          "Nhận xét AI · " + (result.ai.served_model || get("aiModel").value),
        ),
        el("p", result.ai.summary),
      );
      findingsList(narrative, result.ai.findings || []);
      findingsList(narrative, result.ai.next_steps || []);
      if (result.ai.rejected_suggestions)
        narrative.append(
          el(
            "p",
            `Đã chặn ${result.ai.rejected_suggestions} đề xuất không khớp ô gốc hoặc không bảo toàn giá trị.`,
          ),
        );
    } else if (result.ai.status !== "NOT_REQUESTED")
      narrative.append(
        el(
          "p",
          result.ai.message ||
            aiFailure(result.ai.status, result.ai.error_category),
        ),
      );
    const columns = get("aiManualColumn");
    columns.replaceChildren(
      ...result.headers.map((name, index) => {
        const option = el("option", `${index + 1}. ${name}`);
        option.value = String(index);
        return option;
      }),
    );
    get("aiManualRow").max = String(result.row_count + 1);
    drawPatches();
    drawPreview();
  }
  async function inspect(useAi) {
    if (busy) return;
    const text = get("aiCsvText").value,
      token = version;
    busy = true;
    refreshActions();
    message(
      useAi
        ? "AI đang rà soát CSV…"
        : "Đang kiểm tra toàn bộ CSV bằng quy tắc…",
    );
    try {
      const result = await request("/api/demo/ai/inspect", {
        csv_text: text,
        use_ai: useAi,
        consent: get("aiConsent").checked,
        model: get("aiModel").value,
      });
      if (token !== version) {
        message("CSV đã đổi. Bỏ kết quả cũ; kiểm tra lại bản hiện tại.");
        return;
      }
      renderAudit(result);
      message(
        `Đã kiểm tra ${result.row_count} dòng. Duyệt từng thay đổi trước khi áp dụng.`,
      );
    } catch (error) {
      if (token === version) message(error.message);
    } finally {
      busy = false;
      refreshActions();
    }
  }
  get("aiInspectLocal").onclick = () => inspect(false);
  get("aiInspectModel").onclick = () => inspect(true);
  get("aiConsent").onchange = refreshActions;
  get("aiCsvText").oninput = () => {
    reading++;
    invalidateCsv();
    message("CSV đã thay đổi. Kiểm tra lại để nhận gợi ý mới.");
  };
  get("aiCsvFile").onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const token = ++reading;
    try {
      if (!/\.(csv|tsv)$/i.test(file.name) || file.size > 128 * 1024)
        throw Error("Chọn CSV/TSV UTF-8, tối đa 128 KiB.");
      const text = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(await file.arrayBuffer());
      if (token !== reading) return;
      original = text;
      fileName = file.name;
      get("aiCsvText").value = text;
      invalidateCsv();
      message(`Đã đọc ${file.name}. Bản gốc được giữ trong trình duyệt.`);
    } catch (error) {
      message(error.message);
    } finally {
      event.target.value = "";
    }
  };
  get("aiUseCurrentPlan").onclick = () => {
    reading++;
    try {
      const dataset = JSON.parse(get("dataset").value);
      original = "\ufeff" + InputModel.csv(InputModel.rowsFrom(dataset));
      fileName = "EnergyShift_ke_hoach.csv";
      get("aiCsvText").value = original;
      invalidateCsv();
      message(
        "Đã lấy CSV từ đầu vào đã áp dụng. Các thay đổi chưa áp dụng ở bảng nhập liệu chưa có trong CSV này.",
      );
    } catch {
      message("Chưa có đầu vào hợp lệ để lấy CSV.");
    }
  };
  get("aiAddManual").onclick = () => {
    if (!inspected) return;
    const row = Number(get("aiManualRow").value) - 1,
      column = Number(get("aiManualColumn").value),
      grid = [inspected.headers, ...inspected.rows];
    if (
      !Number.isInteger(row) ||
      row < 0 ||
      row >= grid.length ||
      !Number.isInteger(column) ||
      column < 0 ||
      column >= grid[0].length
    ) {
      message("Chọn đúng dòng và cột. Dòng CSV 1 là tiêu đề.");
      return;
    }
    const existing = patches.find(
      (patch) => patch.row === row && patch.column === column,
    );
    const patch = {
      row,
      column,
      before: grid[row][column],
      after: get("aiManualValue").value,
      reason:
        get("aiManualReason").value.trim() ||
        "Người dùng nhập giá trị từ nguồn đối chiếu.",
      source: "manual",
      checked: false,
    };
    if (existing) Object.assign(existing, patch);
    else if (patches.length < 200) patches.push(patch);
    else {
      message("Tối đa 200 thay đổi mỗi lượt.");
      return;
    }
    invalidateEdits();
    drawPatches();
    drawPreview();
    message(
      "Đã thêm thay đổi thủ công. Duyệt ô và xác nhận giá trị trước khi áp dụng.",
    );
  };
  get("aiApplyChanges").onclick = async () => {
    if (busy || !inspected) return;
    const token = version;
    busy = true;
    refreshActions();
    try {
      const result = await request("/api/demo/ai/apply", {
        csv_text: get("aiCsvText").value,
        source_hash: inspected.source_hash,
        patches: patches
          .filter((p) => p.checked)
          .map(({ checked, ...patch }) => patch),
        approved: true,
        facts_confirmed: get("aiFactsConfirmed").checked,
      });
      if (token !== version) {
        message("CSV đã đổi. Chưa áp dụng kết quả cũ.");
        return;
      }
      applied = result;
      drawPreview();
      message(
        "Đã áp dụng vào bản sao và kiểm tra lại. Có thể tải CSV mới hoặc chuyển sang nhập liệu.",
      );
    } catch (error) {
      if (token === version) message(error.message);
    } finally {
      busy = false;
      refreshActions();
    }
  };
  get("aiPreviousPage").onclick = () => {
    page = Math.max(0, page - 1);
    drawPreview();
  };
  get("aiNextPage").onclick = () => {
    page++;
    drawPreview();
  };
  const outputName = (suffix) =>
    fileName.replace(/\.(csv|tsv)$/i, "").replace(/[<>:"/\\|?*]/g, "_") +
    suffix;
  get("aiDownloadOriginal").onclick = () =>
    download(outputName("_original.csv"), original, "text/csv;charset=utf-8");
  get("aiDownloadEdited").onclick = () => {
    if (applied)
      download(
        outputName("_reviewed.csv"),
        applied.csv_text,
        "text/csv;charset=utf-8",
      );
  };
  get("aiImportCsv").onclick = () => {
    const text = applied?.csv_text || get("aiCsvText").value;
    get("tablePaste").value = text;
    get("tablePaste").dispatchEvent(new Event("input", { bubbles: true }));
    get("advancedInput").open = true;
    for (
      let parent = get("tablePaste").parentElement;
      parent && parent !== document.body;
      parent = parent.parentElement
    )
      if (parent.tagName === "DETAILS") parent.open = true;
    get("previewImport").click();
    get("tablePaste").scrollIntoView({ block: "center", behavior: "smooth" });
    message(
      "Đã chuyển CSV sang ghép cột. Kiểm tra và nhận vào bản chuẩn bị; chưa thay đổi kế hoạch đã áp dụng.",
    );
  };
  get("aiDownloadCsvReport").onclick = () => {
    if (!inspected) return;
    const lines = [
      "# Báo cáo kiểm tra CSV",
      `Nguồn: ${fileName}`,
      `Mã bản gốc được kiểm tra: ${inspected.source_hash}`,
      `Dòng: ${inspected.row_count}; cột: ${inspected.column_count}`,
      "",
      "## Kiểm tra bằng quy tắc",
      ...inspected.findings.map(
        (f) =>
          `- ${f.row == null ? "" : `Dòng CSV ${f.row + 1}: `}${f.message}`,
      ),
      "",
      "## AI",
      `Trạng thái: ${inspected.ai.status}`,
      inspected.ai.summary || "Chưa có báo cáo AI hợp lệ.",
      ...(inspected.ai.findings || []).map((f) => "- " + f.message),
      ...(inspected.ai.next_steps || []).map((s) => "- " + s),
    ];
    if (applied)
      lines.push(
        "",
        "## Bản sao đã sửa",
        `Mã bản mới: ${applied.source_hash}`,
        "AI nhận xét bản trước khi sửa; bản mới chỉ được kiểm tra bằng quy tắc.",
        ...applied.applied.map(
          (p) =>
            `- Dòng CSV ${p.row + 1}, cột ${p.column + 1}: ${JSON.stringify(p.before)} → ${JSON.stringify(p.after)}; ${p.reason}`,
        ),
        ...applied.findings.map((f) => "- " + f.message),
      );
    lines.push("", ...inspected.limitations);
    download(
      outputName("_audit.md"),
      lines.join("\n"),
      "text/markdown;charset=utf-8",
    );
  };
  get("aiPlanExplain").onclick = async () => {
    if (busy) return;
    busy = true;
    refreshActions();
    message("Đang chuẩn bị đầu vào, tính lại và viết báo cáo AI…");
    let token;
    try {
      if (pending || preparing || fixtureLoading || scheduleEditorState)
        throw Error(
          "Hoàn tất tính toán hoặc lưu/đóng chỉnh sửa hiện tại trước khi viết báo cáo.",
        );
      if (window.InputDesk && !(await InputDesk.prepareForAnalysis()))
        throw Error("Sửa các lỗi nhập liệu được chỉ ra trước.");
      const dataset = JSON.parse(get("dataset").value);
      clearResult();
      token = revision;
      const result = await request("/api/demo/ai/report", {
        dataset,
        model: get("aiModel").value,
        consent: get("aiConsent").checked,
      });
      if (token !== revision) {
        message("Đầu vào đã đổi; bỏ báo cáo AI của bản cũ.");
        return;
      }
      if (result.analysis?.status === "COMPLETED")
        renderReport(result.analysis);
      const target = get("aiPlanResults");
      target.replaceChildren();
      if (result.facts) {
        target.append(el("h3", "Bằng chứng từ engine"));
        findingsList(
          target,
          Object.entries(result.facts).map(
            ([key, value]) => `${key}: ${String(value)}`,
          ),
        );
      }
      if (result.status !== "OK") {
        message(aiFailure(result.status, result.error_category));
        return;
      }
      planReport = result;
      target.append(
        el("h3", "Diễn giải AI · " + result.model),
        el("p", result.summary),
      );
      findingsList(target, result.findings);
      findingsList(target, result.next_steps);
      message(
        "Đã tạo báo cáo từ kết quả engine mới nhất. Diễn giải AI cần được người dùng rà soát.",
      );
    } catch (error) {
      if (token == null || token === revision) message(error.message);
    } finally {
      busy = false;
      refreshActions();
    }
  };
  get("aiDownloadPlanReport").onclick = () => {
    if (!planReport) return;
    download(
      "EnergyShift_AI_report.md",
      [
        "# Báo cáo kế hoạch EnergyShift",
        ...Object.entries(planReport.facts).map(
          ([key, value]) => `${key}: ${String(value)}`,
        ),
        "",
        "## Diễn giải AI",
        planReport.summary,
        ...planReport.findings.map((s) => "- " + s),
        "",
        "## Việc cần làm",
        ...planReport.next_steps.map((s) => "- " + s),
        "",
        "Model: " + planReport.model,
        "Diễn giải AI cần rà soát; không chứng minh ROI nhà máy hoặc phê duyệt vận hành.",
      ].join("\n"),
      "text/markdown;charset=utf-8",
    );
  };
  document.addEventListener("energyshift:invalidated", invalidatePlan);
  get("aiModel").onchange = () => {
    invalidateCsv();
    invalidatePlan();
    message("Đã đổi model. Chạy lại để nhận phân tích từ model mới.");
  };
  apiFetch("/api/demo/ai/status")
    .then((response) => {
      if (!response.ok) throw Error();
      return response.json();
    })
    .then((status) => {
      configured = status.configured;
      get("aiModel").value = status.default_model;
      get("aiConnection").textContent = configured
        ? "OpenRouter đã cấu hình · chỉ model miễn phí"
        : "Chưa cấu hình AI · vẫn kiểm tra CSV bằng quy tắc";
      refreshActions();
    })
    .catch(() => {
      get("aiConnection").textContent =
        "Chưa kết nối được trợ lý. Kiểm tra backend.";
    });
  refreshActions();
});
