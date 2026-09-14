import * as pdfjsLib from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
import { LabReport } from '../types';
import { parseMedicalReportFromText } from './medicalParser';

// Configure PDF.js worker locally using Vite asset resolution (offline-first, no CDN dependency)
if (typeof window !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  } catch {
    // Fallback if local URL resolution is not supported
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  }
}

export type OcrProgressCallback = (info: { message: string; progress: number }) => void;

/**
 * Extract text from a PDF file using PDF.js.
 * If pages are digital, extracts structured text directly.
 * If pages are scanned images (text is empty), renders page to canvas and runs Tesseract OCR.
 */
export async function extractTextFromPdf(
  fileOrBuffer: File | ArrayBuffer | Uint8Array,
  onProgress?: OcrProgressCallback
): Promise<{ text: string; pageDataUrls: string[] }> {
  onProgress?.({ message: 'Đang nạp tài liệu PDF với PDF.js...', progress: 10 });

  let dataArray: Uint8Array;
  if (fileOrBuffer instanceof Uint8Array) {
    dataArray = fileOrBuffer;
  } else if (fileOrBuffer instanceof ArrayBuffer) {
    dataArray = new Uint8Array(fileOrBuffer);
  } else {
    const ab = await fileOrBuffer.arrayBuffer();
    dataArray = new Uint8Array(ab);
  }

  const loadingTask = pdfjsLib.getDocument({ data: dataArray });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  let fullExtractedText = '';
  const pageDataUrls: string[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    onProgress?.({
      message: `PDF.js đang đọc trang ${pageNum}/${numPages}...`,
      progress: 20 + Math.round((pageNum / numPages) * 35),
    });

    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });

    // Try extracting digital text
    const textContent = await page.getTextContent();
    let pageText = '';

    if (textContent.items && textContent.items.length > 0) {
      // Group items by vertical position (Y coordinate) to reconstruct lines accurately
      const lineMap = new Map<number, Array<{ x: number; str: string }>>();

      for (const item of textContent.items as any[]) {
        if (!item.str || item.str.trim() === '') continue;
        const transform = item.transform; // [scaleX, skewY, skewX, scaleY, x, y]
        const y = Math.round(transform[5] / 4) * 4; // snap to ~4px bucket
        const x = transform[4];

        if (!lineMap.has(y)) {
          lineMap.set(y, []);
        }
        lineMap.get(y)!.push({ x, str: item.str });
      }

      // Sort lines from top (highest Y) to bottom (lowest Y)
      const sortedYs = Array.from(lineMap.keys()).sort((a, b) => b - a);
      for (const y of sortedYs) {
        const lineItems = lineMap.get(y)!;
        lineItems.sort((a, b) => a.x - b.x);
        const lineStr = lineItems.map((it) => it.str).join('  ');
        pageText += lineStr + '\n';
      }
    }

    // Render page to canvas for preview & scanned fallback
    if (typeof document !== 'undefined') {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const canvasContext = canvas.getContext('2d');

        if (canvasContext) {
          await page.render({ canvasContext, viewport, canvas } as any).promise;
          const pageDataUrl = canvas.toDataURL('image/jpeg', 0.85);
          pageDataUrls.push(pageDataUrl);

          // If digital text is almost empty (< 50 chars), run Tesseract OCR on rendered canvas!
          if (pageText.trim().length < 50) {
            onProgress?.({
              message: `Trang ${pageNum} là ảnh scan, đang chạy Tesseract OCR...`,
              progress: 60,
            });
            const ocrResult = await extractTextFromImage(canvas, onProgress);
            pageText += '\n' + ocrResult;
          }
        }
      } catch (renderErr) {
        console.warn('Could not render PDF page to canvas:', renderErr);
      }
    }

    fullExtractedText += pageText + '\n';
  }

  onProgress?.({ message: 'Hoàn thành đọc tài liệu PDF.js', progress: 100 });
  return { text: fullExtractedText, pageDataUrls };
}

/**
 * Extract text from an image using Tesseract.js (Vietnamese + English)
 */
export async function extractTextFromImage(
  imageSource: string | HTMLCanvasElement | HTMLImageElement | File | Blob,
  onProgress?: OcrProgressCallback
): Promise<string> {
  onProgress?.({ message: 'Đang khởi động Tesseract OCR (vie+eng)...', progress: 15 });

  const worker = await createWorker(['vie', 'eng'], undefined, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        const p = 20 + Math.round((m.progress || 0) * 70);
        onProgress?.({
          message: `Tesseract đang nhận diện chữ viết: ${Math.round((m.progress || 0) * 100)}%`,
          progress: p,
        });
      } else if (m.status === 'loading tesseract core' || m.status === 'loading language traineddata') {
        onProgress?.({
          message: `Tesseract: ${m.status}...`,
          progress: 25,
        });
      }
    },
  });

  try {
    const result = await worker.recognize(imageSource as any);
    onProgress?.({ message: 'Tesseract OCR hoàn tất!', progress: 95 });
    return result.data.text;
  } finally {
    await worker.terminate();
  }
}

/**
 * Process any medical lab file (PDF or Image) using ONLY PDF.js & Tesseract
 */
export async function processMedicalFile(
  file: File,
  onProgress?: OcrProgressCallback
): Promise<LabReport> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  let extractedText = '';
  let previewDataUrl = '';

  if (isPdf) {
    onProgress?.({ message: 'Đang mở tập tin PDF bằng PDF.js...', progress: 5 });
    const { text, pageDataUrls } = await extractTextFromPdf(file, onProgress);
    extractedText = text;
    if (pageDataUrls.length > 0) {
      previewDataUrl = pageDataUrls[0];
    } else {
      // Create object URL or data URL
      previewDataUrl = await readFileAsDataUrl(file);
    }
  } else {
    onProgress?.({ message: 'Đang tải hình ảnh và quét với Tesseract OCR...', progress: 10 });
    previewDataUrl = await readFileAsDataUrl(file);
    extractedText = await extractTextFromImage(file, onProgress);
  }

  onProgress?.({ message: 'Đang bóc tách chỉ số xét nghiệm & đối chiếu danh mục...', progress: 96 });

  const parsedPartial = parseMedicalReportFromText(extractedText, file.name);

  const finalReport: LabReport = {
    id: parsedPartial.id || `rep-${Date.now()}`,
    title: parsedPartial.title || (isPdf ? 'Xét nghiệm từ tài liệu PDF' : 'Xét nghiệm từ hình ảnh'),
    fileName: file.name,
    fileType: isPdf ? 'pdf' : 'image',
    fileDataUrl: previewDataUrl,
    patient: parsedPartial.patient || {
      fullName: 'Chưa rõ',
      gender: 'Chưa rõ',
      birthYearOrAge: 'Chưa rõ',
      patientCode: '',
      sampleDate: '',
      resultDate: new Date().toLocaleDateString('vi-VN'),
    },
    tests: parsedPartial.tests || [],
    totalDetected: parsedPartial.totalDetected || 0,
    abnormalCount: parsedPartial.abnormalCount || 0,
    unmappedCount: parsedPartial.unmappedCount || 0,
    avgConfidence: parsedPartial.avgConfidence || 90,
    rawSummary: parsedPartial.rawSummary || `Đọc được ${parsedPartial.tests?.length || 0} chỉ số`,
    rawText: extractedText || parsedPartial.rawText || '',
    createdAt: new Date().toISOString(),
  };

  onProgress?.({ message: 'Hoàn tất!', progress: 100 });
  return finalReport;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}
