# Bước 3 — B1 single-move và quyết định có bằng chứng

**Bằng chứng số tiền/counts bên dưới thuộc demo-1 tại bước 3.** Contract hiện
hành là [demo-2](DEMO2_DATA_CONTRACT.md); B0/B1 hiện tính thêm đổi khuôn vật lý.
Không dùng lại 157.918 VND làm kết quả build hiện tại.

```console
python -m backend backend/fixtures/editable_cell.json --analyze
python -m unittest discover -s backend/tests -v
```

Python API local: `backend.analysis.analyze(snapshot, grid_minutes=30,
max_candidates=5000)`. CLI dùng mặc định; --baseline và --analyze loại trừ nhau.
Frontend vẫn dùng SCENARIOS, chưa hiển thị kết quả engine.

## Search B1

Data gate → verifier/recost B0 → thử từng assignment khác B0 → verifier/recost
toàn lịch → chọn best valid. Giữ B0 làm incumbent; không cộng dồn move.
Một job có thể đổi giờ, máy hoặc cả hai; assignment job khác giữ nguyên.

Thời điểm trên grid 30 phút tính từ horizon.start, nằm trong release/due theo
duration máy đích. Thêm giờ gốc để không bỏ cơ hội đổi máy ở start ngoài grid.
Không làm tròn start/duration. Duyệt job ID, machine ID, start tăng dần; hòa
chi phí thì giữ B0, các move ngang tiền giữ move được tìm trước.

Generator tạo thời điểm lần lượt, budget mặc định 5.000 candidate kiểm tra.
Xuất evaluated/rejected/valid, runtime, search_complete và termination
GRID_EXHAUSTED/CANDIDATE_LIMIT. evaluated = rejected + valid. Chưa có timeout
theo giây. Hết grid chỉ là hết miền single-move đã nêu, không tối ưu toàn cục.

Setup của job không đổi assignment có thể đổi do thứ tự chạy mới. Engine recost
toàn lịch và xuất derived_setup_effects, không giấu ảnh hưởng lên job khác.

## Sensitivity và policy

B0/B1 giữ nguyên lịch ở LOW/BASE/HIGH. Scale power của SYNTHETIC/ESTIMATED
bằng 1-u / 1 / 1+u, MEASURED giữ nguyên. Cùng parameter scenario áp dụng cả hai
lịch; không chạy search lại. Mỗi mức có cost/saving/meets_threshold/hash.
acceptance_stable_in_tested_scenarios chỉ nói trạng thái đạt ngưỡng có giống
nhau trong ba mức; có thể ổn định ở cả ba mức đều không đạt.

Đây là kiểm tra power biến thiên đồng hướng, không bảo đảm robust trước mọi
tổ hợp power độc lập; chưa xét bất định duration/setup/calendar hoặc rank máy
cần đo. Khi MEASURE_FIRST, chỉ biết giả định công suất có thể đổi kết luận.

- Muốn đổi: saving > 0 và đạt cả min_net_saving_vnd lẫn min_net_saving_pct.
  Biên bằng chấp nhận; xét tỷ lệ bằng Fraction, saving_pct hiển thị được làm tròn.
- Ba mức có trạng thái đạt ngưỡng khác nhau → MEASURE_FIRST, giữ B0.
- B1 không đạt ngưỡng → KEEP_CURRENT: chưa tìm được phương án đạt trong miền
  đã xét, không chứng minh không có lịch tốt hơn.
- B1 đạt ở cả ba mức → CHANGE, chọn B1.
- B2 luôn NOT_RUN, cost/schedule null; chưa trả USE_SIMPLE_RULE vì chưa có
  phép so B1/B2. min_b2_incremental_vnd chưa được dùng.
- Budget hết vẫn đánh giá best valid, ghi SEARCH_INCOMPLETE; một move đã tìm
  vẫn có thể đáng làm, còn KEEP không đồng nghĩa bất khả thi.
- Input sai → BLOCKED_INVALID, decision null; B0 sai → BASELINE_INVALID.

Mỗi run có UUID và input_hash; plans/comparison/sensitivity/decision cùng một
snapshot gốc, reason_codes và evidence_ids chỉ về report. Lặp input giữ nguyên
plan/cost/decision; UUID và runtime thay đổi. Không dùng LLM để quyết định.

## Bằng chứng SYNTHETIC mặc định

| Kết quả | VND |
|---|---:|
| B0 | 1.360.222 |
| B1 | 1.202.304 |
| Giảm điện | 57.918 |
| Giảm setup | 100.000 |
| Giảm chi phí mô hình | 157.918 |

Dời J4 từ M2 lúc 08:00 sang M2 lúc 22:00; setup trước J5 thay đổi do thứ tự
chạy mới. Đúng một assignment đổi. 1.056 candidate: 490 loại, 566 hợp lệ.
LOW/BASE/HIGH saving 149.230 / 157.918 / 166.606 VND, đều vượt ngưỡng mặc định;
CHANGE chọn B1, B2 chưa đánh giá. Chỉ là modeled saving cho điện chạy + setup,
không phải ROI thực tế hoặc cơ hội tiết kiệm toàn nhà máy.

20 tests mới, tổng 77 tests PASS local Python 3.11.8: nghiệm tính tay, B1 không
tệ hơn B0, single-move, recost setup, tie, VND/%, input đổi verdict, sensitivity,
MEASURED giữ nguyên, off-grid, budget, invalid data/B0, CLI, không mutate input,
lặp lại và đối soát tổng/hash.

Bước tiếp theo: API local và nối UI từ một result snapshot; B2 triển khai sau.
