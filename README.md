# EnergyShift VN

Hỗ trợ quyết định điều chỉnh lịch sản xuất dựa trên tính khả thi và chi phí.

Frontend HTML/CSS/JavaScript hiện tại là demo minh họa dùng kịch bản khai báo
sẵn. Backend mới đang được xây theo từng bước; chưa phải hệ thống tối ưu hoàn chỉnh.

## Backend — bước 2

Python 3.11, chạy từ thư mục gốc repository:

```console
python -m pip install -r requirements.txt
python -m backend backend/fixtures/editable_cell.json
python -m backend backend/fixtures/editable_cell.json --baseline
python -m unittest discover -s backend/tests -v
```

CLI mặc định kiểm tra dữ liệu. Thêm `--baseline` để kiểm chứng và tính lại B0
từ job/máy/thời gian/biểu giá/setup. Lịch FAIL hoặc UNKNOWN không được xuất
chi phí. Dữ liệu mẫu hoàn toàn SYNTHETIC; phạm vi tính chỉ gồm điện chạy job
và setup, chưa có B1/B2 hay khuyến nghị đổi lịch. Sau khi cài dependency,
CLI và tests không yêu cầu mạng.

- [Contract dữ liệu và giới hạn](docs/DEMO_DATA_CONTRACT.md)
- [Kiểm chứng lịch, số học và bằng chứng bước 2](docs/BASELINE_VERIFICATION.md)
- [Lịch sử nhận diện điểm yếu và nâng cấp](docs/UPGRADE_HISTORY.md)
- [Định hướng sản phẩm](PRODUCT.md)
