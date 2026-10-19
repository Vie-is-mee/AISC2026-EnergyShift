# Trợ lý AI bước 2: CSV thô → rà soát → bảng kế hoạch

Ngày triển khai: 19/10/2026. Bước này chuẩn bị **bảng kế hoạch**, không phải tự
nội suy dữ liệu cảm biến hoặc tự điều khiển sản xuất. Giữ UI hiện tại và luồng
nhập thủ công. Dùng cùng key/model backend đã cấu hình ở bước 1.

## Cách dùng

1. **Điều chuyển đơn hàng** là tab đầu tiên và màn hình bắt đầu. Trong khối
   **1. Chọn hồ sơ xưởng**, mở hồ sơ đã lưu hoặc dùng dữ liệu mẫu. Hồ sơ cần có máy,
   định mức, lịch tham chiếu và giá; một CSV kế hoạch không tự tạo được hồ sơ xưởng.
2. Trong **2. Nhập lệnh sản xuất**, chọn **Tải CSV / TSV** hoặc **Dán từ Excel**.
   Chỉ hiện vùng nhập tương ứng; công cụ AI/thủ công xuất hiện khi đã đọc file
   hoặc có bảng dán. Chưa đọc trực tiếp XLSX. Có thể dùng
   [file minh họa](templates/ai_import_demo.csv) với hồ sơ mẫu 8 lô.
   Nếu dùng bảng mẫu hoặc tự nhập, chọn **Sửa bảng trực tiếp** rồi xuống bước 3;
   không cần gọi AI. Ghép cột thủ công nằm trong một mục thu gọn riêng.
3. Trong **Nhờ AI đọc bảng và đề xuất ghép cột**, mở ghi chú nếu cần, đọc và chọn đồng ý gửi
   dữ liệu. Bảng gốc cùng phần hồ sơ cần thiết được gửi qua OpenRouter: nguồn
   hồ sơ, khoảng lập lịch, mã định mức, sản lượng, release/due và máy tương thích.
   Không gửi thêm biểu giá/chi phí vào prompt ghép cột. Dữ liệu thực nhạy cảm cần
   được đơn vị sở hữu cho phép trước khi gửi tới nhà cung cấp.
4. Bấm **Nhờ AI ghép cột**. AI đề xuất ý nghĩa cho từng cột, chỉ ra ô nghi vấn
   và hỏi thông tin thiếu. Lý do/cảnh báo AI có thể sai, cần người dùng rà soát.
5. Kiểm tra/sửa các lựa chọn ghép cột rồi bấm **Cập nhật bản xem trước**. Mỗi
   trường chỉ được lấy từ một cột. Có thể chọn **Giữ kèm / ngoài mô hình**.
   Đổi mapping và cập nhật sẽ tạo lại bản xem trước, không giữ các ô vừa sửa ở
   bản xem trước cũ. Không mất file gốc.
6. Trong bảng xem trước, mỗi ô có giá trị gốc và ô nhập sẽ dùng. Xem gợi ý từ
   hồ sơ, nguồn và reference. Chỉ khi **bạn bấm Dùng hồ sơ** mới điền giá trị đó.
   Có thể tự nhập/sửa; không có mô hình tự đoán giá trị thiếu.
7. Đọc cột ngoài mô hình, câu hỏi/cảnh báo; chọn các xác nhận tương ứng. Sửa
   bất kỳ ô nào đều phải xác nhận rà soát lại. Ghi chú được lưu cùng quyết định.
8. Bấm **Duyệt và đưa vào bảng**. Backend kiểm tra lại mapping, số dòng, định
   mức, số lượng, máy, ngày giờ và data gate. Nếu chưa đạt, giữ nguyên kế hoạch
   và bản đề xuất chờ sửa; không tự chạy bằng dữ liệu cũ. Nút hiện trạng thái
   đang kiểm tra; lỗi xuất hiện ngay cạnh nút. Nếu nút chưa bật, dòng hướng dẫn
   bên trên chỉ rõ còn thiếu xác nhận nào.
