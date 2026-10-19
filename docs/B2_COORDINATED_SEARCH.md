# B2: dịch lịch phối hợp, kiểm tra độc lập

Cập nhật sau đánh giá: API nay bật thêm tối đa 12 miền láng giềng đổi thứ tự/
chuyển máy; mô tả dưới đây là mốc B2 ban đầu. [Phạm vi mới và nhóm demo](TEAM_DEMO.md).
UI đã có trục/bảng giờ, bằng chứng chi tiết và tờ trình; có [luồng số đo](MEASUREMENT_PILOT.md)
nhưng chưa có số đo thực tế để xác nhận độ chính xác ngoài xưởng.

Ngày 19/10/2026. UI chuẩn lấy từ bản người dùng xác nhận sau khi agent UI hoàn tất,
trên nền `ec408d9`. Giữ nguyên `workspace.css`, bố cục header/sáu mục, bảng màu,
theme và responsive. Thay controller dựng sẵn bằng dữ liệu thật, giữ input
hồ sơ/nháp/CSV/lot confirmation và thiết lập nâng cao.

## Điểm yếu và kỹ thuật nâng cấp

B1 chỉ dịch một job nên bỏ lỡ lợi ích khi phải dịch nhiều lô. B2 trước đây chưa
chạy, trong khi UI mới có các số mẫu về lịch, giá và telemetry. B2 nay dùng
OR-Tools CP-SAT 9.15.6755 để chọn đồng thời thời điểm chạy mọi job, rồi verifier
dựng lại lịch và cost engine tính lại ledger trước khi cho phép đề xuất.

Miền tìm kiếm là hợp của hai cấu hình máy và thứ tự job trong B0/B1. Trong mỗi
cấu hình, thời điểm là lưới 30 phút cộng mốc B0/B1 để không mất incumbent ngoài
lưới. Cấu hình trùng chỉ giải một lần. Không tự do đổi máy/thứ tự ngoài hai miền
này, không chứng minh tối ưu toàn nhà máy. `global_optimum_proven` luôn false.

Mô hình kiểm tra release/due, horizon, lịch mở máy liên tục (gộp cửa sổ liền nhau),
chuẩn bị/chuyển khuôn và giữ khuôn vật lý tới khi thay khuôn hoàn tất, kể cả máy
không nhận job mới. Chi phí điện bảng dùng phân số/HALF_UP theo từng job/tariff.
Hậu kiểm tính lại độc lập, không tin objective của solver. Sai lịch hoặc chi phí
không khớp thì loại. Chi phí số nguyên quá lớn bị từ chối an toàn.

API bật B2 mặc định, tối đa 8 job/3 máy/48 giờ. B2 có ngân sách 6 giây gồm kiểm
tra incumbent và dựng mô hình trước solver; hậu kiểm có thể cộng thêm thời gian.
Một worker, seed 0. `OPTIMAL` chỉ khi mọi miền khác nhau đều OPTIMAL; `FEASIBLE`
khi có nghiệm solver nhưng chưa hoàn tất mọi miền; `UNKNOWN` khi chưa có nghiệm
solver được chấp nhận/không chạy. Hết giờ hoặc mô hình bị từ chối thì giữ B0/B1
đã kiểm chứng, ghi rõ `origin`; không nhận vơ solver đã tìm ra incumbent.

## Quyết định kinh tế

Card hiển thị chi phí điện + chuyển đổi nominal, không phải toàn bộ chi phí nhà
máy hay tiết kiệm ròng chắc chắn. Giữ khoảng công suất độc lập và review các
chi phí loại trừ. Review `ALL_SINGLE_JOB_MOVES_IN_HORIZON` chỉ đủ cho B1; B2 cần
`ALL_CANDIDATE_SCHEDULES_IN_HORIZON`. Checkbox ghi rõ xác nhận mọi phương án
B0/B1/B2. Đây là khai báo người dùng, chưa chứng thực bằng chứng hiện trường.
Thiếu phạm vi thì B2 `UNKNOWN_SCOPE`, không khuyến nghị B2.

Khi cả B1/B2 đạt ngưỡng so với B0, chỉ chọn B2 khi cận thấp lợi ích tăng thêm
dương và đạt `min_b2_incremental_vnd`; nếu chưa đạt thì `USE_SIMPLE_RULE` B1.
Chi phí loại trừ B1/B2 có thể khác nhau trong biên khai báo, không mặc định chúng
triệt tiêu. Chỉ một ứng viên đủ bằng chứng thì chọn nó. Thiếu bằng chứng dẫn tới
`MEASURE_FIRST`; mọi ứng viên tìm được đều không đạt thì `KEEP_CURRENT`.

`comparison` và sensitivity LOW/BASE/HIGH cũ vẫn chỉ B1 để tương thích. Dữ liệu
riêng B1/B2 và incremental ở `comparison.plans`, `coordinated_economics`.
UI không dùng saving B1 dán nhãn B2. Phụ tải tính từ ledger chạy, không phải IoT;
chưa có công suất nền, điện chờ/setup hay định mức TBA để kết luận an toàn.
Khoảng rủi ro là biên độc lập, không phải khoảng tin cậy thống kê.

## Chạy lại và kiểm chứng

```console
python -m pip install -r requirements.txt
python -m backend backend/fixtures/coordinated_cell.json --analyze --b2
python ops/evaluate_b2.py
python -m unittest discover -s backend/tests -v
node --test ops/input-model.test.cjs ops/deployment.test.cjs
```

Trên UI chọn **Phối hợp hai lô · kiểm chứng B2**, kiểm tra đầu vào tại
**Điều chuyển đơn hàng**, bấm **Phân tích kế hoạch**. Xem ba card/Gantt/rủi ro,
**Xem tờ trình → Tải báo cáo JSON** để lấy run_id/input_hash/snapshot/ledger/
solver và bằng chứng chuẩn bị của cùng lượt chạy.

Ca hai lô SYNTHETIC: B0 **135.920 đ**, B1 **91.760 đ**, B2 **47.600 đ**;
tăng thêm nominal so với B1 **44.160 đ**. Cả ba lịch PASS. Đây là ví dụ xây dựng
để kiểm chứng thuật toán, không phải tiết kiệm đo thực tế hay benchmark độc lập.
Không gọi API model khi chạy B2. [Sáu ca chạy thật](evaluation/b2_cases.json)
và [QA browser](evaluation/b2_ui_qa.json).

155 tests Python, 23 tests Node. B2 có 12 tests: đối chiếu vét cạn miền nhỏ có
lịch máy gián đoạn/mốc ngoài lưới, giữ khuôn vật lý, incumbent tampered,
fallback hết giờ/từ chối mô hình, review hẹp, UNKNOWN/quá lớn, ngưỡng tăng thêm,
tie và chi phí âm không tạo đề xuất đổi lịch không đổi. Browser kiểm tra B2
khớp report, baseline lỗi, response cũ, điều hướng/theme và hồi quy input ở
desktop/mobile. Build static hai origin kiểm tra CORS/CSP, chưa chứng nhận
deployment cloud hoặc vận hành công nghiệp.

Nguồn: [CP-SAT và trạng thái](https://developers.google.com/optimization/cp/cp_solver),
[tác vụ CP-SAT](https://developers.google.com/optimization/cp/cp_tasks),
[OR-Tools 9.15.6755](https://pypi.org/project/ortools/9.15.6755/).
