import * as pdfjsLib from 'pdfjs-dist';
import { createWorker, PSM } from 'tesseract.js';
import { LabReport } from '../types';
import { parseMedicalReportFromText } from './medicalParser';

// Configure PDF.js worker locally using Vite asset resolution (offline-first, no CDN dependency)
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
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
    const unscaledViewport = page.getViewport({ scale: 1.0 });
    // Dynamic scale to achieve optimal OCR resolution (~2000-2400px width)
    const optimalScale = Math.max(2.0, Math.min(3.5, 2200 / unscaledViewport.width));
    const viewport = page.getViewport({ scale: optimalScale });

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

    // Only fall back to OCR when PDF text is truly sparse. Some valid reports use
    // uncommon Vietnamese labels, so a keyword check can accidentally replace good
    // embedded text with lower-quality OCR output.
    const hasUsableDigitalText = pageText.replace(/\s+/g, '').length >= 120;

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

          // If digital text is almost empty, treat the page as a scanned PDF.
          if (!hasUsableDigitalText) {
            onProgress?.({
              message: `Trang ${pageNum} là ảnh scan, đang chạy Tesseract OCR tối ưu hóa...`,
              progress: 60,
            });
            const ocrResult = await extractTextFromImage(canvas, onProgress);
            pageText = ocrResult;
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
 * Preprocesses an image via offscreen HTML5 Canvas:
 * 1. Upscaling if width < 1800px to ensure decimal dots and small fonts are clearly resolved.
 * 2. Grayscale conversion and dynamic contrast stretching to make text dark and paper background clean white.
 */
export async function preprocessImageForOcr(
  imageSource: string | HTMLCanvasElement | HTMLImageElement | File | Blob
): Promise<HTMLCanvasElement | HTMLImageElement | string | File | Blob> {
  if (typeof document === 'undefined') return imageSource;

  try {
    const img = await loadImageElement(imageSource);
    const origW = img.naturalWidth || img.width;
    const origH = img.naturalHeight || img.height;

    // Optimal recognition resolution for OCR is approx 300 DPI, typically 2000 - 2400px wide
    let scale = 1.0;
    if (origW < 1800) {
      scale = Math.min(2.5, 2200 / origW);
    } else if (origW > 3500) {
      scale = 3000 / origW;
    }

    const targetW = Math.round(origW * scale);
    const targetH = Math.round(origH * scale);

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return imageSource;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetW, targetH);

    // Grayscale and dynamic contrast stretching
    const imgData = ctx.getImageData(0, 0, targetW, targetH);
    const data = imgData.data;
    const len = data.length;

    let minLum = 255;
    let maxLum = 0;
    for (let i = 0; i < len; i += 64) {
      const lum = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
    }

    const range = Math.max(maxLum - minLum, 40);
    for (let i = 0; i < len; i += 4) {
      const lum = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
      let stretched = ((lum - minLum) / range) * 255;
      if (stretched > 205) {
        stretched = 255;
      }
      data[i] = stretched;
      data[i + 1] = stretched;
      data[i + 2] = stretched;
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
  } catch (err) {
    console.warn('Canvas preprocessing skipped:', err);
    return imageSource;
  }
}

function loadImageElement(source: string | HTMLCanvasElement | HTMLImageElement | File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') {
      return reject(new Error('Image constructor not available'));
    }
    if (source instanceof HTMLImageElement) {
      if (source.complete) return resolve(source);
      source.onload = () => resolve(source);
      source.onerror = reject;
      return;
    }
    if (source instanceof HTMLCanvasElement) {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = source.toDataURL('image/png');
      return;
    }
    const img = new Image();
    img.onload = () => {
      if (typeof source !== 'string') {
        URL.revokeObjectURL(img.src);
      }
      resolve(img);
    };
    img.onerror = (err) => {
      if (typeof source !== 'string') {
        URL.revokeObjectURL(img.src);
      }
      reject(err);
    };
    if (typeof source === 'string') {
      img.src = source;
    } else if (typeof source === 'object' && source !== null) {
      img.src = URL.createObjectURL(source as Blob);
    } else {
      reject(new Error('Unsupported image source type'));
    }
  });
}

/**
 * Extract text from an image using Tesseract.js (Vietnamese + English)
 */
export async function extractTextFromImage(
  imageSource: string | HTMLCanvasElement | HTMLImageElement | File | Blob,
  onProgress?: OcrProgressCallback
): Promise<string> {
  onProgress?.({ message: 'Đang tiền xử lý ảnh và khởi động Tesseract OCR...', progress: 15 });

  // Standalone image files are passed to Tesseract as-is. This matches public
  // Tesseract demos more closely and avoids canvas preprocessing changing
  // decimal points, table lines, or watermark contrast. PDF scans still arrive
  // as canvas pages and keep the preprocessing path that works well for them.
  const shouldPreprocess = typeof HTMLCanvasElement !== 'undefined' && imageSource instanceof HTMLCanvasElement;
  const processedSource = shouldPreprocess ? await preprocessImageForOcr(imageSource) : imageSource;

  const primaryResult = await runOcrPass(['vie', 'eng'], imageSource, processedSource, onProgress);

  onProgress?.({ message: 'Tesseract OCR hoàn tất!', progress: 95 });
  return getReadableOcrText(primaryResult);
}

