export interface PatientInfo {
  fullName: string;
  gender: string; // "Nam" | "Nữ" | "Khác"
  birthYearOrAge: string;
  patientCode: string;
  sampleDate: string;
  resultDate: string;
  doctor?: string;
  facility?: string;
  diagnosis?: string;
}

export type LabTestStatus = 'normal' | 'low' | 'high' | 'abnormal';

export interface LabTestItem {
  id: string;
  name: string; // Tên chuẩn (vd: Hồng cầu (RBC))
  code: string; // Ký hiệu (vd: RBC)
  rawName: string; // Chuỗi đọc được nguyên bản (vd: RBC hoặc R.B.C)
  value: string; // Giá trị đo (vd: "4.35" hoặc "Âm tính")
  numericValue?: number | null;
  unit: string; // Đơn vị (vd: 10^12/L)
  referenceRange: string; // Khoảng tham chiếu (vd: 4.20 - 5.40)
  refMin?: number | null;
  refMax?: number | null;
  status: LabTestStatus; // 'normal' | 'low' | 'high' | 'abnormal'
  matchedCategory?: string; // vd: "Huyết học (CBC)", "Sinh hóa máu", etc.
  confidence: number; // 0 - 100
  note?: string;
  isUnmapped?: boolean;
  rawValue?: string; // Giá trị thô đọc được từ OCR/Text
  normalizedValue?: string | null; // Giá trị đã chuẩn hóa an toàn nếu có
  normalizationReason?: string; // Lý do chuẩn hóa
  needsReview?: boolean; // Cần người dùng kiểm tra lại
  warning?: string; // Cảnh báo cụ thể (mất dấu thập phân, độ tin cậy thấp, ...)
  rawLine?: string; // Dòng text gốc chứa chỉ số
}

export type OcrEngineType = 'tesseract' | 'scribe' | 'both';

export interface LabReport {
  id: string;
  title: string; // vd: "Xét nghiệm máu 10 thông số"
  fileName: string;
  fileType: 'image' | 'pdf';
  fileDataUrl: string;
  patient: PatientInfo;
  tests: LabTestItem[];
  totalDetected: number;
  abnormalCount: number;
  unmappedCount: number;
  avgConfidence: number;
  rawSummary?: string;
  rawText?: string;
  tesseractRawText?: string;
  scribeRawText?: string;
  selectedEngine?: OcrEngineType;
  createdAt: string;
}

export interface StandardCatalogItem {
  id: string;
  code: string;
  name: string;
  category: string;
  defaultUnit: string;
  defaultRefRange: string;
  defaultRefMin?: number;
  defaultRefMax?: number;
}
