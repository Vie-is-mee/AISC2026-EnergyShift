# Local API + giao diện dùng engine thật

Cập nhật 19/10: API chạy B0/B1/B2 trên UI chuẩn hiện tại. Xem
[miền CP-SAT và policy](B2_COORDINATED_SEARCH.md). Controller là `app.js`;
`workspace.js` cũ giữ tương thích asset nhưng không nạp.

Đây là bước nối UI sau khi siết contract demo-3. Không thêm LLM vào policy.

## Chạy

```console
python -m pip install -r requirements.txt
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8765
```

Mở http://127.0.0.1:8765, không mở index.html bằng file://. Giữ process Python
đang chạy. Server dành cho demo localhost; chưa có mô hình triển khai đa người
dùng. Sau khi cài dependency có thể tắt Wi-Fi; UI không tải font/CDN hoặc API AI.

Giao diện: index.html, app.js, live.css, input-model.js, input-desk.js cùng workspace.css/workspace.js
cho thiết kế cockpit và api-client.js/deployment-config.js cho cấu hình backend. Bản cũ giữ trong legacy để so
source, không được API phục vụ. build_app.py chỉ rebuild legacy/app.js, không
ghi đè app.js của luồng live. PRODUCT.md là định hướng sản phẩm, không phải
danh sách chứng nhận tất cả khả năng đã hoàn tất.

## Luồng người dùng

1. Bộ mẫu SYNTHETIC tự nạp, chưa có kết luận trước khi chạy.
2. Vào Lịch chạy & Nhập liệu: dùng hồ sơ, sửa bảng hoặc dán Excel/nhập CSV/TSV,
   ghép cột rồi bấm Phân tích kế hoạch (tự kiểm tra/áp dụng). Có JSON nâng cao/upload JSON/chỉnh nhanh. Quantity/duration cần lot
   confirmation theo demo-3. Xem INPUT_WORKSPACE.md cho bộ nhớ và giới hạn.
3. Chạy phân tích → API data gate → B0/B1 + verifier/cost + risk policy.
4. Xem verdict, raw modeled savings, net bounds, chi phí và Gantt B0/B1, tất
   cả job, kiểm định, miền tìm kiếm và review chi phí ngoài mô hình.
5. Tải JSON chứa cùng run_id/input_hash/input_snapshot, plans, ledger và risk.

Hai nút overtime chỉ sửa input, không gắn verdict sẵn. UNKNOWN được engine
trả MEASURE_FIRST; extra 200.000 VND được engine trả KEEP_CURRENT trên mẫu.
Quyết định luôn phân biệt B1 ứng viên và lịch được đề xuất; xem lịch B1 không
đồng nghĩa B1 được khuyến nghị khi verdict KEEP/MEASURE.

Kết quả bị ẩn ngay khi input đổi; export không còn report cũ. Response về sau
edit hoặc upload bị bỏ qua qua revision guard. Khi đang chạy, nút Analyze bị
khóa nhưng vẫn có thể sửa input. Không có fallback sang số liệu SCENARIOS.
Baseline invalid hoặc input lỗi không hiển thị cost/savings từ lần chạy trước.

## API

| Endpoint | Kết quả |
|---|---|
| GET /api/demo/health | mode, schema, workspace build SHA, busy status |
| POST /api/demo/validate | Kiểm tra contract và trả snapshot/hash; chưa kiểm định lịch/search |
| GET /api/demo/fixtures | Danh sách fixture được cho phép |
| GET /api/demo/fixtures/editable-cell | Input demo-3 hoàn chỉnh |
| POST /api/demo/analyze | Raw dataset JSON, không bọc trong field khác |

POST COMPLETED trả cùng report của engine, bổ sung input_snapshot chuẩn hóa.
BASELINE_INVALID vẫn HTTP 200 với status nghiệp vụ và cost=null. Input sai
HTTP 422 có field/code/why/how_to_fix. JSON sai/duplicate keys/NaN không bị tự
sửa. 415 sai content type, 413 quá dung lượng, 409 khi đang có analysis khác.
500 trả lỗi chung không echo diagnostics. Cùng process chỉ chạy một analysis;
worker thread tách khỏi event loop để health/static vẫn phản hồi được.

Giới hạn demo: 512 KiB, tối đa 8 jobs, 3 machines, horizon 48 giờ; grid 30 phút,
budget 2.000 candidates. Budget hết được xuất SEARCH_INCOMPLETE, không giả là
đã tìm hết. Chưa có deadline theo giây/hủy CPU worker hoặc queue nhiều jobs.
Thời gian phụ thuộc máy/tải nền; chưa cam kết SLA hoặc quy mô lớn.

## Phục vụ file và dữ liệu

Chỉ 9 asset công khai index.html, app.js, live.css, input-model.js, input-desk.js,
workspace.css, workspace.js, api-client.js, deployment-config.js được phục vụ. Không mount repository
thành static directory: /.env, /.git, backend, docs, legacy và JS fragments đều
404. Có same-origin POST check, trusted localhost hostnames, CSP và no-store.
Đây không phải chứng nhận security cho triển khai public; giới hạn dùng local.

DOM hiển thị giá trị bằng textContent, không nhúng source/reference vào HTML.
Gantt chỉ dựng geometry số từ các lịch đã verifier PASS. Thời gian hiển thị
theo Asia/Ho_Chi_Minh. Bảng/Gantt cuộn ngang trên mobile, trang không tràn ngang.
Nguồn MEASURED/PARTNER vẫn là khai báo của người cung cấp, chưa được xác minh.

## Bằng chứng kiểm tra

- 14 tests API/builder; tổng 138 tests Python khi ghép với 124 tests engine trước.
- 18 Node tests cho nhập bảng, bảo toàn facts, quantity/mapping/date guards.
- Test API thực bằng TestClient: input đổi verdict/hash/run; invalid baseline;
  quantity sai; JSON lỗi; size/type/origin/host; private files; concurrency;
  lỗi nội bộ không giữ lock hoặc lộ diagnostics.
- Node syntax check cho JS; CI dùng requirements-dev và chạy cả hai nhóm.
- Headless Edge qua CDP chạy trên API/server thực, có ảnh desktop/mobile.
  Script: ops/browser_smoke.py. Cần Windows, Edge tại đường dẫn chuẩn và
  websocket-client từ requirements-browser; không tự cài hoặc mở browser người dùng.
- QA artifact: [live_ui_qa.json](evaluation/live_ui_qa.json), có source hashes.
  Ảnh và file tải về nằm local trong work/ui-qa (ignored), không commit profile/cache.

QA trình duyệt là một lượt kiểm tra với dữ liệu giả lập trên một trình duyệt,
không chứng nhận mọi browser, mọi lỗi mạng hoặc điều kiện nhà máy. JSON report
chưa thay tờ trình HTML/PDF và chưa có lưu run bền vững qua restart/reload.
