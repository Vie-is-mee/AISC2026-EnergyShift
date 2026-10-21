# ENERGYSHIFT — LỘ TRÌNH ĐA NGÀNH, CÓ GIỚI HẠN KIỂM CHỨNG

**Ngày lập:** 19/10/2026 · **Mục tiêu gần:** AISC'26 Vòng 2 · **Mục tiêu dài hạn:** trợ lý lập lịch sản xuất đa ngành có kiểm tra ràng buộc.
**Phạm vi đã triển khai ở bản này:** một trường ngữ cảnh cơ sở/ngành cho AI đọc yêu cầu và đọc CSV; dấu vết/ngăn dùng nhầm giữa các ngữ cảnh; GIỮ NGUYÊN bộ giải và verifier hiện hành.

## 1. Nguyên tắc sản phẩm

EnergyShift giúp doanh nghiệp biến dữ liệu vận hành thành quyết định điều chỉnh lịch có bằng chứng. Mỗi trường hợp có:
- Công việc, nguồn lực, khoảng thời gian, mục tiêu và điều kiện.
- Phân tích dữ liệu và bối cảnh, chuẩn hóa có người duyệt.
- Phương án B0 (gốc) / B1 (thay đổi đơn giản) / B2 (phối hợp), kiểm chứng độc lập và chi phí.
- Quyết định đổi, giữ hoặc đo thêm, có dấu vết nguồn và giới hạn.

**AI hiểu ngôn ngữ không có quyền tự phát minh năng lực bộ giải.** Trường ngữ cảnh là lời khai người dùng, không phải xác nhận kỹ thuật, không được nhét vào snapshot solver.
**Tổng chi phí đang mô hình hóa** gồm điện chạy máy và chuyển đổi. Chi phí nhân sự, điện chờ, nguyên vật liệu, nhiều công đoạn... phải ghi rõ nếu ngoài phạm vi.

## 2. Sơ đồ kiến trúc mục tiêu

```
Thông tin ngành/cơ sở (lời khai) + file + hồ sơ kỹ thuật
                 |
[Parser xác định] + [AI ghép ngữ nghĩa, hỏi lại] -> Người dùng DUYỆT dữ liệu
                 |
        [Schema lõi phiên bản]
      Job / Resource / Window / Process / Tariff / Rules
                 |
  [Registry điều kiện đã hỗ trợ, compiler + verifier]
                 |
[Người dùng DUYỆT phạm vi/thứ được phép thay đổi]
                 |
[B0 / B1 / B2 và chi phí + hậu kiểm độc lập]
                 |
[Dữ liệu phân tích -> insight -> kịch bản/giải thích AI]
                 |
       [Người dùng CHỌN kết quả]
```

**Không coi AI tự động biết đầy đủ năng lực từng nhà máy.** Phải hỏi kỹ sư về nguồn lực, thao tác, lịch ca, tiền điện, ràng buộc đặc thù.

## 3. Trạng thái phiên bản gốc & nâng cấp hiện tại

### Đã có trước khi nâng cấp
- CSV/TSV, hồ sơ, yêu cầu AI; người dùng xác nhận; B0/B1/B2; hậu kiểm; giới hạn 8 lô, 3 máy, 48 giờ.
- Job bắt buộc có `mold_id`, tham chiếu tới một khuôn vật lý; mỗi job chạy không gián đoạn trên một máy.
- Miền B2 giới hạn, không chứng minh tối ưu toàn bộ lịch nhà máy.
- Lõi tính chi phí chạy máy + chuyển đổi, chi phí loại trừ phải rà soát.

### Bản vá đa ngành tương thích đã bổ sung
- Một ô **Ngữ cảnh cơ sở/ngành sản xuất** (tùy chọn, tối đa 1200 ký tự) trong Bước 1.
- Cả hai tuyến gọi model AI nhận `work_context`; model nhận thêm `solver_scope` công khai về phạm vi hỗ trợ và chưa hỗ trợ.
- Backend kiểm tra độ dài, lưu ngữ cảnh trong bản ghi yêu cầu và đưa nó vào `request_hash`, không đưa vào `input_hash` hay snapshot của solver.
- Đổi ngữ cảnh làm vô hiệu kết quả AI trên giao diện; mở lại yêu cầu cũ với ngữ cảnh khác bị chặn tại giao diện.
- CSV vẫn phải qua cổng con người rà soát; yêu cầu hiện trường chưa tự biến thành điều kiện chạy solver.
- API không gửi ngữ cảnh khi chỉ chạy `/api/demo/analyze`.

