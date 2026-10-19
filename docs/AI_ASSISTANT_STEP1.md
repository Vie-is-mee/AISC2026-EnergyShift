# Trợ lý AI - bước 1: hiểu yêu cầu và người dùng rà soát

Ngày triển khai: 19/10/2026. Đây là bước đầu của hướng trợ lý xử lý thay đổi kế
hoạch. Chưa triển khai tự làm sạch CSV, điền khuyết hoặc điều phối solver.

## Cách dùng

1. Mở **Điều chuyển đơn hàng**. Chọn hồ sơ/mẫu và kiểm tra bảng kế hoạch.
2. Trong **Trợ lý AI · Bước 1**, mô tả tình huống cần xử lý bằng tiếng Việt.
3. Đọc và chọn đồng ý gửi kế hoạch cùng mô tả tới model qua OpenRouter. Dữ liệu
   được gửi là toàn bộ snapshot kế hoạch đã kiểm tra; không chỉ mô tả. Không dùng
   thông tin nhà máy nhạy cảm khi chưa thống nhất việc gửi tới nhà cung cấp.
4. Bấm **Nhờ AI xem yêu cầu**. Nếu bảng đổi, hệ thống kiểm tra/áp dụng bảng trước.
   Theo dõi trạng thái chờ, gọi model, lỗi hoặc chờ bạn rà soát.
5. Đọc cách hiểu, nhận xét gắn mã lô, câu hỏi và các bước AI đề nghị. Nhãn nguồn
   trong nhận xét là khai báo model, không phải kiểm chứng tự động tính đúng.
6. Sửa nội dung xác nhận nếu cần; tick đã rà soát rồi xác nhận hoặc từ chối.
   Nếu còn câu hỏi, bổ sung mô tả và gửi lại. Xác nhận cách hiểu vẫn có thể ghi
   nhận nhu cầu hỏi thêm; không nghĩa là câu hỏi đã được giải quyết.
7. Tải bản ghi rà soát. Mở dấu vết để xem trạng thái API, model, mã provider,
   token nếu có, độ trễ và hai hash. Không có số liệu usage nghĩa là provider
   không trả số liệu, không được hiểu là đã sử dụng 0 token.

Luồng **Phân tích kế hoạch** vẫn chạy engine riêng. Bấm nút đó không gọi model.
Chưa có đường từ câu trả lời AI tới sửa dataset, áp dụng ràng buộc, chọn B1/B2
hoặc điều khiển máy. Nội dung AI là đề xuất cần con người rà soát.

## Phiên bản, quyền dừng và lưu lại

- Backend tạo input_hash từ snapshot chuẩn hóa, request_hash từ input_hash và
  nội dung yêu cầu. Chỉ duyệt khi AWAITING_REVIEW, hai hash khớp và người dùng
  gửi xác nhận rõ ràng. Không được duyệt hai lần hay duyệt lượt lỗi/chưa xong.
- Sửa kế hoạch/mô tả hoặc bỏ đồng ý sẽ ẩn/vô hiệu hóa kết quả trên màn hình.
  Bản ghi cũ nếu đã duyệt vẫn là lịch sử của phiên bản cũ; không đổi dữ liệu mới.
  Chạy phân tích engine cũng có thể làm sạch trạng thái trợ lý trên màn hình.
- Dừng ngăn nhận kết quả về lượt đó. HTTP tới provider đã bắt đầu có thể tiếp
  tục và tiêu tốn quota; phản hồi đến muộn bị bỏ. Không tự retry POST hoặc đổi model.
- Phiên trợ lý tách khỏi phiên hàng đợi engine. Capability trong sessionStorage;
  chỉ lưu hash token trong SQLite. Ai có token có thể dùng phiên; chưa xác thực
  danh tính/role. Đóng phiên, xóa dữ liệu trình duyệt hoặc host free mất ổ đĩa có
  thể mất truy cập. Không dùng bản ghi này như chữ ký hay audit chống sửa đổi.
