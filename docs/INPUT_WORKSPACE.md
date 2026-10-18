# Đầu vào thuận tiện, giữ nguyên bằng chứng

Ngày nghiên cứu/triển khai: 18/10/2026. Đây là lớp chuẩn bị dữ liệu cho engine
demo-3, không thay schema hoặc nới lỏng verifier/cost/risk policy.

## Nghiên cứu từ các dự án đang có

Chỉ dùng tài liệu chính thức, không coi quảng cáo là bằng chứng hiệu quả tại xưởng.

| Dự án / nguồn | Cách làm được mô tả | Áp dụng tại EnergyShift |
|---|---|---|
| [Odoo Work centers](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/advanced_configuration/using_work_centers.html) | Hồ sơ work center và giờ làm việc cấu hình riêng | Nhớ hồ sơ máy/lịch sẵn sàng, không nhập lại mỗi lô |
| [ERPNext Routing](https://docs.frappe.io/erpnext/routing) | Routing tái sử dụng operation, thời gian, batch size và workstation | Thư viện định mức theo lô/máy, giữ quantity/duration và nguồn xác nhận |
| [frePPLe Importing data](https://frepple.com/docs/current/user-interface/getting-around/importing-data.html) | Nhập CSV/Excel, dòng tiêu đề, báo lỗi; có thể xuất mẫu để nhập lại | Dán Excel/CSV/TSV, tải CSV mẫu, xem trước và ghép cột |

Đây là lựa chọn thiết kế suy ra từ các nguồn, không phải tích hợp hoặc sao chép code
của ba sản phẩm. Không tuyên bố tính năng mới độc quyền trên thị trường.

## Luồng mới

1. Bắt đầu với bộ mẫu SYNTHETIC hoặc JSON demo-3 đã chuẩn bị. Chưa tạo kết luận.
2. Đặt tên và lưu hồ sơ trên trình duyệt. Hồ sơ gồm toàn bộ dữ liệu tham chiếu:
   máy, khuôn, setup, availability, tariff, policy, định mức và lịch gốc tham chiếu.
3. Mỗi lần dùng, chọn hồ sơ → sửa bảng kế hoạch hoặc dán bảng Excel / mở CSV/TSV.
4. Kiểm tra ghép cột và dữ liệu xem trước. Các tên cột tiếng Việt/Anh quen thuộc
   được gợi ý bằng luật xác định. Cấu hình ghép được nhớ theo đúng dãy tiêu đề.
5. Bổ sung những chỗ thiếu/sai được nêu. Bấm **Phân tích kế hoạch**: bảng đã sửa
   được tự kiểm tra và áp dụng trước khi tính, không phải bấm hai nút.
6. Data gate kiểm tra schema và consistency; sau khi READY, verifier/costing/B1
   thực sự chạy. Nút chỉ kiểm tra/áp dụng thủ công giữ trong Thiết lập nâng cao.
7. Xuất báo cáo: cùng input hash, snapshot và bằng chứng chuẩn bị nếu dùng bảng.

Các trường mỗi lô: mã lô, mã định mức, số lượng, máy B0, bắt đầu, sẵn sàng từ,
hạn xong. Dùng mã lô mới vẫn lấy đúng định mức và provenance cũ; không đồng nhất
mã định mức với mã sản phẩm đã được xác nhận ngoài thực tế. Trong bước này,
mã định mức lấy từ job ID của hồ sơ tham chiếu, chưa có product master riêng.

## Bộ nhớ và chỉnh sửa

- **Hồ sơ**: tối đa 5 tên trên cùng browser/origin; lưu/cập nhật theo tên bằng nút.
  Không phải database đa người dùng, không tự đồng bộ qua máy khác/cổng khác.
- **Bản nháp**: tự lưu bảng và hồ sơ đã cập nhật sau 350 ms khi sửa. Có nút khôi
  phục và xóa; reload không tự áp dụng nháp hoặc phục hồi quyết định cũ. Những ô
  thiết lập/định mức đang sửa cần bấm cập nhật trước để được đưa vào bản lưu.
- **Bản sao JSON**: tải đầy đủ base, rows, bảng nhập gốc/cột ngoài mô hình và
  applied_input. Khôi phục sẽ kiểm tra phiên bản/base rồi yêu cầu áp dụng mới.
  applied_input chỉ là bản tham khảo, không tự kích hoạt hoặc phục hồi report.
- Chỉnh máy: các khoảng availability, khuôn/family ban đầu, thời gian/phí đổi khuôn,
  nguồn và reference. Chỉnh biểu giá theo từng khoảng có sẵn. Chỉnh review EXCLUDED.
  Thêm máy/khuôn, sửa số khoảng tariff và transition nâng cao vẫn dùng JSON.
- Chỉnh định mức: quantity và duration của mọi máy tương thích, kW, nguồn công suất,
  sai số riêng, nguồn và reference xác nhận lô mới. Không tự scale thời lượng.
- Khi browser chặn storage/hết quota, có cảnh báo; chuẩn bị/phân tích vẫn dùng được.
  Bản nháp không lưu API key, kết quả hoặc dữ liệu .env. Dữ liệu sản xuất được lưu
  local trên máy dùng chung cũng có thể bị người cùng browser đọc; có nút xóa/tải bản sao.

## Không đánh đổi tính đúng để nhập ít hơn

- Bảng có chỉnh sửa chưa áp dụng sẽ chặn chạy đầu vào cũ. Mọi chỉnh sửa chuẩn bị
  làm ẩn kết quả cũ. JSON nâng cao sửa trực tiếp làm bảng bị đánh dấu cũ và bỏ trace.
- Sản lượng khác định mức: chặn, chỉ rõ lô và yêu cầu cập nhật thời lượng/xác nhận.
  Không giả lập cycle model, không tạo xác nhận đo thực từ dữ liệu nhập.
- Chi phí EXCLUDED mặc định chuyển UNKNOWN khi áp dụng kế hoạch. Muốn giữ bounds
  phải xem bảng và xác nhận lại phạm vi **mọi single-job moves**. Xác nhận không
  biến UNKNOWN thành 0, không biến SYNTHETIC thành MEASURED.
- Dời ngày yêu cầu xác nhận lịch máy/giá/trạng thái khuôn, dịch tất cả timestamps
  cùng số ngày. Giữ nguyên đơn giá và trạng thái, không tự xử lý ngày lễ hoặc đổi tariff.
- CSV có ô quote/dấu phân cách/newline được giữ; trùng tiêu đề, thiếu cột, dòng
  ragged, ngày mơ hồ, vượt giới hạn bị chặn. Không tự cắt bớt các lô quá giới hạn.
- Cột chưa ghép phải được xác nhận rõ: giữ nguyên bảng/raw text trong backup và
  report.input_preparation.import_source, nhưng **không được engine mô hình hóa**.
  Ví dụ cột “nhiệt độ khuôn” hoặc “nguyên liệu thiếu” cần đánh giá ràng buộc trước
  khi áp dụng kết quả tại xưởng. Lưu cột không có nghĩa là đã kiểm tra ràng buộc.
- Evidence chuẩn bị là khai báo browser/user, không phải log audit chống sửa đổi.
  Chi phí/quyết định vẫn do engine tính, không do JS input layer hoặc LLM chấm.

## Giới hạn và bước tiếp

Giữ max 8 lô, 3 máy, 48h, budget 2000 candidates. Bảng max 128 KiB, 32 cột,
4096 ký tự/ô; JSON snapshot max 512 KiB. UTF-8; ngày giờ YYYY-MM-DD HH:mm (+07:00).
Chưa đọc trực tiếp XLSX: dùng copy/paste vùng bảng từ Excel hoặc CSV UTF-8/TSV.
Không có ERP/MES sync, OCR, AI mapping, cycle/yield model hoặc overtime engine.
Lần thiết lập xưởng mới hoàn toàn vẫn cần chuẩn hóa danh mục/transition qua JSON;
luồng bảng giảm nhập lặp sau khi đã có hồ sơ. Chưa đo thời gian onboarding với kỹ sư
thực, không tự công bố phần trăm giảm thao tác/thời gian.

Hướng tiếp có dữ liệu kiểm chứng: thử với bảng kế hoạch ẩn danh của kỹ sư, quan sát
thời gian/ô cần sửa; bổ sung product master và XLSX khi có mẫu thật. API model có
thể đề xuất ghép cột sau này, nhưng cần xác nhận và cùng data gate; bản này không
gọi OpenRouter hoặc đưa dữ liệu nhà máy lên dịch vụ bên ngoài.

## Kiểm thử

`node --test ops/input-model.test.cjs`: 18 tests bảo toàn dữ liệu, provenance,
quantity lock, mapping, CSV, datetime và dời ngày. Python: 138 tests, gồm validate
endpoint không search, cùng guards. CI chạy Python, syntax và Node tests.

`python ops/browser_smoke.py`: Edge profile kiểm thử riêng; hồ sơ, nháp qua reload,
ghép cột nhớ lại, bảng gốc/cột dư, xác nhận quantity, UNKNOWN costs → MEASURE_FIRST,
matching hash, date shift, structured workshop, storage denied và mobile; kèm các
luồng regression UI cũ. Artifact: evaluation/live_ui_qa.json; ảnh trong work/ui-qa.
