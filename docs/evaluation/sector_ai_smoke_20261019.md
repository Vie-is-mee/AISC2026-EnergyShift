# AISC Vòng 2 — Thử nghiệm trợ lý AI theo ngữ cảnh ngành (19/10/2026)

> **Mục đích:** Phát triển EnergyShift phù hợp hơn với dữ liệu sản xuất đa ngành, nhưng không tuyên bố hỗ trợ các ràng buộc mà solver/verifier chưa giải được. Các dữ liệu trong thử nghiệm này đều **SYNTHETIC**.

## 1. Thay đổi mã nguồn trong lượt M1.1

- `backend/context_scope.py`: bộ phát hiện *dấu hiệu cần kỹ sư rà soát*, chưa phải phân tích đầy đủ hay ràng buộc chính thức. Có 6 nhóm: thứ tự công đoạn, nhân sự/ca làm, tồn kho, giao vận, chia nhỏ công việc, nhiều máy đồng thời.
- `backend/assistant.py`: lưu và trả `scope_review` qua API, gửi cùng ngữ cảnh và giới hạn solver cho mô hình. Không đưa `scope_review` hoặc `work_context` vào snapshot tính toán.
- `backend/assistant_csv.py`: hướng dẫn AI không nhầm ngữ cảnh ngành với nguồn dữ liệu và không tự gán điều kiện bên ngoài mô hình.
- `index.html`, `api-client.js`: hiển thị gợi ý phạm vi ngay khi kỹ sư nhập ngữ cảnh/mô tả. Không có từ khóa **không có nghĩa là đã được hỗ trợ**.
- `backend/tests/test_context_scope.py` và `ops/work-context.test.cjs`: kiểm thử tách một công đoạn khỏi nhiều công đoạn, bảo toàn phiên và dữ liệu.

## 2. Thử nghiệm với model AI THẬT — dữ liệu giả lập

**Cơ chế:** `ops/sector_ai_live.py` gửi một yêu cầu JSON Schema cho OpenRouter, dùng cùng fixture `backend/fixtures/coordinated_cell.json` và thay đổi `work_context`. Đây là kiểm tra API + định dạng + dấu hiệu chất lượng nội dung, **không phải thử nghiệm đa ngành trên dữ liệu doanh nghiệp thực**. Không gửi API key trong prompt/báo cáo.

| Ca | Model | Kết quả | Độ trễ thực tế |
| --- | --- | --- | --- |
| Đầu tiên, ngành nhựa | `google/gemma-4-26b-a4b-it:free` cấu hình sẵn | HTTP 404; không có kết quả | ~1,0 giây |
| Ngành nhựa với router miễn phí | `nvidia/nemotron-3-super-120b-a12b:free` (OpenRouter tự chọn) | JSON đúng schema; nội dung nhìn chung có liên hệ dữ liệu và yêu cầu | 32,994 giây |
| Ngành dệt may nhiều công đoạn với router miễn phí | `xingchen-agi/xing4.0-29b-a4b:free` (OpenRouter tự chọn) | JSON đúng schema nhưng có lỗi ngữ nghĩa quan trọng | 102,56 giây |

**Các tệp bằng chứng:**
- `work/aisc_round2/sector_ai_plastic.json` — HTTP 404 gốc
- `work/aisc_round2/sector_ai_plastic_free_router.json` — gọi model thật thành công
- `work/aisc_round2/sector_ai_textile_free_router.json` — gọi model thật thành công nhưng nội dung chưa đạt chất lượng