- Nút mở lượt gần nhất chỉ phục hồi khi kế hoạch/mô tả vẫn khớp. Reload không tự
  gọi model; cần nhập lại đúng mô tả nếu muốn mở lượt cũ. Nếu mất phản hồi POST
  trước khi nhận được ID, có thể chưa mở lại được lượt đó bằng UI. Đợi lượt cũ
  kết thúc trước khi gửi lại; không tự gửi liên tiếp.
- Giữ tối đa 50 lượt gần nhất toàn dịch vụ, tối đa 7 ngày. Có thể mất sớm hơn;
  tải các bản ghi quan trọng. Không có cam kết lưu bền trên Render Free.

## Cấu hình backend

Điền các biến sau trong môi trường Render, không đặt trên Vercel hoặc JS:

```dotenv
OPENROUTER_API_KEY=<key riêng của nhóm>
OPENROUTER_MODEL=<model nhóm chọn>
ENERGYSHIFT_TEAM_DEMO_ENABLED=1
```

Local đọc `.env` tại gốc repo; biến môi trường có ưu tiên cao hơn. Mẫu nằm trong
`.env_example` và `.env.render.example`. `.env` ở máy cá nhân không tự được deploy
lên Render. Chỉ một process/worker. Trợ lý dùng chung file SQLite với nhóm demo;
đổi ENERGYSHIFT_TEAM_DB đổi cả kho trợ lý. Engine vẫn dùng được khi thiếu key.

Giới hạn bước 1: snapshot gửi model tối đa 64 KiB, mô tả 4.000 ký tự; một worker AI, tối đa 3 lượt đang xử lý/chờ toàn service; một
lượt hoạt động mỗi phiên; chặn sau 30 bản ghi trong 24 giờ/phiên (bị giới hạn bởi
chính sách dọn lịch sử). Ngân sách nội bộ tối đa 1.000 lần gọi/ngày UTC, 10/phút;
đếm cả lần lỗi đã gửi. Quota thực của provider có thể thấp hơn. Timeout client
75 giây; không đảm bảo thời gian phản hồi tổng hoặc dừng ngay request mạng.

AI chỉ trả JSON theo contract, không chạy mã hay gọi công cụ. Schema và mã lô
được kiểm tra; nội dung ngôn ngữ vẫn có thể sai. Key không vào prompt, report,
artifact frontend hoặc log; phản hồi có chứa key bị loại thay vì lưu.

## Kiểm tra

Tests thường dùng client giả, không gọi API và không chứng minh chất lượng model.
Kiểm thử live phải được chạy chủ động và chỉ dùng dữ liệu SYNTHETIC:

```console
python -m unittest backend.tests.test_assistant -v
python ops/cloud_smoke.py --assistant-live --env-file PATH_TO_LOCAL_ENV
```

Script live gọi một lượt model trong trình duyệt thật. Evidence thành công lưu
`docs/evaluation/assistant_live_smoke.json`, không lưu key hoặc raw reasoning.
Một lượt thành công chỉ chứng minh nối API và cổng rà soát, không phải benchmark
độ chính xác, tính khả thi của lời AI hoặc hiệu quả tại xưởng.

Trong lần kiểm tra triển khai, model cấu hình gặp HTTP 429. Lượt thử bằng
`--assistant-model openrouter/free` đã trả lời và hoàn tất cổng rà soát trên Edge.
Đây là override riêng của script kiểm thử, không sửa `.env`, không phải tự
fallback trong sản phẩm và không chứng minh model cấu hình đã phục vụ thành công.
Một lượt router trước đó bị cắt đầu ra ở budget 1.500 token; client intake đã
tách budget tối đa 6.000 token (gồm reasoning nếu có), không ép tắt reasoning
vì một số endpoint bắt buộc. Yêu cầu JSON Schema và endpoint hỗ trợ; vẫn kiểm tra
schema ở backend, không tự chữa số liệu khi JSON sai. Không lưu reasoning.
Tham khảo [ngữ nghĩa reasoning/budget OpenRouter](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens).

## Bước tiếp theo

Thêm khảo sát CSV và đề xuất biến đổi có nguồn, bản so sánh trước/sau, cổng duyệt
dữ liệu; sau đó bổ sung ràng buộc và công cụ solver để AI tổ chức thử kịch bản.
Cổng duyệt phạm vi và lịch cuối chưa được triển khai trong bước 1.