**Chú ý:** bản này là **AI intake thích nghi thuật ngữ**, không phải chứng nhận lập lịch tự động cho mọi ngành.

## 4. Roadmap có mục tiêu, đầu ra và điều kiện nghiệm thu

### M0 — Đóng băng bằng chứng Vòng 2 (19–22/10)
**Mục tiêu:** ổn định slide/demo, không refactor lõi trong giờ chót.
**Đầu ra:** dữ liệu minh họa có nhãn SYNTHETIC; B0/B1/B2 kèm hash, PASS và ledger; ảnh/video; thuyết trình có giới hạn.
**Đạt khi:** chạy lại được fixture, các test hiện tại xanh, không nói “mọi ngành” hay “tiết kiệm nhà máy thực”.
**Cấm:** tráo dữ liệu đo và giả lập, tự thêm giấy chứng nhận/phân quyền/ERP không có.

### M1 — Ngữ cảnh có kiểm soát (bản vá hiện tại; rà soát UI trước khi trình bày)
**Mục tiêu:** kỹ sư nhập một mô tả cơ sở để AI hiểu thuật ngữ trong CSV và câu hỏi.
**Đầu ra:** textbox + payload `work_context`, version hash, trace, consent, kiểm tra prompt/data; ví dụ hai ngữ cảnh khác nhau.
**Đạt khi:** cùng snapshot + khác ngữ cảnh -> khác request_hash; snapshot và B0/B1/B2 không đổi; ngữ cảnh vượt 1200 ký tự bị từ chối; trả lời AI không nhận vơ hỗ trợ quy tắc chưa có.

### M2 — Lõi dữ liệu dùng chung phiên bản mới (sau Vòng 2, 1–2 sprint)

**Cập nhật thử nghiệm ngày 20/10/2026:** prototype **factory-1** không có khuôn đã dùng **OR-Tools CP-SAT** rời rạc cho B1 (tối đa 1 job thay đổi) và B2 (phối hợp chọn máy/giờ) cùng hậu kiểm/ledger độc lập. Registry mới cưỡng chế giới hạn máy, lịch khả dụng, thời hạn, không chồng máy, thứ tự giữa các job (precedence) và sức chứa nguồn lực tái sử dụng (khi có khai báo). Có 2 fixture **giả lập** CNC và đóng gói, API, UI Factory Lab, kiểm thử browser Brave. Vẫn **chưa phải v4**: job chỉ một công đoạn, tồn kho, nhân sự theo ca/kỹ năng và hệ thống hai mode sản xuất/điện độc lập-kết hợp chưa được hỗ trợ. **Bổ sung ngày 20/10:** changeover theo họ job đã khai báo ma trận đầy đủ, thời gian setup, chi phí setup cố định và tài nguyên setup dùng chung; CP-SAT kiểm tra thứ tự liền kề bằng AddCircuit, verifier đối soát riêng. Chưa tính điện setup hay hỗ trợ setup tách rời khỏi job. Hai phạm vi tìm kiếm hiện tại **không đồng nghĩa** hai mode nghiệp vụ tương lai. Xem [FACTORY_LAB_V1.md](FACTORY_LAB_V1.md).

**Bổ sung Factory Lab `factory-2` (20/10):** mô hình Work Order → Operation với DAG thứ tự bắt buộc khai báo, năng lực máy/duration/kW theo từng operation, B0/B1/B2 CP-SAT + hậu kiểm độc lập và đối soát chi phí cho từng work order. Adapter versioned vào factory-1, giữ nguyên demo-3; 2 work order × 2 công đoạn đóng gói giả lập. Bắt buộc xác nhận bộ đệm trung gian **không giới hạn**; chưa hỗ trợ tồn kho/WIP hữu hạn, vận chuyển giữa công đoạn, yield/scrap, chia/ghép batch hoặc kỹ năng lao động. Chưa phải sản phẩm v4 hay ERP/MES đầy đủ. Xem [FACTORY_LAB_V1.md](FACTORY_LAB_V1.md).

