import React, { useState } from 'react';
import {
  AlertTriangle,
  RotateCw,
  Trash2,
  Plus,
  Copy,
  FileSpreadsheet,
  Check,
  ChevronDown,
  Filter,
  Search,
  ExternalLink,
  Edit2,
  CheckCircle2,
  FileCode,
  X,
} from 'lucide-react';
import { LabReport, LabTestItem, LabTestStatus } from '../types';
import { LAB_CATALOG, COMMON_UNITS } from '../data/labCatalog';

interface LabResultsTableProps {
  report: LabReport;
  onUpdateReport: (updated: LabReport) => void;
  onReAnalyze: () => void;
  onExportExcel: () => void;
  onCancel: () => void;
  onCopyClipboard: () => Promise<void>;
  isReanalyzing?: boolean;
}

export const LabResultsTable: React.FC<LabResultsTableProps> = ({
  report,
  onUpdateReport,
  onReAnalyze,
  onExportExcel,
  onCancel,
  onCopyClipboard,
  isReanalyzing = false,
}) => {
  const [filter, setFilter] = useState<'all' | 'abnormal' | 'normal' | 'unmapped'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [isEditingPatient, setIsEditingPatient] = useState(false);
  const [patientForm, setPatientForm] = useState(report.patient);
  const [showRawModal, setShowRawModal] = useState(false);
  const [copiedRawInTable, setCopiedRawInTable] = useState(false);

  // Auto calculate status based on value and reference range
  const recalculateStatus = (
    valStr: string,
    refRangeStr: string,
    currentStatus: LabTestStatus
  ): { status: LabTestStatus; refMin?: number; refMax?: number } => {
    const num = parseFloat(valStr.replace(/,/g, '.'));
    if (isNaN(num)) return { status: currentStatus };

    // Try to parse range "min - max" or "< max" or "> min"
    let min: number | undefined;
    let max: number | undefined;

    const rangeMatch = refRangeStr.match(/([0-9.]+)\s*[-–—]\s*([0-9.]+)/);
    if (rangeMatch) {
      min = parseFloat(rangeMatch[1]);
      max = parseFloat(rangeMatch[2]);
    } else {
      const lessMatch = refRangeStr.match(/[<≤]\s*([0-9.]+)/);
      if (lessMatch) max = parseFloat(lessMatch[1]);

      const greaterMatch = refRangeStr.match(/[>≥]\s*([0-9.]+)/);
      if (greaterMatch) min = parseFloat(greaterMatch[1]);
    }

    if (max !== undefined && num > max) {
      return { status: 'high', refMin: min, refMax: max };
    }
    if (min !== undefined && num < min) {
      return { status: 'low', refMin: min, refMax: max };
    }
    if (min !== undefined || max !== undefined) {
      return { status: 'normal', refMin: min, refMax: max };
    }

    return { status: currentStatus };
  };

  const handleUpdateTestItem = (id: string, updates: Partial<LabTestItem>) => {
    const updatedTests = report.tests.map((t) => {
      if (t.id !== id) return t;

      const merged = { ...t, ...updates };

      // If value or reference range changed, auto re-check status
      if (updates.value !== undefined || updates.referenceRange !== undefined) {
        const { status, refMin, refMax } = recalculateStatus(
          merged.value,
          merged.referenceRange,
          merged.status
        );
        merged.status = status;
        if (refMin !== undefined) merged.refMin = refMin;
        if (refMax !== undefined) merged.refMax = refMax;
      }

      return merged;
    });

    const abnormalCount = updatedTests.filter(
      (t) => t.status === 'low' || t.status === 'high' || t.status === 'abnormal'
    ).length;
    const unmappedCount = updatedTests.filter((t) => t.isUnmapped).length;

    onUpdateReport({
      ...report,
      tests: updatedTests,
      totalDetected: updatedTests.length,
      abnormalCount,
      unmappedCount,
    });
  };

  const handleMapCatalog = (testId: string, catalogId: string) => {
    const catalogItem = LAB_CATALOG.find((c) => c.id === catalogId);
    if (!catalogItem) {
      handleUpdateTestItem(testId, {
        isUnmapped: true,
      });
      return;
    }

    handleUpdateTestItem(testId, {
      name: catalogItem.name,
      code: catalogItem.code,
      unit: catalogItem.defaultUnit,
      referenceRange: catalogItem.defaultRefRange,
      matchedCategory: catalogItem.category,
      isUnmapped: false,
    });
  };

  const handleDeleteTest = (id: string) => {
    const updatedTests = report.tests.filter((t) => t.id !== id);
    const abnormalCount = updatedTests.filter(
      (t) => t.status === 'low' || t.status === 'high' || t.status === 'abnormal'
    ).length;
    const unmappedCount = updatedTests.filter((t) => t.isUnmapped).length;

    onUpdateReport({
      ...report,
      tests: updatedTests,
      totalDetected: updatedTests.length,
      abnormalCount,
      unmappedCount,
    });
  };

  const handleAddNewTest = () => {
    const newTest: LabTestItem = {
      id: `new-${Date.now()}`,
      name: '',
      code: '',
      rawName: 'Thủ công',
      value: '',
      unit: '',
      referenceRange: '',
      status: 'normal',
      confidence: 100,
      isUnmapped: true,
    };

    const updatedTests = [...report.tests, newTest];
    onUpdateReport({
      ...report,
      tests: updatedTests,
      totalDetected: updatedTests.length,
      unmappedCount: report.unmappedCount + 1,
    });
  };

  const handleSavePatient = () => {
    onUpdateReport({
      ...report,
      patient: patientForm,
    });
    setIsEditingPatient(false);
  };

  const handleCopy = async () => {
    await onCopyClipboard();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Filter & search
  const filteredTests = report.tests.filter((test) => {
    if (filter === 'abnormal' && test.status === 'normal') return false;
    if (filter === 'normal' && test.status !== 'normal') return false;
    if (filter === 'unmapped' && !test.isUnmapped) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        test.name.toLowerCase().includes(q) ||
        test.code.toLowerCase().includes(q) ||
        test.rawName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="h-full flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Top Header matching reference image */}
      <div className="p-4 sm:px-6 sm:py-4 border-b border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              Kết quả đọc từ tập tin
            </h2>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full border border-slate-200">
              <FileSpreadsheet className="w-3 h-3 text-teal-600" />
              Đọc từ tập tin
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setIsEditingPatient(!isEditingPatient)}
              className="text-xs text-teal-700 hover:text-teal-800 font-medium inline-flex items-center gap-1 hover:underline"
            >
              <Edit2 className="w-3 h-3" />
              Sửa thông tin hành chính
            </button>
          </div>
        </div>

        {/* Patient Subtitle Line: "Xét nghiệm máu 10 thông số · UYÊN LÊ · Nữ, 1999 · Ngày trả kết quả 08/09/2026" */}
        <p className="text-xs sm:text-sm text-slate-600 mt-1 font-medium flex flex-wrap items-center gap-1">
          <span className="font-semibold text-slate-800">{report.title}</span>
          <span>·</span>
          <span className="font-bold text-teal-800 uppercase">{report.patient.fullName}</span>
          <span>·</span>
          <span>
            {report.patient.gender}, {report.patient.birthYearOrAge}
          </span>
          <span>·</span>
          <span>Ngày trả kết quả: {report.patient.resultDate}</span>
          {report.patient.patientCode && (
            <>
              <span>·</span>
              <span className="text-slate-500 font-mono text-xs">Mã: {report.patient.patientCode}</span>
            </>
          )}
        </p>

        {/* Patient quick editor collapse */}
        {isEditingPatient && (
          <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Tên bệnh nhân</label>
              <input
                type="text"
                value={patientForm.fullName}
                onChange={(e) => setPatientForm({ ...patientForm, fullName: e.target.value })}
                className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-500 outline-hidden"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Giới tính & Tuổi</label>
              <div className="flex gap-1">
                <select
                  value={patientForm.gender}
                  onChange={(e) => setPatientForm({ ...patientForm, gender: e.target.value })}
                  className="w-1/2 px-2 py-1 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-500 outline-hidden"
                >
                  <option value="Nữ">Nữ</option>
                  <option value="Nam">Nam</option>
                  <option value="Khác">Khác</option>
                </select>
                <input
                  type="text"
                  placeholder="1999"
                  value={patientForm.birthYearOrAge}
                  onChange={(e) => setPatientForm({ ...patientForm, birthYearOrAge: e.target.value })}
                  className="w-1/2 px-2 py-1 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-500 outline-hidden"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Ngày trả kết quả</label>
              <input
                type="text"
                value={patientForm.resultDate}
                onChange={(e) => setPatientForm({ ...patientForm, resultDate: e.target.value })}
                className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-500 outline-hidden"
              />
            </div>
            <div className="flex items-end space-x-1">
              <button
                type="button"
                onClick={handleSavePatient}
                className="px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded text-xs font-semibold shadow-xs"
              >
                Lưu
              </button>
              <button
                type="button"
                onClick={() => setIsEditingPatient(false)}
                className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-xs font-medium"
              >
                Đóng
              </button>
            </div>
          </div>
        )}

        {/* Stats Strip matching reference image:
            "Đọc được 12 chỉ số · 2 chỉ tiêu chưa khớp danh mục · 6 chỉ số bất thường · Độ tin cậy trung bình 87%   [Đọc lại tập tin]" */}
        <div className="mt-3 py-2 px-3 bg-slate-50/80 rounded-lg border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-600">
            <span className="font-semibold text-slate-900">
              Đọc được {report.totalDetected} chỉ số
            </span>
            <span>·</span>
            <span className={report.unmappedCount > 0 ? 'text-rose-600 font-semibold' : 'text-slate-600'}>
              {report.unmappedCount} chỉ tiêu chưa khớp danh mục
            </span>
            <span>·</span>
            <span className={report.abnormalCount > 0 ? 'text-amber-600 font-semibold' : 'text-emerald-700 font-medium'}>
              {report.abnormalCount} chỉ số bất thường
            </span>
            <span>·</span>
            <span>
              Độ tin cậy trung bình <strong className="text-teal-700">{report.avgConfidence}%</strong>
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => setShowRawModal(true)}
              className="text-xs text-teal-700 hover:text-teal-800 font-semibold inline-flex items-center gap-1 transition-colors"
              title="Xem văn bản thô đọc được từ OCR"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Xem Dữ liệu Raw</span>
            </button>

            <button
              type="button"
              onClick={onReAnalyze}
              disabled={isReanalyzing}
              className="text-xs text-slate-600 hover:text-slate-800 font-medium inline-flex items-center gap-1 transition-colors disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isReanalyzing ? 'animate-spin' : ''}`} />
              <span>Đọc lại tập tin</span>
            </button>
          </div>
        </div>

        {/* Filters and search bar */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center space-x-1">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Tất cả ({report.tests.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('abnormal')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                filter === 'abnormal'
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/50'
              }`}
            >
              Bất thường ({report.abnormalCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter('normal')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                filter === 'normal'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/50'
              }`}
            >
              Bình thường ({report.tests.length - report.abnormalCount})
            </button>
            {report.unmappedCount > 0 && (
              <button
                type="button"
                onClick={() => setFilter('unmapped')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  filter === 'unmapped'
                    ? 'bg-rose-600 text-white'
                    : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/50'
                }`}
              >
                Chưa khớp ({report.unmappedCount})
              </button>
            )}
          </div>

          <div className="relative w-44 sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm chỉ số..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1 bg-slate-50 border border-slate-200 rounded-md text-xs focus:ring-1 focus:ring-teal-500 focus:bg-white outline-hidden"
            />
          </div>
        </div>
      </div>

      {/* Main Table Area matching columns: CHỈ SỐ | KẾT QUẢ | ĐƠN VỊ | KHOẢNG THAM CHIẾU | ĐÁNH GIÁ */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50/90 sticky top-0 z-10 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="py-2.5 px-4 sm:px-6 w-[35%]">CHỈ SỐ</th>
              <th className="py-2.5 px-3 w-[18%]">KẾT QUẢ</th>
              <th className="py-2.5 px-3 w-[15%]">ĐƠN VỊ</th>
              <th className="py-2.5 px-3 w-[18%]">KHOẢNG THAM CHIẾU</th>
              <th className="py-2.5 px-3 w-[12%] text-center">ĐÁNH GIÁ</th>
              <th className="py-2.5 px-2 w-[4%] text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {filteredTests.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400">
                  Không tìm thấy chỉ số xét nghiệm phù hợp với bộ lọc.
                </td>
              </tr>
            ) : (
              filteredTests.map((test) => {
                const isAbnormal = test.status === 'low' || test.status === 'high' || test.status === 'abnormal';

                return (
                  <tr
                    key={test.id}
                    className={`hover:bg-slate-50/70 transition-colors ${
                      test.isUnmapped ? 'bg-rose-50/20' : ''
                    }`}
                  >
                    {/* CHỈ SỐ Column */}
                    <td className="py-2.5 px-4 sm:px-6">
                      <div className="space-y-1">
                        {test.isUnmapped ? (
                          /* Unmapped item with red/amber highlight like in user's image */
                          <div className="relative">
                            <select
                              aria-label="Chọn chỉ số trong danh mục"
                              value=""
                              onChange={(e) => handleMapCatalog(test.id, e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-white border border-rose-300 hover:border-rose-400 text-rose-700 font-medium rounded-md text-xs focus:ring-1 focus:ring-rose-500 outline-hidden appearance-none pr-7 shadow-xs"
                            >
                              <option value="" disabled>
                                Chọn chỉ số trong danh mục
                              </option>
                              {LAB_CATALOG.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name} ({item.code})
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-rose-500 pointer-events-none" />
                          </div>
                        ) : (
                          /* Standard mapped dropdown */
                          <div className="relative">
                            <select
                              aria-label="Chọn chỉ số xét nghiệm"
                              value={
                                LAB_CATALOG.find((c) => c.code.toLowerCase() === test.code.toLowerCase() || c.name === test.name)?.id || ''
                              }
                              onChange={(e) => handleMapCatalog(test.id, e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 hover:border-slate-300 font-medium text-slate-800 rounded-md text-xs focus:ring-1 focus:ring-teal-500 outline-hidden appearance-none pr-7 truncate shadow-2xs"
                            >
                              <option value="">{test.name || test.code || 'Tùy chỉnh'}</option>
                              {LAB_CATALOG.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          </div>
                        )}

                        {/* Raw read subtitle */}
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 pl-0.5">
                          <span>Đọc được:</span>
                          <span className="font-mono text-slate-500">{test.rawName || test.code}</span>
                        </div>
                      </div>
                    </td>

                    {/* KẾT QUẢ Column with warning icon inside input if abnormal */}
                    <td className="py-2.5 px-3">
                      <div className="relative">
                        <input
                          type="text"
                          value={test.value}
                          onChange={(e) => handleUpdateTestItem(test.id, { value: e.target.value })}
                          className={`w-full px-3 py-1.5 rounded-md font-semibold text-xs border text-center transition-all outline-hidden ${
                            isAbnormal
                              ? 'bg-amber-50/50 border-amber-300 text-amber-900 focus:ring-1 focus:ring-amber-500'
                              : 'bg-white border-slate-200 text-slate-900 focus:ring-1 focus:ring-teal-500'
                          }`}
                        />
                        {isAbnormal && (
                          <span
                            title="Chỉ số ngoài ngưỡng tham chiếu"
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-500"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                    </td>

                    {/* ĐƠN VỊ Column */}
                    <td className="py-2.5 px-3">
                      <div className="relative">
                        <input
                          list={`units-${test.id}`}
                          value={test.unit}
                          onChange={(e) => handleUpdateTestItem(test.id, { unit: e.target.value })}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-md text-xs text-slate-700 focus:ring-1 focus:ring-teal-500 outline-hidden pr-6 text-center"
                          placeholder="Đơn vị"
                        />
                        <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <datalist id={`units-${test.id}`}>
                          {COMMON_UNITS.map((u) => (
                            <option key={u} value={u} />
                          ))}
                        </datalist>
                      </div>
                    </td>

                    {/* KHOẢNG THAM CHIẾU Column */}
                    <td className="py-2.5 px-3">
                      <input
                        type="text"
                        value={test.referenceRange}
                        onChange={(e) => handleUpdateTestItem(test.id, { referenceRange: e.target.value })}
                        className="w-full px-2.5 py-1.5 bg-transparent hover:bg-white border border-transparent hover:border-slate-200 focus:border-slate-300 rounded-md text-xs text-slate-600 text-center focus:ring-1 focus:ring-teal-500 outline-hidden"
                        placeholder="min - max"
                      />
                    </td>

                    {/* ĐÁNH GIÁ Column */}
                    <td className="py-2.5 px-3 text-center">
                      {test.isUnmapped ? (
                        <span className="text-slate-400 text-xs">—</span>
                      ) : test.status === 'normal' ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                          Bình thường
                        </span>
                      ) : test.status === 'low' ? (
                        <span className="inline-flex items-center gap-0.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200/60">
                          Thấp ↓
                        </span>
                      ) : test.status === 'high' ? (
                        <span className="inline-flex items-center gap-0.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/60">
                          Cao ↑
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/60">
                          Bất thường
                        </span>
                      )}
                    </td>

                    {/* Delete action */}
                    <td className="py-2.5 px-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteTest(test.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                        title="Xóa chỉ số này"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom bar matching user's reference image */}
      <div className="p-3 sm:px-6 sm:py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
        {/* Left Notice: "⚠ 2 chỉ tiêu chưa khớp danh mục sẽ không được lưu vào bệnh án" */}
        <div className="flex items-center space-x-2 text-xs">
          {report.unmappedCount > 0 ? (
            <span className="text-amber-700 flex items-center gap-1.5 font-medium">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                {report.unmappedCount} chỉ tiêu chưa khớp danh mục sẽ không được lưu vào bệnh án / Excel
              </span>
            </span>
          ) : (
            <span className="text-emerald-700 flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Tất cả chỉ số đã được chuẩn hóa danh mục y tế</span>
            </span>
          )}

          <button
            type="button"
            onClick={handleAddNewTest}
            className="ml-2 text-xs text-teal-700 hover:text-teal-800 font-semibold inline-flex items-center gap-1 hover:underline"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm chỉ số</span>
          </button>
        </div>

        {/* Right Action Buttons: [HỦY] [SAO CHÉP] [XUẤT RA EXCEL / LƯU VÀO BỆNH ÁN] */}
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/70 rounded-lg transition-colors"
          >
            HỦY
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg shadow-2xs transition-colors"
            title="Sao chép bảng kết quả vào Clipboard (dán vào Excel / Sheets)"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-600">Đã chép</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                <span>Sao chép</span>
              </>
            )}
          </button>

          <button
            id="btn-save-export-excel"
            type="button"
            onClick={onExportExcel}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg shadow-sm shadow-emerald-600/20 transition-all"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>LƯU VÀO BỆNH ÁN & XUẤT EXCEL</span>
          </button>
        </div>
      </div>

      {/* Raw Data Modal Popup */}
      {showRawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center">
                  <FileCode className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Dữ liệu OCR thô (Raw Text)</h3>
                  <p className="text-[11px] text-slate-500">
                    Văn bản nhận diện trực tiếp từ phiếu xét nghiệm: {report.fileName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRawModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-2 text-xs text-slate-500">
                <span>
                  Tổng cộng: <strong className="text-slate-800 font-mono">{(report.rawText || '').split('\n').filter(Boolean).length} dòng</strong> ({(report.rawText || '').length} ký tự)
                </span>
                <span className="text-[11px] text-slate-400 font-medium">Định dạng: Plain Text UTF-8</span>
              </div>

              <div className="flex-1 overflow-auto bg-slate-950 text-slate-200 p-4 rounded-xl font-mono text-xs leading-relaxed whitespace-pre-wrap select-text border border-slate-800 shadow-inner">
                {report.rawText || 'Chưa có dữ liệu văn bản thô cho tài liệu này.'}
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={async () => {
                  if (!report.rawText) return;
                  try {
                    await navigator.clipboard.writeText(report.rawText);
                    setCopiedRawInTable(true);
                    setTimeout(() => setCopiedRawInTable(false), 2000);
                  } catch (err) {
                    console.error('Failed to copy raw text:', err);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg shadow-2xs transition-colors"
              >
                {copiedRawInTable ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-600 font-semibold">Đã chép vào Clipboard</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    <span>Sao chép toàn bộ Text</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowRawModal(false)}
                className="px-4 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
