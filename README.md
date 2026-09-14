# 🔬 LabScan OCR - Trích Xuất Kết Quả Xét Nghiệm Sang Excel

Ứng dụng web tự động nhận diện ký tự (OCR) và bóc tách thông tin từ các phiếu kết quả xét nghiệm y tế (Ảnh chụp hoặc tệp PDF), cho phép đối chiếu trực quan 2 cột song song và xuất dữ liệu ra file **Microsoft Excel (.xlsx)** chuẩn xác.

Hệ thống hoạt động **Offline-first / On-premise**, toàn bộ quá trình OCR và bóc tách dữ liệu được thực hiện trực tiếp trên máy client hoặc máy chủ nội bộ, **không gửi dữ liệu bệnh nhân ra dịch vụ AI đám mây bên thứ ba**, đảm bảo tuyệt đối quyền riêng tư và bảo mật y tế.

---

## ✨ Tính Năng Nổi Bật

- 📄 **Hỗ trợ đa định dạng tập tin**:
  - Hình ảnh: `PNG`, `JPG`, `JPEG`, `WebP` (ảnh chụp phiếu từ điện thoại, máy scan).
  - Tệp PDF: Nhận diện trực tiếp PDF điện tử bằng **PDF.js**; tự động render canvas và chạy **Tesseract OCR** đối với PDF dạng scan ảnh.
- 👁️ **Giao diện đối chiếu song song (Dual-Pane Workspace)**:
  - **Cột trái**: Bộ xem tài liệu gốc hỗ trợ phóng to (zoom), thu nhỏ, xoay ảnh, kéo thả góc nhìn (pan), xem toàn màn hình và xem metadata phiếu.
  - **Cột phải**: Bảng kết quả xét nghiệm số hóa có thể chỉnh sửa trực tiếp.
- 🧠 **Bóc tách thông tin thông minh (Medical Parser)**:
  - Tự động nhận diện thông tin hành chính: Tên bệnh nhân, giới tính, năm sinh/tuổi, mã hồ sơ (PID/SID), ngày lấy mẫu/trả kết quả, bác sĩ, cơ sở y tế.
  - Tự động bóc tách các chỉ số: Tên chỉ số, mã y khoa (WBC, RBC, HGB, Glucose, AST, ALT, Creatinine...), kết quả đo, đơn vị và khoảng tham chiếu chuẩn.
- ⚖️ **Tự động đối chiếu & Cảnh báo bất thường**:
  - So sánh kết quả đo với ngưỡng tham chiếu để đánh giá trạng thái: **Bình thường**, **Cao ↑**, **Thấp ↓**, **Bất thường**.
  - Tự động tính toán lại trạng thái khi người dùng chỉnh sửa giá trị.
- 🎯 **Chuẩn hóa danh mục y tế (`LAB_CATALOG`)**:
  - Cảnh báo các chỉ số lạ hoặc chưa khớp danh mục chuẩn (`isUnmapped`).
  - Cho phép người dùng chọn khớp nhanh danh mục bằng dropdown.
- 📊 **Xuất bảng tính Excel đa năng**:
  - Tùy chỉnh bật/tắt từng cột khi xuất (STT, Mã, Tên chỉ số, Kết quả, Đơn vị, Tham chiếu, Đánh giá, Ghi chú).
  - Tự động format tiêu đề, thông tin bệnh nhân và độ rộng cột file `.xlsx`.
  - Hỗ trợ nút **Sao chép dữ liệu (Clipboard)** định dạng TSV để dán trực tiếp vào Google Sheets / Excel chỉ với 1 click.
- 🧪 **Dữ liệu mẫu tích hợp sẵn**: Thử nghiệm nhanh với các mẫu phiếu thực tế (Huyết học CBC, Sinh hóa máu) mà không cần chuẩn bị sẵn file.

---

## 🏗️ Kiến Trúc Hệ Thống

```
Người dùng tải ảnh/PDF xét nghiệm
       │
       ▼
┌────────────────────────────────────────────────────────┐
│  Bộ máy OCR (Client-side / Browser-first)               │
│  ├─ PDF.js: Trích xuất text số & dựng layout dòng       │
│  └─ Tesseract.js (vie + eng): OCR ảnh & fallback PDF scan│
└────────────────────────────────────────────────────────┘
       │
       ▼ (Raw Extracted Text)
┌────────────────────────────────────────────────────────┐
│  Medical Rule-based Parser (src/utils/medicalParser.ts) │
│  ├─ Trích xuất Metadata bệnh nhân & cơ sở y tế         │
│  ├─ So khớp Alias & Từ điển chuẩn (src/data/labCatalog)│
│  └─ Đánh giá ngưỡng tham chiếu (min/max -> High/Low)   │
└────────────────────────────────────────────────────────┘
       │
       ▼ (Structured LabReport Object)
┌────────────────────────────────────────────────────────┐
│  Giao diện tương tác & Xuất dữ liệu                     │
│  ├─ LabResultsTable: Sửa giá trị, map danh mục         │
│  └─ excelExporter: Tạo file .xlsx hoặc copy Clipboard  │
└────────────────────────────────────────────────────────┘
```

---

## 📁 Cấu Trúc Thư Mục

