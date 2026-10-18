# Lịch sử nâng cấp EnergyShift VN

File này được cập nhật theo từng bước; mỗi bước source có PR và merge riêng.
Ngày ghi theo Asia/Ho_Chi_Minh. Chỉ đánh dấu đã làm khi có code và kiểm chứng.

## 18/10/2026 — Đánh giá nền trước nâng cấp

Đối chiếu submission V3.2, PRODUCT.md, source và master roadmap 18–22/10.
Mốc source ban đầu: `7f8482abcb2a66fe7fa69c5fa3457967a1872097`.

Các điểm yếu nhận diện trực tiếp qua source:

- `SCENARIOS` chứa sẵn verdict, KPI, chi phí, lịch và cờ pass.
- Nút đối chiếu ERP/MES chỉ dùng timeout; chưa có kết nối dữ liệu thực.
- Bảng độ nhạy luôn ghi ổn định, không phản ánh stable=false.
- Scenario đầu tuyên bố đủ 6 job nhưng Gantt chỉ có 5.
- Phụ tải và công suất trạm là các giá trị cố định.
- Nhãn ERP/công tơ/xác nhận nhà máy chưa có bằng chứng đi kèm trong repository.
- Chưa có contract chung, data gate, verifier và cost engine chạy từ input.
- `build_app.py` có thể ghi đè app.js từ hai file JS thành phần.

Định hướng: input giả lập có thể sửa → normalize/validate → B0 → tính chi phí
theo interval → B1 → verifier độc lập → policy → UI cùng snapshot; B2 chỉ thêm
sau khi nền đúng. Không dùng kết quả giả lập để khẳng định ROI nhà máy.

## Bước 01 — Contract, fixture và data gate

Phạm vi roadmap: T00 phần contract/branch, T01, T02. Không phân vai nhân sự.

### Điểm yếu được xử lý

Demo chưa có dữ liệu đầu vào chuẩn để tính toán; số liệu hiển thị có thể lệch
nhau vì mỗi view dùng dữ liệu tự khai báo. Chưa có cơ chế từ chối input sai.

### Công nghệ và kỹ thuật

- Python 3.11 + Pydantic 2.12.5 strict models: kiểm tra kiểu, số hữu hạn,
  timestamp có offset, giới hạn field và không cho verdict nằm trong input.
- Data gate kiểm tra references, conservation baseline, tariff coverage,
  calendar, setup matrix và provenance; trả lỗi theo field, không tự điền số.
- Snapshot JSON chuẩn hóa + SHA-256 để nhận diện input nhất quán cho bước sau.
- JSON fixture SYNTHETIC: 8 job, 3 máy, 8 khuôn, 24 giờ, đủ tariff và setup.
- Khai báo khuôn vật lý riêng với family; công khai các chi phí bị loại trừ.
- CLI offline cho kiểm tra input; unittest và GitHub Actions cho regression.

### Đã kiểm chứng

- `python -m unittest discover -s backend/tests -v`: **24 tests PASS** trên
  Python 3.11.8 tại môi trường local ngày 18/10/2026.
- CLI fixture trả READY + snapshot + SHA-256; file không đọc được trả READ_ERROR
  và exit 1. Sửa power làm hash đổi; chạy lại input không đổi giữ nguyên hash.
- Negative tests: missing field, duplicate IDs/jobs, machine/mold không tồn tại,
  máy không eligible, duration/power/price sai, timezone sai, due sai, tariff
  gap/overlap, thiếu setup, nhãn measured sai trên synthetic, JSON lỗi.
- CI được cấu hình chạy cùng lệnh kiểm tra trên Python 3.11.

### Giới hạn và bước kế tiếp

Frontend vẫn là mockup cũ; data gate READY chưa chứng minh lịch khả thi.
Chưa có API, cost engine, B1/B2, sensitivity hoặc kết luận kinh tế thật.
Chưa chứng nhận dữ liệu thực tại nhà máy. Phạm vi chi phí dự kiến chỉ gồm điện
chạy job và setup; overtime/idle/setup energy/other costs hiện EXCLUDED.

Bước 02: cost engine cắt interval theo TOU (bao gồm 09:30 và qua ngày), độc lập
verifier lịch B0/máy/khuôn/setup/deadline/calendar, cùng kiểm thử đối soát.

### Dấu vết GitHub

Nhánh: `feature/step-01-data-foundation`. PR và kết quả merge được ghi tiếp
trong mục này sau khi kiểm tra thay đổi và tạo PR; số PR truy được từ lịch sử
merge GitHub. Chưa ghi nhận merge khi chưa có xác nhận từ GitHub.
