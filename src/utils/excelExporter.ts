import * as XLSX from 'xlsx';
import { LabReport, LabTestItem } from '../types';

export interface ExportColumnOptions {
  includeIndex: boolean;
  includeCode: boolean;
  includeName: boolean;
  includeValue: boolean;
  includeUnit: boolean;
  includeRefRange: boolean;
  includeStatus: boolean;
  includeNote: boolean;
}

export const DEFAULT_COLUMN_OPTIONS: ExportColumnOptions = {
  includeIndex: true,
  includeCode: true,
  includeName: true,
  includeValue: true,
  includeUnit: true,
  includeRefRange: true,
  includeStatus: true,
  includeNote: true,
};

function getStatusLabel(status: string): string {
  switch (status) {
    case 'high':
      return 'Cao ↑';
    case 'low':
      return 'Thấp ↓';
    case 'abnormal':
      return 'Bất thường';
    case 'normal':
    default:
      return 'Bình thường';
  }
}

/**
 * Builds a workbook sheet for a single lab report with patient header and table data
 */
export function buildReportWorksheet(report: LabReport, options: ExportColumnOptions = DEFAULT_COLUMN_OPTIONS): XLSX.WorkSheet {
  const rows: (string | number)[][] = [];

  // Header information
  rows.push(['PHIẾU KẾT QUẢ XÉT NGHIỆM Y TẾ']);
  rows.push([report.title || 'Xét nghiệm']);
  if (report.patient.facility) {
    rows.push(['Cơ sở y tế:', report.patient.facility]);
  }
  rows.push([
    'Bệnh nhân:',
    report.patient.fullName || 'Chưa rõ',
    'Giới tính:',
    report.patient.gender || 'Chưa rõ',
    'Năm sinh / Tuổi:',
    report.patient.birthYearOrAge || 'Chưa rõ',
    'Mã BN:',
    report.patient.patientCode || 'Chưa có',
  ]);
  rows.push([
    'Ngày trả kết quả:',
    report.patient.resultDate || report.patient.sampleDate || 'Chưa rõ',
    'Bác sĩ chỉ định:',
    report.patient.doctor || 'Chưa rõ',
    'Chẩn đoán:',
    report.patient.diagnosis || '',
  ]);
  rows.push([]); // Empty spacing row

  // Table header row
  const tableHeaders: string[] = [];
  if (options.includeIndex) tableHeaders.push('STT');
  if (options.includeCode) tableHeaders.push('MÃ CHỈ SỐ');
  if (options.includeName) tableHeaders.push('TÊN CHỈ SỐ XÉT NGHIỆM');
  if (options.includeValue) tableHeaders.push('KẾT QUẢ');
  if (options.includeUnit) tableHeaders.push('ĐƠN VỊ');
  if (options.includeRefRange) tableHeaders.push('KHOẢNG THAM CHIẾU');
  if (options.includeStatus) tableHeaders.push('ĐÁNH GIÁ');
  if (options.includeNote) tableHeaders.push('GHI CHÚ');

  rows.push(tableHeaders);

  // Table data rows
  report.tests.forEach((test, idx) => {
    const row: (string | number)[] = [];
    if (options.includeIndex) row.push(idx + 1);
    if (options.includeCode) row.push(test.code || test.rawName || '');
    if (options.includeName) row.push(test.name || test.rawName || '');
    if (options.includeValue) {
      // Try to parse numeric value if possible
      const num = Number(test.value);
      row.push(!isNaN(num) && test.value.trim() !== '' ? num : test.value);
    }
    if (options.includeUnit) row.push(test.unit || '');
    if (options.includeRefRange) row.push(test.referenceRange || '');
    if (options.includeStatus) row.push(getStatusLabel(test.status));
    if (options.includeNote) row.push(test.note || (test.isUnmapped ? 'Chưa khớp danh mục' : ''));

    rows.push(row);
  });

  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Compute column widths
  const colWidths = tableHeaders.map((header, colIndex) => {
    let maxLen = header.length;
    // Inspect data rows
    const dataStartRow = rows.length - report.tests.length;
    for (let r = dataStartRow; r < rows.length; r++) {
      const cellVal = rows[r]?.[colIndex];
      if (cellVal !== undefined && cellVal !== null) {
        maxLen = Math.max(maxLen, String(cellVal).length);
      }
    }
    return { wch: Math.min(Math.max(maxLen + 4, 12), 45) };
  });

  ws['!cols'] = colWidths;

  return ws;
}

/**
 * Exports a single report directly as a .xlsx file download
 */