async function runOcrPass(
  languages: Array<'vie' | 'eng'>,
  originalSource: string | HTMLCanvasElement | HTMLImageElement | File | Blob,
  processedSource: HTMLCanvasElement | HTMLImageElement | string | File | Blob,
  onProgress?: OcrProgressCallback
) {
  const worker = await createLocalOcrWorker(languages, onProgress);

  try {
    await worker.setParameters({
      preserve_interword_spaces: '1',
      tessedit_pageseg_mode: PSM.AUTO,
      user_defined_dpi: '300',
    });

    const processedResult = await recognizeOcrVariant(worker, processedSource);
    let bestResult = processedResult;

    if (processedSource !== originalSource) {
      onProgress?.({ message: 'Đang đối chiếu OCR với ảnh gốc để chọn kết quả tốt nhất...', progress: 88 });
      const originalResult = await recognizeOcrVariant(worker, originalSource);
      if (scoreOcrResult(originalResult) > scoreOcrResult(processedResult) + 2) {
        bestResult = originalResult;
      }
    }

    return bestResult;
  } finally {
    await worker.terminate();
  }
}

async function createLocalOcrWorker(
  languages: Array<'vie' | 'eng'>,
  onProgress?: OcrProgressCallback
) {
  const baseHref = typeof window !== 'undefined'
    ? new URL('.', window.location.href).href.replace(/\/+$/, '') + '/'
    : './';

  return createWorker(languages, undefined, {
    workerPath: `${baseHref}tesscore/worker.min.js`,
    corePath: `${baseHref}tesscore`,
    langPath: `${baseHref}tessdata`,
    logger: (m) => {
      if (m.status === 'recognizing text') {
        const p = 20 + Math.round((m.progress || 0) * 65);
        onProgress?.({
          message: `Tesseract (${languages.join('+')}) đang nhận diện: ${Math.round((m.progress || 0) * 100)}%`,
          progress: p,
        });
      } else if (m.status === 'loading tesseract core' || m.status === 'loading language traineddata') {
        onProgress?.({
          message: `Tesseract (${languages.join('+')}): ${m.status}...`,
          progress: 25,
        });
      }
    },
  });
}

async function recognizeOcrVariant(worker: Awaited<ReturnType<typeof createWorker>>, source: unknown) {
  return worker.recognize(
    source as any,
    { rotateAuto: true },
    { text: true, tsv: true }
  );
}

function scoreOcrResult(result: Awaited<ReturnType<Awaited<ReturnType<typeof createWorker>>['recognize']>>): number {
  const text = result.data.text || '';
  const confidence = Number(result.data.confidence) || 0;
  const usefulChars = text.replace(/\s/g, '').length;
  const digitCount = (text.match(/\d/g) || []).length;
  const labKeywordCount = (text.match(/glucose|creatinine|cholesterol|triglyceride|egfr|got|gpt|ggt|natri|kali|calci/gi) || []).length;

  return confidence + Math.min(12, usefulChars / 120) + Math.min(8, digitCount / 12) + Math.min(8, labKeywordCount * 2);
}

function getReadableOcrText(result: Awaited<ReturnType<Awaited<ReturnType<typeof createWorker>>['recognize']>>): string {
  const plainText = (result.data.text || '').trim();
  const tsvText = reconstructTextFromTsv(result.data.tsv);

  if (!plainText) return tsvText;
  if (!tsvText) return plainText;

  const plainChars = plainText.replace(/\s/g, '').length;
  const tsvChars = tsvText.replace(/\s/g, '').length;
  const plainLines = plainText.split(/\r?\n/).filter((line) => line.trim()).length;
  const tsvLines = tsvText.split(/\r?\n/).filter((line) => line.trim()).length;

  if (tsvChars > plainChars * 1.2 || tsvLines > plainLines * 1.5) {
    return tsvText;
  }

  return plainText;
}

function reconstructTextFromTsv(tsv: string | null | undefined): string {
  if (!tsv) return '';

  type WordBox = {
    text: string;
    left: number;
    top: number;
    width: number;
    lineKey: string;
  };

  const words: WordBox[] = [];
  const rows = tsv.split(/\r?\n/);

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i].split('\t');
    if (cols.length < 12 || cols[0] !== '5') continue;

    const text = cols.slice(11).join('\t').trim();
    if (!text) continue;

    const conf = Number(cols[10]);
    if (Number.isFinite(conf) && conf < 0) continue;

    words.push({
      text,
      left: Number(cols[6]) || 0,
      top: Number(cols[7]) || 0,
      width: Number(cols[8]) || 0,
      lineKey: `${cols[1]}:${cols[2]}:${cols[3]}:${cols[4]}`,
    });
  }

  if (words.length === 0) return '';

  const lineMap = new Map<string, WordBox[]>();
  for (const word of words) {
    const lineWords = lineMap.get(word.lineKey) || [];
    lineWords.push(word);
    lineMap.set(word.lineKey, lineWords);
  }

  const lines = Array.from(lineMap.values())
    .map((lineWords) => {
      lineWords.sort((a, b) => a.left - b.left);
      const top = Math.min(...lineWords.map((word) => word.top));
      const left = Math.min(...lineWords.map((word) => word.left));
      const avgCharWidth =
        lineWords.reduce((sum, word) => sum + word.width / Math.max(word.text.length, 1), 0) /
        lineWords.length;

      let text = '';
      let previousRight = 0;
      for (const word of lineWords) {
        if (!text) {
          text = word.text;
        } else {
          const gap = Math.max(0, word.left - previousRight);
          const spaces = gap > avgCharWidth * 1.8 ? Math.min(8, Math.max(2, Math.round(gap / avgCharWidth))) : 1;
          text += ' '.repeat(spaces) + word.text;
        }
        previousRight = word.left + word.width;
      }

      return { top, left, text: text.trim() };
    })
    .filter((line) => line.text.length > 0)
    .sort((a, b) => (Math.abs(a.top - b.top) > 8 ? a.top - b.top : a.left - b.left));

  return lines.map((line) => line.text).join('\n').trim();
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
    rawText: parsedPartial.rawText || extractedText || '',
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
