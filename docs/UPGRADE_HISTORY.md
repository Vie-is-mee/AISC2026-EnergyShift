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

Nhánh: `feature/step-01-data-foundation`.
Commit triển khai: `32fc645e083f55a1cab0166e043b3bf4ac5cfa90`.
PR: [#1 — validated demo input foundation](https://github.com/Vie-is-mee/AISC2026-EnergyShift/pull/1).
Kết quả CI và bản ghi merge chính thức được lưu trên PR này; không suy ra trạng
thái merge từ commit đang nằm trên feature branch.

## Bước 02 — Kiểm chứng lịch độc lập và cost engine theo interval

Ngày thực hiện: 18/10/2026 (Asia/Ho_Chi_Minh). Bước 01 đã merge trong PR #1,
merge commit `2745c85093993c2b2606b115d58d03ab2f5c3270`.
Phạm vi roadmap: T03, T04 và phần dựng/recost B0 của T05; chưa có B1.

### Điểm yếu được xử lý

Cờ pass và số tiền của frontend chưa có phép kiểm chứng từ lịch. Job qua ranh
giới TOU hoặc nửa đêm dễ tính sai. Chưa phát hiện tranh chấp khuôn giữa các máy
và chưa đối soát số tiền theo job/component/máy/band.

### Công nghệ và kỹ thuật

- Verifier thuần nhận snapshot và lịch JSON, dựng end/quantity từ input chuẩn;
  kiểm tra conservation, eligibility, release/due/horizon, máy, khuôn, setup,
  calendar; trả PASS/FAIL/UNKNOWN và mã lỗi có job/time khi liên quan.
- Cost engine độc lập dựng lại lịch và transition; chỉ tính sau verifier PASS,
  không đọc tổng từ solver hoặc các rows đã dựng của verifier.
- Giao interval job/tariff theo phút và timestamp tuyệt đối, qua ngày đúng giá.
- Số hữu tỷ Fraction và HALF_UP từng đoạn để tránh cộng dồn float; ledger truy
  được từng khoản, tổng hợp theo job/máy/component/band và kWh chính xác.
- CLI `--baseline`: BASELINE_VERIFIED hoặc BASELINE_INVALID; lịch sai cost=null.
- Cập nhật contract, README và tài liệu BASELINE_VERIFICATION.md.

### Đã kiểm chứng

- 33 tests mới, tổng **57 tests PASS** local Python 3.11.8.
- Ví dụ TOU 09:00–10:00 đúng **52.310 VND**; qua ngày có giá khác đúng
  **63.800 VND**; tăng công suất 10% tính lại ra **57.541 VND**.
- Lịch thiếu/trùng job, sai máy, overlap máy/khuôn, thiếu setup, maintenance,
  trễ hạn, đầu vào thiếu/sai đều bị chặn; không dùng end giả từ candidate.
- Kiểm tra biên interval, rounding, máy thay thế, giữ nguyên input, thứ tự
  candidate và các tổng tiền/kWh đối soát nhau.
- B0 fixture: PASS, **464 kWh**, điện **1.060.222 VND** + setup **300.000 VND**
  = **1.360.222 VND**, dữ liệu SYNTHETIC, chưa tuyên bố savings.

### Giới hạn và bước kế tiếp

Frontend vẫn dùng SCENARIOS. Chưa có API, B1/B2, sensitivity hay policy kinh tế.
PASS chỉ xác nhận những ràng buộc demo-1 đã khai báo; không xác nhận mọi điều
kiện nhà máy. Chi phí overtime/idle/setup energy/other vẫn EXCLUDED.
Bước 03 dự kiến: B1 single-move search, so sánh B0/B1 và policy có bằng chứng,
sau đó API và nối UI theo cùng snapshot.

Nhánh: `feature/step-02-cost-verifier`. Liên kết PR bổ sung sau khi tạo;
CI và merge được kiểm chứng trên GitHub trước khi kết thúc bước.