```bash
trích-xuất-kết-quả-xét-nghiệm-sang-excel/
├── .env.example              # Mẫu biến môi trường
├── .gitignore                # Khai báo các file bỏ qua khi commit git
├── index.html                # HTML entry point của ứng dụng
├── metadata.json             # Cấu hình thông tin ứng dụng
├── package.json              # Quản lý scripts & dependencies
├── server.ts                 # Express server & API fallback OCR
├── tsconfig.json             # Cấu hình trình biên dịch TypeScript
├── vite.config.ts            # Cấu hình bundler Vite & TailwindCSS
├── eng.traineddata           # Dữ liệu ngôn ngữ tiếng Anh Tesseract OCR
├── vie.traineddata           # Dữ liệu ngôn ngữ tiếng Việt Tesseract OCR
│
└── src/
    ├── App.tsx               # Component chính điều phối luồng ứng dụng
    ├── index.css             # TailwindCSS v4 stylesheet
    ├── main.tsx              # React mounting entry point
    ├── types.ts              # Định nghĩa types (PatientInfo, LabTestItem, LabReport)
    ├── vite-env.d.ts         # Khai báo kiểu môi trường Vite
    │
    ├── components/
    │   ├── DocumentViewer.tsx     # Cột xem và thao tác tài liệu gốc (zoom, rotate, pan)
    │   ├── ExcelExportModal.tsx   # Modal tùy chọn cột & xuất file Excel (.xlsx)
    │   ├── FileUploaderModal.tsx  # Modal kéo thả/tải file & thanh tiến trình
    │   ├── Header.tsx             # Thanh menu điều hướng & chọn mẫu test nhanh
    │   └── LabResultsTable.tsx    # Bảng kết quả xét nghiệm tương tác & lọc dữ liệu
    │
    ├── data/
    │   ├── labCatalog.ts          # Từ điển danh mục xét nghiệm chuẩn & đơn vị đo
    │   └── sampleReports.ts       # Dữ liệu mẫu kiểm thử
    │
    └── utils/
        ├── excelExporter.ts       # Xây dựng bảng tính & tải file .xlsx (SheetJS)
        ├── medicalParser.ts       # Bộ bóc tách thông tin y khoa bằng Regex Rule
        └── ocrEngine.ts           # Động cơ OCR kết hợp PDF.js và Tesseract.js
```

---

## 🚀 Cài Đặt & Chạy Ứng Dụng

### 1. Yêu cầu môi trường
- **Node.js**: Phiên bản `>= 18.0.0` (khuyến nghị `20.x` hoặc `22.x`).
- **npm** (hoặc `pnpm`, `bun`).

### 2. Cài đặt các gói phụ thuộc
```bash
npm install
```

### 3. Khởi chạy ở chế độ phát triển (Development)
```bash
npm run dev
```
Ứng dụng sẽ khởi động tại: **http://localhost:3000** (bao gồm cả giao diện web và API server).

### 4. Build sản phẩm (Production)
```bash
npm run build
```
Lệnh trên sẽ:
1. Đóng gói mã nguồn frontend vào thư mục `dist/` bằng Vite.
2. Bundle server Node.js thành `dist/server.cjs` bằng esbuild.

### 5. Khởi chạy bản Production
```bash
npm start
```

### 6. Triển khai lên GitHub Pages (Miễn phí)
Dự án đã tích hợp sẵn GitHub Actions workflow tự động deploy lên GitHub Pages khi push code lên nhánh `main`:
1. Vào repository trên GitHub > chọn tab **Settings**.
2. Chọn mục **Pages** ở thanh bên trái.
3. Tại phần **Build and deployment** > **Source**, chọn **GitHub Actions**.
4. Mỗi khi bạn `git push` lên nhánh `main`, hệ thống sẽ tự động build và xuất bản trang web tại địa chỉ:
   `https://<username>.github.io/<ten-repo>/`

---

## 🛠️ Công Nghệ Sử Dụng

- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [TailwindCSS v4](https://tailwindcss.com/), [Lucide React](https://lucide.dev/), [Motion](https://motion.dev/).
- **Bộ máy xử lý tài liệu**:
  - [PDF.js (`pdfjs-dist`)](https://mozilla.github.io/pdf.js/): Bóc tách text số & render canvas cho PDF.
  - [Tesseract.js](https://tesseract.projectnaptha.com/): Nhận diện ký tự quang học (OCR) tiếng Việt & tiếng Anh chạy bằng WebAssembly.
  - [SheetJS (`xlsx`)](https://docs.sheetjs.com/): Tạo và tải file Microsoft Excel `.xlsx`.
- **Backend**: [Node.js](https://nodejs.org/), [Express](https://expressjs.com/), [tsx](https://github.com/privatenumber/tsx), [esbuild](https://esbuild.github.io/).

---

## 🔒 An Toàn & Quyền Riêng Tư Dữ Liệu Y Tế

1. **Xử lý cục bộ**: Tài liệu bệnh án được đọc và phân tích trực tiếp trên trình duyệt máy khách (hoặc máy chủ nội bộ nếu sử dụng API).
2. **Không phụ thuộc đám mây**: Không truyền dữ liệu người bệnh qua bất kỳ API đám mây bên ngoài nào.
3. **Chạy được trong mạng cô lập (Air-gapped / Intranet)**: Đã cấu hình worker PDF.js cục bộ và có sẵn file ngôn ngữ `vie.traineddata`/`eng.traineddata` offline.

---

## 📝 Giấy Phép (License)

Dự án được phân phối dưới giấy phép [MIT](LICENSE). Tự do sử dụng, chỉnh sửa và triển khai cho các cơ sở y tế, phòng khám và mục đích cá nhân.
