# EnergyShift demo-1 — hợp đồng dữ liệu (lịch sử)

**Đã được thay bằng [demo-3](DEMO3_ECONOMIC_RISK.md), kế thừa nền demo-2.**
Engine hiện chỉ nhận demo-3; không tự thêm xác nhận lô hoặc giả định đổi khuôn
cho input cũ. Nội dung dưới đây lưu phạm vi của các bước trước, không phải
contract hiện hành.

Ngày chốt: 18/10/2026 (Asia/Ho_Chi_Minh). Phạm vi bước 1: T00 phần contract,
T01 fixture, T02 parser/data gate của master roadmap.

## Chạy và kiểm tra

Từ thư mục gốc repository, Python 3.11:

```console
python -m pip install -r requirements.txt
python -m backend backend/fixtures/editable_cell.json
python -m unittest discover -s backend/tests -v
```

Sau khi cài dependency, CLI và tests chạy local, không gọi dịch vụ mạng.
Frontend hiện tại vẫn là bản minh họa dùng SCENARIOS, chưa kết nối backend.
Không chạy `build_app.py` để build backend: script đó chỉ ghép hai file JS
và ghi đè `app.js`. Khi nâng frontend cần thống nhất nguồn JS trước.

## Nguồn đặc tả

- `backend/schemas.py`: Pydantic 2 strict models, từ chối field lạ, NaN/Infinity,
  kiểu dữ liệu sai và verdict được nhét vào input.
- `backend/validation.py`: quan hệ giữa đối tượng, độ phủ thời gian và chuẩn hóa.
- `backend/fixtures/editable_cell.json`: ví dụ hoàn chỉnh, 8 jobs, 3 machines,
  8 khuôn riêng, 24 giờ, các lựa chọn máy đều là giả định SYNTHETIC.

Fixture không chứa số tiền tổng, KPI tiết kiệm, `pass`, hoặc kết luận sẵn.
Biểu giá là cấu hình minh họa, không khẳng định giá hiện hành hoặc áp dụng cho
một nhà máy thực. Job giữ nguyên quantity trên mọi máy; duration của từng cặp
job/machine là thời gian hoàn thành toàn bộ quantity, không phải mỗi sản phẩm.

## Quy ước dữ liệu

| Nhóm | Quy tắc |
|---|---|
| Metadata | `schema_version=demo-1`, currency VND, timezone Asia/Ho_Chi_Minh; source_type bắt buộc |
| Thời gian | ISO có offset +07:00, độ phân giải một phút, interval nửa mở `[start,end)` |
| Horizon | Khoảng audit hữu hạn; demo-1 yêu cầu release/due, calendar và tariff trong horizon |
| Jobs | ID duy nhất, quantity nguyên dương, release < due, eligible không rỗng |
| Processing | duration_min nguyên dương; avg_kw hữu hạn, không âm; power_source bắt buộc |
| Machines | ID duy nhất; các cửa sổ available không chồng; khoảng không khai báo là không khả dụng |
| Molds | Mỗi ID là một khuôn vật lý độc quyền; nhiều job có thể tham chiếu cùng khuôn |
| Baseline | Mỗi job đúng một assignment, máy tồn tại và nằm trong eligible |
| Setup | Trạng thái family đầu horizon cho mọi máy; khai báo đủ mọi transition có thể gặp, kể cả cùng family |
| Tariff | Phủ đúng toàn horizon, không gap/overlap, có band và VND/kWh |
| Provenance | Dataset SYNTHETIC chỉ được có power_source SYNTHETIC |
| Policy | policy-1; ngưỡng VND nguyên không âm, saving_pct 0–100, uncertainty 0–1 (0.15 = 15%) |

`family` biểu diễn nhóm chuyển đổi, **không thay cho `mold_id`**. Bộ verifier
ở bước 2 đã kiểm tra no-overlap theo máy lẫn khuôn. Chưa mô hình hóa
thợ dùng chung, thời gian di chuyển khuôn hoặc khuôn đang gắn trên máy đầu kỳ;
nếu cần các điều kiện đó phải mở rộng contract trước khi nhận dữ liệu pilot.

