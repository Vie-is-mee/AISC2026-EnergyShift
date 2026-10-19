# Nhóm demo và miền tìm kiếm mở rộng

Dành cho nhóm thử nghiệm nhỏ, chưa phải hệ thống vận hành/phân quyền doanh
nghiệp. Giữ giới hạn 8 job, 3 máy, 48 giờ. Chưa có số đo xưởng.

## Dùng trên UI

Điều chuyển đơn hàng → Nhóm demo → bật hàng đợi. Mỗi phiên trình duyệt có
capability token riêng trong sessionStorage, không đặt trong URL, báo cáo,
localStorage hồ sơ hoặc frontend build. Phân tích vẫn kiểm tra/áp dụng input
trước khi gửi. Có trạng thái, hủy lượt chờ và mở lại kết quả từ lịch sử.
Không tự lặp POST khi mất kết nối.

Tối đa 4 lượt đang chạy/chờ toàn service và 2 mỗi phiên. Một worker xử lý lần
lượt, dùng chung khóa engine với API trực tiếp. Quá tải trả 429/Retry-After.
Chỉ hủy lượt chưa bắt đầu. Sửa input không ép dừng thread; lượt cũ có thể
hoàn tất trong lịch sử, nhưng không ghi đè màn hình mới.

Tối đa 10 lượt/phiên; TTL 7 ngày từ lúc tạo phiên. SQLite lưu hash token và
report/snapshot, không lưu token gốc. Ai có token có quyền đọc/xóa phiên đó;
chưa xác thực danh tính, role kỹ sư/quản đốc hoặc phê duyệt. Đóng phiên trình
duyệt có thể mất token, hãy tải báo cáo quan trọng. Xóa phiên xóa lịch sử;
job đang tính có thể kết thúc nhưng không được lưu. Trace gửi phải khớp
input_hash; mở report cũ không gắn nhầm trace của input hiện tại.

Lịch sử máy chủ lưu kết quả phân tích lúc hoàn tất. Đối chiếu số đo được thêm
sau đó trên trình duyệt cần tải JSON riêng; chưa tự đồng bộ bổ sung vào lịch sử.

Giới hạn ổ đĩa demo: report tối đa 1 MiB, toàn service giữ tối đa 50 lượt gần
nhất (ngoài lượt đang chờ/chạy). Report quá lớn mang ERROR, không lưu như đề
xuất hoàn tất. Lượt cũ có thể bị dọn trước TTL; 7 ngày là mức tối đa, không cam
kết mọi báo cáo luôn còn đủ 7 ngày.

## Máy chủ

TTL chặn truy cập sau 7 ngày; bản ghi hết hạn được dọn khi tạo phiên mới.
Đây không phải dịch vụ bảo đảm xóa dữ liệu đúng thời điểm khi không có request.

- `ENERGYSHIFT_TEAM_DEMO_ENABLED=1` bật (mặc định); `0` tắt endpoints nhóm.
- `ENERGYSHIFT_TEAM_DB` là SQLite phía backend; mặc định thư mục temp.
- Render giữ **một worker**. Không chạy nhiều process/replica trên mô hình queue
  này; executor/admission dành cho service một process.
- CORS cho phép Authorization từ origin Vercel đã cấu hình chính xác. Token
  workspace khác key provider; không đưa key provider vào frontend.
- Render Free dùng `/tmp`: dữ liệu có thể mất khi restart/redeploy/chuyển máy;
  không hứa persistence hoặc SLA. SQLite chỉ bền khi file còn tồn tại.
- Nếu restart và file còn, QUEUED/RUNNING chuyển INTERRUPTED. Input chờ chỉ
  nằm trong RAM, không tự chạy lại lịch cũ; người dùng chủ động gửi lại.
- Tạo phiên tối đa 8/phút/IP và 128 phiên còn TTL. Đây là bảo vệ demo hữu hạn,
  không thay auth/rate-limit phân tán hoặc chống DoS production.
- Ngân sách B2 6 giây không là hạn cứng request: còn B1, dựng mô hình, hậu
  kiểm, hàng đợi/cold start. Chưa benchmark tải công nghiệp.

Pilot sản xuất cần định danh/role thực, quyền theo nhà máy, phê duyệt/hoàn tác
tác nghiệp, queue bền vững, backup, metrics/alerting, retention được đơn vị vận
hành phê duyệt và thiết kế nhiều process đúng nghĩa.

## Miền solver mới

API trực tiếp và hàng đợi bật tối đa **12 miền láng giềng**, ngoài B0/B1:
đổi hai job kề nhau hoặc chuyển một job sang máy đủ điều kiện rồi chèn vào
một vị trí. Sinh miền theo thứ tự cố định, loại trùng; không tìm mọi hoán vị.
CLI giữ mặc định cũ, cho phép tối đa 24:

```console
python -m backend backend/fixtures/coordinated_cell.json --analyze --b2 --b2-neighbors 12
```

Mỗi miền được CP-SAT phối hợp thời điểm, giữ setup/khuôn vật lý. Miền mới
có thể INFEASIBLE bình thường; miền B0/B1 đã có incumbent mà INFEASIBLE là
bất nhất, không nhận chứng minh. Mọi ứng viên được verifier/ledger hậu kiểm.
Hết giờ giữ lịch tốt nhất đã kiểm tra. `PROVEN_IN_DECLARED_DOMAIN` chỉ nói
về miền đã liệt kê, luôn `global_optimum_proven=false`; có số miền, trạng thái
và origin thật. Không nhận tối ưu toàn nhà máy.

Mục tiêu vẫn nominal điện + chuyển đổi, chưa phải peak kW hoặc robust mọi
yếu tố. Policy vẫn chặn UNKNOWN và đòi lợi ích tăng thêm đủ ngưỡng. Chọn
nominal rồi hậu kiểm có thể bỏ lỡ lịch nominal đắt hơn nhưng robust hơn.

## API nhóm

| Endpoint | Hành vi |
|---|---|
| POST `/api/demo/workspaces` body `{}` | Cấp capability |
| POST `/api/demo/jobs` | Snapshot/trace tùy chọn, trả 202 |
| GET `/api/demo/jobs` | Lịch sử riêng |
| GET `/api/demo/jobs/{id}` | Trạng thái/report riêng |
| POST `/api/demo/jobs/{id}/cancel` body `{}` | Hủy lượt chờ |
| DELETE `/api/demo/workspaces/current` | Xóa phiên/lịch sử |

Sau cấp phiên cần `Authorization: Bearer <workspace_token>`. Token sai trả
401, job ngoài phiên trả 404. API `/analyze` vẫn giữ tương thích, không lưu
lịch sử nhóm khi không chọn hàng đợi. Không gọi OpenRouter ở luồng này.