export function exportSingleReportToExcel(
  report: LabReport,
  options: ExportColumnOptions = DEFAULT_COLUMN_OPTIONS,
  customFileName?: string
): void {
  const wb = XLSX.utils.book_new();
  const ws = buildReportWorksheet(report, options);

  // Sanitize sheet name (Excel max 31 chars, no invalid chars : \ / ? * [ ])
  const safeSheetName = (report.patient.fullName || 'KetQua')
    .replace(/[:\\/?*\[\]]/g, '')
    .slice(0, 30);

  XLSX.utils.book_append_sheet(wb, ws, safeSheetName || 'KetQuaXN');

  const cleanPatientName = (report.patient.fullName || 'benh-nhan')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .toLowerCase();

  const fileName = customFileName || `Ket_Qua_Xet_Nghiem_${cleanPatientName}_${new Date().toISOString().slice(0, 10)}.xlsx`;

  XLSX.writeFile(wb, fileName);
}

/**
 * Exports multiple reports into a multi-sheet or consolidated workbook
 */
export function exportBatchReportsToExcel(
  reports: LabReport[],
  options: ExportColumnOptions = DEFAULT_COLUMN_OPTIONS,
  fileName = 'Tong_Hop_Ket_Qua_Xet_Nghiem.xlsx'
): void {
  if (reports.length === 0) return;

  const wb = XLSX.utils.book_new();

  // 1. Consolidated overview sheet
  const summaryRows: (string | number)[][] = [
    ['BẢNG TỔNG HỢP CÁC PHIẾU XÉT NGHIỆM ĐÃ TRÍCH XUẤT'],
    ['Ngày xuất:', new Date().toLocaleString('vi-VN')],
    [],
    ['STT', 'Họ và tên', 'Mã BN', 'Giới tính', 'Năm sinh / Tuổi', 'Tên xét nghiệm', 'Ngày trả KQ', 'Số chỉ số', 'Chỉ số bất thường', 'Độ tin cậy'],
  ];

  reports.forEach((rep, idx) => {
    summaryRows.push([
      idx + 1,
      rep.patient.fullName || 'Chưa rõ',
      rep.patient.patientCode || '',
      rep.patient.gender || '',
      rep.patient.birthYearOrAge || '',
      rep.title || 'Xét nghiệm',
      rep.patient.resultDate || '',
      rep.tests.length,
      rep.abnormalCount,
      `${rep.avgConfidence}%`,
    ]);
  });

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [
    { wch: 8 },
    { wch: 24 },
    { wch: 15 },
    { wch: 10 },
    { wch: 16 },
    { wch: 28 },
    { wch: 16 },
    { wch: 12 },
    { wch: 18 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'TongHop');

  // 2. Individual sheets
  const usedNames = new Set<string>();
  reports.forEach((rep, idx) => {
    const ws = buildReportWorksheet(rep, options);
    let sheetName = (rep.patient.fullName || `Phieu_${idx + 1}`)
      .replace(/[:\\/?*\[\]]/g, '')
      .slice(0, 25);
    
    if (usedNames.has(sheetName)) {
      sheetName = `${sheetName}_${idx + 1}`;
    }
    usedNames.add(sheetName);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  XLSX.writeFile(wb, fileName);
}

/**
 * Copies the test parameters table to clipboard formatted as TSV for instant paste into Excel / Sheets
 */
export async function copyTableToClipboard(
  report: LabReport,
  options: ExportColumnOptions = DEFAULT_COLUMN_OPTIONS
): Promise<boolean> {
  try {
    const lines: string[] = [];

    // Header
    const headers: string[] = [];
    if (options.includeIndex) headers.push('STT');
    if (options.includeCode) headers.push('Mã chỉ số');
    if (options.includeName) headers.push('Tên chỉ số');
    if (options.includeValue) headers.push('Kết quả');
    if (options.includeUnit) headers.push('Đơn vị');
    if (options.includeRefRange) headers.push('Khoảng tham chiếu');
    if (options.includeStatus) headers.push('Đánh giá');
    if (options.includeNote) headers.push('Ghi chú');
    lines.push(headers.join('\t'));

    // Rows
    report.tests.forEach((t, i) => {
      const row: string[] = [];
      if (options.includeIndex) row.push(String(i + 1));
      if (options.includeCode) row.push(t.code || t.rawName);
      if (options.includeName) row.push(t.name || t.rawName);
      if (options.includeValue) row.push(String(t.value));
      if (options.includeUnit) row.push(t.unit || '');
      if (options.includeRefRange) row.push(t.referenceRange || '');
      if (options.includeStatus) row.push(getStatusLabel(t.status));
      if (options.includeNote) row.push(t.note || '');
      lines.push(row.join('\t'));
    });

    await navigator.clipboard.writeText(lines.join('\n'));
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard', err);
    return false;
  }
}