**Bổ sung chế độ nghiệp vụ thử nghiệm (20/10):** cùng CP-SAT hỗ trợ `objective_mode = ENERGY | PRODUCTION | COMBINED` độc lập với `mode = FIXED_MACHINE | JOINT_MACHINE_TIME`. PRODUCTION ưu tiên makespan rồi tổng giờ kết thúc công đoạn (chi phí có thể tăng); ENERGY giảm chi phí điện chạy máy + setup cố định; COMBINED giảm chi phí nhưng áp giới hạn makespan `B0 + max_makespan_slack_minutes` (mặc định 0, sai lưới thời gian sẽ bị chặn). Cả hai schema `factory-1` và `factory-2` dùng cùng cơ chế verifier, ghi nhận objective, makespan, chi phí, trạng thái chứng minh CP-SAT; API + Factory Lab UI đã có bộ chọn mục tiêu riêng. Đây là tách biệt **mục tiêu tối ưu** ở cấp lịch giả lập, **chưa phải hai phân hệ MES và EMS hoàn chỉnh**, chưa tối ưu từng deadline đơn hàng so với B0 hoặc điện setup. Các nhận xét “chưa hỗ trợ mode” ở mốc trước là trạng thái lịch sử trước phần bổ sung này. Xem [FACTORY_LAB_V1.md](FACTORY_LAB_V1.md).

**Bổ sung nhập bảng CSV/Excel (21/10):** đã có mẫu cấu trúc bảng `factory-1`/`factory-2` tải trực tiếp trên UI, API tải mẫu/kiểm tra trước, SHA-256 nguồn, đối chiếu ràng buộc và hậu kiểm B0 trước khi cho xác nhận nạp JSON. Chỉ hỗ trợ template được định nghĩa rõ, **không tự suy luận mapping CSV bất kỳ** hoặc coi metadata `MEASURED` là dữ liệu đã được thẩm định. Mục tiêu tiếp theo: giao diện mapping cột linh hoạt có xác nhận thủ công, phân tích chất lượng dữ liệu và bộ dữ liệu đa ngành thực tế được đánh giá riêng.

### M2 — phần phạm vi gốc
**Mục tiêu:** bỏ phụ thuộc cứng vào “khuôn” trong schema chung mà vẫn giữ chức năng của ngành cần khuôn.
**Thực hiện:** tạo schema phiên bản kế tiếp gồm Job, Operation, Resource, Capability, Calendar, Setup/Transition, Tariff; dụng cụ/khuôn là **nguồn lực tùy chọn** có tính độc quyền khi được khai báo; adapter v3->v4.
**Không làm:** tự bịa khuôn giả để khiến dữ liệu một ngành khác vừa schema.
**Đạt khi:** dữ liệu cũ cho cùng lịch/chi phí/hậu kiểm; ít nhất hai bộ dữ liệu một-công-đoạn thuộc hai ngành chạy hợp lệ; mọi dữ kiện chưa đủ chặn rõ.

### M3 — Dịch dữ liệu ngành -> schema lõi (1 sprint sau M2)
**Mục tiêu:** AI hỗ trợ mapping thuật ngữ ngành, không đoán thông số.
**Thực hiện:** vocabulary glossary theo ngữ cảnh; canonical fields; câu hỏi quan trọng; hiển thị source/estimated/unknown và hàng chưa mô hình; cho phép chỉnh tay; ghi lịch sử trước/sau.
**Đạt khi:** bộ 30–50 CSV giả lập đa thuật ngữ có gán nhãn chuẩn; báo precision/recall mapping và số lần chỉnh; không tự điền thời hạn/đơn giá/công suất chưa có nguồn.

