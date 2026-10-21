"use strict";
// Isolated presentation what-if editor. Only the server can mark a draft PASS or price it.
(function (root) {
  function clamp(n, low, high) { return Math.max(low, Math.min(high, n)); }
  function snap(clientX, left, width, horizon, grabSlots, duration) {
    if (!Number.isFinite(width) || width <= 0 || horizon <= 0) return 0;
    return clamp(Math.round((clientX - left) / width * horizon - grabSlots), 0, Math.max(0, Math.floor(horizon - duration)));
  }
  function machinesFor(scene) {
    if (scene.textile) return scene.machines;
    const machines = scene.report.input_snapshot?.machines?.map(m => m.id) || [];
    return [...new Set([...machines, ...scene.machines])];
  }
  function eligibleFor(scene, job) {
    return scene.textile ? [job.machine] :
      Object.keys(scene.report.input_snapshot.jobs.find(j => j.id === job.id)?.eligible || {});
  }
  function durationFor(scene, job, machine) {
    if (scene.textile) return job.end - job.start;
    const profile = scene.report.input_snapshot.jobs.find(j => j.id === job.id)?.eligible?.[machine];
    return profile ? profile.duration_min / scene.stepMinutes : job.end - job.start;
  }
  function dateTimeForSlot(scene, slot) {
    return new Date(scene.horizonStart+slot*scene.stepMinutes*60000+7*3600000).toISOString().slice(0,16);
  }
  function slotForDateTime(scene, value) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
    const time=Date.parse(value+":00+07:00"), slot=(time-scene.horizonStart)/(scene.stepMinutes*60000);
    if (!Number.isInteger(slot)||slot<0||slot>scene.horizon) return null;
    return dateTimeForSlot(scene,slot)===value ? slot : null;
  }
  function preview(plan, job, machine, start, eligible, duration = job.end - job.start) {
    if (!eligible.includes(machine)) return { status: "BLOCKED", reason: "Máy không thuộc danh sách tương thích của công việc." };
    if (start < 0 || start + duration > plan.horizon) return { status: "BLOCKED", reason: "Vị trí vượt giới hạn lịch." };
    const end = start + duration;
    const overlaps = plan.jobs.filter(j => j.id !== job.id && j.machine === machine && j.start < end && j.end > start).map(j => j.id);
    return { status: "REVIEW_REQUIRED", reason: overlaps.length ?
      "Xung đột thời gian sơ bộ với " + overlaps.join(", ") + ". Máy chủ sẽ kiểm chứng đầy đủ." :
      "Vị trí mới chỉ là đề xuất. Cần máy chủ kiểm chứng setup, khuôn và các giới hạn khác.", overlaps };
  }
  const math = {snap, machinesFor, eligibleFor, durationFor, dateTimeForSlot, slotForDateTime, preview};
  if (typeof module !== "undefined" && module.exports) module.exports = math;
  if (typeof document === "undefined") return;

  document.addEventListener("DOMContentLoaded", () => {
    if (!root.DemoWorkspace) return;
    const section = document.createElement("section");
    section.className = "studio demo-edit-section";
    section.id = "demoScheduleEditor";
    section.setAttribute("aria-label", "Điều chỉnh lịch mô phỏng");
    const context = document.createElement("section");
    context.id = "demoContextSection";
    context.className = "studio demo-edit-section";
    context.innerHTML = `<div class="studio-section-head"><div><h3>Bối cảnh vận hành</h3><p>Khai báo điều kiện ca làm và thông tin cần kỹ sư rà soát trước khi đổi lịch.</p></div></div>
      <label for="demoFactoryContext">Bối cảnh vận hành và điều kiện chưa có trong mô hình</label>
      <textarea id="demoFactoryContext" rows="2" maxlength="1200" placeholder="Ví dụ: ca đêm chỉ có 2 kỹ thuật viên; thiếu người chuyển khuôn."></textarea>
      <div class="studio-actions"><button id="demoFactoryAnalyze" type="button">Phân tích bối cảnh & lập báo cáo</button><button id="demoFactoryAI" type="button">Chuyển ngữ cảnh sang AI</button></div>
      <p id="demoFactoryStatus" role="status" aria-live="polite"></p>
      <div id="demoFactoryReport" class="demo-report" aria-live="polite"></div>`;
    section.innerHTML = `<div class="studio-section-head"><div><h3>Gantt kéo thả · lịch thử nghiệm</h3><p>Kéo thanh công việc theo thời gian hoặc sang máy phù hợp. Tự căn vào ô thời gian; thả để gửi kiểm chứng độc lập. Có thể dùng biểu mẫu bằng bàn phím.</p></div></div>
      <div class="demo-edit-controls">
        <label>Phương án gốc<select id="demoEditBase"></select></label><label>Công việc<select id="demoEditJob"></select></label>
        <label>Máy<select id="demoEditMachine"></select></label>
        <label id="demoEditClockLabel">Bắt đầu (giờ Việt Nam)<input id="demoEditClock" type="datetime-local" step="1800" required aria-describedby="demoEditTime"></label>
        <label id="demoEditSlotLabel" hidden>Ô bắt đầu<input id="demoEditSlot" type="number" min="0" step="1" aria-describedby="demoEditTime"></label>
        <button id="demoEditRun" type="button">Kiểm tra thay đổi</button>
      </div>
      <p id="demoEditTime" class="studio-muted"></p>
      <div class="demo-edit-toolbar"><button id="demoEditUndo" type="button" disabled>Hoàn tác bước cuối</button><button id="demoEditReset" type="button" disabled>Về lịch trước khi chỉnh</button><span id="demoEditHint" role="status" aria-live="polite">Chọn hoặc kéo một thanh công việc. Màu xem trước không phải kết quả verifier.</span></div>
      <div id="demoEditGantt" class="demo-edit-gantt" aria-label="Gantt có thể kéo thả và cuộn ngang"></div>
      <div id="demoEditResult" role="status" aria-live="polite"></div>`;
    root.DemoWorkspace.mountSection("context", context);
    root.DemoWorkspace.mountSection("editor", section);
    const get = id => document.getElementById(id);
    const note = (id, message) => { get(id).textContent = message; };
    const fmt = n => Number(n).toLocaleString("vi-VN", { maximumFractionDigits: 6 });
    const add = (parent, tag, value) => {
      const item = document.createElement(tag); item.textContent = value; parent.append(item); return item;
    };
    const populate = (sel, values, current) => {
      sel.replaceChildren();
      for (const [value, label] of values) { const opt = add(sel, "option", label); opt.value = value; }
      if (current && values.some(v => v[0] === current)) sel.value = current;
    };
    const current = () => root.DemoWorkspace?.getScene?.();
    let working = false, drag = null, lastHash = null, history = [], suppressClick = false;
    let retainedJob = null, retainedBase = null;

    function available() {
      const scene = current(), plan = scene?.plans[get("demoEditBase").value];
      return { scene, plan };
    }
    function buttons() {
      get("demoEditUndo").disabled = working || !history.length;
      get("demoEditReset").disabled = working || !history.length;
      get("demoEditRun").disabled = working || !current();
      get("demoEditRun").textContent=working?"Đang xử lý…":"Kiểm tra thay đổi";
      section.setAttribute("aria-busy",String(working));
      for(const id of ["demoEditBase","demoEditJob","demoEditMachine","demoEditSlot","demoEditClock"])
        get(id).disabled=working||!current();
    }
    function refresh() {
      const scene = current();
      if (scene?.hash !== lastHash) {
        // Only our own publish marks lastHash before the scene-updated event.
        history = [];
        retainedJob = null; retainedBase = null;
        get("demoEditResult").replaceChildren();
      }
      lastHash = scene?.hash || null;
      get("demoFactoryReport").replaceChildren();
      note("demoFactoryStatus", "");
      if (!scene) {
        section.dataset.ready = "false";
        get("demoEditGantt").replaceChildren();
        note("demoEditResult", "Chưa có lịch. Chạy phân tích để bắt đầu.");
        buttons(); return;
      }
      section.dataset.ready = "true";
      const validPlans = Object.keys(scene.plans).filter(k => scene.plans[k].total !== null);
      populate(get("demoEditBase"), validPlans.map(k => [k, k]), retainedBase && validPlans.includes(retainedBase) ?
        retainedBase : scene.plans.MANUAL ? "MANUAL" : scene.plans.B1 ? "B1" : "B0");
      populate(get("demoEditJob"), scene.plans[get("demoEditBase").value].jobs.map(j => [j.id, j.id]), retainedJob);
      updateJob();
      buttons();
    }
    function updateJob() {
      const {scene, plan} = available();
      if (!scene || !plan) return;
      const previous = get("demoEditJob").value;
      populate(get("demoEditJob"), plan.jobs.map(j => [j.id, j.id]), previous);
      const job = plan.jobs.find(j => j.id === get("demoEditJob").value);
      if (!job) return;
      retainedJob = job.id;
      populate(get("demoEditMachine"), eligibleFor(scene, job).map(id => [id, id]), job.machine);
      get("demoEditSlot").max = String(Math.floor(scene.horizon - durationFor(scene, job, get("demoEditMachine").value)));
      get("demoEditSlot").value = String(job.start);
      updateTime();
      draw();
    }
    function updateTime(){
      const scene=current(),value=Number(get("demoEditSlot").value);
      if(!scene||!get("demoEditSlot").value.trim()||!Number.isInteger(value)){get("demoEditTime").textContent="Nhập ô thời gian nguyên.";return;}
      get("demoEditClockLabel").hidden=scene.textile;
      get("demoEditSlotLabel").hidden=!scene.textile;
      if(!scene.textile){
        const clock=get("demoEditClock");
        clock.setCustomValidity("");clock.value=dateTimeForSlot(scene,value);
        clock.min=dateTimeForSlot(scene,0);
        clock.max=dateTimeForSlot(scene,Number(get("demoEditSlot").max));
        clock.step=String(scene.stepMinutes*60);
        clock.removeAttribute("aria-invalid");
      }
      get("demoEditTime").textContent=scene.textile ? `${value*scene.stepMinutes} phút từ đầu thí nghiệm` :
        new Date(scene.horizonStart+value*scene.stepMinutes*60000).toLocaleTimeString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit"})+" · "+scene.stepMinutes+" phút/ô";
    }
    function draw() {
      const {scene, plan} = available();
      if (!scene || !plan) return;
      const area = get("demoEditGantt"); area.replaceChildren();
      const scroller = add(area, "div", ""); scroller.className = "demo-edit-scroller"; scroller.tabIndex = 0;
      const grid = add(scroller, "div", ""); grid.className = "demo-edit-grid";
      grid.style.minWidth = Math.max(760, Math.ceil(scene.horizon) * 18) + "px";
      const horizon = Math.max(1, scene.horizon), selected = get("demoEditJob").value;
      const ruler = add(grid, "div", ""); ruler.className = "demo-edit-ruler";
      add(ruler, "strong", "Máy / ô");
      const timeline = add(ruler, "div", ""); timeline.className = "demo-edit-ruler-ticks";
      for (let i = 0; i <= 4; i++) {
        const tick = add(timeline, "span", String(Math.round(horizon * i / 4)));
        tick.style.left = (i * 25) + "%";
      }
      for (const machine of machinesFor(scene)) {
        const row = add(grid, "div", ""); row.className = "demo-edit-row";
        add(row, "strong", machine);
        const track = add(row, "div", ""); track.className = "demo-edit-track";
        track.dataset.machine = machine;
        track.style.setProperty("--slot-width", (100 / horizon) + "%");
        for (const job of plan.jobs.filter(j => j.machine === machine)) {
          const bar = add(track, "button", job.id); bar.type = "button"; bar.className = "demo-edit-bar";
          bar.style.left = (job.start / horizon * 100) + "%";
          bar.style.width = Math.max((job.end - job.start) / horizon * 100, 0.8) + "%";
          bar.title = job.id + " · " + machine + " · ô " + job.start + " → " + job.end + " · kéo hoặc bấm để chọn";
          bar.setAttribute("aria-label", bar.title);
          bar.setAttribute("aria-pressed", String(job.id === selected));
          const selectJob = (keepFocus = false) => {
            get("demoEditJob").value = job.id;
            updateJob();
            // Updating the selected job redraws all bars. Restore keyboard focus
            // to the replacement element rather than dropping it on the document.
            if (keepFocus) {
              const selectedBar = [...area.querySelectorAll(".demo-edit-bar")].find(node => node.textContent === job.id);
              selectedBar?.focus({preventScroll: true});
            }
          };
          bar.addEventListener("click", () => {
            if (!suppressClick) selectJob();
          });
          // Do not rely on browser-synthesized clicks for keyboard activation.
          // Prevent the button's default click so a key cannot select twice.
          bar.addEventListener("keydown", event => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            if (!event.repeat) selectJob(true);
          });
          bar.addEventListener("pointerdown", event => beginDrag(event, bar, job, plan, scene));
        }
      }
      add(area, "p", `0–${scene.horizon} ô · ${scene.stepMinutes} phút/ô · ${scene.currency} · kéo ngang/dọc và cuộn vùng lịch nếu cần. Máy chủ quyết định PASS/FAIL.`).className = "studio-muted";
    }
    function clearGhost() {
      get("demoEditGantt").querySelectorAll(".demo-edit-ghost, .demo-edit-track[data-drop]").forEach(el => {
        if (el.classList.contains("demo-edit-ghost")) el.remove();
        else delete el.dataset.drop;
      });
    }
    function beginDrag(event, bar, job, plan, scene) {
      if (working || event.button !== 0 || (event.pointerType === "mouse" && event.buttons !== 1)) return;
      if (drag) return;
      const rect = bar.parentElement.getBoundingClientRect();
      const offset = (event.clientX - bar.getBoundingClientRect().left) / rect.width * scene.horizon;
      drag = {id: event.pointerId, bar, job, plan, scene, x: event.clientX, y: event.clientY,
        offset, proposal: null, moving: false};
      try { bar.setPointerCapture(event.pointerId); } catch { /* window events remain active */ }
      root.addEventListener("pointermove", pointerMove);
      root.addEventListener("pointerup", pointerUp);
      root.addEventListener("pointercancel", cancelDrag);
    }
    function findDrop(event) {
      const track = document.elementFromPoint(event.clientX, event.clientY)?.closest?.(".demo-edit-track");
      return track && get("demoEditGantt").contains(track) ? track : null;
    }
    function pointerMove(event) {
      if (!drag || event.pointerId !== drag.id) return;
      const d = drag;
      if (!d.moving && Math.hypot(event.clientX - d.x, event.clientY - d.y) < 5) return;
      d.moving = true;
      event.preventDefault();
      clearGhost();
      const track = findDrop(event);
      if (!track) { d.proposal = null; note("demoEditHint", "Thả lên một hàng máy để đặt vị trí."); return; }
      const rect = track.getBoundingClientRect();
      const duration = durationFor(d.scene, d.job, track.dataset.machine);
      const slot = snap(event.clientX, rect.left, rect.width, d.scene.horizon, d.offset, duration);
      const eligibility = eligibleFor(d.scene, d.job);
      const assessment = preview({...d.plan, horizon: d.scene.horizon}, d.job, track.dataset.machine, slot, eligibility, duration);
      d.proposal = {machine: track.dataset.machine, slot, assessment};
      track.dataset.drop = assessment.status === "BLOCKED" ? "blocked" : "review";
      const ghost = add(track, "div", d.job.id); ghost.className = "demo-edit-ghost";
      ghost.dataset.status = assessment.status;
      ghost.style.left = (slot / d.scene.horizon * 100) + "%";
      ghost.style.width = Math.max(duration / d.scene.horizon * 100, .8) + "%";
      note("demoEditHint", `${d.job.id} → ${track.dataset.machine}, ô ${slot}–${fmt(slot + duration)}. ${assessment.reason}`);
    }
    function endDrag() {
      const d = drag; if (!d) return null;
      drag = null;
      root.removeEventListener("pointermove", pointerMove);
      root.removeEventListener("pointerup", pointerUp);
      root.removeEventListener("pointercancel", cancelDrag);
      try { d.bar.releasePointerCapture(d.id); } catch { /* possibly detached */ }
      clearGhost();
      return d;
    }
    function cancelDrag(event) {
      if (drag && event.pointerId === drag.id) {
        endDrag();
        note("demoEditHint", "Đã hủy kéo. Lịch không thay đổi.");
      }
    }
    function pointerUp(event) {
      if (!drag || event.pointerId !== drag.id) return;
      // Read the final position even when the last pointermove was coalesced.
      if (drag.moving) pointerMove(event);
      const d = endDrag();
      if (!d.moving) return; // ordinary button click is the keyboard/pointer selection alternative
      suppressClick = true;
      root.setTimeout(() => { suppressClick = false; }, 0);
      const proposal = d.proposal;
      if (!proposal) { note("demoEditHint", "Không tìm thấy hàng máy để thả; không thay đổi lịch."); return; }
      if (proposal.assessment.status === "BLOCKED") {
        note("demoEditResult", proposal.assessment.reason + " Không gửi lịch không hợp lệ đến bộ tính chi phí.");
        return;
      }
      get("demoEditJob").value = d.job.id;
      updateJob();
      get("demoEditMachine").value = proposal.machine;
      get("demoEditSlot").value = String(proposal.slot);
      updateTime();
      if (d.job.start === proposal.slot && d.job.machine === proposal.machine) {
        note("demoEditHint", "Công việc chưa được dịch. Hãy thử vị trí khác."); return;
      }
      note("demoEditHint", "Đã thả thanh; đang yêu cầu máy chủ xác minh lịch đề xuất…");
      void evaluate(proposal.slot, proposal.machine, d.job.id);
    }
    get("demoEditBase").addEventListener("change", () => { retainedBase = get("demoEditBase").value; updateJob(); });
    get("demoEditJob").addEventListener("change", updateJob);
    get("demoEditMachine").addEventListener("change", () => {
      const {scene, plan} = available();
      const job = plan?.jobs.find(j => j.id === get("demoEditJob").value);
      if (scene && job) {
        const maxSlot = Math.floor(scene.horizon - durationFor(scene, job, get("demoEditMachine").value));
        get("demoEditSlot").max = String(maxSlot);
        if (Number(get("demoEditSlot").value) > maxSlot) get("demoEditSlot").value = String(maxSlot);
      }
      note("demoEditHint", "Máy đã chọn; thời lượng có thể khác. Bấm Thử dịch & kiểm chứng để kiểm tra."); draw();
      updateTime();
    });
    get("demoEditSlot").addEventListener("input", () => { updateTime(); note("demoEditHint", "Ô bắt đầu mới chưa được kiểm chứng."); });
    get("demoEditClock").addEventListener("input",()=>{
      const scene=current();if(!scene||scene.textile)return;
      const slot=slotForDateTime(scene,get("demoEditClock").value);
      const clock=get("demoEditClock");
      if(slot===null){
        get("demoEditSlot").value="";
        clock.setCustomValidity("Chọn thời gian trong lịch, theo bước "+scene.stepMinutes+" phút.");
        clock.setAttribute("aria-invalid","true");
        note("demoEditHint","Chọn thời gian trong lịch, theo bước "+scene.stepMinutes+" phút.");return;
      }
      get("demoEditSlot").value=String(slot);updateTime();
      note("demoEditHint","Thời gian mới chưa được kiểm chứng. Bấm Kiểm tra thay đổi để đối chiếu lịch.");
    });
    async function send(path, body) {
      const r = await apiFetch("/api/demo/studio/" + path, {
        method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.message || "Không thể thực hiện.");
      return data;
    }
    async function action(buttonId, work, onError = "demoEditResult") {
      if (working) return;
      working = true; get(buttonId).disabled = true; buttons();
      try { await work(); }
      catch (error) { note(onError, error.message || String(error)); }
      finally { working = false; get(buttonId).disabled = false; buttons(); }
    }
    get("demoFactoryAnalyze").addEventListener("click", () => action("demoFactoryAnalyze", async () => {
      const scene = current(); if (!scene) throw Error("Chạy phân tích lịch trước.");
      const hash = scene.hash, result = await send("context", {input_hash: hash, context: get("demoFactoryContext").value});
      if (current()?.hash !== hash) return;
      const box = get("demoFactoryReport"); box.replaceChildren();
      add(box, "h4", "Báo cáo bối cảnh · cần kỹ sư rà soát");
      add(box, "p", `Nguồn: ${result.source_type} · ${result.decision} · ${result.selected_plan || "chưa chọn"} · ${result.input_hash}`);
      const tiles = add(box, "div", ""); tiles.className = "studio-plan-summary";
      for (const plan of result.plans) {
        const tile = add(tiles, "div", "");
        add(tile, "strong", plan.code);
        add(tile, "span", plan.modeled_cost === null ? "Không xuất chi phí" : fmt(plan.modeled_cost) + " " + result.currency);
        add(tile, "p", plan.verification + " · " + plan.checked_jobs + " công việc");
      }
      if (result.modeled_saving_vs_b0 !== null)
        add(box, "p", "Chênh lệch kế hoạch so B0: " + fmt(result.modeled_saving_vs_b0) + " " + result.currency + " (chi phí trong mô hình).");
      add(box, "h4", "Điều kiện cần kiểm tra"); const items = add(box, "ul", "");
      for (const item of result.constraint_indicators) add(items, "li", item.label + " — " + item.review_reason);
      if (!result.constraint_indicators.length) add(items, "li", "Không thấy chỉ dấu từ khóa; không có nghĩa đã xác nhận mọi ràng buộc.");
      for (const caveat of result.caveats) add(items, "li", caveat);
      add(box, "p", result.scope_note);
      add(box, "h4", "Các bước cần kỹ sư xác nhận");
      const actions = add(box, "ul", "");
      for (const next of result.recommended_next_actions || []) add(actions, "li", next);
      add(box, "p", "Chỉ phát hiện điều kiện từ ngữ cảnh: " + (result.engine_constraints_added ? "Có ràng buộc mới" : "Không bổ sung ràng buộc vào bộ tối ưu") + ".");
      add(box, "p", "Kết luận: " + result.status + " · " +
        (result.human_approval_required ? "cần kỹ sư phê duyệt" : "kiểm tra trạng thái") +
        " · báo cáo theo quy tắc, không phải AI.");
    }, "demoFactoryReport"));
    function issueText(problem) {
      const ids = problem.jobs || (problem.job ? [problem.job] : problem.job_id ? [problem.job_id] : []);
      return [problem.group, problem.code, ...ids].filter(Boolean).join(" · ") || "Ràng buộc không đạt; xem verifier.";
    }
    async function evaluate(value, machine, job) {
      return action("demoEditRun", async () => {
        const scene = current(); if (!scene) throw Error("Cần tính lịch trước.");
        if (!Number.isInteger(value) || value < 0 || value > scene.horizon)
          throw Error("Ô bắt đầu phải là số nguyên trong chân trời lịch.");
        const plan = scene.plans[get("demoEditBase").value];
        const selected = plan?.jobs.find(j => j.id === job);
        if (!selected || !eligibleFor(scene, selected).includes(machine))
          throw Error("Công việc hoặc máy không hợp lệ.");
        if (value + durationFor(scene, selected, machine) > scene.horizon)
          throw Error("Vị trí vượt chân trời lịch với thời lượng của máy được chọn.");
        const hash = scene.hash;
        const box = get("demoEditResult"); note("demoEditResult", "Máy chủ đang kiểm chứng lịch đề xuất…");
        const result = await send("manual", {input_hash: hash, base_plan: get("demoEditBase").value,
          moves: [{job_id: job, machine_id: machine, start_slot: value}]});
        if (current()?.hash !== hash) return;
        box.replaceChildren();
        if (result.status !== "PASS") {
          add(box, "h4", "FAIL · Không có chi phí cho lịch không hợp lệ");
          add(box, "p", result.message);
          const issues = add(box, "ul", "");
          for (const problem of result.verification?.issues || []) add(issues, "li", issueText(problem));
          note("demoEditHint", "Lịch không qua verifier. B0/B1/B2/MANUAL hiện tại chưa bị sửa.");
          return;
        }
        const previous = {lastHash, retainedBase, retainedJob};
        history.push(structuredClone(scene.report));
        retainedBase = "MANUAL"; retainedJob = job;
        lastHash = result.updated_report.input_hash; // preserve undo history through our own scene event
        try {
          root.DemoWorkspace.publishManual(result.updated_report);
        } catch (error) {
          history.pop();
          ({lastHash, retainedBase, retainedJob} = previous);
          buttons();
          throw error;
        }
        const target = get("demoEditResult");
        target.replaceChildren();
        add(target, "h4", "PASS · Lịch MANUAL đã kiểm chứng, chưa phê duyệt");
        add(target, "p", `Chi phí mô hình: ${fmt(result.comparison.draft_cost)} ${result.comparison.currency}; chênh lệch so B0: ${fmt(result.comparison.saving_vs_b0)} ${result.comparison.currency}.`);
        add(target, "p", "Chưa gồm chi phí ngoài mô hình; cần kỹ sư kiểm tra trước khi áp dụng.");
        note("demoEditHint", "Có thể tiếp tục kéo MANUAL hoặc hoàn tác. Các tab dùng cùng báo cáo đã kiểm chứng.");
        buttons();
      });
    }
    get("demoEditRun").addEventListener("click", () => {
      if(!current()?.textile&&!get("demoEditClock").checkValidity()){
        get("demoEditClock").reportValidity();note("demoEditResult","Kiểm tra lại giờ bắt đầu và giới hạn lịch trước khi gửi.");return;
      }
      const slot = get("demoEditSlot").value.trim();
      if (!slot) { note("demoEditResult", "Cần nhập ô bắt đầu trước khi kiểm chứng."); return; }
      void evaluate(Number(slot), get("demoEditMachine").value, get("demoEditJob").value);
    });
    function restore(report) {
      lastHash = report.input_hash;
      retainedBase = report.plans.MANUAL ? "MANUAL" : "B1";
      root.DemoWorkspace.publishManual(structuredClone(report));
      note("demoEditHint", "Đã khôi phục bản lịch có bằng chứng trước đó; không tác động dữ liệu xưởng.");
      note("demoEditResult", "Đã hoàn tác bản nháp. Phương án hiển thị theo báo cáo đã lưu.");
      buttons();
    }
    get("demoEditUndo").addEventListener("click", () => { if (!working && history.length) restore(history.pop()); });
    get("demoEditReset").addEventListener("click", () => {
      if (!working && history.length) { const original = history[0]; history = []; restore(original); }
    });
    get("demoFactoryAI").addEventListener("click", () => {
      const scene = current();
      if (!scene) { note("demoFactoryReport", "Chạy lịch và lập báo cáo trước."); return; }
      const memo = get("demoWorkspaceMemo"); memo.open = true;
      get("demoWorkspaceQuestion").value = get("demoFactoryContext").value;
      get("demoWorkspaceQuestion").dispatchEvent(new Event("input", {bubbles: true}));
      root.DemoWorkspace.openMemo();
      note("demoFactoryStatus", "Đã chuyển ngữ cảnh đến Tờ trình & AI. Chưa gọi mô hình; cần đồng ý gửi bằng chứng và bấm yêu cầu giải thích.");
    });
    root.addEventListener("energyshift:scene-updated", refresh);
    refresh();
  });
})(typeof window !== "undefined" ? window : globalThis);
