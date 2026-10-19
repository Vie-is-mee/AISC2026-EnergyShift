/* AI proposes intent only. No path from a model response to dataset or solver. */
window.AssistantIntake = (() => {
  const $ = (id) => document.getElementById(id);
  const active = new Set(["QUEUED", "RUNNING"]);
  let token = "", current = null, generation = 0, base = "", pollTimer = null, busy = false;
  const sessionKey = "energyshift.assistant.session.v1", lastKey = "energyshift.assistant.last.v1";
  const labels = {
    QUEUED: "Đang chờ đến lượt gọi model…", RUNNING: "Đang gọi model đọc yêu cầu…",
    AWAITING_REVIEW: "AI đã trả lời. Bạn hãy rà soát, sửa hoặc từ chối.",
    ACCEPTED: "Đã lưu cách hiểu bạn xác nhận. Chưa sửa dữ liệu, duyệt ràng buộc hoặc chạy lịch.",
    REJECTED: "Đã lưu quyết định từ chối. Sửa mô tả rồi gửi lại nếu cần.",
    CANCELLED: "Đã bỏ lượt này. Lượt API đã bắt đầu có thể vẫn hoàn tất, nhưng phản hồi sẽ không được áp dụng.",
    INTERRUPTED: "Máy chủ đã khởi động lại. Không tự gọi lại model; bạn có thể gửi lại.",
    ERROR: "Lượt trợ lý lỗi; chưa có nội dung được duyệt.",
  };
  function remember(key, value) {
    try { if (value) sessionStorage.setItem(key, value); else sessionStorage.removeItem(key); }
    catch { /* In-memory session still works until reload. */ }
  }
  async function request(path, body) {
    const response = await apiFetch("/api/demo/assistant/requests" + path, {
      ...(body === undefined ? {} : {method: "POST", body: JSON.stringify(body)}),
      headers: {"Content-Type": "application/json", Authorization: "Bearer " + token},
    });
    const value = await response.json();
    if (!response.ok) {
      if (response.status === 401) {token = ""; remember(sessionKey, "");}
      throw Error(value.errors?.map(e => e.why).join("; ") || value.detail || "Không truy cập được trợ lý.");
    }
    return value;
  }
  async function ensure() {
    if (token) return;
    const response = await apiFetch("/api/demo/workspaces", {method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
    const result = await response.json();
    if (!response.ok) throw Error("Chưa tạo được phiên trợ lý. Thử lại sau.");
    token = result.workspace_token;
    remember(sessionKey, token);
  }
  function status(text) {$("aiStatus").textContent = text;}
  function buttons() {
    const review = current?.status === "AWAITING_REVIEW" && base === $("dataset").value;
    const acknowledged = $("aiAcknowledged").checked && $("aiReviewedSummary").value.trim().length > 0;
    $("aiSend").disabled = busy;
    $("aiCancel").disabled = !current || !(active.has(current.status) || review);
    $("aiAccept").disabled = $("aiReject").disabled = !review || !acknowledged || busy;
    $("aiExport").disabled = !current || !["ACCEPTED","REJECTED"].includes(current.status) || base !== $("dataset").value;
  }
  function steps(state) {
    const selected = active.has(state) ? "aiStepModel" : state === "AWAITING_REVIEW" ? "aiStepReview" : ["ACCEPTED","REJECTED"].includes(state) ? "aiStepDone" : "aiStepInput";
    for (const id of ["aiStepInput","aiStepModel","aiStepReview","aiStepDone"]) {
      if (id === selected) $(id).setAttribute("aria-current", "step"); else $(id).removeAttribute("aria-current");
    }
  }
  function list(id, values) {
    $(id).replaceChildren(...values.map(text => {const li = document.createElement("li");li.textContent = text;return li;}));
  }
  function render(value) {
    current = value;
    busy = active.has(value.status);
    status((value.error || labels[value.status] || value.status) +
      (value.api?.http_status ? ` HTTP ${value.api.http_status}${value.api.error_category === "RATE_LIMIT" ? " · Model đang giới hạn lượt gọi; chờ rồi thử lại." : ""}` : ""));
    steps(value.status);
    $("aiAcknowledged").checked = false;
    $("aiResult").hidden = !value.proposal;
    if (value.proposal) {
      $("aiOriginal").textContent = value.proposal.summary;
      list("aiObservations", value.proposal.observations.map(o => `${o.source === "SNAPSHOT" ? "Theo kế hoạch" : "Theo mô tả"}${o.job_ids.length ? " · " + o.job_ids.join(", ") : ""}: ${o.text}`));
      list("aiQuestions", value.proposal.questions.length ? value.proposal.questions : ["AI chưa nêu câu hỏi thêm; bạn vẫn cần kiểm tra cách hiểu."]);
      list("aiNextSteps", value.proposal.next_steps);
      $("aiReviewedSummary").value = value.review?.reviewed_summary || value.proposal.summary;
      $("aiReviewedSummary").disabled = value.status !== "AWAITING_REVIEW";
    }
    const a = value.api;
    $("aiTrace").textContent = `Lượt ${value.id} · đầu vào ${value.input_hash} · yêu cầu ${value.request_hash}. ` +
      (a ? `API: ${a.status}${a.http_status ? " HTTP " + a.http_status : ""}; model: ${a.model || "không có"}; mã provider: ${a.response_id || "không có"}; ${a.latency_seconds ?? "?"} giây; tổng token: ${a.usage?.total_tokens ?? "không báo"}.` : "Chưa có phản hồi API.");
    buttons();
  }
  async function poll(expected) {
    if (!current || expected !== generation) return;
    try {
      const result = await request("/" + current.id);
      if (expected !== generation || base !== $("dataset").value) return;
      render(result);
      if (active.has(result.status)) pollTimer = setTimeout(() => poll(expected), 1300);
    } catch (e) {
      if (expected !== generation) return;
      busy = false;
      status(e.message + " Chọn Mở lượt gần nhất để kiểm tra trước khi gửi lại.");
      buttons();
    }
  }
  function invalidate() {
    generation++;
    clearTimeout(pollTimer);
    if (!$("aiStatus")) return;
    if (current) status("Kế hoạch hoặc mô tả đã đổi. Bản hiểu/duyệt cũ không còn áp dụng; hãy gửi lại. Lượt API đã bắt đầu có thể vẫn chạy.");
    current = null; busy = false;
    $("aiResult").hidden = true;
    $("aiAcknowledged").checked = false;
    steps(""); buttons();
  }
  async function start() {
    const message = $("aiMessage").value.trim();
    if (message.length < 10 || !$("aiConsent").checked) {
      status("Mô tả ít nhất 10 ký tự và xác nhận gửi kế hoạch tới model trước khi tiếp tục."); return;
    }
    if (preparing || pending || fixtureLoading) {status("Chờ tác vụ chuẩn bị/phân tích hiện tại hoàn tất.");return;}
    $("aiSend").disabled = true;
    preparing = true;
    let prepared;
    try {prepared = !window.InputDesk || await InputDesk.prepareForAnalysis();}
    finally {preparing = false;}
    if (!prepared || message !== $("aiMessage").value.trim() || !$("aiConsent").checked) {
      status("Kiểm tra bảng và mô tả rồi gửi lại."); buttons(); return;
    }
    invalidate();
    const expected = generation;
    base = $("dataset").value;
    busy = true; buttons(); steps("RUNNING"); status("Đang kiểm tra kế hoạch và gửi yêu cầu…");
    let result;
    try {
      const snapshot = JSON.parse(base);
      await ensure();
      if (expected !== generation) return;
      result = await request("", {snapshot,message,consent:true});
      if (expected !== generation) {
        request("/" + result.id + "/cancel", {}).catch(() => {}); return;
      }
      remember(lastKey, JSON.stringify({id:result.id, base, message}));
      render(result);
      if (active.has(result.status)) pollTimer = setTimeout(() => poll(expected), 500);
    } catch (e) {
      if (expected === generation) {busy = false;status(e.message + " Không tự gửi lại API; kiểm tra lượt gần nhất nếu kết nối bị mất.");buttons();}
    }
  }
  async function review(decision) {
    if (busy || !current || current.status !== "AWAITING_REVIEW" || base !== $("dataset").value || !$("aiAcknowledged").checked) return;
    const expected = generation;
    busy = true; buttons();
    try {
      const result = await request("/"+current.id+"/review", {input_hash:current.input_hash,request_hash:current.request_hash,decision,reviewed_summary:$("aiReviewedSummary").value.trim(),acknowledged:true});
      if (expected === generation) render(result);
    } catch (e) {if (expected === generation) {busy = false;status(e.message);buttons();}}
  }
  async function resume() {
    try {
      const previous = JSON.parse(sessionStorage.getItem(lastKey) || "null");
      if (!previous || !token) {status("Chưa có lượt được lưu trong phiên trình duyệt này.");return;}
      if (previous.base !== $("dataset").value || previous.message !== $("aiMessage").value.trim() || !InputDesk.beforeAnalyze()) {
        status("Kế hoạch/mô tả hiện tại khác lượt cũ. Không phục hồi duyệt cũ lên dữ liệu mới; hãy gửi yêu cầu mới.");return;
      }
      invalidate(); const expected = generation; base = previous.base;
      const result = await request("/"+previous.id);
      if (expected !== generation) return;
      render(result);
      if (active.has(result.status)) pollTimer = setTimeout(() => poll(expected),500);
    } catch (e) {status(e.message);}
  }
  document.addEventListener("DOMContentLoaded", () => {
    try {token = sessionStorage.getItem(sessionKey) || "";} catch { /* optional storage */ }
    $("aiSend").onclick = () => start().catch(e => {busy = false;status(e.message);buttons();});
    $("aiAccept").onclick = () => review("ACCEPTED");
    $("aiReject").onclick = () => review("REJECTED");
    $("aiResume").onclick = resume;
    $("aiCancel").onclick = async () => {
      if (!current) return;
      const id = current.id, expected = generation;
      generation++; clearTimeout(pollTimer); busy = false;
      try {const value = await request("/"+id+"/cancel",{}); if (generation === expected+1) render(value);}
      catch (e) {if (generation === expected+1) {status(e.message);buttons();}}
    };
    $("aiMessage").addEventListener("input", invalidate);
    $("aiConsent").addEventListener("change", () => {if (!$("aiConsent").checked) invalidate();});
    $("aiAcknowledged").addEventListener("change", buttons);
    $("aiReviewedSummary").addEventListener("input", () => {$("aiAcknowledged").checked = false;buttons();});
    $("aiExport").onclick = () => {
      if (current?.review && base === $("dataset").value) download("EnergyShift_AI_review.json", JSON.stringify({...current,scope:"INTENT_ONLY_NO_DATA_OR_SCHEDULE_CHANGE"},null,2), "application/json");
    };
  });
  return {invalidate, ensureSession:ensure, request};
})();
