# EnergyShift VN

Hỗ trợ quyết định điều chỉnh lịch sản xuất dựa trên tính khả thi và chi phí.

Frontend HTML/CSS/JavaScript hiện tại là demo minh họa dùng kịch bản khai báo
sẵn. Backend mới đang được xây theo từng bước; chưa phải hệ thống tối ưu hoàn chỉnh.

## Backend — bước 1

Python 3.11, chạy từ thư mục gốc repository:

```console
python -m pip install -r requirements.txt
python -m backend backend/fixtures/editable_cell.json
python -m unittest discover -s backend/tests -v
```

CLI kiểm tra dữ liệu, trả READY hoặc lỗi có hướng dẫn sửa; chưa tính chi phí
hay chứng nhận lịch. Dữ liệu mẫu hoàn toàn SYNTHETIC. Sau khi cài dependency,
CLI và tests không yêu cầu mạng.

- [Contract dữ liệu và giới hạn](docs/DEMO_DATA_CONTRACT.md)
- [Lịch sử nhận diện điểm yếu và nâng cấp](docs/UPGRADE_HISTORY.md)
- [Định hướng sản phẩm](PRODUCT.md)