9. Khi đạt, bảng được đưa vào **bản chuẩn bị**; chưa sửa input đang phân tích
   hoặc chạy solver. Rà soát chi phí rồi bấm **Phân tích kế hoạch** để kiểm tra
   và tính B0/B1/B2. Khi nhận thành công, màn hình chuyển đến **3. Rà soát bảng
   kế hoạch**, hiện số lô đã nhận và bảng mới. Bấm **Tiếp tục đến bước 4** để đến
   **4. Kiểm tra và phân tích**. Nút phân tích nằm trong bước này, không nổi đè
   lên vùng nhập. Lịch không khả thi vẫn bị verifier chặn như trước.
10. Tải bản ghi CSV và bản sao workspace/báo cáo cần giữ. Nút tải nguồn giữ
    nguyên văn file đã đọc; các sửa đổi nằm ở bản chuẩn bị và bản ghi rà soát.

Nếu mất phản hồi khi duyệt, dùng **Kiểm tra lại lượt** trước khi gửi thêm POST.
Nếu backend đã duyệt mà chưa đưa được vào bảng, bấm **Đưa bản đã duyệt vào bảng**;
chỉ được dùng khi nguồn, hồ sơ và bảng hiện tại vẫn đúng phiên bản.

Phần hỏi AI về tình huống sản xuất nằm trong mục tùy chọn ở bước 4. Thiết lập
xưởng, định mức, quản lý hồ sơ/JSON và nhóm demo được thu gọn phía dưới bốn bước;
không phải điền tất cả các mục này cho mỗi lần nhập kế hoạch.

## Chức năng AI và chương trình được phân chia rõ

| Công việc | Ai thực hiện? |
|---|---|
| Đọc quote, delimiter, encoding, số dòng/cột và kích thước | Parser, không dùng model |
| Đề xuất ý nghĩa cột và nghi vấn theo ngữ cảnh | API model thật, JSON Schema và kiểm tra đủ cột/tọa độ |
| Bỏ khoảng trắng quanh ô nhập | Quy tắc xác định, giữ giá trị gốc trong dấu vết |
| Đề xuất ô thiếu từ đúng hồ sơ | Chương trình tra cứu, người dùng chọn; không nhờ LLM tính số |
| Sửa và xác nhận dữ kiện | Người dùng; lưu riêng nguồn và kết quả sửa |
| Dựng snapshot và kiểm tra contract | Backend, trước khi chấp nhận dữ liệu |
| Kiểm chứng lịch/tính chi phí/chọn phương án | Engine sau khi người dùng chủ động phân tích |

Gợi ý hồ sơ chỉ gồm **mã định mức, số lượng, thời điểm sẵn sàng và hạn xong**,
khi xác định được template từ cột định mức hoặc mã lô khớp chính xác hồ sơ.
**Không tự điền máy hoặc giờ bắt đầu**, không tự ước lượng kW, thời lượng, đơn
giá, phí ngoài mô hình hoặc nội suy ngày mơ hồ. Đổi sản lượng vẫn cần cập nhật
định mức/thời lượng có xác nhận; không tự scale theo tỷ lệ.

Nếu đổi mã định mức trong ô nhập, cần tự rà soát lại các giá trị đã lấy từ hồ sơ.
Các gợi ý ở bản xem trước dựa trên mapping và nguồn lúc tạo bản xem trước, không
tự thay đổi theo mỗi ký tự đang sửa. Backend vẫn kiểm tra định mức và số lượng.

## Bảo toàn dữ liệu và giới hạn

- AI nhận tối đa **32 KiB, 8 dòng dữ liệu, 32 cột, 4096 ký tự/ô**. Nhập thủ công
  giữ giới hạn 128 KiB. Chưa đọc trực tiếp XLSX. Vượt giới hạn bị chặn, không cắt file.
- Không tự xóa dòng trống, dòng nghi vấn, hợp nhất trùng hoặc bỏ cột. File lỗi
  cú pháp/dòng trống/tiêu đề trùng phải được người dùng sửa trước khi gọi model.
