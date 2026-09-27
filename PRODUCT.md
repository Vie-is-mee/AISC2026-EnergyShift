# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: HTML5, modern Vanilla CSS with design tokens, and modular Vanilla JavaScript. Zero runtime friction, native browser performance, responsive industrial layout.

## Users

1. **Người lập kế hoạch sản xuất (Production Planner)**: Chịu trách nhiệm lập kế hoạch chạy máy hàng ngày/tuần, điều phối máy và khuôn, cân đối ca làm việc, giảm thời gian chuyển đổi dây chuyền và đảm bảo giao hàng đúng hạn.
2. **Quản lý xưởng / Giám đốc sản xuất (Plant Manager / Operations Director)**: Cần bằng chứng kinh tế và độ tin cậy vận hành trước khi phê duyệt thay đổi lịch sản xuất; không chấp nhận rủi ro trễ đơn hoặc xung đột máy móc.
3. **Kỹ sư quản lý năng lượng (Energy / Sustainability Officer)**: Theo dõi mức tiêu thụ điện năng (kWh), biểu giá điện theo giờ (TOU), giảm phát thải CO2 và tối ưu hóa chi phí điện nhà máy.

## Product Purpose

Trả lời câu hỏi duy nhất và quan trọng nhất của người lập kế hoạch vào mỗi đầu tuần:
> **“Lịch sản xuất tuần này có đáng đổi để giảm tổng chi phí vận hành không?”**

EnergyShift VN không phải là một công cụ bán thuật toán tối ưu hộp đen hay phần mềm thay thế ERP/MES. Hệ thống là một giải pháp hỗ trợ ra quyết định dựa trên bằng chứng dữ liệu thực tế, cung cấp 4 kết luận minh bạch:
1. **THAY ĐỔI LỊCH**: Khi phương án mới vừa chạy được ngoài xưởng (đạt 5/5 ràng buộc) vừa giảm tổng chi phí sau khi tính đủ tiền điện và chi phí phát sinh.
2. **GIỮ LỊCH HIỆN TẠI**: Khi chi phí phát sinh (chuyển đổi, làm thêm giờ) lớn hơn số tiền điện tiết kiệm được.
3. **DÙNG QUY TẮC ĐƠN GIẢN**: Khi một thay đổi đơn lẻ (B1) đã mang lại phần lớn lợi ích so với phương án phối hợp phức tạp (B2).
4. **ĐO THÊM TRƯỚC KHI QUYẾT ĐỊNH**: Khi số liệu chưa chắc chắn khiến kết luận bị đảo chiều giữa các kịch bản Thấp / Cơ sở / Cao.

## Positioning

Khác biệt hoàn toàn với các phần mềm APS (Advanced Planning & Scheduling) hay giám sát năng lượng truyền thống:
- **Bắt đầu từ Lịch hiện tại (B0)** làm mốc chuẩn đối chứng, không ép nhà máy đổi theo một lịch lý thuyết.
- **Thử quy tắc đơn giản (B1) trước**, chỉ dùng giải pháp phối hợp phức tạp (B2) nếu chứng minh được giá trị tăng thêm vượt trội.
- **Bộ kiểm tra độc lập (Independent Validation)**: Tách rời bộ tìm phương án và bộ kiểm tra ràng buộc vật lý, triệt tiêu nguy cơ thuật toán tự chứng nhận kết quả sai.
- **Hạch toán Tổng chi phí vận hành (Total Operating Cost)**: Tính đầy đủ Tiền điện (theo biểu giá 3 khung giờ EVN) + Chi phí chuyển đổi khuôn + Làm thêm giờ + Phạt trễ hạn, ngăn chặn tình trạng "tiết kiệm điện nhưng lỗ tổng chi phí".
- **Không bao giờ tạo chi phí thấp bằng cách bỏ đơn hàng hay trễ hạn**: Ràng buộc giao hàng và sản lượng là tuyệt đối.

## Operating Context

- Môi trường: Nhà máy sản xuất ép phun nhựa (injection moulding) và sản xuất theo lô tại Việt Nam.
- Nguồn dữ liệu tích hợp: Tệp kế hoạch Excel/CSV, trích xuất ERP (SAP/Odoo), MES, nhật ký máy ép phun và dữ liệu công tơ điện tử đo đếm thời gian thực.
- Quy chuẩn pháp lý: Biểu giá điện theo thời gian trong ngày (TOU) cho sản xuất công nghiệp theo Quyết định 1279/QĐ-BCT và thông tư EVN (Giờ thấp điểm: 1.190 đ/kWh, Giờ bình thường: 1.833 đ/kWh, Giờ cao điểm: 3.398 đ/kWh).
- Chu kỳ sử dụng: Mỗi thứ Sáu hoặc đầu tuần mới khi chốt lịch sản xuất cho tuần kế tiếp.