Setup là khoảng liên tục ngay trước job, chiếm máy và khuôn, phụ thuộc family
của job trước hoặc initial_family. Same-family bằng 0 chỉ khi được khai báo
0, không suy diễn từ việc thiếu transition. Bước 2 đã thực thi quy tắc lịch này.

## Phạm vi chi phí

`cost_scope.included = RUN_ELECTRICITY_AND_SETUP` là phạm vi cho cost engine
đã triển khai ở bước 2: điện chạy job và chi phí setup được khai báo. Bắt buộc nêu đủ
`LABOR_OVERTIME`, `IDLE_ENERGY`, `SETUP_ENERGY`, `OTHER_COSTS` trong excluded.
Không coi các khoản bị loại trừ là bằng 0, không gọi kết quả là toàn bộ chi phí
nhà máy. Xem quy tắc số học và ví dụ đối soát trong BASELINE_VERIFICATION.md.

Job không bị chia nhỏ hoặc dừng giữa chừng trong demo-1. Không đổi sản lượng
để tạo tiết kiệm. Deadline là ràng buộc cứng, không đánh đổi bằng phạt.
Cost engine dùng số hữu tỷ và HALF_UP theo từng đoạn; solver không được âm thầm làm tròn
duration hoặc thời điểm input sang grid gây lệch so sánh B0/B1/B2.

## Kết quả data gate

```json
{
  "status": "READY",
  "errors": [],
  "snapshot": {"schema_version": "demo-1"},
  "input_hash": "sha256:..."
}
```

Snapshot trong ví dụ được rút gọn. Output thực chứa toàn bộ input chuẩn hóa.
SHA-256 tính từ JSON chuẩn hóa, sort keys và separator cố định, không thêm
default ẩn. Thứ tự danh sách được giữ lại và là một phần của snapshot; không
cam kết hash giống nhau khi hoán vị jobs/windows. Hash không chứng minh nguồn
dữ liệu đúng; nó nhận diện snapshot để các màn hình cùng dùng một input.

Khi lỗi: `status=BLOCKED_INVALID`, snapshot/hash null, errors là danh sách
`field`, `code`, `why`, `how_to_fix`. CLI exit 0 khi READY và 1 khi bị chặn.
Lỗi cú pháp, duplicate JSON keys và số không hữu hạn bị từ chối. Người dùng
phải sửa dữ liệu; không biến lỗi input thành khuyến nghị MEASURE_FIRST.

**READY chỉ là data readiness.** Chạy thêm `--baseline` để kiểm chứng start/end,
release/due, máy/khuôn, setup và calendar; chỉ lịch PASS mới được tính chi phí.
CLI trả BASELINE_VERIFIED hoặc BASELINE_INVALID; xem BASELINE_VERIFICATION.md.
Bước 3 thêm `--analyze` để có run_id, B0/B1 và verdict kinh tế trong phạm vi mô
hình. Chưa có API hoặc B2; xem B1_DECISION.md.

## Contract output engine — bước 3 và phần còn lại

Bước 3 dùng một result snapshot có `run_id`, `input_hash`,
`source_type`, `plans`, `comparison`, `sensitivity`, `decision`, cost_scope.
Mỗi plan có status riêng: B2 NOT_RUN không có lịch/chi phí giả hoặc solver status
toàn cục áp nhầm cho B0/B1. Lỗi input khác BASELINE_INVALID và MEASURE_FIRST.
Chỉ candidate được verifier PASS mới được đưa vào policy kinh tế. Chưa có
USE_SIMPLE_RULE vì chưa có B2 để chứng minh giá trị tăng thêm không đáng kể.

Sensitivity đánh giá lịch cố định dưới cùng parameter scenario với B0; nếu chạy
lại solver theo từng scenario, xuất riêng và không dùng để khẳng định một lịch
đã chọn là robust. Bước 3 đã triển khai ba mức correlated power scaling; chưa
bao phủ các tổ hợp biến độc lập hoặc bất định duration/setup/calendar.
