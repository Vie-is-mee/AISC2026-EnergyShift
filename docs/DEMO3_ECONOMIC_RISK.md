# Demo-3 — kiểm soát chi phí ngoài mô hình và power uncertainty độc lập

Ưu tiên 2 sau đánh giá khắt khe. Engine chỉ nhận schema_version=demo-3, không
mặc định chi phí bị loại trừ bằng 0 khi nhận input cũ. Toàn bộ quy tắc khuôn,
lot confirmation, tariff và số học của [demo-2](DEMO2_DATA_CONTRACT.md) giữ nguyên.

```console
python -m backend backend/fixtures/editable_cell.json --analyze
python -m unittest discover -s backend/tests -v
```

## Chi phí EXCLUDED

Ledger B0/B1 vẫn chỉ gồm RUN_ELECTRICITY và SETUP. Những khoản chưa có cost
engine không được giả thành số tiền quan sát được. cost_scope phải thêm:

```json
{
  "review_scope": "ALL_SINGLE_JOB_MOVES_IN_HORIZON",
  "excluded_review": {
    "LABOR_OVERTIME": {
      "status": "BOUNDED",
      "incremental_min_vnd": 0,
      "incremental_max_vnd": 200000,
      "source_type": "SYNTHETIC",
      "reference": "synthetic-overtime-range-v1"
    }
  }
}
```

Snippet rút gọn: bắt buộc có review cho đúng mọi phần tử excluded (hiện gồm
LABOR_OVERTIME, IDLE_ENERGY, SETUP_ENERGY, OTHER_COSTS), không thừa/thiếu keys.
Khoảng là **candidate cost trừ B0 cost**, VND cho toàn horizon, bao phủ mọi
single-job move được phép. Giá trị âm là khoản giảm chi phí được khai báo.
BOUNDED cần hai số nguyên hữu hạn có min<=max; UNKNOWN cần cả hai null.
Source/reference bắt buộc; dữ liệu SYNTHETIC không được claim đo thực.

Nếu thiếu review thì input BLOCKED_INVALID. Nếu review UNKNOWN thì vẫn được
tính modeled cost, nhưng một B1 có thay đổi không được khuyến nghị CHANGE;
policy trả MEASURE_FIRST, chỉ rõ unknown_components. Cùng lịch B0/B1 thì giữ
nguyên, không đòi người dùng đo thêm chỉ để quyết định không đổi.

Review được khai báo chứ chưa được hệ thống xác minh thực tế; không có chữ ký
hay chứng cứ rằng khoảng là đủ bảo thủ. Khi horizon/điều kiện ca làm thay đổi,
người cung cấp dữ liệu phải đánh giá lại review. Không cộng lại phí đã nằm trong
SETUP hoặc RUN_ELECTRICITY. Review zero trong fixture là **giả định SYNTHETIC
tường minh**, không áp dụng cho nhà máy thật hoặc ngầm suy từ dữ liệu bị thiếu.

## Sai số công suất độc lập

Mỗi profile job/machine có power_uncertainty_pct tùy chọn trong [0,1]:

- Nếu có số cụ thể: dùng số đó, kể cả cho profile MEASURED.
- Nếu null/không có: SYNTHETIC/ESTIMATED dùng policy.power_uncertainty_pct;
  MEASURED mặc định cố định. Cố định không phải chứng minh công tơ không sai số.

Cùng một profile dùng cùng tham số power ở B0/B1. Các profile khác nhau được
phép sai số ngược chiều, kể cả khi thuộc cùng máy; đây là tập lớn bảo thủ hơn
giả định mọi máy cùng tăng/giảm. Không thay đổi duration/setup/tariff hay chạy
lại search trong đánh giá rủi ro.

Trước rounding, điện là hàm tuyến tính của các hệ số power. risk.py gộp các
đoạn giống nhau giữa B0/B1 để hủy chính xác, gộp coefficient theo job/machine,
rồi lấy min/max từng coefficient ở hai đầu khoảng. Không cần duyệt 2^N tổ hợp.
Đoạn điện biến thiên chưa hủy được cộng sai số tối đa 0,5 VND mỗi rounding,
có nhân trọng số. Đoạn cố định dùng số VND thực đã làm tròn. Vì vậy bounds có
thể bảo thủ vài đồng gần ngưỡng, nhưng bao phủ rounding chứ không làm tròn có lợi.

