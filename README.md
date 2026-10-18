# EnergyShift VN

Hỗ trợ quyết định điều chỉnh lịch sản xuất dựa trên tính khả thi và chi phí.

Frontend HTML/CSS/JavaScript hiện tại là demo minh họa dùng kịch bản khai báo
sẵn. Backend mới đang được xây theo từng bước; chưa phải hệ thống tối ưu hoàn chỉnh.

## Backend — bước 3

Python 3.11, chạy từ thư mục gốc repository:

```console
python -m pip install -r requirements.txt
python -m backend backend/fixtures/editable_cell.json
python -m backend backend/fixtures/editable_cell.json --baseline
python -m backend backend/fixtures/editable_cell.json --analyze
python -m unittest discover -s backend/tests -v
```

CLI mặc định kiểm tra dữ liệu. Thêm `--baseline` để kiểm chứng và tính lại B0
từ job/máy/thời gian/biểu giá/setup. Lịch FAIL hoặc UNKNOWN không được xuất
chi phí. Dữ liệu mẫu hoàn toàn SYNTHETIC; phạm vi tính chỉ gồm điện chạy job
và setup. `--analyze` tạo B1 single-move, kiểm tra LOW/BASE/HIGH trên lịch cố
định và trả CHANGE / KEEP_CURRENT / MEASURE_FIRST theo ngưỡng cấu hình.
B2 chưa chạy; frontend chưa nối engine. Sau khi cài dependency, CLI và tests
không yêu cầu mạng.

- [Contract dữ liệu và giới hạn](docs/DEMO_DATA_CONTRACT.md)
- [Kiểm chứng lịch, số học và bằng chứng bước 2](docs/BASELINE_VERIFICATION.md)
- [B1, policy và bằng chứng bước 3](docs/B1_DECISION.md)
- [Lịch sử nhận diện điểm yếu và nâng cấp](docs/UPGRADE_HISTORY.md)
- [Định hướng sản phẩm](PRODUCT.md)

## Cấu hình OpenRouter (chuẩn bị)

Điền key trong `.env` local theo mẫu `.env_example`:

```dotenv
OPENROUTER_API_KEY=
OPENROUTER_MODEL=google/gemma-4-26b-a4b-it:free
```

`.env` được Git bỏ qua. Cấu hình này dành cho backend; không đưa key vào JS
chạy trong trình duyệt. Hiện chưa có loader `.env` hoặc lời gọi OpenRouter;
engine B0/B1 và policy vẫn chạy độc lập. Model trên là cấu hình do nhóm chọn.
