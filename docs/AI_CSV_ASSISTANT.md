# Trợ lý CSV và báo cáo AI

Vào **Điều chuyển đơn hàng → Trợ lý CSV & báo cáo AI**.

## Cách dùng

1. Chọn CSV/TSV UTF-8, dán nội dung, hoặc lấy CSV từ đầu vào đã áp dụng.
2. **Kiểm tra CSV bằng quy tắc** chạy ở backend, không gửi dữ liệu tới dịch vụ AI. Kiểm tra tiêu đề, mã lô, dữ liệu thiếu, sản lượng, thời gian, mã trùng và ô có công thức bảng tính.
3. Nếu muốn dùng AI, đồng ý gửi dữ liệu và chọn **Phân tích CSV với AI**. Model đọc các ô và kết quả kiểm tra để viết nhận xét, đề xuất việc cần làm. AI không tự bổ sung số liệu sản xuất thiếu.
4. Duyệt từng ô trước/sau. Gợi ý tự động chỉ được chuẩn hóa bảo toàn giá trị. Muốn đổi giá trị nghiệp vụ, nhập thủ công và xác nhận nguồn đối chiếu.
5. **Áp dụng các ô đã duyệt vào bản sao** kiểm tra mã băm bản gốc, giá trị trước khi sửa, tọa độ và các ô trùng. File trên máy không bị ghi đè.
6. Tải CSV đã duyệt hoặc chuyển sang nhập liệu để ghép cột, nhận vào bản chuẩn bị, rồi phân tích kế hoạch. Các kiểm tra CSV không thay thế input gate, định mức máy hoặc verifier.

**Tính & viết báo cáo kế hoạch AI** dùng đầu vào đã chuẩn bị, tính lại bằng engine, rồi yêu cầu model diễn giải bằng chứng. Những trường quyết định, phương án, tiết kiệm và nguồn dữ liệu phải khớp bằng chứng; sai lệch bị chặn. Lời diễn giải vẫn cần người dùng rà soát, vì kiểm tra các trường cấu trúc không chứng minh mọi câu văn AI đều đúng.

Kết quả trễ bị bỏ khi CSV hoặc đầu vào tương ứng thay đổi. Báo cáo kế hoạch AI hết hiệu lực khi sửa đầu vào. Báo cáo CSV ghi rõ nhận xét AI áp dụng cho bản nào; sau sửa chỉ kiểm tra quy tắc cho tới khi chạy AI lại.

## Cấu hình OpenRouter

Tạo API key trong tài khoản OpenRouter và đặt ở `.env` tại thư mục gốc backend, hoặc biến môi trường của dịch vụ:

```dotenv
OPENROUTER_API_KEY=your_key_here
OPENROUTER_MODEL=openrouter/free
```

Không commit `.env`. Không đặt key trong JavaScript, CSV, biến public Vercel hoặc nội dung chat. Nếu key cũ nằm trong biến môi trường process, nó được ưu tiên hơn `.env`; cần cập nhật biến đó và khởi động lại backend.

Giao diện hỗ trợ `openrouter/free` và `google/gemma-4-26b-a4b-it:free`. Model được chọn từ danh sách cố định ở backend. Không tự đổi sang model trả phí hoặc gọi lại khi hết quota.

Backend đọc cấu hình khi gọi; thay `.env` có hiệu lực với lần gọi tiếp theo nếu không bị biến môi trường ghi đè. Reload trang để cập nhật trạng thái kết nối hiển thị.

- `401/403 AUTH`: key không hợp lệ, bị thu hồi hoặc không có quyền. Cần key hợp lệ, không phải lỗi thuật toán tối ưu.
- `429/RATE_LIMIT/DAILY_QUOTA`: hết quota hoặc giới hạn lượt gọi; chờ và thử lại chủ động.
- `INVALID_RESPONSE`: phản hồi model không đúng JSON/schema; không dùng phản hồi đó để sửa ô.
- `EVIDENCE_MISMATCH`: AI đổi bằng chứng tính toán; chặn diễn giải.

## Giới hạn

- CSV: 128 KiB, 500 dòng dữ liệu, 32 cột, 4096 ký tự mỗi ô. Không tự cắt dòng.
- Gửi AI: tối đa 100 dòng và 32 KiB; vượt giới hạn thì không gửi phần mẫu và vẫn kiểm tra toàn bộ bằng quy tắc.
- Tối đa 200 thông báo và 200 sửa đổi mỗi lượt; giao diện thông báo nếu đạt giới hạn.
- Engine demo: tối đa 8 lô, 3 máy, 48 giờ. Rà soát được CSV lớn hơn nhưng không có nghĩa engine nhận được toàn bộ.
- Ô có biểu thức spreadsheet cần sửa thành dữ liệu thuần trước khi xuất bản mới. Bản gốc không bị tự thay đổi.
- Cột ngoài mô hình được giữ khi xuất CSV nhưng không được tự coi là đầu vào tính toán.
- AI dùng dịch vụ bên ngoài; kiểm tra chính sách dữ liệu của provider trước khi gửi dữ liệu xưởng thật.

## Kết quả kiểm tra triển khai

Kiểm tra parser, tọa độ, nguồn/mã băm, sửa đổi đã duyệt, thay đổi thủ công, nguyên tắc không đoán giá trị, quyền truy cập route và sai lệch bằng chứng bằng bộ test backend. Kiểm tra tích hợp frontend riêng cho đọc file, duyệt ô, xuất CSV, chuyển sang nhập liệu và phản hồi cũ.

Lần gọi thực tế bằng CSV SYNTHETIC trong phiên triển khai nhận `HTTP 401 AUTH` từ OpenRouter. Chưa xác nhận sinh báo cáo AI thực tế thành công với key hiện có; cần thay key hợp lệ. Quy tắc kiểm tra và luồng sửa bản sao đã được kiểm tra độc lập với provider.
