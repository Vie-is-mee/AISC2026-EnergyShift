# Khôi phục UI của nhóm, giữ engine và đầu vào đã nâng cấp

Cập nhật: phần dưới là hồ sơ PR #11. Bản UI chuẩn hiện tại trên nền `ec408d9`
đã được giữ trong nâng cấp [B2 chạy thật](B2_COORDINATED_SEARCH.md).
`app.js` nối dữ liệu trực tiếp; không nạp `workspace.js` cũ. B2 không còn NOT_RUN.

Ngày 19/10/2026. Người dùng yêu cầu dùng giao diện trong
`EnergyShift_Complete_UI_UX_Chat_Changes`, thay cho màn hình dài nhiều thiết lập.

## Nguồn thiết kế

`workspace.css` lấy từ `GitHub-UI/styles.css` của thư mục người dùng cung cấp.
Khung header, brand, icon/menu trái, bảng màu, card B0/B1/B2, sáng/tối và responsive
dựa trên `GitHub-UI/index.html` và bộ CSS đó. Các phần nối engine dùng
workspace.js, app.js và input-desk.js; live.css điều chỉnh nội dung live vào shell.
Không chạy app.js/scenarios_extracted.js của bản thiết kế, vì README của bản đó
ghi rõ chi phí/quyết định chưa tính lại từ chỉnh sửa lịch.

Không dùng Google Fonts/CDN; giữ font hệ thống để hoạt động offline. CSS thiết kế
được giữ riêng, không đổi build_app.py để tránh ghi đè frontend live.

## Sáu mục trái theo bản thiết kế

| Mục | Dữ liệu hiển thị |
|---|---|
| Quyết định & So sánh | Verdict, lịch được chọn, card B0/B1, B2 chưa chạy, lợi ích và bảng chi phí từ cùng report |
| Tiến độ Gantt | Toàn bộ jobs/machines và setup của B0/B1 đã verifier PASS |
| Phụ tải & Biểu giá | kWh và kW trung bình từng khoảng giờ tổng hợp từ RUN_ELECTRICITY ledger; biểu giá từ input |
| Ràng buộc vật lý | Verifier và search status thật, kèm phạm vi chưa mô hình hóa |
| Độ nhạy & Rủi ro | UNKNOWN/bounds chi phí, sai số công suất và LOW/BASE/HIGH thực |
| Lịch chạy & Nhập liệu | Bảng kế hoạch, hồ sơ, Excel/CSV và các thiết lập nâng cao |

Không ghi cứng “24H” vì input có thể tới 48h; không ghi cố định “5 ràng buộc” vì
verifier kiểm tra nhiều quy tắc hơn. Chưa có dữ liệu thì hiện màn hình bắt đầu,
không dựng cost/verdict để lấp chỗ trống. Sửa input ẩn kết quả cũ ở mọi mục.

Phụ tải là **trung bình theo khoảng giờ**, gồm cả khoảng cuối dưới 1 giờ nếu có;
không phải peak tức thời, công suất trạm biến áp hoặc số đo IoT. Chỉ tính điện chạy,
không gồm điện chờ/setup; số hiển thị làm tròn, tiền vẫn lấy ledger backend chính xác.

## Luồng nhập rút gọn

1. Chọn hồ sơ đã lưu hoặc dùng bộ mẫu.
2. Sửa bảng lô: mã lô, sản lượng, máy và bắt đầu chạy. Bật **Hiện định mức & hạn
   hoàn thành** khi cần sửa định mức/release/due; dữ liệu không bị xóa khi thu gọn.
3. Bấm **Phân tích kế hoạch**. Nếu bảng đổi, hệ thống tự chạy data gate, áp dụng
   snapshot rồi phân tích; nếu lỗi thì dừng và chỉ rõ dòng cần sửa. Khi thành công,
   mở mục Quyết định & So sánh.

Nhập từ Excel/CSV mở một phần riêng khi cần. Hồ sơ, backup/restore, lịch máy/khuôn,
tariff, định mức, review chi phí, JSON và kiểm tra/áp dụng thủ công nằm trong
**Thiết lập nâng cao**. Không buộc người dùng bấm áp dụng và phân tích hai lần.

Giữ nguyên guards: quantity khác định mức yêu cầu xác nhận duration từng máy;
chi phí chưa xác nhận chuyển UNKNOWN; ngày mới cần rà soát calendar/tariff/molds;
không tự nhân duration hoặc giả 0 chi phí. Chuẩn bị bản nháp chưa hợp lệ không
được chạy bằng input cũ. Một click không tự xác nhận chi phí thay người dùng.

## Kiểm chứng và deploy

- 143 tests Python, 23 tests Node, syntax workspace.js trên CI.
- QA Edge: sáu mục, chuyển mục không mất bản nhập, sáng/tối, menu điện thoại,
  compact input/advanced fields, tự data gate → analysis → kết quả, lỗi quantity,
  hourly kWh khớp ledger trong sai số hiển thị, cùng toàn bộ regression trước.
- Source hashes/artifacts: live_ui_qa.json và cloud_rehearsal.json. Ảnh local:
  work/ui-qa/desktop.png, mobile.png, workspace-dark.png, input-desktop.png, input-mobile.png.
- Thêm workspace.css/workspace.js vào static allowlist backend và Vercel builder:
  tổng 9 public assets. Không publish thư mục thiết kế nguyên bản, source nội bộ
  hoặc .env; CORS/build/environment/deploy config giữ nguyên.

Chưa kiểm tra với kỹ sư thật, không công bố thời gian onboarding hoặc tỷ lệ giảm
thao tác. B2 vẫn NOT_RUN; không khôi phục ERP/IoT/solver/ROI hoặc approval giả từ
bản UI. Giao diện đẹp không thay chứng cứ dữ liệu hoặc giới hạn vận hành.
