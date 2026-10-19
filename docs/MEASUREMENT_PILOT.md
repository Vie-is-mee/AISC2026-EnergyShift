# Đối chiếu số đo và chuẩn bị thử nghiệm

Người dùng xác nhận chưa có dữ liệu thực. Bản này làm sẵn luồng thu nhận và
kiểm tra; không có kết quả tiết kiệm nhà máy được chứng minh.

## Nhập trên UI

Phân tích kế hoạch, mở Phụ tải & Biểu giá → Đối chiếu số đo. Chọn đúng B0/B1/B2
đã thực hiện, mở CSV hoặc dán bảng CSV rồi xác nhận lịch/phạm vi. Không dùng
lịch đề xuất chưa thực hiện làm lịch thực tế. Tải báo cáo để giữ input_hash,
observation_hash, lịch, CSV gốc và nguồn. Sửa đầu vào/số đo sẽ vô hiệu kết quả cũ.

CSV UTF-8 tối đa 128 KiB, 500 dòng, đúng bảy cột (không bỏ cột thừa):

```csv
start,end,machine_id,kwh,scope,source_type,reference
2026-10-19T09:30:00+07:00,2026-10-19T10:30:00+07:00,M1,,RUN_ONLY,MEASURED,replace-with-original-meter-file
```

Ô kWh trong mẫu cố ý trống: phải điền số đo, không tự coi là 0. Dùng số không
âm với dấu thập phân chấm; giữ thời gian +07:00 theo phút và nằm trong horizon.
Ngày trong mẫu chỉ minh họa cấu trúc, cần đổi theo ca thực. Không chồng khoảng
đo cùng máy; không gửi số công tơ tích lũy như điện năng của một khoảng.

- `RUN_ONLY`: điện chạy của máy đã tách khỏi điện nền/chờ/chuẩn bị, có machine_id.
- `TOTAL_MACHINE`: điện tổng máy; không so điểm chính xác với mô hình chỉ điện chạy.
- `TOTAL_PLANT`: điện toàn xưởng, machine_id để trống; chưa so điểm chính xác.
- `MEASURED`: người dùng khai báo số đo; chưa xác thực đồng hồ, chữ ký hoặc nguồn.
- `SYNTHETIC`: giả lập. Nút ví dụ luôn mang nhãn này, kể cả khi cho kết quả đẹp.

Backend dựng lại và kiểm tra lịch, tính lại ledger, tích phân kWh theo đúng
máy và khoảng đo. Chỉ RUN_ONLY có chỉ số: MAE kWh mỗi khoảng, bias dự báo−đo,
WAPE = tổng sai lệch tuyệt đối / tổng kWh đo và tỷ lệ điện chạy mô hình được phủ.
WAPE không xác định nếu tổng đo bằng 0. Coverage là tỷ lệ năng lượng mô hình,
không phải tỷ lệ thời gian, độ chính xác toàn xưởng hoặc xác nhận điện chờ.
Nguồn SYNTHETIC của dự báo vẫn được giữ ngay cả khi số đo được khai báo MEASURED.
Không tự thay avg_kw hoặc power_source của hồ sơ sau một lần đối chiếu.

## Chuẩn bị dữ liệu xưởng

1. Ghi thông tin đồng hồ, đơn vị, vị trí đo, độ phân giải và tải được bao gồm.
2. Lưu file gốc; đối chiếu đồng hồ thời gian máy/thiết bị đo; ghi mất mẫu và hiệu chỉnh.
3. Thu lịch thực hiện, máy/khuôn, số lượng, setup, downtime và thay đổi so với kế hoạch.
4. Chọn khoảng so sánh cùng phạm vi. Nếu chỉ có công tơ tổng, tách tải bằng dữ
   liệu được kỹ sư xác nhận hoặc mở rộng mô hình; không tự trừ tải nền ước đoán.
5. Lưu cả ca khó, dự báo sai và ca không đủ dữ liệu; không chỉ chọn ca tiết kiệm.
6. Thống nhất ngưỡng sai số và điều kiện cho phép khuyến nghị với người phụ trách
   trước thử nghiệm. Phân biệt kiểm tra mô hình với đánh giá tiết kiệm sau triển khai.

Đối chiếu dự báo với số đo của một lịch không tạo phản thực tế cho lịch khác.
Để công bố tiết kiệm phải có thiết kế so sánh sản lượng, điều kiện vận hành,
baseline và các yếu tố thay đổi; chưa được thực hiện trong demo này.

## Thử nghiệm kỹ sư và so sánh cách lập lịch

Dùng cùng bộ ca để đối chiếu B0, lịch kỹ sư, B1 và B2; ghi miền tìm kiếm, thời
gian, tính hợp lệ, modeled cost và lý do không khuyến nghị. Khi chưa có số đo,
chỉ ghi modeled cost; không gọi là tiết kiệm đo thực tế. Giữ các ca không đạt.

Ghi thời gian chuẩn bị input, số lần sửa lỗi, người dùng có giải thích đúng đề
xuất/rủi ro hay không và phản hồi thao tác trong [mẫu nhật ký](templates/pilot_log.csv).
Không điền dữ liệu giả vào nhật ký thử nghiệm thật hoặc gộp dữ liệu nhạy cảm
vào bản demo công khai. Chế độ nhóm demo chưa thay quản lý định danh doanh nghiệp.

API: `POST /api/demo/reconcile` nhận snapshot, executed_schedule,
executed_schedule_confirmed=true, observations. Có kiểm tra kích thước/JSON
trùng khóa/schema, scope, offset, horizon, máy và overlap. Xem tests trong
`backend/tests/test_reconciliation.py`.
