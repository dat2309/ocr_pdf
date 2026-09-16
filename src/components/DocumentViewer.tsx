import React, { useState, useRef } from 'react';
import {
  RotateCw,
  RotateCcw,
  Maximize2,
  Minimize2,
  RefreshCw,
  FileText,
  ImageIcon,
  FileCode,
  Copy,
  Check,
  Info,
  Eye,
} from 'lucide-react';
import { LabReport } from '../types';

interface DocumentViewerProps {
  report: LabReport | null;
  onDropNewFile?: (file: File) => void;
  onApplyRawText?: (rawText: string, engineName: string) => void;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  report,
  onDropNewFile,
  onApplyRawText,
}) => {
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'raw' | 'info'>('preview');
  const [copiedRaw, setCopiedRaw] = useState(false);
  const [copiedTesseract, setCopiedTesseract] = useState(false);
  const [copiedScribe, setCopiedScribe] = useState(false);
  const [rawViewMode, setRawViewMode] = useState<'compare' | 'tesseract' | 'scribe' | 'active'>('compare');

  const containerRef = useRef<HTMLDivElement>(null);

  const copyToClipboard = async (text: string, setCopied: (v: boolean) => void) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const handleCopyRaw = () => copyToClipboard(report?.rawText || '', setCopiedRaw);

  const handleRotateCw = () => setRotation((prev) => (prev + 90) % 360);
  const handleRotateCcw = () => setRotation((prev) => (prev - 90 + 360) % 360);
  const handleReset = () => {
    setRotation(0);
    setPan({ x: 0, y: 0 });
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Left click only
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  if (!report) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-slate-900/5 rounded-2xl border-2 border-dashed border-slate-300">
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-4">
          <ImageIcon className="w-8 h-8" />
        </div>
        <h3 className="text-sm font-semibold text-slate-700">Chưa có tập tin phiếu xét nghiệm</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-xs">
          Tải lên ảnh (JPG, PNG) hoặc file PDF kết quả xét nghiệm để xem tài liệu gốc đối chiếu.
        </p>
      </div>
    );
  }

  const isPdf = report.fileType === 'pdf';

  return (
    <div
      ref={containerRef}
      className={`relative h-full flex flex-col bg-slate-900 select-none overflow-hidden rounded-xl border border-slate-800 shadow-md ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none' : ''
      }`}
    >
      {/* Top bar */}
      <div className="px-4 py-2.5 bg-slate-950/80 backdrop-blur-xs border-b border-slate-800 flex items-center justify-between text-xs text-slate-300 z-10">
        <div className="flex items-center space-x-2 truncate">
          <span className="p-1 rounded bg-slate-800 text-teal-400">
            {isPdf ? <FileText className="w-3.5 h-3.5" /> : <ImageIcon className="w-3.5 h-3.5" />}
          </span>
          <span className="font-medium text-slate-200 truncate max-w-[200px] sm:max-w-xs" title={report.fileName}>
            {report.fileName}
          </span>
        </div>

        <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[11px]">
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1 ${
              activeTab === 'preview' ? 'bg-teal-600 text-white' : 'hover:bg-slate-800 text-slate-400'
            }`}
          >
            <Eye className="w-3 h-3" />
            <span>Tài liệu gốc</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('raw')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1 ${
              activeTab === 'raw' ? 'bg-teal-600 text-white' : 'hover:bg-slate-800 text-slate-400'
            }`}
            title="Xem toàn bộ văn bản OCR đọc được nguyên bản từ tập tin"
          >
            <FileCode className="w-3 h-3" />
            <span>Dữ liệu Raw</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('info')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1 ${
              activeTab === 'info' ? 'bg-teal-600 text-white' : 'hover:bg-slate-800 text-slate-400'
            }`}
          >
            <Info className="w-3 h-3" />
            <span>Thông tin</span>
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div
        className={`relative flex-1 overflow-hidden flex items-center justify-center bg-slate-950/60 ${
          activeTab === 'preview' ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
        onMouseDown={activeTab === 'preview' ? handleMouseDown : undefined}
        onMouseMove={activeTab === 'preview' ? handleMouseMove : undefined}
        onMouseUp={activeTab === 'preview' ? handleMouseUp : undefined}
        onMouseLeave={activeTab === 'preview' ? handleMouseUp : undefined}
      >
        {activeTab === 'preview' ? (
          <div
            className="transition-transform duration-75 origin-center flex items-center justify-center p-4"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg)`,
            }}
          >
            {isPdf && report.fileDataUrl.startsWith('data:application/pdf') ? (
              <iframe
                src={`${report.fileDataUrl}#toolbar=0&navpanes=0`}
                title="Tài liệu PDF xét nghiệm"
                className="w-[580px] h-[780px] bg-white rounded-lg shadow-2xl pointer-events-none border border-slate-700"
              />
            ) : (
              <img
                src={report.fileDataUrl}
                alt="Phiếu kết quả xét nghiệm gốc"
                className="max-w-[560px] max-h-[760px] w-auto h-auto object-contain rounded-sm shadow-2xl bg-white"
                draggable={false}
              />
            )}
          </div>
        ) : activeTab === 'raw' ? (
          /* Raw OCR Text View & Side-by-Side Comparison */
          <div className="w-full h-full flex flex-col bg-slate-950 p-3 sm:p-4 text-slate-200">
            {/* Top Toolbar: Sub-tabs and actions */}
            <div className="flex flex-wrap items-center justify-between pb-2.5 mb-2 border-b border-slate-800 gap-2">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-teal-400" />
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">
                  Dữ liệu Text thô (Raw OCR)
                </span>
              </div>

              {/* Engine sub-tabs if multiple engine results exist */}
              {report.tesseractRawText && report.scribeRawText ? (
                <div className="flex items-center bg-slate-900 border border-slate-700/80 rounded-lg p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setRawViewMode('compare')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                      rawViewMode === 'compare'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    So sánh 2 bên
                  </button>
                  <button
                    type="button"
                    onClick={() => setRawViewMode('tesseract')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                      rawViewMode === 'tesseract'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Tesseract.js
                  </button>
                  <button
                    type="button"
                    onClick={() => setRawViewMode('scribe')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                      rawViewMode === 'scribe'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Scribe.js
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-teal-300 font-mono">
                    {(report.rawText || '').split('\n').filter(Boolean).length} dòng · {(report.rawText || '').length} ký tự
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyRaw}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors border border-slate-700 hover:border-slate-600 shadow-2xs"
                    title="Sao chép toàn bộ văn bản OCR vào Clipboard"
                  >
                    {copiedRaw ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400 font-semibold">Đã chép</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                        <span>Sao chép Raw</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Content Area */}
            {report.tesseractRawText && report.scribeRawText && rawViewMode === 'compare' ? (
              /* Side-by-Side Dual Pane */
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 min-h-0 overflow-hidden">
                {/* Left: Tesseract.js */}
                <div className="flex flex-col h-full bg-slate-900/90 rounded-lg border border-slate-800 overflow-hidden shadow-inner">
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-850 border-b border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs shadow-emerald-500/50"></span>
                      <span className="text-xs font-bold text-emerald-400">Tesseract.js</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {(report.tesseractRawText || '').split('\n').filter(Boolean).length} dòng
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {onApplyRawText && (
                        <button
                          type="button"
                          onClick={() => onApplyRawText(report.tesseractRawText || '', 'Tesseract.js')}
                          className="px-2 py-0.5 rounded bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 text-[11px] font-semibold border border-emerald-800/80 transition-colors"
                          title="Áp dụng văn bản Tesseract vào bảng kết quả xét nghiệm"
                        >
                          Dùng text này
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => copyToClipboard(report.tesseractRawText || '', setCopiedTesseract)}
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                        title="Sao chép văn bản Tesseract.js"
                      >
                        {copiedTesseract ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-auto p-3 font-mono text-xs text-slate-300 leading-relaxed whitespace-pre-wrap select-text">
                    {report.tesseractRawText}
                  </div>
                </div>

                {/* Right: Scribe.js */}
                <div className="flex flex-col h-full bg-slate-900/90 rounded-lg border border-slate-800 overflow-hidden shadow-inner">
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-850 border-b border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-xs shadow-purple-500/50"></span>
                      <span className="text-xs font-bold text-purple-400">Scribe.js</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {(report.scribeRawText || '').split('\n').filter(Boolean).length} dòng
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {onApplyRawText && (
                        <button
                          type="button"
                          onClick={() => onApplyRawText(report.scribeRawText || '', 'Scribe.js')}
                          className="px-2 py-0.5 rounded bg-purple-950/80 hover:bg-purple-900 text-purple-300 text-[11px] font-semibold border border-purple-800/80 transition-colors"
                          title="Áp dụng văn bản Scribe.js vào bảng kết quả xét nghiệm"
                        >
                          Dùng text này
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => copyToClipboard(report.scribeRawText || '', setCopiedScribe)}
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                        title="Sao chép văn bản Scribe.js"
                      >
                        {copiedScribe ? <Check className="w-3.5 h-3.5 text-purple-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-auto p-3 font-mono text-xs text-slate-300 leading-relaxed whitespace-pre-wrap select-text">
                    {report.scribeRawText}
                  </div>
                </div>
              </div>
            ) : (
              /* Single Full Width View */
              <div className="flex-1 flex flex-col min-h-0 bg-slate-900 rounded-lg border border-slate-800/90 overflow-hidden">
                <div className="flex items-center justify-between px-3.5 py-2 bg-slate-850 border-b border-slate-800 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Đang xem:</span>
                    <span className="font-bold text-teal-300">
                      {rawViewMode === 'scribe' ? 'Scribe.js' : rawViewMode === 'tesseract' ? 'Tesseract.js' : (report.selectedEngine === 'scribe' ? 'Scribe.js' : 'Tesseract.js')}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const textToCopy = rawViewMode === 'scribe' ? (report.scribeRawText || '') : (report.tesseractRawText || report.rawText || '');
                      copyToClipboard(textToCopy, setCopiedRaw);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] text-slate-300 hover:text-white px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700"
                  >
                    {copiedRaw ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>Sao chép</span>
                  </button>
                </div>
                <div className="flex-1 overflow-auto p-3.5 font-mono text-xs text-slate-300 leading-relaxed whitespace-pre-wrap select-text shadow-inner">
                  {(rawViewMode === 'scribe' ? report.scribeRawText : (rawViewMode === 'tesseract' ? report.tesseractRawText : report.rawText)) || (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center py-8">
                      <FileCode className="w-8 h-8 text-slate-600 mb-2" />
                      <p className="text-xs">Chưa có chuỗi văn bản OCR thô cho chế độ này.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Metadata view */
          <div className="w-full h-full p-6 text-slate-200 overflow-y-auto bg-slate-900/90 backdrop-blur-xs">
            <h4 className="text-sm font-bold text-teal-400 uppercase tracking-wider mb-4 border-b border-slate-800 pb-2">
              Thông tin chi tiết phiếu xét nghiệm
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block mb-1">Loại xét nghiệm:</span>
                <span className="font-semibold text-white">{report.title}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-1">Cơ sở xét nghiệm:</span>
                <span className="font-semibold text-white">{report.patient.facility || 'Chưa rõ'}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-1">Họ tên bệnh nhân:</span>
                <span className="font-semibold text-white">{report.patient.fullName}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-1">Giới tính & Tuổi:</span>
                <span className="font-semibold text-white">
                  {report.patient.gender} · {report.patient.birthYearOrAge}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block mb-1">Mã bệnh nhân:</span>
                <span className="font-mono text-teal-300 font-semibold">{report.patient.patientCode || 'Không có'}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-1">Bác sĩ chỉ định:</span>
                <span className="font-semibold text-white">{report.patient.doctor || 'Không có'}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-1">Ngày trả kết quả:</span>
                <span className="font-semibold text-white">{report.patient.resultDate}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-1">Chẩn đoán ban đầu:</span>
                <span className="text-white">{report.patient.diagnosis || 'Không có'}</span>
              </div>
            </div>

            <div className="mt-6 p-4 rounded-lg bg-slate-800/80 border border-slate-700">
              <span className="text-xs font-semibold text-slate-300 block mb-2">Thống kê trích xuất:</span>
              <ul className="text-xs space-y-1 text-slate-400">
                <li>• Tổng số chỉ số phát hiện: <strong className="text-slate-200">{report.totalDetected}</strong></li>
                <li>• Chỉ số bất thường (Cao / Thấp): <strong className="text-amber-400">{report.abnormalCount}</strong></li>
                <li>• Chỉ số chưa khớp danh mục chuẩn: <strong className="text-slate-200">{report.unmappedCount}</strong></li>
                <li>• Độ tin cậy nhận diện trung bình: <strong className="text-teal-400">{report.avgConfidence}%</strong></li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Floating Toolbar Controls at Bottom (Only in preview mode) */}
      {activeTab === 'preview' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 text-white rounded-full px-3 py-1.5 shadow-xl flex items-center space-x-2 z-20">
        <button
          type="button"
          onClick={handleRotateCcw}
          className="p-1.5 hover:bg-slate-700 rounded-full transition-colors text-slate-300 hover:text-white"
          title="Xoay ngược chiều kim đồng hồ"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleRotateCw}
          className="p-1.5 hover:bg-slate-700 rounded-full transition-colors text-slate-300 hover:text-white"
          title="Xoay theo chiều kim đồng hồ"
        >
          <RotateCw className="w-4 h-4" />
        </button>
        <div className="w-px h-4 bg-slate-700" />
        <button
          type="button"
          onClick={handleReset}
          className="p-1.5 hover:bg-slate-700 rounded-full transition-colors text-slate-300 hover:text-white"
          title="Đặt lại góc nhìn"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="p-1.5 hover:bg-slate-700 rounded-full transition-colors text-slate-300 hover:text-white"
          title={isFullscreen ? 'Thu nhỏ cửa sổ' : 'Xem toàn màn hình'}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>
      )}

      {/* Bottom Left thumbnail indicator like in user's image */}
      <div className="absolute bottom-4 left-4 flex items-center space-x-1.5 z-20">
        <button
          type="button"
          className="w-8 h-8 rounded-lg bg-teal-600/90 text-white flex items-center justify-center shadow-md border border-teal-500/50 hover:bg-teal-500"
          title="Trang 1 / Tập tin hiện tại"
        >
          <FileText className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
