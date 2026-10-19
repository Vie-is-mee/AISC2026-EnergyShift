"use strict";
const apiBaseUrl = window.ENERGYSHIFT_CONFIG?.apiBaseUrl || "";
const getWorkContext = () => document.getElementById("facilityContext")?.value.trim() || "";
const scopeHintRules = [
  [/nhiều công đoạn|công đoạn.{0,80}(rồi|trước khi|sau đó|tiếp theo|trước–sau|trước-sau)|trước khi.{0,80}(sấy|nhuộm|đóng gói)|precedence|multi.stage/i, "thứ tự nhiều công đoạn"],
  [/công nhân|nhân sự|nhân lực|staffing|workforce/i, "nguồn lực nhân sự"],
  [/tồn kho|nguyên liệu|vật tư|inventory|material shortage/i, "tồn kho vật liệu"],
  [/vận chuyển|logistics|xe tải|tuyến giao/i, "giao vận"],
  [/chia nhỏ.{0,40}(lô|việc)|ngắt quãng|preempt/i, "chia nhỏ công việc"],
  [/nhiều máy đồng thời|hai máy cùng lúc|một lô.{0,40}nhiều máy/i, "đồng thời nhiều máy"]
];
function updateFacilityHint() {
  const el = document.getElementById("facilityScopeHint");
  if (!el) return;
  const combined = [getWorkContext(), document.getElementById("aiMessage")?.value || "", document.getElementById("aiCSVNotes")?.value || ""].join(" ");
  const found = scopeHintRules.filter(([pattern]) => pattern.test(combined)).map(([, label]) => label);
  el.textContent = found.length
    ? "Cần kỹ sư rà soát: " + found.join(", ") + ". Các điều kiện này CHƯA được tự động đưa vào solver/verifier; đừng coi lịch là đã đáp ứng chúng."
    : "Chưa nhận diện từ khóa về điều kiện ngoài mô hình. Điều này KHÔNG chứng minh bộ giải hỗ trợ đầy đủ quy trình của ngành; kỹ sư vẫn phải xác nhận.";
}
// Interim adapter for both AI workflows; context never enters a solver snapshot.
document.addEventListener("DOMContentLoaded", () => {
  const field = document.getElementById("facilityContext");
  field?.addEventListener("input", () => { window.AssistantIntake?.invalidate?.(); updateFacilityHint(); });
  document.getElementById("aiMessage")?.addEventListener("input", updateFacilityHint);
  document.getElementById("aiCSVNotes")?.addEventListener("input", updateFacilityHint);
  updateFacilityHint();
  document.getElementById("aiResume")?.addEventListener("click", event => {
    let previous = null;
    try { previous = sessionStorage.getItem("energyshift.assistant.last_context.v1"); } catch { return; }
    if (previous !== null && previous !== getWorkContext()) {
      event.preventDefault(); event.stopImmediatePropagation();
      document.getElementById("aiStatus").textContent = "Ngữ cảnh cơ sở đã thay đổi. Không thể mở lại lượt AI trước đó; hãy gửi yêu cầu mới.";
    }
  }, true);
});
function apiFetch(path, options) {
  if (!path.startsWith("/api/demo/")) throw Error("Unsupported demo endpoint");
  // No credentials or API keys are attached to public demo requests.
  if (path === "/api/demo/assistant/requests" && options?.method === "POST" && typeof options.body === "string") {
    const payload = JSON.parse(options.body);
    const workContext = getWorkContext();
    if (workContext.length > 1200) throw Error("Ngữ cảnh cơ sở tối đa 1200 ký tự.");
    options = { ...options, body: JSON.stringify({ ...payload, work_context: workContext }) };
    if (payload.kind !== "CSV") {
      try { sessionStorage.setItem("energyshift.assistant.last_context.v1", workContext); } catch { /* optional */ }
    }
  }
  return fetch(apiBaseUrl + path, { ...options, credentials: "omit" });
}
