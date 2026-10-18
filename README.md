# EnergyShift VN

Hỗ trợ quyết định điều chỉnh lịch sản xuất dựa trên tính khả thi và chi phí.

Frontend HTML/CSS/JavaScript hiện tại nhận kết quả tính thật từ API local.
Dữ liệu mẫu là SYNTHETIC; đây chưa phải hệ thống vận hành công nghiệp hoàn chỉnh.

## Xem demo trên Internet

Đã có `vercel.json`, `render.yaml`, `.env.vercel.example` và `.env.render.example`.
Vercel phục vụ frontend, Render Free chạy engine Python. Không cần API key model.
Làm theo [hướng dẫn deploy miễn phí từng bước](docs/DEPLOY_FREE.md).

## Chạy giao diện local

Python 3.11, từ thư mục gốc repository:

```console
python -m pip install -r requirements.txt
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8765
```

Mở **http://127.0.0.1:8765/**. Sau khi cài dependency, giao diện/engine/fixture
không cần Internet hoặc key OpenRouter. Dùng hồ sơ xưởng đã lưu, sửa bảng kế hoạch
hoặc dán từ Excel / mở CSV, rồi bấm Phân tích kế hoạch (tự kiểm tra/áp dụng). JSON giữ ở mục
nâng cao. Sửa input làm mất hiệu lực kết quả cũ. B2 hiện CHƯA CHẠY.

Kiểm thử: `python -m pip install -r requirements-dev.txt`, rồi
`python -m unittest discover -s backend/tests -v`, `node --check app.js` và
`node --test ops/input-model.test.cjs`.
QA trình duyệt Windows/Edge tùy chọn: cài requirements-browser.txt, giữ server
đang chạy và chạy `python ops/browser_smoke.py` (Edge headless/profile riêng).

Xem [hướng dẫn API, giới hạn và demo đầu cuối](docs/LOCAL_DEMO.md).
Xem [hồ sơ xưởng, nhập bảng và nghiên cứu thiết kế đầu vào](docs/INPUT_WORKSPACE.md).
Giao diện dùng lại thiết kế của nhóm, có sáu mục trái và luồng nhập một nút:
[phạm vi UI/UX và cách dùng](docs/UI_RESTORATION.md).

## Backend — B0/B1 với contract demo-3

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
B2 chưa chạy; frontend đã nối engine qua API local. Sau khi cài dependency, CLI và tests
không yêu cầu mạng.

Policy demo-3 dùng bounds công suất độc lập và review chi phí EXCLUDED để
quyết định. Khoản chưa biết trả MEASURE_FIRST; LOW/BASE/HIGH chỉ là minh họa.
Raw savings vẫn đối soát ledger; net bounds nằm riêng trong economic_assessment.

- [Contract demo-3: chi phí bị loại trừ và sai số công suất độc lập](docs/DEMO3_ECONOMIC_RISK.md)
- [Nền mô hình khuôn và duration theo lô](docs/DEMO2_DATA_CONTRACT.md)
- [Kiểm chứng lịch, số học và bằng chứng bước 2](docs/BASELINE_VERIFICATION.md)
- [B1, policy và bằng chứng bước 3](docs/B1_DECISION.md)
- [Lịch sử nhận diện điểm yếu và nâng cấp](docs/UPGRADE_HISTORY.md)
- [Định hướng sản phẩm](PRODUCT.md)

## OpenRouter và đánh giá có thể chạy lại

Điền key trong `.env` local theo mẫu `.env_example`:

```dotenv
OPENROUTER_API_KEY=
OPENROUTER_MODEL=google/gemma-4-26b-a4b-it:free
```

`.env` được Git bỏ qua. Client đánh giá phía backend đọc key từ file này hoặc
biến môi trường; không đưa key vào JS trình duyệt. Engine B0/B1/policy vẫn chạy
độc lập, không phụ thuộc API. Model trên là cấu hình do nhóm chọn.

```console
python -m backend.benchmark --output work/evaluation/engine.json
python -m backend.evaluate_openrouter --output work/evaluation/model.json
```

Lệnh thứ hai gọi API thật với 5 ca dữ liệu SYNTHETIC và lưu báo cáo đã loại
secret. Thêm `--limit 1` để smoke test hoặc `--free-router` để dùng openrouter/free
cho lượt đó, không sửa `.env`. Router chọn model khác nhau, nên đây là đánh giá
pipeline/router, không phải benchmark cố định một model. Không tự fallback trả phí.

Xem [kết quả đánh giá và giới hạn](docs/API_EVALUATION.md). Đây chưa phải tính
năng giải thích trên giao diện và không chứng minh độ chính xác tại nhà máy.
