import React, { useState } from 'react';
import {
  FileSpreadsheet,
  X,
  Download,
  Copy,
  Check,
  CheckSquare,
  Square,
  Table,
} from 'lucide-react';
import { LabReport } from '../types';
import {
  ExportColumnOptions,
  DEFAULT_COLUMN_OPTIONS,
  exportSingleReportToExcel,
  copyTableToClipboard,
} from '../utils/excelExporter';

interface ExcelExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: LabReport | null;
}

export const ExcelExportModal: React.FC<ExcelExportModalProps> = ({
  isOpen,
  onClose,
  report,
}) => {
  if (!isOpen || !report) return null;

  const defaultCleanName = (report.patient.fullName || 'benh-nhan')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .toUpperCase();

  const [fileName, setFileName] = useState(
    `Ket_Qua_Xet_Nghiem_${defaultCleanName}_${new Date().toISOString().slice(0, 10)}.xlsx`
  );
  const [colOptions, setColOptions] = useState<ExportColumnOptions>(DEFAULT_COLUMN_OPTIONS);
  const [copied, setCopied] = useState(false);

  const toggleCol = (key: keyof ExportColumnOptions) => {
    setColOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleDownload = () => {
    exportSingleReportToExcel(report, colOptions, fileName);
    onClose();
  };

  const handleCopyClipboard = async () => {
    const success = await copyTableToClipboard(report, colOptions);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const columnsList: Array<{ key: keyof ExportColumnOptions; label: string; desc: string }> = [
    { key: 'includeIndex', label: 'STT', desc: 'Số thứ tự dòng (1, 2, 3...)' },
    { key: 'includeCode', label: 'Mã chỉ số', desc: 'Ký hiệu y khoa (WBC, RBC, HGB...)' },
    { key: 'includeName', label: 'Tên chỉ số', desc: 'Tên tiếng Việt đầy đủ' },
    { key: 'includeValue', label: 'Kết quả', desc: 'Giá trị đo từ phiếu' },
    { key: 'includeUnit', label: 'Đơn vị', desc: 'Đơn vị đo (g/dL, 10^12/L...)' },
    { key: 'includeRefRange', label: 'Khoảng tham chiếu', desc: 'Ngưỡng min - max bình thường' },
    { key: 'includeStatus', label: 'Đánh giá', desc: 'Bình thường, Cao ↑, Thấp ↓' },
    { key: 'includeNote', label: 'Ghi chú', desc: 'Cảnh báo và phân loại danh mục' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Tùy chỉnh & Xuất file Excel</h3>
              <p className="text-xs text-slate-500">
                Xuất {report.tests.length} chỉ số của bệnh nhân {report.patient.fullName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* File Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Tên file Excel tải về:
            </label>
            <div className="flex items-center">
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs sm:text-sm font-mono focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-hidden"
              />
            </div>
          </div>

          {/* Select Columns */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700">
                Cấu hình các cột xuất ra Excel:
              </label>
              <button
                type="button"
                onClick={() => {
                  const allTrue = Object.values(colOptions).every(Boolean);
                  const nextVal = !allTrue;
                  setColOptions({
                    includeIndex: nextVal,
                    includeCode: nextVal,
                    includeName: nextVal,
                    includeValue: nextVal,
                    includeUnit: nextVal,
                    includeRefRange: nextVal,
                    includeStatus: nextVal,
                    includeNote: nextVal,
                  });
                }}
                className="text-xs text-emerald-700 hover:underline font-medium"
              >
                Chọn tất cả / Bỏ chọn
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {columnsList.map((col) => {
                const checked = colOptions[col.key];
                return (
                  <button
                    key={col.key}
                    type="button"
                    onClick={() => toggleCol(col.key)}
                    className={`flex items-start p-2.5 rounded-xl border text-left transition-all ${
                      checked
                        ? 'border-emerald-500 bg-emerald-50/40 text-slate-900'
                        : 'border-slate-200 bg-slate-50/50 text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    <div className="mt-0.5 mr-2 text-emerald-600">
                      {checked ? (
                        <CheckSquare className="w-4 h-4" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                    <div>
                      <span className="font-semibold text-xs">{col.label}</span>
                      <p className="text-[11px] text-slate-500">{col.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preview Box */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Table className="w-3.5 h-3.5 text-slate-500" />
                Xem trước cấu trúc bảng Excel ({report.tests.length} dòng):
              </span>
              <span className="text-[11px] text-slate-500">Định dạng: Microsoft Excel (.xlsx)</span>
            </div>

            <div className="overflow-x-auto text-[11px]">
              <table className="min-w-full divide-y divide-slate-200 bg-white border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-100 text-slate-600 font-bold">
                  <tr>
                    {colOptions.includeIndex && <th className="px-2.5 py-1.5">STT</th>}
                    {colOptions.includeCode && <th className="px-2.5 py-1.5">Mã</th>}
                    {colOptions.includeName && <th className="px-2.5 py-1.5">Tên xét nghiệm</th>}
                    {colOptions.includeValue && <th className="px-2.5 py-1.5">Kết quả</th>}
                    {colOptions.includeUnit && <th className="px-2.5 py-1.5">Đơn vị</th>}
                    {colOptions.includeRefRange && <th className="px-2.5 py-1.5">Tham chiếu</th>}
                    {colOptions.includeStatus && <th className="px-2.5 py-1.5">Đánh giá</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {report.tests.slice(0, 3).map((t, i) => (
                    <tr key={t.id}>
                      {colOptions.includeIndex && <td className="px-2.5 py-1.5 text-center">{i + 1}</td>}
                      {colOptions.includeCode && <td className="px-2.5 py-1.5 font-semibold">{t.code}</td>}
                      {colOptions.includeName && <td className="px-2.5 py-1.5">{t.name}</td>}
                      {colOptions.includeValue && (
                        <td className="px-2.5 py-1.5 font-bold text-slate-900">{t.value}</td>
                      )}
                      {colOptions.includeUnit && <td className="px-2.5 py-1.5 text-slate-500">{t.unit}</td>}
                      {colOptions.includeRefRange && (
                        <td className="px-2.5 py-1.5 text-slate-500">{t.referenceRange}</td>
                      )}
                      {colOptions.includeStatus && (
                        <td className="px-2.5 py-1.5">
                          {t.status === 'normal' ? 'Bình thường' : t.status === 'low' ? 'Thấp ↓' : 'Cao ↑'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.tests.length > 3 && (
                <p className="text-center text-[10px] text-slate-400 mt-1 italic">
                  ... và {report.tests.length - 3} chỉ số tiếp theo
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleCopyClipboard}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg shadow-2xs transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-600" />
                <span className="text-emerald-600">Đã chép vào Clipboard</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-500" />
                <span>Sao chép dữ liệu (dán vào Excel)</span>
              </>
            )}
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors"
            >
              Hủy
            </button>
            <button
              id="btn-confirm-download-excel"
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs sm:text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg shadow-sm shadow-emerald-600/20 transition-all"
            >
              <Download className="w-4 h-4" />
              <span>Tải file Excel (.xlsx)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
