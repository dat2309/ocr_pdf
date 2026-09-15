import React from 'react';
import { FileSpreadsheet, Upload, Sparkles, FileText, CheckCircle2 } from 'lucide-react';

interface HeaderProps {
  onOpenUpload: () => void;
  onOpenExport: () => void;
  onSelectSample: (index: number) => void;
  hasData: boolean;
  isAnalyzing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenUpload,
  onOpenExport,
  onSelectSample,
  hasData,
  isAnalyzing,
}) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo & Title */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-600 to-cyan-600 flex items-center justify-center text-white shadow-sm shadow-teal-500/20">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                LabScan OCR
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200/60">
                <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                PDF.js & Tesseract OCR
              </span>
            </div>
            <p className="text-xs text-slate-500 hidden sm:flex items-center gap-2">
              <span>Trích xuất kết quả xét nghiệm từ Ảnh & PDF sang Excel tự động</span>
              <span className="text-slate-300">|</span>
              <span className="font-mono text-[11px] text-slate-400" title="Thời gian build">
                Build: {__BUILD_TIME__}
              </span>
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Sample quick loader */}
          <div className="hidden md:flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
            <span className="px-2 text-slate-500 font-medium flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" /> Mẫu:
            </span>
            <button
              id="btn-sample-cbc"
              type="button"
              onClick={() => onSelectSample(0)}
              className="px-2.5 py-1 rounded-md text-slate-700 hover:bg-white hover:text-teal-700 hover:shadow-xs transition-all font-medium"
              title="Xét nghiệm máu CBC (UYÊN LÊ)"
            >
              Huyết học 12 chỉ số
            </button>
            <button
              id="btn-sample-chemistry"
              type="button"
              onClick={() => onSelectSample(1)}
              className="px-2.5 py-1 rounded-md text-slate-700 hover:bg-white hover:text-teal-700 hover:shadow-xs transition-all font-medium"
              title="Sinh hóa máu (NGUYỄN VĂN AN)"
            >
              Sinh hóa 11 chỉ số
            </button>
          </div>

          {/* Upload Button */}
          <button
            id="btn-upload-trigger"
            type="button"
            onClick={onOpenUpload}
            disabled={isAnalyzing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 text-xs sm:text-sm font-semibold transition-colors disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            <span>{isAnalyzing ? 'Đang đọc...' : 'Tải tập tin'}</span>
          </button>

          {/* Export Excel Button */}
          <button
            id="btn-export-excel-header"
            type="button"
            onClick={onOpenExport}
            disabled={!hasData}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs sm:text-sm font-semibold shadow-sm shadow-emerald-600/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Xuất Excel</span>
          </button>
        </div>
      </div>
    </header>
  );
};