**Đánh giá chất lượng thủ công, không tự phong điểm:**
- Ca nhựa: AI nêu câu hỏi bảo trì, giới hạn đo đạc và điều kiện hợp lệ tương đối hữu ích. Vẫn có lỗi diễn đạt/đoạn tiếng nước ngoài nên cần kỹ sư duyệt.
- Ca dệt may: AI nêu đúng một phần giới hạn như thứ tự công đoạn và nhân lực, nhưng **gán sai ngữ cảnh dệt may vào nguồn của fixture giả lập**; một số thuật ngữ sai, câu khó hiểu; phần các bước tiếp theo lại gợi ý tối ưu khi điều kiện quan trọng chưa được mô hình hóa. **Không đạt nghiệm thu nghiệp vụ**.
- Free router thay đổi model ở từng lượt nên không thể lấy kết quả một model để tuyên bố độ ổn định của hệ thống. Hai mẫu chưa có giá trị ước lượng tỷ lệ chính xác.
- Không chạy thử nghiệm bằng dữ liệu riêng tư hoặc dữ liệu doanh nghiệp thật. API bên ngoài chỉ nhận fixture SYNTHETIC.

Sau khi đọc kết quả, đã **siết lại system prompt** để yêu cầu tách rõ dữ kiện từ snapshot và lời khai ngữ cảnh, không đề xuất tối ưu trên trường hợp có ràng buộc ngoài mô hình. Chưa chạy lại live test sau thay đổi này; không xem các bài test cũ là bằng chứng prompt mới đã sửa được lỗi.

## 3. Quyết định trước hạn slide

- **Giữ demo chính:** 8 lô, 3 máy trong phạm vi solver, bảng B0/B1/B2 và verifier; những chi phí được tính trực tiếp phải công bố rõ.
- **Demo AI ngành khác:** Nếu trình chiếu, chỉ mô tả bước *phát hiện điều kiện cần kỹ sư rà soát*, không diễn giải như lịch dệt may đã được lập/kiểm chứng. Ưu tiên cảnh báo xác định từ `scope_review` và giao diện, không dựa vào phản hồi ngẫu nhiên của free router.
- **Không chạy AI live bắt buộc trong phần 15 phút:** độ trễ của hai lượt trên là khoảng 33 và 103 giây; dùng ảnh/đoạn ghi hình đúng nguồn từ một lượt đã kiểm tra và có lời chú thích.
- **Không sửa khóa API/.env tự động:** model cấu hình hiện tại trả 404; script thử `--free-router` chỉ thay đổi cấu hình trong tiến trình thử nghiệm. Cần chọn model/provider ổn định và đánh giá thêm trước khi công bố chức năng AI đáng tin.

## 4. Điều kiện nghiệm thu M1.2 (sau khi nộp slide)

1. AI dùng model được chỉ định cố định, hỗ trợ structured output và trả kết quả dưới ngân sách độ trễ phù hợp (phải đo p50/p95 trên bộ mẫu đủ lớn).
2. Bộ 30–50 yêu cầu có phân loại lĩnh vực, mô tả thực tế, đáp án ràng buộc hỗ trợ/chưa hỗ trợ và nguồn cho từng nhận xét; đánh giá cả lỗi AI bịa dữ liệu ngành, bỏ sót và khuyến nghị sai.
3. Khi có điều kiện chưa được solver/verifier hỗ trợ, hệ thống **không** xuất lịch như đã được kiểm tra điều kiện đó.
4. Đo hiệu quả AI so với không AI, gồm thời gian kỹ sư sửa lỗi, tổng thời gian và chi phí gọi model.
5. Mở rộng solver theo từng loại ràng buộc sau khi có kiểm thử và sự xác nhận của kỹ sư, không dùng prompt để thay thế việc lập trình/kiểm chứng.

## 5. Lệnh chạy lại kiểm thử

```powershell
cd J:\vi\AI_Competition\AISC\AISC2026-EnergyShift
python -m unittest discover -s backend/tests -q
node --test ops/work-context.test.cjs ops/ai-csv-view.test.cjs
python work/aisc_round2_evidence.py
python ops/cloud_smoke.py --csv-mock
```

Lưu ý: script `ops/sector_ai_live.py` chỉ gửi yêu cầu API thật khi có `--allow-live-api` và model miễn phí; không dùng trong CI mặc định.