- Giữ raw text, BOM/CRLF khi mở file UTF-8, delimiter, tiêu đề, mọi ô nguồn và
  hash nguồn. Khi dán từ clipboard, trình duyệt có thể đã chuẩn hóa xuống dòng;
  bản gốc khi đó là nội dung dán nhận được, không hứa khôi phục byte của file Excel.
- Cột không dùng được giữ cùng nguồn trong bản sao và `input_preparation` của
  báo cáo. Ví dụ ghi chú thiếu vật tư chưa trở thành ràng buộc solver ở bước này.
- Hồ sơ tham chiếu giữ nguyên toàn bộ danh mục chuyển đổi. Khi dựng snapshot
  cho ít lô hơn, chỉ giữ quy tắc có nhóm sản phẩm còn trong các lô hoặc trạng
  thái máy ban đầu; các quy tắc không còn tham chiếu được ghi riêng trong bản
  duyệt. Không nới lỏng verifier hoặc tự tạo phí/thời gian chuyển đổi mới.
- Hash yêu cầu gồm hồ sơ chuẩn hóa, hash nguyên văn bảng và ghi chú. Duyệt phải
  khớp phiên bản. UI chặn áp dụng khi nguồn/hồ sơ/bảng thay đổi; phản hồi cũ không
  ghi đè dữ liệu mới. Mỗi lượt chỉ được duyệt một lần; không có đường dùng cổng
  “xác nhận cách hiểu” của bước 1 để bỏ qua cổng dữ liệu CSV.
- Khi tạo kế hoạch mới, review chi phí bị đưa về UNKNOWN đến khi được rà soát
  lại. Nhãn SYNTHETIC/nguồn hồ sơ giữ nguyên; chọn gợi ý không biến thành đo thực.
- Bản ghi ghi nhận giá trị gốc, giá trị duyệt, cột/dòng và phân loại thay đổi:
  `CSV_TRIMMED`, `USER_CONFIRMED_PROFILE` hoặc `HUMAN_EDIT`. Phân loại hồ sơ dựa
  trên khớp giá trị gợi ý, không chứng minh người dùng đã bấm một nút cụ thể.
- Sau khi sửa bảng tiếp, bằng chứng nhập vẫn là lịch sử của lần nhập, không
  tự phê duyệt các lần sửa sau. Hash snapshot đã chuẩn bị giúp nhận ra khác biệt.
- Dùng chung hàng đợi/quota/SQLite và phiên capability của trợ lý bước 1. Tối
  đa 50 lượt gần nhất/7 ngày, có thể mất sớm hơn trên host free. Không phải quyền
  kỹ sư/quản đốc đã xác thực hoặc audit log chống sửa đổi. Tải bản ghi quan trọng.

## Kiểm thử và bằng chứng

```console
python -m unittest backend.tests.test_assistant_csv -v
node --test ops/ai-csv-view.test.cjs
python ops/cloud_smoke.py --csv-live --env-file PATH_TO_ENV --assistant-model openrouter/free --planning-tabs
```

Các test thường dùng client giả, không chứng minh gọi model thật. Tùy chọn
`--csv-live` gọi một lượt model thật, upload file BOM/CRLF giả lập, duyệt/sửa,
thử sai sản lượng, nhập vào workspace và đối chiếu hash với báo cáo engine.
Artifact live lưu tại `docs/evaluation/ai_csv_live_smoke.json` khi thành công;
lỗi provider được lưu riêng. Không sửa `.env`, không tự retry/fallback trả phí.
Một ví dụ live không phải benchmark độ chính xác ghép cột hoặc kiểm chứng xưởng.

## Bước tiếp

Chuyển ghi chú hiện trường thành ràng buộc được solver và verifier hỗ trợ, kèm
cổng duyệt phạm vi. Bước 2 chưa điều phối thử lịch bằng AI hoặc tự đoán dữ kiện
vận hành từ một file chưa đủ bằng chứng.