## Capabilities and Constraints

### Capabilities
- **Tái dựng lịch hiện tại (B0)** và tính chuẩn xác chi phí gốc.
- **Tạo và so sánh 3 phương án (B0 vs B1 vs B2)** với biểu đồ Gantt trực quan chia theo máy và khung giờ điện EVN.
- **Kiểm định 5 ràng buộc bắt buộc (5 Physical Constraints)**:
  1. Đủ sản lượng (100% đơn hàng, không bỏ sót).
  2. Đúng hạn hoàn thành (100% on-time delivery).
  3. Đúng máy & khuôn (chỉ dùng các cặp máy - khuôn đã xác nhận kỹ thuật).
  4. Không chồng lịch (không overlap trên cùng một máy).
  5. Đủ thời gian chuyển đổi khuôn (đảm bảo setup time giữa các lô).
- **Phân tích độ nhạy 3 kịch bản (THẤP / CƠ SỞ / CAO)** khi dữ liệu công suất chưa chắc chắn.
- **Chỉ định điểm đo cần thiết**: Nếu kết luận chưa chắc, chỉ rõ cần lắp công tơ hoặc đo đếm ở máy nào, công việc nào.
- **Gắn nhãn mức độ tin cậy dữ liệu**: Đo trực tiếp, Dữ liệu gốc ERP, Nhà máy xác nhận, Ước tính kiểm chứng, Suy ra gián tiếp.

### Constraints
- Phiên bản đầu tiên tập trung hỗ trợ ra quyết định cho một cụm sản xuất trong 1 tuần, không tự động điều khiển máy móc (no machine actuation).
- Tuyệt đối không quy đổi việc giao hàng trễ thành tiền để "tối ưu" đánh đổi; giao hàng trễ là vi phạm ràng buộc loại trừ ngay lập tức.

## Brand Commitments

- Tên sản phẩm: **EnergyShift VN**
- Khẩu hiệu: *Hệ thống hỗ trợ quyết định điều chỉnh lịch sản xuất nhằm giảm tổng chi phí vận hành*
- Tông giọng: Khách quan, thận trọng, dựa trên bằng chứng dữ liệu, minh bạch kỹ thuật, chuẩn công nghiệp sản xuất.
- Bảng màu: Gam màu sáng (Light Theme) theo phong cách Siemens Energy Manager PRO và hệ thống MES công nghiệp hiện đại: nền xám sáng trung tính (slate-50 / white), xanh ngọc năng lượng (emerald/green), xanh công nghiệp (slate/blue), hổ phách cảnh báo (amber), tím phối hợp (violet).

## Evidence on Hand

- Văn bản đề xuất dự án hoàn chỉnh: `EnergyShift_Proposal_DeHieu_ChuyenSau_V2.md`
- Sơ đồ quy trình và triết lý sản phẩm: `image.png`, `image-1.png`, `image-2.png`, `image-3.png`, `image-4.png`, `image-5.png`
- Giao diện mẫu tham chiếu: `UI Template/UI1.webp`, `UI Template/UI2.webp`, `UI Template/UI3.webp`
- Bằng chứng thực tế biểu giá EVN QĐ 1279/QĐ-BCT và case study nhà máy ép phun Seawin Industrial (khuôn 8 lòng vòi xịt tinh chất chạy trên máy 160T hoặc 200T).

## Product Principles

1. **Bằng chứng trước hành động (Evidence-First Decision)**: Không khuyến nghị thay đổi nếu không có đủ số liệu chứng minh tổng chi phí vận hành giảm ròng.
2. **Tôn trọng thực tế xưởng (Shopfloor Reality Above Theory)**: Một lịch rẻ trên lý thuyết nhưng không khả thi ngoài thực địa là lịch vô giá trị.
3. **Đơn giản hóa trước khi phức tạp hóa (Simplicity Before Complexity)**: Ưu tiên B1 nếu B2 không tạo ra lợi ích cách biệt.
4. **Minh bạch và dám từ chối (Honest Ambiguity)**: Trả về kết luận "Đo thêm" hoặc "Giữ nguyên" một cách dứt khoát khi dữ liệu chưa đủ chắc chắn.
