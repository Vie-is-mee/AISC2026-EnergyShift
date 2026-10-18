# Deploy demo: Render Free + Vercel Hobby

Cấu hình kiểm tra theo tài liệu chính thức ngày 18/10/2026. Tài khoản, tên URL và
quota do nhà cung cấp quản lý; repository đã chuẩn bị cấu hình, chưa tự tạo dịch
vụ trong tài khoản của bạn. Không cần API key model cho demo hiện tại.

```text
Trình duyệt → Vercel: HTML/CSS/JavaScript trong dist/
           → Render: /api/demo/*, engine Python B0/B1
```

Render cũng phục vụ đầy đủ UI tại URL gốc: bạn có thể xem demo ngay sau bước 1,
chưa cần đợi Vercel. Không chạy engine Python bằng Vercel Functions trong cấu hình này.

## Các file đã chuẩn bị

| File | Mục đích |
|---|---|
| render.yaml | Blueprint Web Service Python, plan free, 1 worker, health check |
| .python-version | Chọn Python 3.11 thay vì phụ thuộc bản mặc định của Render |
| vercel.json | Framework Other, build bằng Node, chỉ publish thư mục dist |
| ops/build-static.cjs | Copy đúng 9 asset public (gồm workspace UI), tạo cấu hình URL backend |
| .env.render.example | Mẫu biến Render có thể commit |
| .env.vercel.example | Mẫu biến Vercel có thể commit |
| .env.render / .env.vercel | Bản local để bạn điền, Git bỏ qua; không tự được cloud đọc |

File .env chứa key OpenRouter của bạn được giữ riêng và bỏ qua bởi Git.
Không import toàn bộ file đó vào Vercel. Bản build chỉ đọc ENERGYSHIFT_API_BASE_URL,
không serialize process.env hay copy thư mục repository.

## 1. Tạo backend trên Render

