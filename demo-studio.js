"use strict";
// Every numeric result comes from the backend; source strings enter text nodes only.
document.addEventListener("DOMContentLoaded", () => {
  const get = id => document.getElementById(id);
  const make = (tag, text, cls) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (cls) element.className = cls;
    return element;
  };
  const steps = ["source", "textile", "synthetic", "explain"];
  const setAIState = (panelId, state, label) => {
    const panel = get(panelId);
    if (!panel) return;
    panel.dataset.aiState = state;
    const stateLabel = panel.querySelector(".ai-live-state");
    if(stateLabel) stateLabel.textContent = label;
    panel.setAttribute("aria-busy", String(state === "loading"));
  };
  document.querySelectorAll("[data-ai-prompt-for]").forEach(button => {
    button.addEventListener("click", () => {
      const textarea = get(button.dataset.aiPromptFor);
      if (!textarea) return;
      textarea.value = button.dataset.aiPrompt;
      textarea.dispatchEvent(new Event("input", {bubbles:true}));
      textarea.focus();
    });
  });
  document.querySelectorAll("[data-ai-count-for]").forEach(counter => {
    const textarea = get(counter.dataset.aiCountFor);
    if (!textarea) return;
    const update = () => {counter.textContent = textarea.value.length + " / " + textarea.maxLength;};
    textarea.addEventListener("input", update);
    update();
  });
  let audit = null, selected = new Set(), textile = null, synthetic = null, narratives = [], step = 0, page = 0, busy = false, generation = 0;
  const number = value => Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 6 });
  const status = (message, error = false) => {
    const stage=get("studio-"+steps[step]);
    if(stage)stage.prepend(get("studioStatus"));
    get("studioStatus").textContent = message;
    get("studioStatus").dataset.error = String(error);
  };
  async function api(path, body) {
    const response = await apiFetch("/api/demo/" + path, body === undefined ? undefined : {
      method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.message || result.detail || "Yêu cầu chưa thành công. Kiểm tra đầu vào rồi thử lại.");
    return result;
  }
  function updateActions() {
    const countInput = get("studioSelectionCount");
    const countReady = !audit || (countInput.validity.valid && Number(countInput.value) === selected.size);
    get("studioRunTextile").disabled = busy || !audit || !selected.size || !countReady;
    get("studioAudit").disabled = busy || !get("sourceInputFile").files.length || !get("sourceOutputFile").files.length;
    get("sourceInputFile").disabled=busy;
    get("sourceOutputFile").disabled=busy;
    get("studioReplay").disabled = busy;
    get("studioAIContext").disabled = busy || !get("studioAIConsent").checked;
    get("studioAIReport").disabled = busy || !get("studioAIConsent").checked;
    get("studioExport").disabled = busy || (!audit && !synthetic);
    get("studioDefaultSelection").disabled = busy || !audit;
    get("studioFilter").disabled = busy;
    get("studioPrevRows").disabled = busy || page === 0;
    const count = audit ? filteredRows().length : 0;
    get("studioNextRows").disabled = busy || (page + 1) * 25 >= count;
    get("studioRows").querySelectorAll('input[type="checkbox"]').forEach(box => { box.disabled = busy || box.dataset.eligible !== "true"; });
    for (const id of ["studioOpenGantt", "studioOpenVerifier", "studioOpenDecision"]) get(id).disabled = busy || !synthetic;
    get("studioSelectedCount").textContent = `${selected.size} / ${audit?.counts.compatible ?? 0} dòng đủ điều kiện`;
    for (const id of ["studioSelectionCount", "studioSelectCount", "studioSelectAll", "studioClearSelection"]) get(id).disabled = busy || !audit;
  }
  async function task(message, action) {
    if (busy) return;
    busy = true;
    globalThis.DemoWorkspace?.setWorking?.(true);
    updateActions();
    status(message);
    try { await action(); }
    catch (error) { status(error.message, true); }
    finally { busy = false; globalThis.DemoWorkspace?.setWorking?.(false); updateActions(); }
  }
  function showStep(index) {
    step = Math.max(0, Math.min(steps.length - 1, index));
    const name=steps[step];
    const panel=get("studioPanel-"+name);
    panel.open=true;
    const role="studio"+name[0].toUpperCase()+name.slice(1);
    globalThis.DemoWorkspace?.openSection(role);
    document.querySelectorAll("[data-studio-step]").forEach(button => {
      if (button.dataset.studioStep === steps[step]) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
  }
  function invalidateTextile() {
    generation += 1;
    textile = null;
    globalThis.DemoWorkspace?.invalidateTextile?.();
    narratives = narratives.filter(n => n.scenario !== "textile");
    get("studioTextileResult").replaceChildren();
    get("studioAIResult").replaceChildren();
    get("studioAITrace").textContent = "Đầu vào đã đổi. Kết quả nhóm cũ và phần giải thích đã bị ẩn; chạy lại trước khi báo cáo.";
    updateActions();
  }
  const reasons = {UNKNOWN_MODE: "Thiếu chế độ nguồn", INCOMPATIBLE_MACHINE: "Không tương thích máy", COMPATIBLE_CANDIDATE: "Ứng viên đúng mã & máy"};
  function filteredRows() { return (audit?.rows || []).filter(row => get("studioFilter").value === "ALL" || row.classification === get("studioFilter").value); }
  function renderRows() {
    const rows = filteredRows();
    page = Math.min(page, Math.max(0, Math.ceil(rows.length / 25) - 1));
    const fragment = document.createDocumentFragment();
    for (const row of rows.slice(page * 25, (page + 1) * 25)) {
      const tr = make("tr");
      const cell = make("td");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.setAttribute("aria-label", "Chọn dòng " + row.id);
      box.dataset.eligible = String(row.classification === "COMPATIBLE_CANDIDATE");
      box.disabled = box.dataset.eligible !== "true";
      box.checked = selected.has(row.id);
      box.addEventListener("change", () => {
        if (box.checked && selected.size >= 256) { box.checked = false; status("Tối đa 256 công việc được chọn trong một lượt phân tích.", true); return; }
        if (box.checked) selected.add(row.id); else selected.delete(row.id);
        get("studioSelectionCount").value=selected.size;
        invalidateTextile(); renderFunnel();
      });
      cell.append(box); tr.append(cell);
      for (const text of [row.id, row.machine, row.task_mode, row.start, reasons[row.classification]]) tr.append(make("td", text));
      fragment.append(tr);
    }
    get("studioRows").replaceChildren(fragment);
    get("studioRowPage").textContent = `${rows.length} dòng · trang ${rows.length ? page + 1 : 0} / ${Math.ceil(rows.length / 25)}`;
    updateActions();
  }
  function renderFunnel() {
    get("studioFunnel").replaceChildren(...[
      [audit.counts.total, "Công việc trong lịch nguồn"], [audit.counts.known_mode, "Có chế độ trong input"],
      [audit.counts.compatible, "Đúng chế độ & máy"], [selected.size, "Được chọn cho thí nghiệm"]
    ].map(([value, label]) => { const div = make("div"); div.append(make("strong", value), make("span", label)); return div; }));
  }
  async function loadAudit() {
    const token=generation, input=get("sourceInputFile").files[0], output=get("sourceOutputFile").files[0];
    if(!input||!output)throw Error("Chọn đủ hai tệp Input và Output.");
    if([input,output].some(file=>!file.size||file.size>4*1024*1024))throw Error("Mỗi tệp JSON phải có dữ liệu và không vượt 4 MiB.");
    const decode=async file=>new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(await file.arrayBuffer());
    const [inputText,outputText]=await Promise.all([decode(input),decode(output)]);
    const next = await api("studio/source/upload",{input_text:inputText,output_text:outputText,input_name:input.name,output_name:output.name});
    if(token!==generation)return;
    audit = next;
    get("studioAuditDetails").hidden = false;
    globalThis.DemoWorkspace?.setAudit?.(next);
    selected = new Set(next.default_selection);
    get("studioSelectionCount").max = Math.min(256, next.counts.compatible);
    get("studioSelectionCount").value = selected.size;
    const defaults=next.defaults;
    for(const [id,key] of Object.entries({studioMinutes:"step_minutes",studioPower:"power_unit",studioPrice:"price_basis",studioCurrency:"currency",studioMoveCost:"extra_cost_per_move",studioSolarUnit:"solar_unit"}))get(id).value=defaults[key]??"";
    for(const [id,key] of Object.entries({studioSolar:"solar_enabled",studioUnitsConfirmed:"confirmed",studioScopeConfirmed:"subset_acknowledged"}))get(id).checked=defaults[key];
    invalidateTextile(); page = 0;
    get("studioWarnings").hidden = false;
    get("studioWarnings").replaceChildren(make("p", `${next.counts.unknown_mode} dòng thiếu chế độ; ${next.counts.incompatible_machine} dòng có chế độ nhưng không đúng máy.`), ...next.warnings.map(w => make("p", w)));
    get("studioFiles").replaceChildren(...Object.values(next.files).map(file => {
      const p = make("p"); p.append(make("strong", file.file), make("br"), make("code", file.sha256)); return p;
    }));
    get("studioArchive").replaceChildren();
    renderFunnel(); renderRows();
    get("studioPanel-textile").hidden=false;
    get("sourceFileStatus").textContent=`Đã nhận ${input.name} và ${output.name}. ${next.counts.total} dòng nguồn; ${selected.size} công việc trong nhóm phân tích.`;
    status("Đã kiểm tra hai tệp. Thiết lập mặc định và điện mặt trời đã sẵn sàng; bấm Phân tích lịch & điện mặt trời.");
  }
  function tag(text, tone) { const node = make("span", text, "studio-tag"); if (tone) node.dataset.tone = tone; return node; }
  function plot(title,series,report){
    return EnergyChart.create({title,series,unit:title.includes("kW")?"kW":EnergyChart.sourceCurrency(report.currency)+"/kWh",
      stepMinutes:report.step_minutes,horizonSlots:report.horizon_slots,group:"source-analysis",
      sourceHash:report.input_hash||report.manifest?.source_hash||"source"});
  }
  function renderTextile(report) {
    const target = get("studioTextileResult"); target.replaceChildren();
    target.append(make("h4", report.status === "BASELINE_INVALID" ? "B0 nguồn chưa qua kiểm chứng" : "Kết quả nhóm độc lập — cần rà soát trước áp dụng"));
    target.append(tag("EXTERNAL · ISOLATED SUBSET", "warning"), make("p", report.decision.reason || report.message));
    const summary = make("div", undefined, "studio-plan-summary");
    for (const [code, plan] of Object.entries(report.plans)) {
      const div = make("div"); div.append(make("span", code), make("strong", plan.cost ? `${number(plan.cost.total)} ${EnergyChart.shortCurrency(report.currency)}` : "Không xuất chi phí"), tag(plan.verification.status, plan.verification.status === "PASS" ? "pass" : "warning"));
      if (plan.cost) div.append(make("p", `${number(plan.cost.energy_kwh)} kWh · ${plan.cost.changed_jobs} công việc đổi lịch`), make("p", `Lưới ${number(plan.cost.grid_kwh)} kWh · Mặt trời ${number(plan.cost.solar_kwh)} kWh`));
      summary.append(div);
    }
    target.append(summary);
    const costPolicy=report.manifest?.cost_policy||{},fee=costPolicy.effective_cost_per_move ?? report.manifest?.mapping?.extra_cost_per_move;
    if(costPolicy.move_cost_mode==="SOURCE_DERIVED_ONE_MINUTE_PROXY"){
      target.append(make("p",`Chi phí điều phối mô phỏng: ${number(fee)} ${EnergyChart.shortCurrency(report.currency)} cho mỗi công việc đổi thời điểm. Công thức: công suất trung vị × giá nguồn trung vị × 1 phút; tính cho cả B0/B1/B2, không phải chi phí thực tế được xác nhận.`,"demo-cost-explanation"));
    }
    const groups = make("div", undefined, "studio-groups");
    for (const group of report.plans.B0.verification.groups) groups.append(tag(`${group.id}: ${group.status}`, group.status === "PASS" ? "pass" : "warning"));
    target.append(make("p", "5 nhóm kiểm tra B0: đủ công việc, lịch máy, thời gian, thứ tự, xung đột loại công việc."), groups);
    if (report.status === "COMPLETED" || report.status === "REPAIRED_WITH_INVALID_BASELINE") {
      const plans = Object.entries(report.plans);
      const valid = plans.filter(([,p])=>p.cost!==null);
      if (!report.baseline_valid) target.append(make("p", `B0: FAIL (${report.plans.B0.verification.issues.length} vi phạm); không có chi phí hay phần trăm tiết kiệm so B0. B1/B2 là lịch sửa độc lập khi PASS.`, "studio-notice"));
      if (valid.length) {
        target.append(plot(`Biểu giá đã ánh xạ · ${EnergyChart.sourceCurrency(report.currency)}/kWh`, [{label: "Giá nguồn theo ô thời gian", values: valid[0][1].cost.series.price_per_kwh}],report));
        target.append(plot("Phụ tải chạy việc theo lịch · kW", valid.map(([code,p]) => ({label: code,values:p.cost.series.load_kw})),report));
        if (report.manifest.mapping.solar_enabled) target.append(plot("Điện lưới sau khi dùng điện mặt trời · kW", valid.map(([code,p]) => ({label: code,values:p.cost.series.grid_kw})),report));
      }
      const table = make("table"), head = make("thead"), hr = make("tr"), body = make("tbody");
      for (const t of ["Phương án / công việc", "Máy", "Bắt đầu → kết thúc / ô", "Vị trí trong chân trời"]) hr.append(make("th", t));
      head.append(hr); table.append(head, body);
      for (const [code, p] of plans) for (const job of p.schedule) {
        const tr = make("tr"); tr.append(make("td", `${code} · ${job.job_id}`), make("td", job.machine_id), make("td", `${job.start_slot} → ${job.end_slot}`));
        const cell = make("td"), track = make("div", undefined, "studio-gantt"), bar = make("span");
        bar.style.left = `${job.start_slot / report.horizon_slots * 100}%`; bar.style.width = `${(job.end_slot - job.start_slot) / report.horizon_slots * 100}%`; track.append(bar); cell.append(track); tr.append(cell); body.append(tr);
      }
      const scroll = make("div", undefined, "studio-table-wrap"); scroll.tabIndex = 0; scroll.append(table); target.append(scroll);
      const localSearch = report.solver.algorithm === "SOLAR_AWARE_COORDINATED_LOCAL_SEARCH";
      const solverNote = report.solver.b2_used_fallback
        ? "B2 giữ nguyên B1 vì chưa tìm được lịch tốt hơn; điều này không chứng minh tối ưu toàn cục."
        : report.solver.b2_proven_optimal ? "B2 tối ưu trong miền tìm kiếm đã công bố."
        : "B2 là lịch phối hợp đã kiểm chứng; chưa chứng minh tối ưu toàn cục.";
      const label = localSearch
        ? `B2 tìm kiếm cục bộ phối hợp: ${report.solver.moves} lượt đổi thời điểm, ${report.solver.passes} vòng duyệt, ${report.solver.seconds}s`
        : `B2 CP-SAT: ${report.solver.status}, ${report.solver.seconds}s`;
      target.append(make("p", `${label} · ${report.solver.domain}. ${solverNote} Chỉ áp dụng cho nhóm được chọn.`));
      for (const [code, p] of plans.filter(([code]) => code !== "B0")) {
        const line = make("p"); line.textContent = `${code}: ${p.verification.status} · ${p.verification.job_count} công việc · 5 nhóm kiểm tra.`; target.append(line);
      }
    } else target.append(make("p", JSON.stringify(report.plans.B0.verification.issues)));
    const details = make("details"), title = make("summary", "Manifest nguồn và giả định đã xác nhận"), pre = make("pre"); pre.style.whiteSpace = "pre-wrap"; pre.style.overflowWrap = "anywhere"; pre.textContent = JSON.stringify(report.manifest, null, 2); details.append(title, pre); target.append(details);
  }
  function renderSynthetic(report) {
    const target = get("studioSyntheticResult"); target.replaceChildren(); target.classList.remove("studio-empty");
    const facts = window.DemoViewModel.presentationEvidence(report);
    if (!facts) { target.append(make("p", "Không thể đối chiếu kịch bản: thiếu nguồn, lịch hoặc bằng chứng verifier.")); return; }
    const summary = make("div", undefined, "studio-plan-summary");
    for (const [code, plan] of Object.entries(report.plans)) {
      const div = make("div"), check = facts[code.toLowerCase()];
      if (code === facts.selectedPlan) div.classList.add("recommended");
      div.append(make("span", code + (code === facts.selectedPlan ? " · Được policy chọn" : "")),
        make("strong", check?.valid ? number(check.cost) + " đ" : "Chưa có chi phí hợp lệ"),
        tag(check?.status || plan.status || "UNKNOWN", check?.valid ? "pass" : "warning"));
      summary.append(div);
    }
    target.append(summary);
    if (facts.savingB1 === null) {
      target.append(make("p", "B0/B1 chưa đủ bằng chứng kiểm chứng độc lập; không công bố số tiền tiết kiệm."));
    } else {
      target.append(make("p", `B1 so với B0: ${facts.savingB1 >= 0 ? "giảm" : "tăng"} ${number(Math.abs(facts.savingB1))} đ trong mô hình. Policy: ${facts.decision} · ${facts.selectedPlan || "chưa chọn"}.`));
    }
    if (facts.b2Difference === null) {
      target.append(make("p", "B2 chưa có lịch và chi phí được kiểm chứng để so sánh."));
    } else if (facts.b2Difference > 0) {
      target.append(make("p", `B2 giảm thêm ${number(facts.b2Difference)} đ so với B1 (tổng giảm ${number(facts.savingB2)} đ so B0), nhưng chưa xác nhận chi phí phối hợp ngoài mô hình.`));
    } else if (facts.b2Difference === 0) {
      target.append(make("p", "B2 không giảm thêm chi phí so với B1 trong lần tìm kiếm có giới hạn này."));
    } else {
      target.append(make("p", `B2 cao hơn B1 ${number(-facts.b2Difference)} đ trong mô hình; không được mô tả B2 là rẻ hơn.`));
    }
    for (const c of facts.b1Changes) target.append(make("p", `${c.job_id} trên ${c.to.machine_id}: ${c.from.start} → ${c.to.start}.`));
    const checks = make("div", undefined, "studio-groups");
    for (const code of ["B0", "B1", "B2"]) {
      const item = facts[code.toLowerCase()];
      checks.append(tag(`${code}: ${item.valid ? "PASS" : item.status} · ${item.verifiedJobs}/${facts.expectedJobs} công việc`, item.valid ? "pass" : "warning"));
    }
    target.append(make("h4", "Bằng chứng verifier thực tế"), checks,
      make("p", "Verifier kiểm tra bảo toàn công việc, máy phù hợp, mốc thời gian, khả dụng/chồng lấn máy, setup và khuôn. Không có cơ sở để ghi 128/128 công việc cho kịch bản này."),
      make("p", "Kịch bản này là SYNTHETIC, tách biệt nguồn ngành dệt; tiết kiệm chỉ là chi phí điện chạy việc + setup trong mô hình, không phải ROI xưởng đo thực tế."),
      make("code", report.input_hash));
  }
  function syncSyntheticView(tab) {
    if (!synthetic) return;
    document.body.classList.remove("demo-presenting");
    get("studioPresent").textContent = "Chế độ trình chiếu";
    setDataset(structuredClone(synthetic.input_snapshot));
    renderReport(structuredClone(synthetic));
    activeGanttPlan = "compare"; renderGantt();
    window.Workspace.show(tab);
  }
  function sourceFilesChanged(){
    audit=null;selected.clear();
    narratives = narratives.filter(n => n.scenario !== "source");
    invalidateTextile();
    globalThis.DemoWorkspace?.setAudit?.(null);
    get("studioAuditDetails").hidden=true;get("studioWarnings").hidden=true;
    get("studioFunnel").replaceChildren();get("studioRows").replaceChildren();
    get("studioPanel-textile").hidden=true;
    const count=Number(!!get("sourceInputFile").files.length)+Number(!!get("sourceOutputFile").files.length);
    get("sourceFileStatus").textContent=count===2?"Đã chọn đủ hai tệp. Bấm Nhập & kiểm tra hai tệp.":`Đã chọn ${count}/2 tệp. Chọn đủ Input và Output.`;
    status("Dữ liệu nguồn đã đổi. Kiểm tra lại hai tệp trước khi phân tích.");
    updateActions();
  }
  get("sourceInputFile").addEventListener("change",sourceFilesChanged);
  get("sourceOutputFile").addEventListener("change",sourceFilesChanged);
  get("studioAudit").addEventListener("click", () => task("Đang đọc và đối chiếu nguồn…", loadAudit));
  get("studioFilter").addEventListener("change", () => { page = 0; renderRows(); });
  get("studioPrevRows").addEventListener("click", () => { page--; renderRows(); });
  get("studioNextRows").addEventListener("click", () => { page++; renderRows(); });
  const eligibleRows = () => (audit?.rows || []).filter(row => row.classification === "COMPATIBLE_CANDIDATE");
  function representativeSelection(count) {
    if (count === audit.default_selection.length) return [...audit.default_selection];
    const groups = audit.machines.map(machine =>
      eligibleRows().filter(row => row.machine === machine).sort((a,b) => a.start-b.start || a.id.localeCompare(b.id)));
    const quota = groups.map(() => 0);
    for (let n=0; n<count; n++) {
      const i=groups.reduce((best, group, index) =>
        quota[index] < group.length && (best < 0 || quota[index] / group.length < quota[best] / groups[best].length) ? index : best, -1);
      if (i<0) break;
      quota[i]++;
    }
    const chosen = groups.flatMap((group,index) => Array.from({length:quota[index]},(_,n) =>
      group[quota[index]===1 ? 0 : Math.round(n*(group.length-1)/(quota[index]-1))]));
    return chosen.sort((a,b) => a.start-b.start || a.id.localeCompare(b.id)).map(row=>row.id);
  }
  function replaceSelection(ids) {
    selected = new Set(ids);
    get("studioSelectionCount").value = selected.size;
    invalidateTextile(); renderFunnel(); renderRows();
    status(`Đã chọn ${selected.size} công việc trên ${new Set(ids.map(id=>audit.rows.find(r=>r.id===id)?.machine)).size} máy. Chạy B1/B2 để cập nhật Gantt theo nhóm này.`);
  }
  function applyCount() {
    if(!audit || busy) return;
    const input=get("studioSelectionCount"), count=Number(input.value), limit=Math.min(256,audit.counts.compatible);
    if (!input.value || !Number.isInteger(count) || count<1 || count>limit) {
      invalidateTextile();
      status(`Số công việc phải từ 1 đến ${limit}. Chưa thể phân tích với số này.`,true);
      return;
    }
    const ids=representativeSelection(count);
    if(selected.size!==ids.length || ids.some(id=>!selected.has(id))) replaceSelection(ids);
    else updateActions();
  }
  get("studioSelectionCount").addEventListener("input",applyCount);
  get("studioSelectCount").addEventListener("click",applyCount);
  get("studioSelectAll").addEventListener("click", () => replaceSelection(eligibleRows().slice(0,256).map(row => row.id)));
  get("studioClearSelection").addEventListener("click", () => replaceSelection([]));
  get("studioDefaultSelection").addEventListener("click", () => replaceSelection(audit.default_selection));
  get("studioMapping").addEventListener("input", invalidateTextile);
  get("studioMapping").addEventListener("change", invalidateTextile);
  get("studioMapping").addEventListener("submit", event => {
    event.preventDefault();
    if (!get("studioMapping").reportValidity()) return;
    const token = generation;
    // Source-file mode uses server-provided defaults, not stale hidden form state.
    const body = {...audit.defaults, source_hash: audit.source_hash, selected_ids: [...selected]};
    task("Đang kiểm chứng B0, thử B1 và tìm lịch phối hợp B2…", async () => {
      const report = await api("studio/textile", body);
      if (token !== generation) { status("Đầu vào đã đổi khi đang tính. Kết quả cũ đã bỏ; chạy lại với đầu vào mới."); return; }
      textile = report;
      renderTextile(report);
      globalThis.DemoWorkspace?.publish?.(report);
      const repaired=report.status==="REPAIRED_WITH_INVALID_BASELINE";
      status(repaired ? report.message : report.status==="COMPLETED"
        ? `Đã cập nhật Gantt cho ${report.plans.B0.schedule.length} công việc; B0/B1/B2 đã kiểm chứng.`
        : report.message, report.status!=="COMPLETED" && !repaired);
      // Always open the actual report, even when B0 is invalid. Never retain the old chart.
      window.Workspace.show(report.status==="BASELINE_INVALID" ? "tab-validation" : "tab-gantt");
      const heading=get("demoTitle-"+(report.status==="BASELINE_INVALID" ? "validation":"gantt"));
      heading?.focus({preventScroll:true});
    });
  });
  get("studioReplay").addEventListener("click", () => task("Đang đặt lại và tính kịch bản slide bằng engine…", async () => {
    const report = await api("studio/replay", {}); synthetic = report; narratives = narratives.filter(n => n.scenario !== "synthetic");
    globalThis.DemoWorkspace?.publish?.(report);
    get("studioAIResult").replaceChildren(); renderSynthetic(report); status("Đã tính kịch bản SYNTHETIC. Mở Gantt và verifier để trình bày bằng chứng.");
  }));
  get("studioOpenGantt").addEventListener("click", () => syncSyntheticView("tab-gantt"));
  get("studioOpenVerifier").addEventListener("click", () => syncSyntheticView("tab-validation"));
  get("studioOpenDecision").addEventListener("click", () => syncSyntheticView("tab-overview"));
  get("studioAIDiagnostics").addEventListener("click", async () => {
    const button = get("studioAIDiagnostics");
    const output = get("studioAIDiagnosticResult");
    button.disabled = true;
    output.textContent = "Đang đọc danh mục endpoint và quota, không gửi prompt AI…";
    try {
      const info = await api("studio/ai/diagnostics");
      const models = info.free_endpoints?.models || [];
      const notes = models.map(item => {
        const label = item.model.includes("minimax/") ? "MiniMax Free" : "XingChen Free";
        return label + ": " + (item.status === "NO_ENDPOINTS" ? "0 endpoint" :
          item.status === "LISTED" ? item.endpoints + " endpoint được công bố" :
          "chưa kiểm tra được");
      });
      const quota = info.account?.free_model_daily_requests;
      output.textContent = [...notes,
        quota ? "Quota tài khoản còn " + quota.remaining + "/" + quota.limit :
          "Chưa kiểm tra được quota tài khoản.",
        "Đây là kết quả kiểm tra chỉ đọc; endpoint được công bố chưa chắc hỗ trợ mọi tham số hoặc còn quota provider."
      ].join(" · ");
    } catch {
      output.textContent = "Không lấy được chẩn đoán từ backend; không gửi prompt AI.";
    } finally {
      button.disabled = false;
    }
  });
  async function connection() {
    try {
      const info = await api("studio/ai/status");
      get("studioAIConnection").textContent = info.configured ? `LIVE API · MiniMax M3.1 Free → XingChen Free dự phòng · còn ${info.requests_remaining}/${info.request_budget} lượt · không dùng câu trả lời cache` : "Chưa có khóa API ở backend";
    } catch { get("studioAIConnection").textContent = "Chưa kết nối backend"; }
  }
  function clearNarrative() {
    get("studioAIResult").replaceChildren(make("p","Câu trả lời từ API sẽ xuất hiện tại đây khi bạn gửi câu hỏi.","ai-live-empty"));
    get("studioAITrace").textContent = "Ngữ cảnh đã đổi. Chọn câu hỏi và gửi để lấy giải thích mới từ provider.";
    setAIState("studioAILivePanel","idle","Chờ câu hỏi");
  }
  get("studioAIMessage").addEventListener("input", clearNarrative);
  get("studioAIScenario").addEventListener("change", clearNarrative);
  get("studioAIConsent").addEventListener("change", updateActions);
  async function ask(kind) {
    const scenario = get("studioAIScenario").value;
    const evidence = scenario === "source" ? audit : scenario === "textile" ? textile : synthetic;
    if (!evidence) { status("Đọc nguồn hoặc chạy kịch bản đã chọn trước khi nhờ AI.", true); return; }
    const question = get("studioAIMessage").value;
    const fingerprint = evidence.input_hash || evidence.source_hash;
    setAIState("studioAILivePanel","loading","Đang kết nối…");
    get("studioAITrace").textContent = "Đang gửi yêu cầu tới OpenRouter. Xin chờ phản hồi thật từ provider…";
    get("studioAIResult").replaceChildren(make("p","Đang nhận nội dung từ model miễn phí. Engine và lịch sản xuất không bị thay đổi.","ai-live-empty"));
    await task("Đang nhờ MiniMax M3.1 Free diễn giải bằng chứng; nếu provider lỗi có thể thử XingChen Free. Không gọi model trả phí…", async () => {
      try {
      const result = await api("studio/ai", {kind, scenario, input_hash: fingerprint, message: question, consent: get("studioAIConsent").checked});
      const current = scenario === "source" ? audit : scenario === "textile" ? textile : synthetic;
      if (!current || !get("studioAIConsent").checked || (current.input_hash || current.source_hash) !== fingerprint || get("studioAIScenario").value !== scenario || get("studioAIMessage").value !== question) { status("Ngữ cảnh hoặc đồng ý gửi đã đổi; phản hồi AI cũ đã bỏ."); return; }
      if (result.status !== "OK") {
        if (result.http_status === 404) throw Error(`OpenRouter không tìm thấy endpoint miễn phí phù hợp (HTTP 404). Đã thử ${(result.attempted_models || []).join(" → ")}. Kiểm tra danh sách model đang hoạt động; không phải lỗi số liệu hay solver.`);
        if (result.http_status === 429) throw Error(result.rate_limit_scope === "UPSTREAM_PROVIDER" ? `Các model miễn phí đã thử (${(result.attempted_models || []).join(" → ")}) vẫn gặp giới hạn từ ${result.provider_name || "provider"}. Quota tài khoản OpenRouter có thể là giới hạn riêng. Chờ và thử lại chủ động; không chuyển sang model trả phí.` : "OpenRouter đang giới hạn lượt. Kiểm tra quota và nguyên nhân lỗi trong Tờ trình & AI. Không tự chuyển sang model trả phí.");
        const invalid = {
          OUTPUT_TRUNCATED: "phản hồi bị cắt khi model hết giới hạn sinh",
          EMPTY_CONTENT: "model trả phản hồi rỗng",
          MALFORMED_JSON: "model trả JSON sai định dạng",
          NON_OBJECT_JSON: "model không trả về JSON object",
          NARRATIVE_SCHEMA_INVALID: "cấu trúc kết quả chưa đạt kiểm chứng",
          FACTS_CHANGED: "model tự thay đổi facts gốc nên kết quả bị từ chối"
        };
        const problem = invalid[result.error_category] || result.error_category || result.status;
        const tried = (result.attempted_models || []).join(" → ");
        throw Error(`Không thể dùng câu trả lời: ${problem}. ${tried ? "Đã thử: " + tried + ". " : ""}Bằng chứng engine không thay đổi; thử lại khi provider sẵn sàng.`);
      }
      const content = get("studioAIResult");
      content.replaceChildren(make("p", result.narrative.summary, "ai-live-lede"));
      const columns = make("div", undefined, "ai-live-answer-grid");
      for (const [label, items] of [["Nhận định theo bằng chứng", result.narrative.findings], ["Cần kiểm tra tiếp", result.narrative.next_steps]]) {
        const block=make("section",undefined,"ai-live-answer-panel");
        block.append(make("h4",label));
        const list=make("ul");
        for(const text of items) list.append(make("li",text));
        if(!items.length) list.append(make("li","Không có mục bổ sung trong phản hồi hiện tại."));
        block.append(list);columns.append(block);
      }
      content.append(columns);
      const proof=make("dl",undefined,"ai-live-proof");
      for(const [title,value] of [["Model",result.served_model||result.model],["Thời gian",String(result.latency_seconds??"—")+" giây"],["Provider response ID",result.response_id||"Không được provider cung cấp"],["Hash bằng chứng",fingerprint]]) {
        const cell=make("div");cell.append(make("dt",title),make("dd",String(value)));proof.append(cell);
      }
      content.append(proof);
      const entry = {scenario, kind, question, input_hash: fingerprint, ...result, reviewed: false};
      narratives.push(entry);
      const review = make("label", undefined, "studio-check"), checkbox = make("input"); checkbox.type = "checkbox";
      checkbox.addEventListener("change", () => { entry.reviewed = checkbox.checked; entry.reviewed_at = checkbox.checked ? new Date().toISOString() : null; });
      review.append(checkbox, make("span", "Tôi đã đối chiếu phần diễn giải AI với bằng chứng và rà soát nội dung.")); content.append(review);
      const usage = result.usage?.total_tokens != null ? ` · ${result.usage.total_tokens} tokens` : "";
      const responseProof = result.response_id ? ` · Provider ID ${result.response_id}` : " · Provider không trả ID";
      get("studioAITrace").textContent = `LIVE OpenRouter · ${result.served_model || result.model} · ${result.latency_seconds ?? "—"}s${usage}${responseProof} · ${fingerprint}`;
      setAIState("studioAILivePanel","success","Đã nhận phản hồi");
      status("Đã kiểm tra facts có cấu trúc của AI với bằng chứng backend. Người trình bày vẫn cần duyệt phần diễn giải.");
      await connection();
      } catch(error) {
        setAIState("studioAILivePanel","error",/JSON|phản hồi|facts|định dạng/i.test(error.message) ? "Phản hồi chưa hợp lệ" : "Provider gặp lỗi");
        get("studioAITrace").textContent=error.message;
        get("studioAIResult").replaceChildren(make("p","Không có câu trả lời AI hợp lệ. Kiểm tra kết nối hoặc quota rồi gửi lại.","ai-live-empty"));
        throw error;
      }
    });
  }
  get("studioAIContext").addEventListener("click", () => ask("context"));
  get("studioAIReport").addEventListener("click", () => ask("report"));
  get("studioExport").addEventListener("click", () => {
    const artifact = {artifact_version: "aisc-demo-1", generated_at: new Date().toISOString(), source_audit: audit, textile_experiment: textile,
      synthetic_slide_scenario: synthetic, ai_explanations: narratives, scope: "External source audit and isolated experiment; separate synthetic slide scenario; no measured factory ROI"};
    const blob = new Blob([JSON.stringify(artifact, null, 2)], {type: "application/json"});
    const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = "EnergyShift-source-evidence.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    status("Đã xuất nguồn, manifest, giả định, lịch, ledger, verifier và giải thích AI hiện có.");
  });
  get("studioPresent").addEventListener("click", () => { const on = document.body.classList.toggle("demo-presenting"); get("studioPresent").textContent = on ? "Thoát trình chiếu" : "Chế độ trình chiếu"; });
  document.querySelectorAll("[data-studio-step]").forEach(button => button.addEventListener("click", () => showStep(steps.indexOf(button.dataset.studioStep))));
  document.addEventListener("keydown", event => { if (event.key === "Escape") { document.body.classList.remove("demo-presenting"); get("studioPresent").textContent = "Chế độ trình chiếu"; } });
  if (new URLSearchParams(location.search).has("demo")) window.Workspace.show("tab-dispatch");
  updateActions(); connection();
  globalThis.DemoStudio = {
    showStep: name => showStep(steps.indexOf(name)),
    onSharedReport: report => {
      if (report.schema_version === "textile-demo-1") { textile = report; renderTextile(report); }
      else { synthetic = report; renderSynthetic(report); }
      updateActions();
    }
  };
});
