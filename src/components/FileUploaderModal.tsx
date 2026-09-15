import React, { useState, useRef } from 'react';
import {
  Upload,
  FileText,
  ImageIcon,
  X,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  FileCheck,
} from 'lucide-react';
import { SAMPLE_REPORTS } from '../data/sampleReports';
import { LabReport } from '../types';

interface FileUploaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSample: (sample: LabReport) => void;
  onUploadFile: (file: File) => Promise<void>;
  onCancelOcr?: () => void;
  isAnalyzing: boolean;
  progressMessage?: string;
  progressPercent?: number;
  error: string | null;
}

export const FileUploaderModal: React.FC<FileUploaderModalProps> = ({
  isOpen,
  onClose,
  onSelectSample,
  onUploadFile,
  onCancelOcr,
  isAnalyzing,
  progressMessage,
  progressPercent,
  error,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFileName(file.name);
    await onUploadFile(file);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    setSelectedFileName(file.name);
    await onUploadFile(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Tải lên phiếu xét nghiệm</h3>
              <p className="text-xs text-slate-500">Hỗ trợ định dạng hình ảnh (PNG, JPG, WebP) hoặc file PDF</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isAnalyzing}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Error notice if any */}
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Lỗi nhận diện tài liệu</p>
                <p className="mt-0.5 text-rose-700">{error}</p>
              </div>
            </div>
          )}

          {/* Drag & drop box */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !isAnalyzing && fileInputRef.current?.click()}
            className={`relative p-8 rounded-2xl border-2 border-dashed text-center transition-all cursor-pointer ${
              isDragOver
                ? 'border-teal-500 bg-teal-50/50 scale-[0.99]'
                : isAnalyzing
                ? 'border-teal-300 bg-teal-50/30 cursor-wait'
                : 'border-slate-300 hover:border-teal-500 hover:bg-slate-50/70'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/jpg,application/pdf"
              className="hidden"
              onChange={handleFileChange}
              disabled={isAnalyzing}
            />

            {isAnalyzing ? (
              <div className="space-y-3 py-4">
                <div className="w-12 h-12 rounded-full bg-teal-100 text-teal-600 mx-auto flex items-center justify-center animate-pulse">
                  <Sparkles className="w-6 h-6 animate-spin" />
                </div>
                <div>
                  <p className="text-sm font-bold text-teal-900">
                    {progressMessage || 'PDF.js & Tesseract OCR đang đọc dữ liệu...'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 font-mono">
                    {selectedFileName || 'Tài liệu xét nghiệm'}
                  </p>
                </div>
                <div className="w-56 h-2 bg-slate-200 rounded-full mx-auto overflow-hidden">
                  <div
                    className="h-full bg-teal-600 rounded-full transition-all duration-300"
                    style={{ width: `${progressPercent || 75}%` }}
                  />
                </div>
                {progressPercent !== undefined && (
                  <p className="text-[11px] font-medium text-teal-700">{progressPercent}%</p>
                )}
                {onCancelOcr && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCancelOcr();
                    }}
                    className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Hủy nhận diện</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 mx-auto flex items-center justify-center group-hover:text-teal-600">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    Kéo thả ảnh hoặc file PDF vào đây, hoặc <span className="text-teal-600 underline">duyệt tập tin</span>
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Hỗ trợ phiếu xét nghiệm chụp bằng điện thoại, máy scan, hoặc file PDF kết quả từ bệnh viện
                  </p>
                </div>
                <div className="pt-2 flex items-center justify-center gap-2 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5" /> PNG, JPG, WebP
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" /> PDF
                  </span>
                  <span>•</span>
                  <span>Tối đa 25MB</span>
                </div>
              </div>
            )}
          </div>

          {/* Quick preset samples */}
          <div className="pt-2 border-t border-slate-100">
            <span className="text-xs font-semibold text-slate-700 block mb-2">
              Hoặc thử nhanh với dữ liệu mẫu thực tế:
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {SAMPLE_REPORTS.map((sample, idx) => (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => {
                    onSelectSample(sample);
                    onClose();
                  }}
                  disabled={isAnalyzing}
                  className="p-3 rounded-xl border border-slate-200 hover:border-teal-500 hover:bg-teal-50/30 text-left transition-all group"
                >
                  <div className="flex items-start justify-between">
                    <span className="font-semibold text-xs text-slate-900 group-hover:text-teal-700">
                      {sample.title}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">
                      {sample.tests.length} chỉ số
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {sample.patient.fullName} · {sample.patient.gender} · {sample.patient.resultDate}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400">
                    <FileCheck className="w-3 h-3 text-emerald-600" />
                    <span>{sample.abnormalCount} chỉ số bất thường phát hiện</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isAnalyzing}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