1. Đăng nhập [Render Dashboard](https://dashboard.render.com/) bằng GitHub.
2. Chọn **New → Blueprint**, kết nối repo
   `Vie-is-mee/AISC2026-EnergyShift`, branch **main**. Blueprint path: `render.yaml`.
3. Kiểm tra service **energyshift-demo-api**, loại **Web Service**, runtime Python,
   region Singapore và instance **Free**. Không thêm database/disk trả phí.
4. Khi được hỏi `ENERGYSHIFT_ALLOWED_ORIGINS`: nếu chưa có URL Vercel, nhập tạm
   `https://example.invalid`. Sau bước 2 sẽ thay bằng domain Vercel thật.
   Đây chỉ là origin được phép, không phải backend URL và không phải secret.
5. Tạo Blueprint/Deploy và chờ build thành công. Ghi lại URL được Render cấp,
   ví dụ `https://energyshift-demo-api-abcd.onrender.com` — tên thật có thể khác.
6. Mở `<URL-RENDER>/api/demo/health`, phải thấy JSON với `status: "OK"`,
   `schema_version: "demo-3"` và commit SHA. Mở `<URL-RENDER>/` để dùng demo ngay.

Nếu dùng **New → Web Service** thay vì Blueprint, nhập thủ công:

| Trường | Giá trị |
|---|---|
| Repository / branch | AISC2026-EnergyShift / main |
| Root Directory | Để trống — các file đã ở gốc repo GitHub |
| Runtime | Python 3 |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `python -m uvicorn backend.app:app --host 0.0.0.0 --port $PORT --workers 1` |
| Health Check Path | `/api/demo/health` |
| Instance Type | **Free** |
| Environment | `ENERGYSHIFT_ALLOWED_ORIGINS=https://example.invalid` |

Render tự cung cấp `PORT`, `RENDER_EXTERNAL_HOSTNAME` và `RENDER_GIT_COMMIT`.
Không tự nhập các biến này. Hostname Render được thêm vào trusted hosts; không mở `*`.

## 2. Tạo frontend trên Vercel

1. Đăng nhập [Vercel](https://vercel.com/), dùng tài khoản **Hobby** phù hợp mục
   đích demo cá nhân/phi thương mại. Chọn **Add New → Project**, import cùng repo.
2. Production branch: **main**. Framework Preset: **Other**. Root Directory: `./`
   (đừng nhập thêm `AISC2026-EnergyShift`, vì repo GitHub đã chính là thư mục đó).
3. Cấu hình trong vercel.json:
   - Build Command: `node ops/build-static.cjs`
   - Output Directory: `dist`
   - Install Command: `node --version` (không có dependency frontend cần cài).
   - Node.js: chọn **22.x** trong Project Settings nếu cần chọn phiên bản.
4. Trong **Environment Variables**, chọn Production (và Preview nếu cần):

   ```dotenv
   ENERGYSHIFT_API_BASE_URL=https://TEN-SERVICE-THAT.onrender.com
   ```

   Dán URL backend thật từ bước 1, không kèm `/api`, đường dẫn hoặc key. Biến này
   công khai trong JavaScript để browser gọi API; chỉ chấp nhận HTTPS onrender.com.
5. Bấm **Deploy**. Khi xong, ghi lại **domain Production ổn định**, ví dụ
   `https://energyshift-demo.vercel.app`. Chưa chạy Analyze được cho đến bước 3.

Thay biến URL sau khi build thì phải **Redeploy** trên Vercel. Các file môi trường
local chỉ là mẫu điền; Vercel không tự đọc file tên `.env.vercel` từ máy bạn.

## 3. Cho phép frontend gọi backend

Trên Render → service → **Environment**, sửa thành đúng URL Vercel Production:

```dotenv
ENERGYSHIFT_ALLOWED_ORIGINS=https://energyshift-demo.vercel.app
```

Chọn **Save, rebuild, and deploy** (hoặc thao tác Save/Deploy tương ứng trong UI),
đợi Live rồi mở URL Vercel. Khi domain thật khác ví dụ, dùng domain thật.
Origin chỉ gồm scheme + hostname (+ port nếu local), không kèm `/api` hay path.

Nếu có thêm domain hợp lệ, phân cách bằng dấu phẩy:

```dotenv
ENERGYSHIFT_ALLOWED_ORIGINS=https://energyshift-demo.vercel.app,https://demo.example.com
```

Không nhập wildcard `*` hoặc `*.vercel.app`. Preview deployment có domain khác
Production sẽ không tự được cho phép; dùng URL Production để chia sẻ demo.
Blueprint dùng sync:false để những lần sync sau không ghi đè origin bạn đã nhập.

## 4. Kiểm tra sau deploy

1. Mở Render `/api/demo/health`, chờ OK.
2. Mở URL Vercel: phải có **Engine · build ...**, bảng 8 lô và không có kết quả
   tính trước. Console/Network không có lỗi CORS hoặc 404 deployment-config.js.
3. Chạy phân tích bộ mẫu: B0/B1 thật, raw modeled saving **132.918 đ**; đây vẫn là
   dữ liệu SYNTHETIC, không phải ROI nhà máy. B2 vẫn chưa chạy.
4. Vào Lịch chạy & Nhập liệu, sửa bảng và bấm **Phân tích kế hoạch**. Khi chưa xác nhận review chi phí,
   UNKNOWN có thể đưa kết luận về MEASURE_FIRST. Không coi khác CHANGE là lỗi deploy.
5. Thử lưu hồ sơ, reload, khôi phục và xuất JSON. Bộ nhớ riêng theo origin/browser:
   hồ sơ ở localhost hoặc URL Render không tự xuất hiện trên URL Vercel. Tải bản
   sao rồi khôi phục qua file nếu muốn chuyển dữ liệu.

## Render Free và xử lý lỗi

Theo [Render Free](https://render.com/docs/free), service ngủ sau 15 phút không có
traffic và khởi động lại khoảng một phút. Trước buổi demo, mở health endpoint và
đợi OK; nếu frontend đã báo lỗi, bấm **Kết nối lại engine**. Không tự retry POST
Analyze để tránh gửi trùng phép tính.

| Dấu hiệu | Cách xử lý |
|---|---|
| Vercel build báo thiếu ENERGYSHIFT_API_BASE_URL | Thêm biến Production với URL Render thật rồi Redeploy |
| Build URL không hợp lệ | Chỉ dùng `https://...onrender.com`, không path, credentials hay query |
| Health 400 / Invalid host header | Kiểm tra dùng đúng URL service và Render có RENDER_EXTERNAL_HOSTNAME |
| CORS / POST 403 | Sửa ENERGYSHIFT_ALLOWED_ORIGINS đúng domain trên thanh địa chỉ; redeploy Render |
| Render loading page / fetch lỗi | Chờ health OK, sau đó Kết nối lại engine trên Vercel |
| 409 ANALYSIS_BUSY | Engine đang chạy một lượt; đợi rồi chạy lại |
| Render build thiếu module | Root Directory để trống và Build Command đúng requirements.txt |
| Render không Live / thiếu PORT | Dùng đúng Start Command trên; bind 0.0.0.0 và `$PORT`, 1 worker |
| Vercel chỉ hiện source hoặc thiếu assets | Framework Other, output dist, deploy commit main mới nhất |

Free có quota, không bảo đảm luôn sẵn sàng hoặc hiệu năng: Render hiện cấp 750
instance-hours/workspace/tháng và có giới hạn bandwidth/build. Vercel Hobby giới
hạn mục đích cá nhân phi thương mại và có quota riêng. Chọn đúng Free/Hobby và xem
dashboard usage; không cần nâng cấp trả phí để làm theo cấu hình demo này.
Nguồn: [Render Free](https://render.com/docs/free), [Vercel Hobby](https://vercel.com/docs/plans/hobby).

Không có auth hoặc queue đa người dùng; chỉ một analysis tại một thời điểm, giới
hạn 8 lô/3 máy/48h. Dùng dữ liệu giả lập khi chia sẻ link demo. Chưa kiểm chứng
hiệu năng/cold start trên tài khoản cloud thật. Không thêm database cho hồ sơ:
localStorage nằm ở browser, không bị phụ thuộc filesystem tạm của Render.

## Kiểm chứng cấu hình trong repository

- `python -m unittest discover -s backend/tests -q`: 143 tests Python.
- `node --test ops/input-model.test.cjs ops/deployment.test.cjs`: 23 tests Node.
- Build tests kiểm tra allowlist, URL hợp lệ, không xuất biến secret và thư mục
  output có file lạ sẽ fail. CORS tests kiểm tra preflight, POST, lỗi 422, host,
  origin lạ và forwarded-host giả.
- `python ops/cloud_smoke.py`: diễn tập hai origin local với artifact build thật,
  Edge và backend thật; không tạo service hoặc dùng credential cloud.

Tài liệu gốc: [Render FastAPI](https://render.com/docs/deploy-fastapi),
[Python version](https://render.com/docs/python-version),
[Blueprint spec](https://render.com/docs/blueprint-spec),
[Vercel configuration](https://vercel.com/docs/project-configuration).
