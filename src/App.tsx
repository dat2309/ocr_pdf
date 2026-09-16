import React, { useRef, useState } from 'react';
import { Header } from './components/Header';
import { DocumentViewer } from './components/DocumentViewer';
import { LabResultsTable } from './components/LabResultsTable';
import { FileUploaderModal } from './components/FileUploaderModal';
import { ExcelExportModal } from './components/ExcelExportModal';
import { SAMPLE_REPORTS } from './data/sampleReports';
import { LabReport, OcrEngineType } from './types';
import { copyTableToClipboard } from './utils/excelExporter';
import { processMedicalFile, terminateOcrWorker } from './utils/ocrEngine';
import { parseMedicalReportFromText } from './utils/medicalParser';
import { Eye, Table } from 'lucide-react';

export default function App() {
  const [report, setReport] = useState<LabReport | null>(SAMPLE_REPORTS[0]);
  const [isUploaderOpen, setIsUploaderOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedEngine, setSelectedEngine] = useState<OcrEngineType>('both');
  const [mobileTab, setMobileTab] = useState<'document' | 'results'>('results');
  const isUploadRunningRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleCancelOcr = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    terminateOcrWorker().catch(() => {});
  };

  const handleUploadFile = async (file: File, engine: OcrEngineType = selectedEngine) => {
    if (isUploadRunningRef.current) return;
    isUploadRunningRef.current = true;
    setSelectedEngine(engine);
    setIsAnalyzing(true);
    setUploadError(null);
    setProgressMessage(`Đang khởi tạo ${engine === 'scribe' ? 'Scribe.js OCR' : engine === 'both' ? 'Tesseract & Scribe.js' : 'Tesseract.js OCR'}...`);
    setProgressPercent(5);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const parsedReport = await processMedicalFile(
        file,
        ({ message, progress }) => {
          setProgressMessage(message);
          setProgressPercent(progress);
        },
        controller.signal,
        engine
      );

      setReport(parsedReport);
      setIsUploaderOpen(false);
    } catch (localErr: any) {
      if (localErr?.name === 'AbortError') {
        setUploadError('Tác vụ nhận diện đã được hủy theo yêu cầu.');
      } else {
        console.error('Lỗi khi bóc tách tài liệu:', localErr);
        setUploadError(localErr.message || 'Không thể trích xuất dữ liệu từ file xét nghiệm.');
      }
    } finally {
      isUploadRunningRef.current = false;
      abortControllerRef.current = null;
      setIsAnalyzing(false);
      setProgressPercent(0);
      setProgressMessage('');
    }
  };

  const handleApplyRawText = (rawText: string, engineName: string) => {
    if (!report || !rawText) return;
    try {
      const parsedPartial = parseMedicalReportFromText(rawText, report.fileName);
      setReport({
        ...report,
        patient: parsedPartial.patient || report.patient,
        tests: parsedPartial.tests || [],
        totalDetected: parsedPartial.totalDetected || 0,
        abnormalCount: parsedPartial.abnormalCount || 0,
        unmappedCount: parsedPartial.unmappedCount || 0,
        avgConfidence: parsedPartial.avgConfidence || 90,
        rawSummary: parsedPartial.rawSummary || `Áp dụng dữ liệu từ ${engineName}`,
        rawText: rawText,
      });
    } catch (err: any) {
      console.error('Lỗi khi áp dụng text:', err);
      alert('Không thể trích xuất kết quả xét nghiệm từ văn bản này.');
    }
  };

  const handleReAnalyze = async () => {
    if (!report) return;
    setIsAnalyzing(true);
    setUploadError(null);

    try {
      if (report.rawText) {
        const parsedPartial = parseMedicalReportFromText(report.rawText, report.fileName);
        setReport({
          ...report,
          patient: parsedPartial.patient || report.patient,
          tests: parsedPartial.tests || [],
          totalDetected: parsedPartial.totalDetected || 0,
          abnormalCount: parsedPartial.abnormalCount || 0,
          unmappedCount: parsedPartial.unmappedCount || 0,
          avgConfidence: parsedPartial.avgConfidence || 90,
          rawSummary: parsedPartial.rawSummary || report.rawSummary,
        });
      }
    } catch (err: any) {
      console.error('Lỗi khi phân tích lại:', err);
      alert(err.message || 'Không thể phân tích lại tập tin.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSelectSample = (index: number) => {
    if (SAMPLE_REPORTS[index]) {
      setReport(SAMPLE_REPORTS[index]);
    }
  };

  const handleCopyClipboard = async () => {
    if (!report) return;
    await copyTableToClipboard(report);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col antialiased text-slate-800">
      {/* Top Navbar */}
      <Header
        onOpenUpload={() => setIsUploaderOpen(true)}
        onOpenExport={() => setIsExportOpen(true)}
        onSelectSample={handleSelectSample}
        hasData={Boolean(report && report.tests.length > 0)}
        isAnalyzing={isAnalyzing}
      />

      {/* Mobile view switch tab */}
      <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-center space-x-2">
        <button
          type="button"
          onClick={() => setMobileTab('document')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
            mobileTab === 'document'
              ? 'bg-slate-900 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Tài liệu gốc</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('results')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
            mobileTab === 'results'
              ? 'bg-teal-700 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Table className="w-3.5 h-3.5" />
          <span>Bảng kết quả ({report?.tests.length || 0})</span>
        </button>
      </div>

      {/* Main Workspace Area (Side-by-Side 2 columns like reference image) */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-2 sm:p-4 lg:p-5 flex flex-col">
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 min-h-[700px] lg:h-[calc(100vh-5.5rem)]">
          {/* Left Column: Original Document Viewer (approx 42% on desktop) */}
          <div
            className={`lg:col-span-5 h-[480px] lg:h-full ${
              mobileTab === 'document' ? 'block' : 'hidden lg:block'
            }`}
          >
            <DocumentViewer
              report={report}
              onDropNewFile={handleUploadFile}
              onApplyRawText={handleApplyRawText}
            />
          </div>

          {/* Right Column: Interactive Lab Results & Mapping Table (approx 58% on desktop) */}
          <div
            className={`lg:col-span-7 h-full flex flex-col ${
              mobileTab === 'results' ? 'block' : 'hidden lg:block'
            }`}
          >
            {report ? (
              <LabResultsTable
                report={report}
                onUpdateReport={(updated) => setReport(updated)}
                onReAnalyze={handleReAnalyze}
                onExportExcel={() => setIsExportOpen(true)}
                onCancel={() => {
                  if (confirm('Bạn có chắc muốn làm mới dữ liệu về trạng thái ban đầu?')) {
                    setReport(SAMPLE_REPORTS[0]);
                  }
                }}
                onCopyClipboard={handleCopyClipboard}
                isReanalyzing={isAnalyzing}
              />
            ) : (
              <div className="h-full bg-white rounded-xl border border-slate-200 p-8 flex flex-col items-center justify-center text-center">
                <Table className="w-12 h-12 text-slate-300 mb-3" />
                <h3 className="text-base font-bold text-slate-800">Chưa có dữ liệu xét nghiệm</h3>
                <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4">
                  Nhấn "Tải tập tin" để chọn ảnh hoặc file PDF kết quả xét nghiệm cần trích xuất sang Excel.
                </p>
                <button
                  type="button"
                  onClick={() => setIsUploaderOpen(true)}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-sm"
                >
                  Tải lên phiếu xét nghiệm ngay
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modals */}
      <FileUploaderModal
        isOpen={isUploaderOpen}
        onClose={() => {
          setIsUploaderOpen(false);
          setUploadError(null);
        }}
        onSelectSample={(sample) => {
          setReport(sample);
          setIsUploaderOpen(false);
        }}
        onUploadFile={handleUploadFile}
        onCancelOcr={handleCancelOcr}
        isAnalyzing={isAnalyzing}
        progressMessage={progressMessage}
        progressPercent={progressPercent}
        error={uploadError}
        currentEngine={selectedEngine}
      />

      <ExcelExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        report={report}
      />
    </div>
  );
}