### M4 — Registry ràng buộc và khả năng thực thi (2–3 sprint từng loại)
**Mục tiêu:** điều kiện đặc thù được đồng bộ AI -> compiler solver -> verifier.
**Ưu tiên:** unavailable windows, machine eligibility, non-overlap; tiếp theo precedence giữa công đoạn; sau đó shared workforce, batch capacity/inventory nếu có dữ liệu và đối tác.
**Bắt buộc:** mỗi loại có schema, validation, compiler, verifier và ca phản ví dụ; chưa có thì hiển thị UNSUPPORTED, không “đã kiểm tra”.
**Đạt khi:** 0 ca vi phạm ràng buộc cứng được báo PASS trong bộ đối kháng; không mất ràng buộc ở bước đổi ngữ cảnh.

### M5 — Phân tích/insight và hỏi-đáp theo bằng chứng (1–2 sprint)
**Mục tiêu:** phù hợp sáu bước Data Driven Business.
**Thực hiện:** provenance nguồn, số liệu chất lượng trước/sau, EDA theo máy/khung giờ/lô, thẻ insight có công thức + input_hash, so sánh B0/B1/B2; AI chỉ giải thích số liệu có reference.
**Đạt khi:** tổng chi phí, ledger, kWh và biểu đồ đối soát; insight có nguồn cụ thể; không dùng dữ liệu lẫn ca; đo tính chính xác diễn giải AI.

### M6 — Điều phối kịch bản, đánh giá kinh doanh và pilot (sau M4–M5)
**Mục tiêu:** AI đề xuất “đáng thử điều gì”, bộ giải tính và verifier xác nhận; người dùng quyết định.
**Thực hiện:** tool calling whitelist, giới hạn 2 vòng tối ưu giả thuyết, cache theo snapshot/hash, đo thời gian/kết quả, thiết kế thử với kỹ sư; so sánh manual+solver, AI1+solver, AI hỏi lại+solver.
**Đạt khi:** AI không nới ràng buộc; tăng giá trị có ý nghĩa qua thử nghiệm đối chứng; dữ liệu doanh nghiệp có quyền sử dụng; công bố cả thất bại, độ trễ, phạm vi chi phí. Chưa công bố tiết kiệm thực trước khi có thiết kế đo.

## 5. Demo đa ngành đúng phạm vi hiện tại

**Demo A — Cơ sở ép nhựa một công đoạn:** hồ sơ gốc + ca B0/B1/B2, ngữ cảnh nói rõ khuôn, nhóm sản phẩm, biểu giá. Đây là ca đúng mô hình đang có.

**Demo B — Gia công may một công đoạn:** sử dụng trường ngữ cảnh để AI nhận diện tên cột/mô tả và nêu cần hỏi; **không** khẳng định chạy lập lịch dệt may thật trước M2/M4 khi dữ liệu có công đoạn nối tiếp hoặc không có khuôn tương ứng.

**Câu cần nói trên slide:** “Lõi tối ưu lịch có khả năng dùng chung cho các bài toán tương thích; trợ lý AI hỗ trợ chuyển đổi ngôn ngữ đầu vào. Mở rộng các kiểu ràng buộc công nghiệp được triển khai và kiểm thử theo từng mô-đun.”

## 6. An toàn và vận hành

- File và bối cảnh người dùng là dữ liệu không tin cậy đối với AI. Không thực thi lệnh trích từ mô tả.
- Model chỉ đề xuất mapping/ý định; không ghi thẳng lịch, phí hay nguồn dữ liệu; người dùng luôn có quyền từ chối.
- Gửi bối cảnh lên API ngoài chỉ khi có consent. Không nhập bí mật doanh nghiệp nếu chưa được phép.
- Ngữ cảnh là văn bản mô tả, không thay thế registry điều kiện hoặc chứng nhận năng lực máy.
- Bản demo SQLite, session token và nhật ký không phải phân quyền thực tế hoặc chứng thực dữ liệu.
- Không đổi mã nguồn lõi B0/B1/B2 trong bản vá context; đề xuất refactor sang phiên bản tương thích riêng sau khi nộp slide.

## 7. Lệnh nghiệm thu cho nhóm

Từ `AISC2026-EnergyShift`:
```powershell
python -m unittest discover -s backend/tests -q
node --test ops/work-context.test.cjs ops/ai-csv-view.test.cjs
node --check api-client.js
node --check ai-csv-import.js
python work/aisc_round2_evidence.py
```
Công bố số bài đạt và bằng chứng theo đúng lượt chạy, không sao chép số của lần cũ.