Bounds áp dụng cho **mọi power trong các khoảng khai báo của lịch cố định**,
không chỉ các góc đã chạy thử. Đây là bảo đảm toán học có điều kiện trên mô
hình tuyến tính/rounding hiện tại, không phải bảo đảm sai số thực tế nằm trong
khoảng. Chưa bao phủ duration, outages, setup/tariff uncertainty, yield hoặc
nguồn dữ liệu khai báo sai.

LOW/BASE/HIGH vẫn được xuất để minh họa, nay tôn trọng radius từng profile.
Nhãn acceptance_stable_in_tested_scenarios chỉ mô tả ba mức; policy dùng
economic_assessment, không dùng nhãn ổn định của ba mức để kết luận robust.

## Net bounds và policy

Gọi D = modeled cost(B0)-modeled cost(B1), E là tổng incremental EXCLUDED.
Net = D-E. Nếu D thuộc [L,U] và E thuộc [a,b], net thuộc [L-b,U-a].
Xét hai ngưỡng AND: net>0, net>=min_vnd và net>=p*modeled_B0_cost.
Bound riêng margin (1-p)*B0-B1-E để xét ngưỡng phần trăm đúng với cùng power
scenario, không dùng baseline cố định hoặc lấy hai cực trị không liên quan.
Mẫu số phần trăm vẫn là modeled B0 (điện chạy + setup), không là tổng nhà máy.

- Lịch B1 không đổi: KEEP_CURRENT.
- Review UNKNOWN: MEASURE_FIRST, giữ B0.
- Mọi giá trị trong khoảng đã khai báo đều đạt cả ngưỡng: CHANGE, chọn B1.
- Có thể chứng minh một ngưỡng không thể đạt ngay cả ở upper bound: KEEP_CURRENT.
- Các trường hợp còn lại: MEASURE_FIRST; bound bảo thủ chưa đủ để đổi lịch.

B1 vẫn chọn theo modeled base cost, chưa search tối ưu robust/net trên mọi
candidate. KEEP sau risk review chỉ nói **B1 được chọn chưa đạt**, không chứng
minh không còn candidate khác tốt. B2 NOT_RUN.

Report giữ raw comparison.saving_vnd cho đối soát ledger. economic_assessment
xuất modeled/net/margin bounds dạng Fraction string; unknown không có net
range giả. power_drivers xếp theo độ rộng đóng góp của giả định power, không
phải Value of Information thống kê hay yêu cầu lắp công tơ đã được xác thực.
max_total_extra_cost_vnd_for_robust_change là trần integer của tổng chi phí
phát sinh để còn đạt ngưỡng dưới power bound; headroom_after_review_vnd là phần
còn lại sau upper extra-cost review. Giá trị âm thể hiện đã vượt trần.

## Bằng chứng SYNTHETIC

- Fixture mặc định: raw modeled saving vẫn **132.918 VND**. Với ±15% power,
  lower/upper saving bảo thủ **124.228,8–141.607,2 VND**. Review mọi khoản EXCLUDED
  là zero tường minh nên CHANGE; trần extra-cost để còn đạt ngưỡng là **24.228 VND**.
- Đổi overtime thành UNKNOWN → MEASURE_FIRST; đặt thêm 200.000 VND → KEEP_CURRENT.
- Một job chuyển M1 20 kW sang M2 18 kW: ba mức cùng chiều đều đạt, nhưng nếu
  M1 thấp/M2 cao trong ±15% thì có thể lỗ. Engine nay trả MEASURE_FIRST.
- Test độc lập recost 9 tổ hợp thấp/cơ sở/cao của hai profile kiểm tra saving
  và percent margin nằm trong bounds; có test riêng radius override, measured
  uncertainty, rounding, missing reviews, extra cost, không đổi raw ledger/hash.

Artifact mới: [economic_risk_demo3.json](evaluation/economic_risk_demo3.json).
19 tests mới, tổng 124 tests. Các báo cáo demo-1/demo-2 vẫn là lịch sử; không
chạy API live trong thay đổi này. Frontend chưa nối engine.
