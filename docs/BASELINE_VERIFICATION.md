# Bước 2 — kiểm chứng lịch và tính chi phí B0

**Các số tiền và giới hạn bên dưới ghi lại demo-1 tại bước 2.** Xem
[demo-2](DEMO2_DATA_CONTRACT.md) cho contract hiện hành, trạng thái khuôn đầu kỳ,
giữ khuôn khi idle, xác nhận lô và kết quả tính mới.

## Chạy local

```console
python -m backend backend/fixtures/editable_cell.json --baseline
python -m unittest discover -s backend/tests -v
```

CLI xuất JSON, exit 0 cho BASELINE_VERIFIED, exit 1 nếu dữ liệu bị chặn hoặc
lịch BASELINE_INVALID. Không có B1/B2, API hoặc khuyến nghị đổi lịch ở bước này.

## Bộ kiểm chứng độc lập

`verify_schedule(snapshot, schedule)` trong `backend/verifier.py` nhận JSON,
không nhận solver object, kết luận hoặc cờ pass từ bên ngoài. Snapshot được
chạy lại data gate; dữ liệu thiếu/sai trả UNKNOWN, lịch có vi phạm trả FAIL.

Assignment chỉ gồm job_id, machine_id, start. End và quantity được dựng lại
từ thông tin job/machine trong snapshot, không nhận end/duration/quantity do
candidate tự khai báo. Candidate phải giữ nguyên multiset job IDs.

Kiểm tra: đúng máy eligible, đúng release/due/horizon, không chồng máy, đủ setup,
không chồng khuôn dùng chung (bao gồm setup), máy khả dụng trong toàn setup/run.
Các cửa sổ availability kề nhau được xem là liên tục; khoảng hở là downtime.
Job end=due hoặc end=start của job tiếp theo được phép theo interval `[start,end)`
nếu setup đủ. Setup được phép trước release của job, nhưng không trước horizon.

Family kế tiếp được xác định từ thứ tự job theo máy, bắt đầu từ initial_family.
Mỗi job có setup liên tục ngay trước lúc chạy. Khuôn được giữ từ setup_start đến
end. Không mô hình hóa thời gian tháo/vận chuyển khuôn, khuôn đang gắn trên máy
đầu kỳ, nhân sự hoặc tài nguyên chưa khai báo. PASS chỉ áp dụng phạm vi demo-1.

## Bộ tính chi phí

`cost_schedule(snapshot, schedule)` trong `backend/costing.py` chỉ tính khi
verifier PASS. Kết quả khác PASS: status BLOCKED và cost=null; không xuất tiền
tiết kiệm cho lịch vi phạm. Bộ tính tự đọc lại assignments, tự dựng end và
transition; không dùng tổng từ solver hoặc rows tính sẵn của verifier.

Điện chạy job được cắt theo tất cả tariff windows tuyệt đối, kể cả ranh giới
09:30, qua ngày và thay giá ngày mới:

`kWh = avg_kw(job,machine) × số phút giao nhau / 60`

`chi phí đoạn = kWh × VND/kWh`

Chọn máy khác dùng duration và avg_kw của chính cặp job/machine đó. Không suy ra
máy lớn/nhỏ luôn tốt hơn. Công suất trung bình là giả định của dataset, không
phải đường cong đo thực tế.

Số học dùng `fractions.Fraction`, dựng số thập phân từ biểu diễn chuỗi. Làm tròn
HALF_UP tới VND nguyên cho từng đoạn job/tariff; tổng là tổng các dòng ledger đã
làm tròn. Setup là số VND nguyên. Đây là quy tắc mô hình demo, không nhận là quy
tắc hóa đơn nhà cung cấp điện. Thay cách chia tariff windows có thể làm khác
vài đồng do rounding; B0/B1/B2 phải dùng cùng snapshot và cùng quy tắc.

Năng lượng và số tiền chưa làm tròn xuất dạng chuỗi hữu tỷ `tử/mẫu`:
`kwh_exact`, `total_kwh_exact`, `kwh_by_band_exact`, `exact_vnd`. Tránh hiểu
chuỗi hữu tỷ là số VND đã làm tròn.

Output gồm ledger truy đến job, máy, start/end, phút, kW, band, kWh, giá và VND;
tổng theo job, máy, component và electricity_by_band. Tổng band chỉ gồm điện,
không cộng setup. Các tổng tiền và tổng năng lượng được test đối soát độc lập.

Phạm vi: RUN_ELECTRICITY + SETUP. LABOR_OVERTIME, IDLE_ENERGY, SETUP_ENERGY,
OTHER_COSTS vẫn EXCLUDED. Nhãn kết quả: Modeled comparable operating cost.

## Bằng chứng kiểm thử

- 20 kW, 09:00–10:00: 10×1.833 + 10×3.398 = **52.310 VND**, 20 kWh.
- 20 kW, 23:00–01:00, giá 1.190 trước 00:00 và 2.000 sau 00:00:
  **63.800 VND**, 40 kWh, dùng cấu hình test mở rộng horizon.
- Cùng job 09:00–10:00 tăng từ 20 lên 22 kW: **57.541 VND**.
- Ca nửa đồng được HALF_UP lên 1 VND; công suất 0 vẫn giữ chi phí setup.
- Kiểm tra riêng ranh giới 04:00, 09:30, 11:30, 17:00, 20:00 và 22:00.
- Fixture mặc định: 8 jobs / 36.000 sản phẩm, PASS phạm vi demo-1,
  **464 kWh**, điện **1.060.222 VND** + setup **300.000 VND**
  = **1.360.222 VND**. Đây là kết quả giả lập, không phải ROI hoặc savings.

Bộ test bước 2 thêm 33 tests; tổng cộng **57 tests PASS** trên Python 3.11.8.
Đã kiểm tra CLI baseline hợp lệ và lịch overlap bị từ chối với cost=null.
