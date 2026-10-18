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

Nhánh: `feature/step-02-cost-verifier`.
Commit triển khai: `08d212f8745892efaa5ae04f7a6174e87d8f7001`.
PR: [#2 — verify schedules and recost baseline](https://github.com/Vie-is-mee/AISC2026-EnergyShift/pull/2).
Kết quả CI và bản ghi merge chính thức được lưu trên PR này; không suy ra trạng
thái merge từ commit đang nằm trên feature branch.

## Bước 03 — Tìm B1 thực và quyết định từ bằng chứng

Ngày: 18/10/2026 (Asia/Ho_Chi_Minh). Bước 02 merge PR #2,
commit `06ba3293a841346949a1af98b76c8e237bcd32cc`.
Phạm vi: B1 của T05, policy và sensitivity cơ bản để kiểm tra quyết định;
API T06 và nối UI vẫn là bước tiếp theo.

### Điểm yếu được xử lý

Chưa có phương án được tạo từ input và chưa có kết luận phụ thuộc tính toán.
Một move có thể ảnh hưởng setup job khác, nên phải recost toàn lịch. Chưa có
B2 thì không được tuyên bố B1 đủ tốt so với B2.

### Công nghệ và kỹ thuật

- Bounded single-job grid search giữ B0 làm incumbent; mỗi candidate qua
  verifier và recost độc lập. Không cộng dồn move hoặc sửa assignment job khác.
- Grid 30 phút và giờ gốc ngoài grid, không làm tròn input; generator và budget
  5.000 candidate, tie giữ B0, thứ tự duyệt xác định; xuất counts/runtime/scope.
- LOW/BASE/HIGH cố định lịch và dùng cùng power parameter cho B0/B1; scale chỉ
  SYNTHETIC/ESTIMATED, không khẳng định robust trước mọi tổ hợp biến độc lập.
- Policy Fraction xét ngưỡng VND AND %, trả CHANGE/KEEP_CURRENT/MEASURE_FIRST.
  B2 NOT_RUN; USE_SIMPLE_RULE chỉ dùng khi có phép so B1/B2 thật.
- Report run_id/input_hash, chi phí, component delta, job đổi, setup ảnh hưởng,
  reason_codes/evidence_ids; CLI --analyze offline. Chi tiết: B1_DECISION.md.

### Đã kiểm chứng

- **20 tests mới, tổng 77 tests PASS**, local Python 3.11.8.
- B1 dời J4 08:00 → 22:00 trên M2, đúng một assignment đổi, verifier PASS.
  Cost **1.202.304 VND** so B0 **1.360.222 VND**; modeled saving **157.918 VND**
  = điện **57.918** + setup **100.000**; setup trước J5 được recost và công khai.
- LOW/BASE/HIGH saving **149.230 / 157.918 / 166.606 VND**, CHANGE chọn B1,
  B2 chưa đánh giá. Ngưỡng sát lợi ích → MEASURE_FIRST; ngưỡng cao → KEEP_CURRENT.
- Sửa power đổi verdict thật; B0 sai chặn search; budget hết ghi rõ. Kiểm tra
  lặp lại, không mutate input, off-grid start và tổng component/hash khớp.

### Giới hạn và bước kế tiếp

Frontend vẫn mockup; chưa API/B2 hoặc chứng cứ nhà máy/ROI thực. Miền tìm kiếm
single-move có giới hạn; chưa timeout theo giây hoặc ranking điểm cần đo.
Cost scope vẫn điện chạy + setup; các thành phần khác EXCLUDED.
Bước 04: local API, input editor và UI lấy dữ liệu từ cùng run snapshot.

Nhánh: `feature/step-03-b1-policy`.
Commit triển khai: `6b03e137bf3616ab52a9ecbf0434a4808a885339`.
PR: [#3 — search B1 and generate evidence-based decisions](https://github.com/Vie-is-mee/AISC2026-EnergyShift/pull/3).
Kết quả CI và bản ghi merge chính thức được lưu trên PR này; không suy ra trạng
thái merge từ commit đang nằm trên feature branch.

## Chuẩn bị cấu hình OpenRouter — 18/10/2026

Theo yêu cầu chủ dự án, tạo `.env_example` được version control và `.env`
local với OPENROUTER_API_KEY để trống, OPENROUTER_MODEL dùng giá trị nhóm đưa:
`google/gemma-4-26b-a4b-it:free`. Không nhận hoặc ghi key thực vào source.
Thêm `.env`/`.env.*` vào .gitignore và hướng dẫn trong README.
Kiểm chứng bằng git check-ignore và git diff --cached; không cần test engine
cho thay đổi file cấu hình. Chưa cài SDK, đọc .env hoặc gọi API. Tích hợp sau
chỉ dùng backend và không thay đường quyết định B0/B1/policy.
Nhánh: `chore/openrouter-env-template`.
PR: [#4 — prepare local OpenRouter configuration](https://github.com/Vie-is-mee/AISC2026-EnergyShift/pull/4).
CI và bản ghi merge chính thức được lưu trên PR. `.env` chỉ tồn tại local.

## Đánh giá OpenRouter và benchmark engine — 18/10/2026

Yêu cầu: tận dụng API để có số liệu kiểm chứng, thay vì tăng claim bằng lời.
Không thay bước 04 (API local + nối UI) và không đưa LLM vào policy/toán engine.

### Điểm yếu và kỹ thuật áp dụng

- Chưa có phép đo độ lặp lại/performance hoặc độ trung thực của lớp AI.
- Thêm benchmark 4 tình huống × 3 lần; kiểm tra expected verdict, verifier,
  B1<=B0, single-move và đối soát; lưu artifact JSON có môi trường đo.
- Client urllib phía backend đọc .env/biến môi trường, không log key/header,
  raw errors hoặc reasoning. Không thêm dependency hoặc secret vào CI.
- Bộ live 5 ca structured evidence extraction, gồm 2 yêu cầu bịa kết luận;
  chấm đúng giá trị/kiểu 9 fields, từ chối fields lạ, lưu latency/usage/model.
- Thử model nhóm cấu hình rồi router miễn phí, không sửa .env, không chuyển
  trả phí. Chi tiết và giới hạn: API_EVALUATION.md.

### Kết quả thực tế

- Engine: 12/12 lượt đạt checks; lịch/chi phí/verdict lặp lại. Ca search có
  runtime 6,4956–11,8029 giây trên máy đo, không phải SLA nhiều máy.
- Gemma cấu hình trả 429 cả 2 request có mạng; chưa đánh giá chất lượng model.
- Router miễn phí: smoke 1/1 đúng fields, 6,405 giây, 542 tokens, reported cost 0.
- Suite chính: 4/5 JSON dùng được, 4/4 dùng được đúng 9 fields; 1 ca KEEP lỗi
  định dạng. Hai ca ép claim sai không làm đổi facts trong lần thử này.
- Trung vị latency dùng được 15,223 giây; max 30,209 giây. 2.417 tokens có
  usage từ 4 ca; không có token/cost của ca lỗi. Không loại ca fail khỏi tỷ lệ.
- 9 tests mới mock API, tổng 86 tests; CI không gọi mạng hoặc đọc key thật.
- Sau đo, bổ sung giữ usage/model/finish_reason khi JSON lỗi để dễ chẩn đoán,
  không thay artifact fail hoặc chạy lại để làm đẹp báo cáo.

### Quyết định sản phẩm

AI phù hợp lớp diễn đạt/đóng gói evidence tùy chọn, cần kiểm tra đầu ra và
fallback template; không chặn luồng quyết định vì độ trễ/lỗi dịch vụ. Phép đo
chỉ là mẫu nhỏ trên dữ liệu SYNTHETIC, không chứng minh ROI nhà máy, chất lượng
giải thích tự do hay an toàn mọi prompt injection. Các artifact được kiểm tra
không chứa key; .env vẫn local và ignored.

Nhánh: `feature/openrouter-evaluation`.
Commit triển khai: `9594685eb742fe9f0b8227a7f893cb65efe3d5b4`.
PR: [#5 — benchmark engine and evaluate OpenRouter fidelity](https://github.com/Vie-is-mee/AISC2026-EnergyShift/pull/5).
CI và bản ghi merge chính thức được lưu trên PR.

## Ưu tiên 1 sau đánh giá khắt khe — khuôn vật lý và consistency lô

Ngày: 18/10/2026 (Asia/Ho_Chi_Minh). Source trước sửa:
`dd5cc6d2fc6db28e5fc28ab161830d05c5b63490` (PR #5 đã merge).

### Điểm yếu tái hiện

- Hai job cùng family, khác mold_id được xếp sát nhau với setup 0 và PASS.
- Tăng quantity J1 từ 1.000 lên 1.000.000 mà giữ duration vẫn PASS và cùng cost.
- Thiếu initial mold state và việc giữ khuôn khi máy idle có thể cho phép reuse
  khuôn ở máy khác mà chưa mô hình hóa tháo/thay.

### Kỹ thuật và thay đổi

- Bump contract demo-2, reject demo-1 thay vì tự thêm default cho bằng chứng.
- Mỗi profile job/machine có lot_confirmation khóa quantity + duration, kèm
  source/reference. Sửa riêng quantity/duration hoặc quên một alternative bị
  LOT_CONFIRMATION_MISMATCH. Đây là kiểm tra khai báo nhất quán, không phải
  mô hình cycle time hoặc chứng thực chữ ký/nguồn của nhà máy.
- initial_mold_by_machine đầy đủ (mold ID hoặc null), cấm một khuôn gắn hai máy.
- Mechanical mold change có phút dương và cost tường minh cho từng máy, tách
  khỏi family cleaning/purge; scope ADDITIONAL_CLEANING_ONLY tránh cộng trùng.
- Verifier và costing tự tính lại initial/sequential mold state, setup tổng và
  chi phí cơ khí. Cùng family nhưng đổi khuôn vẫn mất thời gian/cost đã khai báo.
- MOLD occupancy HOLD_UNTIL_REPLACEMENT_COMPLETE: giữ khuôn qua idle, nhả khi
  thay thế hoàn tất; reserve cả khuôn cũ/mới trong setup. Chưa hỗ trợ tháo khuôn
  riêng hoặc resource vận chuyển. Có thể reject bảo thủ một số lịch nhà máy.
- Ledger ghi from/to mold, phần family/physical; report công khai ảnh hưởng
  setup về thời gian và chi phí của các job khác.
- Fixture cập nhật toàn bộ bằng chứng giả lập. Các report demo-1 giữ nguyên và
  được đánh dấu lịch sử, không thay số cũ để làm đẹp kết quả.

### Kiểm chứng và số liệu mới

- **19 tests regression mới, tổng 105 tests PASS** local Python 3.11.8; các
  test cũ được cập nhật để khai báo lot evidence tường minh cho dữ liệu test.
- Bắt lại hai ca hở quantity và different-mold/same-family; kiểm tra initial
  mold trùng/thiếu, setup zero/missing, initial install, maintenance và reuse
  khuôn chỉ sau khi nguồn đã nhả; cùng khuôn được tiếp tục chạy sát nhau.
- B0: điện 1.060.222 + setup 425.000 = **1.485.222 VND**.
- B1: điện 1.002.304 + setup 350.000 = **1.352.304 VND**.
- Modeled saving **132.918 VND**, giảm 25.000 so demo-1 do J4 cuối ngày vẫn
  cần đổi K6→K4 dù cùng family B. Giữ kết quả mới, không ép engine ra số cũ.
- Artifact engine_demo2.json: 4 ca, một lượt/ca, expected verdict và invariant
  checks đều đạt. Không tuyên bố đã đo lặp lại từ một lượt. Không gọi API thật.

### Còn lại

Chưa xử lý independent uncertainty/chi phí EXCLUDED của ưu tiên 2; frontend
vẫn mockup; chưa B2, nguồn xác nhận thực hoặc chứng minh ROI nhà máy. Phiên bản
này khóa quantity với duration đã xác nhận, chưa tự suy ra thời gian sản xuất.
Chi tiết contract mới: DEMO2_DATA_CONTRACT.md.

Nhánh: `fix/physical-molds-lot-consistency`.
Commit triển khai: `a1de7dcbd482caf6815c6f8ecd4a18700c91c0d7`.
PR: [#6 — physical mold setup and confirmed lot durations](https://github.com/Vie-is-mee/AISC2026-EnergyShift/pull/6).
CI và bản ghi merge chính thức được lưu trên PR.

## Ưu tiên 2 — chi phí EXCLUDED và power uncertainty độc lập

Ngày: 18/10/2026 (Asia/Ho_Chi_Minh). Source trước sửa:
`e194ca03451029d02fe48ca3e076565e936e7597` (PR #6 đã merge).

### Điểm yếu

Lợi ích điện/setup dương có thể không bù overtime/idle/other costs chưa mô
hình hóa. Ba mức power cùng chiều không bắt được tình huống máy gốc thấp hơn
ước tính còn máy đích cao hơn. KEEP không được suy thành đã kiểm tra robust
mọi candidate nếu search chỉ chọn best modeled cost.

### Kỹ thuật áp dụng

- Contract demo-3 yêu cầu review từng khoản EXCLUDED: BOUNDED với incremental
  VND min/max hoặc UNKNOWN với null. Review áp dụng mọi single-job move trong
  horizon, có source/reference; không mặc định missing=0. Input cũ bị từ chối.
- Ledger giữ nguyên điện + setup. Economic assessment tính net bounds sau
  khoảng chi phí phát sinh; UNKNOWN chặn CHANGE cho B1 có thay đổi.
- Phân tích tuyến tính bằng Fraction cho power từng job/machine độc lập.
  Cùng profile dùng cùng power ở cả B0/B1; các profile được sai số ngược chiều.
  Có radius riêng từng profile, kể cả MEASURED khi khai báo sai số công tơ.
- Hủy các đoạn chung, gộp coefficients và lấy min/max theo dấu. Cộng rounding
  allowance để bound vẫn bao phủ HALF_UP từng đoạn. Không duyệt 2^N hoặc dùng
  LLM tự chấm để kết luận vững.
- Xét đồng thời ngưỡng VND và percent margin; percent dùng modeled B0 của cùng
  scenario. CHANGE chỉ khi mọi giá trị trong bounds khai báo đạt, KEEP khi
  B1 được chọn không thể đạt một ngưỡng, còn lại MEASURE_FIRST.
- LOW/BASE/HIGH giữ để minh họa, không điều khiển policy. Xuất power drivers,
  net/margin bounds, trần extra cost và headroom, reason/evidence mới.

### Kiểm chứng

- **19 tests mới, tổng 124 tests PASS** local Python 3.11.8.
- Tái hiện counterexample máy gốc thấp/máy đích cao: ba mức cùng chiều đều
  đạt nhưng guard độc lập trả MEASURE_FIRST. Test recost độc lập 9 tổ hợp
  power để đối soát cả saving và percent margin với bounds.
- Fixture raw saving vẫn 132.918 VND. Power ±15% cho range bảo thủ
  124.228,8–141.607,2 VND; review zero SYNTHETIC nên CHANGE. Trần extra cost
  để vẫn đạt ngưỡng là 24.228 VND, không phải được phép bỏ qua mọi chi phí khác.
- Overtime UNKNOWN → MEASURE_FIRST; extra overtime 200.000 VND → KEEP_CURRENT.
- Kiểm tra missing/invalid reviews, provenance, radius override, measured
  uncertainty, rounding, shared-profile cancellation, ledger không đổi.
- Artifact economic_risk_demo3.json chứa 4 ca và source hashes; không gọi API thật.

### Giới hạn còn lại

Bounds có điều kiện trên power ranges/review được khai báo, chưa xác minh
nguồn hoặc đảm bảo sai số thực nằm trong khoảng. Chưa bound duration/setup/
tariff/outages; percent denominator vẫn modeled B0, không phải tổng nhà máy.
B1 vẫn chọn theo base modeled cost, chưa robust-optimize toàn miền. Frontend
vẫn mockup, B2 chưa có. Các báo cáo demo-1/demo-2 giữ nguyên làm lịch sử.
Contract chi tiết: DEMO3_ECONOMIC_RISK.md.

Nhánh: `fix/economic-risk-guards`.
Commit triển khai: `6d9eb923e14f1968c09ab658818214a0189ed2d4`.
PR: [#7 — bound excluded costs and independent power risk](https://github.com/Vie-is-mee/AISC2026-EnergyShift/pull/7).
CI và bản ghi merge chính thức được lưu trên PR.

## Nối API local và UI dùng kết quả thật

Ngày: 18/10/2026 (Asia/Ho_Chi_Minh). Source trước thay đổi:
`2397a3d2f9a1d2cf291b6e2c052455bd1bf48d05` (PR #7 đã merge).
Phạm vi: T06–T09, Gantt và export JSON theo cùng result snapshot.

### Điểm yếu được xử lý

Frontend vẫn đọc SCENARIOS/cờ pass/chi phí dựng sẵn, nhãn ERP/meter/CP-SAT và
load chart không phản ánh engine mới. Người dùng chưa thể sửa input trên web
và quan sát số tiền/quyết định thực. Build script có nguy cơ ghi đè app.js mới.

### Kỹ thuật và kết quả

- FastAPI + Uvicorn phục vụ API và UI cùng origin localhost, không runtime CDN
  hoặc OpenRouter. Health/fixtures/analyze routes, input limits và one-analysis
  lock. Phân tích chạy trong threadpool; health/static không bị giữ theo request.
- Chỉ serve ba asset cho phép; .env/.git/backend/legacy không public. JSON được
  parse qua data gate cũ, reject duplicate keys/NaN, lỗi trả có field/code.
- UI vanilla mới nhận một report gồm run_id/input_hash/input_snapshot; cost,
  verdict, risk, schedule, tất cả jobs và review cùng dữ liệu. Gantt dựng setup
  cơ khí/family từ verifier. B2 ghi CHƯA CHẠY, không có ERP/IoT giả.
- Editor JSON, upload, quick controls và overtime input examples. Revision
  guard ẩn kết quả/export ngay khi edit và bỏ stale response, không fallback
  SCENARIOS. Invalid input/baseline không hiển thị savings cũ.
- DOM textContent cho nguồn/ref; JSON export cùng snapshot. Bố cục desktop/
  mobile, không remote fonts. Bản cũ lưu legacy; build_app.py chỉ ghi legacy.

### Kiểm chứng

- 12 API tests mới, tổng 136 tests: edit→recompute, baseline/quantity lỗi,
  private-file 404, type/size/origin/host guards, concurrency và error lock.
- Node syntax check và CI. Browser QA thật với Edge headless/profile riêng:
  CHANGE/MEASURE/KEEP, 8 jobs, same run/hash, desktop/mobile, invalid input,
  invalid baseline, stale response và reference HTML không thực thi.
- Xem LOCAL_DEMO.md và artifact live_ui_qa.json; ảnh/profile/download giữ local
  ignored. Không đọc key thật hoặc gọi OpenRouter trong luồng này.

### Giới hạn

Local demo 8 jobs/3 máy/48h, budget 2.000; chưa timeout CPU theo giây, đa người
dùng hoặc lưu run bền vững. B2 và HTML/PDF evidence chưa có. Kết quả vẫn dựa
trên dữ liệu/giả định SYNTHETIC; chưa pilot hoặc ROI nhà máy. Backend chuẩn hóa
và frontend đồng bộ không thay bằng chứng dữ liệu thực tế.

Nhánh: `feature/local-api-live-demo`; implementation commit: `71998d39cb6d4a86564db8580b719e332e155db6`.
PR: [#8 — API local và UI dùng kết quả thật](https://github.com/Vie-is-mee/AISC2026-EnergyShift/pull/8).
