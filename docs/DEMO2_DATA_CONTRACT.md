# EnergyShift demo-2 — khuôn vật lý và duration theo lô

**Đã được mở rộng bởi [demo-3](DEMO3_ECONOMIC_RISK.md).** Engine hiện chỉ nhận
demo-3. Các quy tắc khuôn/lô bên dưới vẫn áp dụng, nhưng yêu cầu input mới gồm
review chi phí EXCLUDED; policy dùng bound công suất độc lập. Số liệu demo-2
được giữ làm bằng chứng lịch sử.

Contract tại thời điểm sửa ưu tiên 1. Engine lúc đó từ chối schema demo-1; không
tự suy đoán xác nhận lô, khuôn đầu kỳ hoặc thời gian đổi khuôn cho input cũ.
Các report demo-1 được giữ nguyên làm lịch sử, không dùng làm kết quả hiện tại.

```console
python -m backend backend/fixtures/editable_cell.json --baseline
python -m backend backend/fixtures/editable_cell.json --analyze
python -m unittest discover -s backend/tests -v
```

## Duration gắn với đúng quantity

Mỗi eligible job/machine bắt buộc có:

```json
{
  "duration_min": 120,
  "avg_kw": 22.0,
  "power_source": "SYNTHETIC",
  "lot_confirmation": {
    "quantity": 1000,
    "duration_min": 120,
    "source_type": "SYNTHETIC",
    "reference": "synthetic-lot-J1-M1-v2"
  }
}
```

confirmation.quantity phải bằng job.quantity; confirmation.duration_min phải
bằng processing.duration_min, trên **mọi máy eligible**. Sửa quantity hoặc
duration riêng sẽ bị LOT_CONFIRMATION_MISMATCH; không cho recost/khuyến nghị.
Muốn thay lô phải xác nhận lại thời lượng của từng cặp máy với reference mới.
Reference không được rỗng hoặc chỉ khoảng trắng. Dữ liệu SYNTHETIC không được
gắn nhãn xác nhận MEASURED/PARTNER_CONFIRMED.

Đây là chế độ **lot-duration được xác nhận**, chưa phải mô hình cycle time.
Hệ thống kiểm tra tính nhất quán của khai báo, chưa xác minh tính thật của
reference hoặc chữ ký người xác nhận. Người dùng cố ý sửa cả số liệu lẫn bằng
chứng vẫn có thể khai báo sai. Chưa suy ra năng suất, phế phẩm, số lòng khuôn
hoặc tự scale duration khi quantity đổi; pilot cần nguồn xác nhận thực tế.

## Setup cơ khí khác với đổi family

Các trường bắt buộc mới trong setup:

```json
{
  "family_transition_scope": "ADDITIONAL_CLEANING_ONLY",
  "mold_occupancy_policy": "HOLD_UNTIL_REPLACEMENT_COMPLETE",
  "initial_mold_by_machine": {"M1": "K1", "M2": "K4", "M3": "K7"},
  "mold_change_by_machine": {
    "M1": {
      "minutes": 30,
      "incremental_cost_vnd": 25000,
      "source_type": "SYNTHETIC",
      "reference": "synthetic-mechanical-change-M1-v2"
    }
  }
}
```

Snippet chỉ minh họa: input hoàn chỉnh phải khai báo mold_change_by_machine cho
**tất cả máy**. Thiếu bị chặn; minutes phải >0, cost phải >=0; zero cost được
chấp nhận chỉ khi khai báo tường minh, zero thời gian cơ khí không được nhận.

Mỗi máy có initial_mold_id hợp lệ hoặc null tường minh (máy đang trống); một
khuôn vật lý không được gắn hai máy đầu kỳ. Giữ initial_family_by_machine và
matrix transitions đầy đủ như trước. Family transitions chỉ là vệ sinh/purge
bổ sung, **không bao gồm lại công/thời gian thay khuôn**. Cần xác nhận scope
này để tránh cộng trùng phí đổi khuôn cũ.

| Trạng thái | Thời gian/chi phí |
|---|---|
| Khuôn cũ = khuôn job mới | Chỉ family transition đã khai báo |
| Khuôn khác, cùng family | Đổi khuôn cơ khí + family transition (thường bằng 0 nếu khai báo 0) |
| Khuôn khác, khác family | Đổi khuôn cơ khí + vệ sinh/purge bổ sung |
| Máy trống → lắp khuôn đầu tiên | Đổi khuôn cơ khí + family transition |

Toàn setup liên tục ngay trước job, chiếm máy, phải nằm trong calendar và
horizon, không đè job trước. Verifier và cost engine tự dựng lại state độc lập.
Cost SETUP = family_setup_vnd + mold_change_vnd; ledger có from/to_mold,
from/to_family, thời gian/cost từng phần. SETUP vẫn là một component tổng để
đối soát total, không cộng tổng lẫn subcomponents thêm lần nữa.

## Giữ khuôn khi máy idle

Khuôn đầu kỳ được giữ từ horizon.start. Sau khi chạy xong, khuôn vẫn gắn trên
máy; chỉ được nhả khi replacement setup hoàn tất, tức job mới bắt đầu. Khuôn
mới được giữ từ setup_start; cả khuôn cũ và mới được reserve trong setup.
Máy không có job vẫn giữ khuôn đầu kỳ tới cuối horizon. Khuôn cuối lịch giữ tới
horizon.end. Verifier xuất mold_reservations và reject overlap giữa các máy.

Đây là quy tắc bảo thủ được khai báo trong input. Không có thao tác tháo khuôn
đơn lẻ; một lịch cần tháo sớm rồi chuyển khuôn có thể bị reject dù nhà máy có
thể làm được nếu bổ sung thao tác. Chưa mô hình hóa xe/thợ vận chuyển, lịch thợ,
storage hoặc thời gian vận chuyển riêng. Không gọi đây là xác nhận mọi điều
kiện nhà máy. Máy có mold_change cố định là giả định demo, chưa phải matrix
thời gian thay khuôn phụ thuộc từng cặp khuôn.

## Các quy tắc giữ nguyên

Timestamp +07:00 theo phút, interval [start,end), job nguyên lô, release/due
cứng, eligible whitelist, machine calendar, đủ job đúng một lần. Tariff phải
phủ đầy horizon. Số học Fraction và HALF_UP từng đoạn TOU. Cost scope chỉ gồm
điện chạy + setup; overtime, idle/setup energy và other costs EXCLUDED.
Sensitivity vẫn là ba mức power biến thiên đồng hướng; giới hạn này **chưa
được xử lý trong bước ưu tiên 1**. B2 NOT_RUN; frontend chưa nối backend.

## Kết quả tính lại, dữ liệu SYNTHETIC

| Khoản | B0 | B1 |
|---|---:|---:|
| Điện | 1.060.222 | 1.002.304 |
| Setup gồm cơ khí + family | 425.000 | 350.000 |
| Tổng VND | 1.485.222 | 1.352.304 |

Tiết kiệm mô hình **132.918 VND** = điện 57.918 + setup 75.000. B1 vẫn dời J4
từ 08:00 sang 22:00 trên M2; khi K6→K4 cùng family B vẫn phải đổi khuôn 30 phút,
25.000 VND. Con số 157.918 VND của demo-1 không còn áp dụng.

Xem [engine_demo2.json](evaluation/engine_demo2.json): 4 ca CHANGE/KEEP/MEASURE/
BASELINE_INVALID, một lượt/ca, có expected verdict và invariant checks.
Các giả định mới là SYNTHETIC, không phải đo đạc hay tiết kiệm thực tại nhà máy.
