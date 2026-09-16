import * as pdfjsLib from 'pdfjs-dist';
import { createWorker, PSM } from 'tesseract.js';
import { LabReport, OcrEngineType } from '../types';
import { parseMedicalReportFromText } from './medicalParser';

// Configure PDF.js worker locally using Vite asset resolution (offline-first, no CDN dependency)
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
}

export type OcrProgressCallback = (info: { message: string; progress: number }) => void;

type OcrWorker = Awaited<ReturnType<typeof createWorker>>;

/**
 * Global system limits for safety and memory protection
 */
export const FILE_LIMITS = {
  maxFileSize: 30 * 1024 * 1024, // 30 MB
  maxPdfPages: 30, // 30 pages
  maxCanvasDimension: 4096, // 4096 px width or height
  maxCanvasPixels: 10_000_000, // 10 Megapixels
};

export const DEFAULT_OCR_CONFIG = {
  psm: PSM.SINGLE_BLOCK, // PSM 6: Uniform single block - preserves horizontal table row structure across columns
  preserveInterwordSpaces: '1',
  userDefinedDpi: '300', // Metadata only for Tesseract
  languages: ['vie', 'eng'] as const,
};

export interface PdfQualityConfig {
  minMeaningfulChars: number;
  minLinesWithContent: number;
  minAlphanumericRatio: number;
  maxCorruptedCharRatio: number;
  minScoreToPass: number;
}

export const DEFAULT_PDF_QUALITY_CONFIG: PdfQualityConfig = {
  minMeaningfulChars: 35,
  minLinesWithContent: 3,
  minAlphanumericRatio: 0.55,
  maxCorruptedCharRatio: 0.04,
  minScoreToPass: 60,
};

export interface PdfTextQualityResult {
  usable: boolean;
  score: number;
  reasons: string[];
  metrics: {
    meaningfulChars: number;
    linesCount: number;
    alphanumericRatio: number;
    corruptedCharsCount: number;
    hasMedicalKeywords: boolean;
    hasUnits: boolean;
    hasNumericValues: boolean;
    isWatermarkOnly: boolean;
    hasAbnormalRepetition: boolean;
  };
}

let ocrQueue: Promise<void> = Promise.resolve();
let localOcrWorkerPromise: Promise<OcrWorker> | null = null;
let activeOcrProgress: OcrProgressCallback | undefined;

function createAbortError(message: string): DOMException {
  return new DOMException(message, 'AbortError');
}

/**
 * Reconstructs lines of text from PDF.js textContent items by grouping
 * bounding boxes with adaptive vertical line clustering and proper horizontal spacing.
 */
export function reconstructPdfPageText(items: any[]): string {
  if (!items || items.length === 0) return '';

  interface TextPiece {
    str: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }

  const pieces: TextPiece[] = [];

  for (const item of items) {
    if (!item.str || typeof item.str !== 'string') continue;
    const str = item.str;
    if (!str.trim()) continue;

    const transform = item.transform || [1, 0, 0, 1, 0, 0];
    const x = Number(transform[4]) || 0;
    const y = Number(transform[5]) || 0;
    const height = Math.max(8, Math.abs(Number(transform[3]) || Number(transform[0]) || Number(item.height) || 10));
    const width = Number(item.width) || Math.max(1, str.length * (height * 0.55));

    pieces.push({ str, x, y, width, height });
  }

  if (pieces.length === 0) return '';

  // Sort pieces vertically descending first (PDF Y coordinate: higher Y is higher on page)
  pieces.sort((a, b) => b.y - a.y);

  // Group into lines using adaptive line tolerance
  interface LineGroup {
    avgY: number;
    height: number;
    pieces: TextPiece[];
  }

  const lines: LineGroup[] = [];

  for (const piece of pieces) {
    let matchedLine: LineGroup | null = null;

    for (const line of lines) {
      const lineTolerance = Math.max(piece.height, line.height) * 0.55;
      if (Math.abs(line.avgY - piece.y) <= lineTolerance) {
        matchedLine = line;
        break;
      }
    }

    if (matchedLine) {
      matchedLine.pieces.push(piece);
      matchedLine.avgY = (matchedLine.avgY * (matchedLine.pieces.length - 1) + piece.y) / matchedLine.pieces.length;
      matchedLine.height = Math.max(matchedLine.height, piece.height);
    } else {
      lines.push({
        avgY: piece.y,
        height: piece.height,
        pieces: [piece],
      });
    }
  }

  // Sort lines from top (highest Y) to bottom (lowest Y)
  lines.sort((a, b) => b.avgY - a.avgY);

  const resultLines: string[] = [];

  for (const line of lines) {
    // Sort pieces in line horizontally (left to right)
    line.pieces.sort((a, b) => a.x - b.x);

    let lineText = '';
    let previousRight = 0;
    const avgCharWidth = line.height * 0.55;

    for (let i = 0; i < line.pieces.length; i++) {
      const piece = line.pieces[i];
      if (i === 0) {
        lineText = piece.str;
      } else {
        const gap = piece.x - previousRight;
        if (gap > avgCharWidth * 1.8) {
          const spaces = Math.min(8, Math.max(2, Math.round(gap / Math.max(avgCharWidth, 4))));
          lineText += ' '.repeat(spaces) + piece.str;
        } else if (gap > avgCharWidth * 0.35) {
          lineText += ' ' + piece.str;
        } else {
          lineText += piece.str;
        }
      }
      previousRight = Math.max(previousRight, piece.x + piece.width);
    }

    if (lineText.trim()) {
      resultLines.push(lineText.trimEnd());
    }
  }

  return resultLines.join('\n');
}

/**
 * Evaluates the quality and reliability of a PDF page's text layer.
 * Decides whether the page has good digital text or must be rendered to canvas for OCR.
 */
export function evaluatePdfTextQuality(
  textItems: any[],
  reconstructedText: string,
  customConfig?: Partial<PdfQualityConfig>
): PdfTextQualityResult {
  const config: PdfQualityConfig = { ...DEFAULT_PDF_QUALITY_CONFIG, ...customConfig };
  const reasons: string[] = [];
  const text = (reconstructedText || '').trim();

  // 1. Alphanumeric meaningful chars
  const alphanumericMatches = text.match(/[a-zA-Z0-9\u00C0-\u024F\u1EA0-\u1EF9]/g) || [];
  const meaningfulChars = alphanumericMatches.length;

  // 2. Lines with content
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const linesCount = lines.length;

  // 3. Valid ratio
  const nonSpaceChars = text.replace(/\s+/g, '').length;
  const alphanumericRatio = nonSpaceChars > 0 ? meaningfulChars / nonSpaceChars : 0;

  // 4. Corrupted characters (replacement character, control characters, or cid sequences)
  const replacementMatches = text.match(/\uFFFD/g) || [];
  const cidMatches = text.match(/\(cid:\d+\)/gi) || [];
  const controlMatches = text.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g) || [];
  const corruptedCharsCount = replacementMatches.length + cidMatches.length + controlMatches.length;

  // 5. Medical keywords
  const medicalKeywordsRegex = /(?:xét\s*nghiệm|kết\s*quả|bệnh\s*nhân|họ\s*(?:và\s*)?tên|bác\s*sĩ|phòng\s*khám|bệnh\s*viện|huyết\s*học|sinh\s*hóa|nước\s*tiểu|glucose|creatinine|cholesterol|triglyceride|ast|alt|ggt|wbc|rbc|hgb|plt|egfr|acid\s*uric|ure|tham\s*chiếu|đơn\s*vị|chỉ\s*số|laboratory|test|patient)/i;
  const hasMedicalKeywords = medicalKeywordsRegex.test(text);

  // 6. Common medical units
  const unitsRegex = /(?:mmol\/L|µmol\/L|umol\/L|mg\/dL|g\/dL|g\/L|U\/L|UI\/mL|mIU\/L|pmol\/L|10\^[0-9]+\/L|G\/L|T\/L|fL|pg|mL\/(?:phút|min)|Leu\/µL|%)/i;
  const hasUnits = unitsRegex.test(text);

  // 7. Numeric lab values
  const hasNumericValues = /(?:^|\s)[0-9]+(?:[.,][0-9]+)?(?:\s|\*|$)/m.test(text);

  // 8. Watermark/Footer only detection
  const isWatermarkOnly = checkIfWatermarkOnly(lines, text);

  // 9. Abnormal repetition detection (e.g. repeated character bomb or broken font output)
  const hasAbnormalRepetition = checkAbnormalRepetition(text, nonSpaceChars);

  // Scoring
  let score = 0;

  if (meaningfulChars >= config.minMeaningfulChars) {
    score += 40;
  } else {
    reasons.push(`Nội dung văn bản quá ít (${meaningfulChars} ký tự có nghĩa, tối thiểu ${config.minMeaningfulChars})`);
  }

  if (linesCount >= config.minLinesWithContent) {
    score += 15;
  } else {
    reasons.push(`Số dòng văn bản quá ít (${linesCount} dòng, tối thiểu ${config.minLinesWithContent})`);
  }

  if (alphanumericRatio >= config.minAlphanumericRatio) {
    score += 15;
  } else {
    reasons.push(`Tỷ lệ ký tự hợp lệ thấp (${Math.round(alphanumericRatio * 100)}%, yêu cầu >= ${Math.round(config.minAlphanumericRatio * 100)}%)`);
  }

  if (hasMedicalKeywords) {
    score += 15;
  } else {
    reasons.push('Không tìm thấy từ khóa hoặc chỉ số xét nghiệm y tế');
  }

  if (hasUnits) {
    score += 10;
  }

  if (hasNumericValues) {
    score += 5;
  }

  if (corruptedCharsCount > 2 || (meaningfulChars > 0 && corruptedCharsCount / meaningfulChars > config.maxCorruptedCharRatio)) {
    score = Math.max(0, score - 50);
    reasons.push(`Phát hiện ${corruptedCharsCount} ký tự lỗi encoding (hoặc ký tự thay thế \\uFFFD / cid)`);
  }

  if (isWatermarkOnly) {
    score = 0;
    reasons.push('Văn bản chỉ chứa watermark, tiêu đề hoặc thông tin trang; nội dung bảng là ảnh scan');
  }

  if (hasAbnormalRepetition) {
    score = Math.max(0, score - 40);
    reasons.push('Phát hiện chuỗi lặp bất thường (lỗi font/vector encoding)');
  }

  const usable = score >= config.minScoreToPass && !isWatermarkOnly && corruptedCharsCount <= 2;

  if (usable) {
    reasons.unshift(`Text layer hợp lệ (Độ tin cậy: ${score}/100)`);
  } else if (reasons.length === 0) {
    reasons.push(`Điểm chất lượng text chưa đạt ngưỡng (${score}/${config.minScoreToPass})`);
  }

  return {
    usable,
    score,
    reasons,
    metrics: {
      meaningfulChars,
      linesCount,
      alphanumericRatio,
      corruptedCharsCount,
      hasMedicalKeywords,
      hasUnits,
      hasNumericValues,
      isWatermarkOnly,
      hasAbnormalRepetition,
    },
  };
}

function checkIfWatermarkOnly(lines: string[], fullText: string): boolean {
  if (lines.length === 0) return true;
  if (lines.length > 8) return false;

  const watermarkPhrases = [
    /^(?:test\s*pdf|draft|confidential|bản\s*nháp|mẫu\s*thử|watermark)$/i,
    /^(?:trang|page)\s*[0-9]+(?:\s*\/\s*[0-9]+)?$/i,
    /^(?:bệnh\s*viện|phòng\s*khám)[^0-9]*$/i,
  ];

  let matchesWatermarkCount = 0;
  for (const line of lines) {
    const cleanLine = line.trim();
    if (watermarkPhrases.some((p) => p.test(cleanLine))) {
      matchesWatermarkCount++;
    }
  }

  // If every single line matches a watermark/header pattern, and no numbers/units appear
  const hasNumbers = /[0-9]{1,4}(?:[.,][0-9]+)?/.test(fullText);
  const hasUnits = /(?:mmol|µmol|umol|mg|U\/L|g\/dL)/i.test(fullText);

  if (matchesWatermarkCount >= lines.length && (!hasNumbers || !hasUnits)) {
    return true;
  }

  return false;
}

function checkAbnormalRepetition(text: string, totalNonSpace: number): boolean {
  if (totalNonSpace < 30) return false;

  // Check if same single character makes up > 40% of text
  const charFreq: Record<string, number> = {};
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    charFreq[ch] = (charFreq[ch] || 0) + 1;
    if (charFreq[ch] / totalNonSpace > 0.4) {
      return true;
    }
  }

  // Check for repeated short token sequence e.g. "abc abc abc abc abc"
  const tokens = text.split(/\s+/).filter(Boolean);
  let maxConsecutive = 1;
  let currentConsecutive = 1;
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i] === tokens[i - 1]) {
      currentConsecutive++;
      if (currentConsecutive > maxConsecutive) maxConsecutive = currentConsecutive;
    } else {
      currentConsecutive = 1;
    }
  }

  return maxConsecutive > 12;
}

/**
 * Extract text from a PDF file using PDF.js page-by-page.
 *
 * Requirements:
 * 1. Evaluate text layer per-page using evaluatePdfTextQuality.
 * 2. If usable, use original digital text (no OCR).
 * 3. If not usable (scanned or corrupted), render ONLY that page to canvas and run Tesseract OCR.
 * 4. Join pages in exact page order.
 * 5. Limit canvas resolution and memory; free canvas after each page.
 */
export async function extractTextFromPdf(
  fileOrBuffer: File | ArrayBuffer | Uint8Array,
  onProgress?: OcrProgressCallback,
  abortSignal?: AbortSignal
): Promise<{
  text: string;
  pageDataUrls: string[];
  pageDecisions: Array<{ page: number; method: 'digital' | 'ocr'; score: number; reasons: string[] }>;
}> {
  if (abortSignal?.aborted) {
    throw new DOMException('Tác vụ đọc PDF đã bị hủy.', 'AbortError');
  }

  onProgress?.({ message: 'Đang mở tài liệu PDF với PDF.js...', progress: 5 });

  let dataArray: Uint8Array;
  if (fileOrBuffer instanceof Uint8Array) {
    dataArray = fileOrBuffer;
  } else if (fileOrBuffer instanceof ArrayBuffer) {
    dataArray = new Uint8Array(fileOrBuffer);
  } else {
    if (fileOrBuffer.size > FILE_LIMITS.maxFileSize) {
      throw new Error(`Kích thước file PDF vượt quá giới hạn cho phép (tối đa 30MB).`);
    }
    const ab = await fileOrBuffer.arrayBuffer();
    dataArray = new Uint8Array(ab);
  }

  const loadingTask = pdfjsLib.getDocument({ data: dataArray });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  if (numPages > FILE_LIMITS.maxPdfPages) {
    throw new Error(`Số trang PDF (${numPages}) vượt quá giới hạn cho phép (tối đa ${FILE_LIMITS.maxPdfPages} trang).`);
  }

  let fullExtractedText = '';
  const pageDataUrls: string[] = [];
  const pageDecisions: Array<{ page: number; method: 'digital' | 'ocr'; score: number; reasons: string[] }> = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    if (abortSignal?.aborted) {
      throw new DOMException('Tác vụ đọc PDF đã bị hủy.', 'AbortError');
    }

    const pageProgressBase = 10 + Math.round(((pageNum - 1) / numPages) * 80);
    onProgress?.({
      message: `Đang phân tích trang ${pageNum}/${numPages}...`,
      progress: pageProgressBase,
    });

    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const reconstructedText = reconstructPdfPageText(textContent.items);
    const quality = evaluatePdfTextQuality(textContent.items, reconstructedText);

    let finalPageText = '';

    if (quality.usable) {
      // High-quality digital text layer: use original text directly
      pageDecisions.push({
        page: pageNum,
        method: 'digital',
        score: quality.score,
        reasons: quality.reasons,
      });
      finalPageText = reconstructedText;

      onProgress?.({
        message: `Trang ${pageNum}/${numPages}: Đọc text layer điện tử thành công`,
        progress: pageProgressBase + Math.round((1 / numPages) * 40),
      });

      // For page 1, create a lightweight preview for DocumentViewer if not yet set
      if (pageNum === 1 && typeof document !== 'undefined') {
        try {
          const previewCanvas = await renderPdfPageToCanvas(page, 1.2, 1200);
          const pageDataUrl = previewCanvas.toDataURL('image/jpeg', 0.85);
          pageDataUrls.push(pageDataUrl);
          disposeCanvas(previewCanvas);
        } catch (e) {
          console.warn('Could not generate preview for digital page 1:', e);
        }
      }
    } else {
      // Scanned or low-quality text layer: render page to canvas and OCR
      pageDecisions.push({
        page: pageNum,
        method: 'ocr',
        score: quality.score,
        reasons: quality.reasons,
      });

      onProgress?.({
        message: `Trang ${pageNum}/${numPages}: Text layer không đạt (${quality.reasons[0] || 'Ảnh scan'}), đang chạy OCR Tesseract...`,
        progress: pageProgressBase + 10,
      });

      if (typeof document !== 'undefined') {
        let scanCanvas: HTMLCanvasElement | null = null;
        try {
          // Render page to canvas with optimal scale (~2200px width for clear OCR)
          scanCanvas = await renderPdfPageToCanvas(page, 2.8, 2600);

          if (pageNum === 1) {
            const pageDataUrl = scanCanvas.toDataURL('image/jpeg', 0.85);
            pageDataUrls.push(pageDataUrl);
          }

          const ocrResult = await extractTextFromImage(scanCanvas, onProgress, abortSignal);
          finalPageText = ocrResult;
        } finally {
          if (scanCanvas) {
            disposeCanvas(scanCanvas);
            scanCanvas = null;
          }
        }
      } else {
        finalPageText = reconstructedText;
      }
    }

    fullExtractedText += (fullExtractedText ? '\n\n' : '') + finalPageText;
  }

  onProgress?.({ message: 'Hoàn thành đọc tài liệu PDF', progress: 95 });
  return { text: fullExtractedText, pageDataUrls, pageDecisions };
}

/**
 * Renders a PDF page to an offscreen HTML5 Canvas with bounded dimensions
 */
async function renderPdfPageToCanvas(
  page: pdfjsLib.PDFPageProxy,
  desiredScale: number,
  targetMaxWidth: number
): Promise<HTMLCanvasElement> {
  const unscaledViewport = page.getViewport({ scale: 1.0 });

  let scale = Math.max(1.0, Math.min(3.5, targetMaxWidth / Math.max(unscaledViewport.width, 1)));
  if (desiredScale > 0) {
    scale = Math.min(scale, desiredScale);
  }

  // Safety caps: max dimensions and max area
  if (unscaledViewport.width * scale > FILE_LIMITS.maxCanvasDimension) {
    scale = FILE_LIMITS.maxCanvasDimension / unscaledViewport.width;
  }
  if (unscaledViewport.height * scale > FILE_LIMITS.maxCanvasDimension) {
    scale = FILE_LIMITS.maxCanvasDimension / unscaledViewport.height;
  }
  if (unscaledViewport.width * scale * unscaledViewport.height * scale > FILE_LIMITS.maxCanvasPixels) {
    scale = Math.sqrt((FILE_LIMITS.maxCanvasPixels * 0.98) / (unscaledViewport.width * unscaledViewport.height));
  }

  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);

  const canvasContext = canvas.getContext('2d', { willReadFrequently: true });
  if (!canvasContext) {
    throw new Error('Không thể tạo 2D context cho canvas render PDF.');
  }

  await page.render({ canvasContext, viewport, canvas } as any).promise;
  return canvas;
}

/**
 * Releases canvas memory immediately to prevent browser tab OOM crashes
 */
export function disposeCanvas(canvas: HTMLCanvasElement): void {
  try {
    canvas.width = 0;
    canvas.height = 0;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 0, 0);
    }
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Preprocesses standalone images (JPG, PNG, WebP) or PDF scan canvases:
 * 1. Preserves natural aspect ratio without forcing wide images into portrait pages.
 * 2. Resizes based on text resolution needs (upscaling small images, capping huge images).
 * 3. Controlled grayscale, contrast normalization, paper whitening (preserving decimal dots and Vietnamese marks).
 * 4. Gentle unsharp sharpening without noise blowout.
 */
export async function preprocessImageForOcr(
  imageSource: string | HTMLCanvasElement | HTMLImageElement | File | Blob
): Promise<HTMLCanvasElement | HTMLImageElement | string | File | Blob> {
  if (typeof document === 'undefined') return imageSource;

  try {
    const img = await loadImageElement(imageSource);
    const origW = img.naturalWidth || img.width;
    const origH = img.naturalHeight || img.height;

    if (!origW || !origH) return imageSource;

    // Keep natural aspect ratio! NEVER force wide images into portrait frames.
    // Tesseract LSTM works best when character height (x-height) is ~28-35px.
    // Target optimal document width of ~2800-3000px while respecting system memory caps.
    let scale = 1.0;
    if (origW < 2800) {
      scale = Math.min(2.5, 3000 / origW);
    } else if (origW > 3600) {
      scale = 3200 / origW;
    }

    let targetW = Math.round(origW * scale);
    let targetH = Math.round(origH * scale);

    // Enforce limits
    if (targetW > FILE_LIMITS.maxCanvasDimension) {
      const s = FILE_LIMITS.maxCanvasDimension / targetW;
      targetW = Math.round(targetW * s);
      targetH = Math.round(targetH * s);
    }
    if (targetH > FILE_LIMITS.maxCanvasDimension) {
      const s = FILE_LIMITS.maxCanvasDimension / targetH;
      targetW = Math.round(targetW * s);
      targetH = Math.round(targetH * s);
    }
    if (targetW * targetH > FILE_LIMITS.maxCanvasPixels) {
      const s = Math.sqrt((FILE_LIMITS.maxCanvasPixels * 0.98) / (targetW * targetH));
      targetW = Math.floor(targetW * s);
      targetH = Math.floor(targetH * s);
    }

    // Small clean white padding around document (16px) to avoid edge character cutoff
    const padding = 16;
    const canvas = document.createElement('canvas');
    canvas.width = targetW + padding * 2;
    canvas.height = targetH + padding * 2;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return imageSource;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, padding, padding, targetW, targetH);

    // Adaptive local illumination normalization (flattens shadows & background gradients)
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    normalizeLocalIllumination(data, canvas.width, canvas.height, padding);
    suppressTableGridLines(data, canvas.width, canvas.height, padding);
    sharpenGrayscaleImageControlled(data, canvas.width, canvas.height, padding, padding, canvas.width - padding, canvas.height - padding);
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  } catch (err) {
    console.warn('Canvas preprocessing skipped due to error, falling back to original source:', err);
    return imageSource;
  }
}

export interface GridLineInfo {
  verticalDividerCols: number[];
  horizontalLineRows: number[];
}

/**
 * Suppresses vertical and horizontal table grid lines on Canvas ImageData:
 * - Detects continuous thin dark lines (vertical dividers and horizontal borders)
 *   that touch text characters and corrupt character recognition (e.g. '|' + 'N' -> 'DE', '|' + 'SH' -> 'gH').
 * - Inpaints line pixels with clean white (255) using a protective safety margin.
 * - Identifies column divider X-coordinates for table structure reconstruction.
 */
export function suppressTableGridLines(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  padding: number = 0
): GridLineInfo {
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  if (innerW < 100 || innerH < 100) {
    return { verticalDividerCols: [], horizontalLineRows: [] };
  }

  const isLine = new Uint8Array(width * height);
  const colRuns = new Int32Array(width);

  // 1. Scan for thin vertical lines
  for (let x = padding + 2; x < width - padding - 2; x++) {
    let runStart = -1;
    for (let y = padding; y < height - padding; y++) {
      const idx = (y * width + x) * 4;
      const lum = (data[idx] * 299 + data[idx + 1] * 587 + data[idx + 2] * 114) / 1000;
      if (lum < 185) {
        if (runStart === -1) runStart = y;
      } else {
        if (runStart !== -1) {
          const len = y - runStart;
          if (len >= 35) {
            colRuns[x] = Math.max(colRuns[x], len);
            for (let ly = runStart; ly < y; ly++) {
              isLine[ly * width + x] = 1;
            }
          }
          runStart = -1;
        }
      }
    }
    if (runStart !== -1 && (height - padding - runStart) >= 35) {
      colRuns[x] = Math.max(colRuns[x], height - padding - runStart);
      for (let ly = runStart; ly < height - padding; ly++) {
        isLine[ly * width + x] = 1;
      }
    }
  }

  // 2. Scan for thin horizontal lines
  for (let y = padding + 2; y < height - padding - 2; y++) {
    let runStart = -1;
    for (let x = padding; x < width - padding; x++) {
      const idx = (y * width + x) * 4;
      const lum = (data[idx] * 299 + data[idx + 1] * 587 + data[idx + 2] * 114) / 1000;
      if (lum < 185) {
        if (runStart === -1) runStart = x;
      } else {
        if (runStart !== -1) {
          const len = x - runStart;
          if (len >= 120) {
            for (let lx = runStart; lx < x; lx++) {
              isLine[y * width + lx] = 1;
            }
          }
          runStart = -1;
        }
      }
    }
    if (runStart !== -1 && (width - padding - runStart) >= 120) {
      for (let lx = runStart; lx < width - padding; lx++) {
        isLine[y * width + lx] = 1;
      }
    }
  }

  // 3. Find vertical divider positions (clusters of line columns with run >= 15% of height)
  const minDividerRun = Math.max(80, Math.round(innerH * 0.15));
  const dividerClusters: number[] = [];
  let clusterStart = -1;
  for (let x = padding; x < width - padding; x++) {
    if (colRuns[x] >= minDividerRun) {
      if (clusterStart === -1) clusterStart = x;
    } else {
      if (clusterStart !== -1) {
        const center = Math.round((clusterStart + x - 1) / 2);
        // Exclude outer canvas border
        if (center > padding + 15 && center < width - padding - 15) {
          dividerClusters.push(center);
        }
        clusterStart = -1;
      }
    }
  }

  // 4. Inpaint detected line pixels with 2px safety margin
  for (let y = padding; y < height - padding; y++) {
    for (let x = padding; x < width - padding; x++) {
      let nearLine = false;
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < width && isLine[y * width + nx]) {
          nearLine = true;
          break;
        }
      }
      if (nearLine) {
        const idx = (y * width + x) * 4;
        data[idx] = 255;
        data[idx + 1] = 255;
        data[idx + 2] = 255;
      }
    }
  }

  return {
    verticalDividerCols: dividerClusters,
    horizontalLineRows: [],
  };
}

/**
 * Fast adaptive local background division (illumination flattening):
 * Samples the background luminance across local tiles, then divides pixel luminance
 * by the local background surface to eliminate shadows, dark corners, and gradients.
 * Preserves grayscale anti-aliasing without binarization or loss of faint decimal dots.
 */
export function normalizeLocalIllumination(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  padding: number = 0
): void {
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  if (innerW < 50 || innerH < 50) return;

  const tileSize = 48;
  const gridW = Math.ceil(innerW / tileSize);
  const gridH = Math.ceil(innerH / tileSize);
  const bgGrid = new Float32Array(gridW * gridH);

  // 1. Calculate local background luminance (90th percentile of local tile)
  for (let gy = 0; gy < gridH; gy++) {
    const y0 = padding + gy * tileSize;
    const y1 = Math.min(height - padding, y0 + tileSize);

    for (let gx = 0; gx < gridW; gx++) {
      const x0 = padding + gx * tileSize;
      const x1 = Math.min(width - padding, x0 + tileSize);

      const hist = new Uint16Array(256);
      let count = 0;
      for (let y = y0; y < y1; y += 4) {
        for (let x = x0; x < x1; x += 4) {
          const idx = (y * width + x) * 4;
          const lum = Math.round((data[idx] * 299 + data[idx + 1] * 587 + data[idx + 2] * 114) / 1000);
          hist[Math.max(0, Math.min(255, lum))]++;
          count++;
        }
      }

      // Target 90th percentile for paper background
      const target = Math.max(1, Math.round(count * 0.90));
      let bgVal = 215;
      let running = 0;
      for (let k = 0; k < 256; k++) {
        running += hist[k];
        if (running >= target) {
          bgVal = k;
          break;
        }
      }
      bgGrid[gy * gridW + gx] = Math.max(bgVal, 30);
    }
  }

  // 2. Normalize each pixel by dividing by local interpolated background
  for (let y = padding; y < height - padding; y++) {
    const gy = Math.min(gridH - 1, Math.floor((y - padding) / tileSize));
    const rowIdx = gy * gridW;

    for (let x = padding; x < width - padding; x++) {
      const gx = Math.min(gridW - 1, Math.floor((x - padding) / tileSize));
      const bg = bgGrid[rowIdx + gx];
      const i = (y * width + x) * 4;
      const lum = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;

      // Divide by local background and scale to near-white (245)
      let normalized = (lum / bg) * 245;

      // Controlled whitening: clean paper background (> 238) to white,
      // slightly boost deep ink (< 50), preserve midtones (100-230) for dots/accents
      if (normalized > 238) {
        normalized = 255;
      } else if (normalized < 50) {
        normalized = Math.max(0, normalized * 0.85);
      }

      const finalVal = Math.max(0, Math.min(255, Math.round(normalized)));
      data[i] = finalVal;
      data[i + 1] = finalVal;
      data[i + 2] = finalVal;
    }
  }
}

function percentileFromHistogram(hist: Uint32Array, count: number, percentile: number): number {
  if (count <= 0) return percentile <= 0.5 ? 0 : 255;

  const target = Math.max(1, Math.round(count * percentile));
  let running = 0;
  for (let i = 0; i < hist.length; i++) {
    running += hist[i];
    if (running >= target) return i;
  }
  return 255;
}

function sharpenGrayscaleImageControlled(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  left: number,
  top: number,
  right: number,
  bottom: number
) {
  const source = new Uint8ClampedArray(data);
  const startX = Math.max(1, left);
  const startY = Math.max(1, top);
  const endX = Math.min(width - 1, right);
  const endY = Math.min(height - 1, bottom);

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const i = (y * width + x) * 4;
      const center = source[i];
      const topLum = source[((y - 1) * width + x) * 4];
      const bottomLum = source[((y + 1) * width + x) * 4];
      const leftLum = source[(y * width + x - 1) * 4];
      const rightLum = source[(y * width + x + 1) * 4];
      const sharpened = center * 1.35 - (topLum + bottomLum + leftLum + rightLum) * 0.0875;
      const value = Math.max(0, Math.min(255, Math.round(sharpened)));
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
    }
  }
}

function loadImageElement(source: string | HTMLCanvasElement | HTMLImageElement | File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') {
      return reject(new Error('Image constructor is not available'));
    }
    if (source instanceof HTMLImageElement) {
      if (source.complete && source.naturalWidth > 0) return resolve(source);
      source.onload = () => resolve(source);
      source.onerror = reject;
      return;
    }
    if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
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
      reject(new Error('Định dạng nguồn ảnh không được hỗ trợ.'));
    }
  });
}

/**
 * Extract text from an image using Tesseract.js (Vietnamese + English)
 */
export async function extractTextFromImage(
  imageSource: string | HTMLCanvasElement | HTMLImageElement | File | Blob,
  onProgress?: OcrProgressCallback,
  abortSignal?: AbortSignal
): Promise<string> {
  if (abortSignal?.aborted) {
    throw new DOMException('Tác vụ OCR đã bị hủy.', 'AbortError');
  }

  onProgress?.({ message: 'Đang tiền xử lý ảnh và khởi động Tesseract OCR...', progress: 15 });

  const processedSource = await preprocessImageForOcr(imageSource);

  try {
    const primaryResult = await runExclusiveOcr(async () => {
      if (abortSignal?.aborted) {
        throw createAbortError('Tác vụ OCR đã bị hủy.');
      }

      activeOcrProgress = onProgress;

      let result: Awaited<ReturnType<typeof runOcrPass>>;
      try {
        result = await runOcrPass(processedSource, onProgress, abortSignal);
      } catch (err: any) {
        if (err?.name === 'AbortError') throw err;
        console.warn('OCR on preprocessed source failed, retrying original source:', err);
        localOcrWorkerPromise = null;
        onProgress?.({ message: 'OCR ảnh chuẩn hóa gặp sự cố, đang thử lại với nguồn gốc...', progress: 85 });
        result = await runOcrPass(imageSource, onProgress, abortSignal);
      } finally {
        activeOcrProgress = undefined;
      }

      return result;
    });

    onProgress?.({ message: 'Tesseract OCR hoàn tất!', progress: 95 });
    return getReadableOcrText(primaryResult);
  } finally {
    if (typeof HTMLCanvasElement !== 'undefined' && processedSource instanceof HTMLCanvasElement && processedSource !== imageSource) {
      disposeCanvas(processedSource);
    }
  }
}

async function runOcrPass(
  processedSource: HTMLCanvasElement | HTMLImageElement | string | File | Blob,
  onProgress?: OcrProgressCallback,
  abortSignal?: AbortSignal
) {
  const worker = await getLocalOcrWorker(onProgress, abortSignal);
  if (abortSignal?.aborted) {
    throw createAbortError('Tác vụ OCR đã bị hủy.');
  }

  const recognizePromise = recognizeOcrVariant(worker, processedSource);
  if (!abortSignal) {
    return recognizePromise;
  }

  let abortListener: (() => void) | undefined;
  const abortPromise = new Promise<never>((_, reject) => {
    abortListener = () => {
      localOcrWorkerPromise = null;
      worker.terminate().catch(() => {});
      reject(createAbortError('Tác vụ OCR đã bị hủy.'));
    };
    abortSignal.addEventListener('abort', abortListener, { once: true });
  });

  try {
    return await Promise.race([recognizePromise, abortPromise]);
  } finally {
    if (abortListener) {
      abortSignal.removeEventListener('abort', abortListener);
    }
  }
}



async function runExclusiveOcr<T>(task: () => Promise<T>): Promise<T> {
  const run = ocrQueue.then(task, task);
  ocrQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/**
 * Singleton worker management: worker is initialized once and reused between pages/files
 */
export async function getLocalOcrWorker(
  onProgress?: OcrProgressCallback,
  abortSignal?: AbortSignal
): Promise<OcrWorker> {
  activeOcrProgress = onProgress;

  if (!localOcrWorkerPromise) {
    localOcrWorkerPromise = createLocalOcrWorker(abortSignal)
      .catch((err) => {
        localOcrWorkerPromise = null;
        throw err;
      });
  }

  return localOcrWorkerPromise;
}

async function createLocalOcrWorker(abortSignal?: AbortSignal): Promise<OcrWorker> {
  if (abortSignal?.aborted) {
    throw new DOMException('Tác vụ đã bị hủy.', 'AbortError');
  }

  const languages: Array<'vie' | 'eng'> = ['vie', 'eng'];
  const baseHref = typeof window !== 'undefined'
    ? new URL('.', window.location.href).href.replace(/\/+$/, '') + '/'
    : './';

  try {
    const worker = await createWorker(languages, undefined, {
      workerPath: `${baseHref}tesscore/worker.min.js`,
      corePath: `${baseHref}tesscore`,
      langPath: `${baseHref}tessdata`,
      gzip: true,
      logger: (m) => {
        if (abortSignal?.aborted) return;
        if (m.status === 'recognizing text') {
          const p = 25 + Math.round((m.progress || 0) * 65);
          activeOcrProgress?.({
            message: `Tesseract (${languages.join('+')}): ${Math.round((m.progress || 0) * 100)}%`,
            progress: p,
          });
        } else if (m.status === 'loading tesseract core' || m.status === 'loading language traineddata') {
          activeOcrProgress?.({
            message: `Tesseract: ${m.status}...`,
            progress: 20,
          });
        }
      },
    });

    if (abortSignal?.aborted) {
      await worker.terminate();
      throw new DOMException('Tác vụ đã bị hủy.', 'AbortError');
    }

    await worker.setParameters({
      preserve_interword_spaces: DEFAULT_OCR_CONFIG.preserveInterwordSpaces,
      tessedit_pageseg_mode: DEFAULT_OCR_CONFIG.psm,
      user_defined_dpi: DEFAULT_OCR_CONFIG.userDefinedDpi,
    });

    return worker;
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    console.error('Lỗi khi tải hoặc khởi động Tesseract worker cục bộ:', err);
    throw new Error(
      'Không thể tải mô hình OCR Tesseract cục bộ (WASM/tessdata). Vui lòng kiểm tra các tệp trong public/tesscore và public/tessdata.'
    );
  }
}

/**
 * Terminate worker and free all associated memory
 */
export async function terminateOcrWorker(): Promise<void> {
  if (localOcrWorkerPromise) {
    try {
      const worker = await localOcrWorkerPromise;
      await worker.terminate();
    } catch {
      // Ignore termination error
    } finally {
      localOcrWorkerPromise = null;
    }
  }
}

/**
 * Cancels any active OCR job
 */
export function cancelActiveOcr(): void {
  terminateOcrWorker().catch(() => {});
}

async function recognizeOcrVariant(worker: OcrWorker, source: unknown) {
  const tesseractSource = await prepareTesseractImageSource(source);
  return worker.recognize(
    tesseractSource as any,
    { rotateAuto: true },
    { text: true, tsv: true }
  );
}

function prepareTesseractImageSource(source: unknown): Promise<unknown> {
  if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
    return new Promise((resolve) => {
      source.toBlob((blob) => {
        resolve(blob || source.toDataURL('image/png'));
      }, 'image/png');
    });
  }

  return Promise.resolve(source);
}

/**
 * Decides whether to use plain text or TSV reconstruction.
 * Requirements:
 * - Prioritize result.data.text when it has line structure and characters.
 * - Do NOT replace text simply based on character count.
 * - Only fall back to TSV when plain text lacks line breaks or is empty.
 */
function getReadableOcrText(result: Awaited<ReturnType<OcrWorker['recognize']>>): string {
  const plainText = (result.data.text || '').trim();
  const plainLines = plainText.split(/\r?\n/).filter((l) => l.trim()).length;

  // If plainText is solid and structured, prefer it directly
  if (plainText.length > 20 && plainLines >= 2) {
    return plainText;
  }

  const tsvText = reconstructTextFromTsv(result.data.tsv);
  if (tsvText && !plainText) {
    return tsvText;
  }

  return plainText || tsvText;
}

export function reconstructTextFromTsv(tsv: string | null | undefined): string {
  if (!tsv) return '';

  interface WordBox {
    text: string;
    left: number;
    top: number;
    width: number;
    confidence: number;
    lineKey: string;
  }

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
      confidence: Number.isFinite(conf) ? conf : 80,
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
  onProgress?: OcrProgressCallback,
  abortSignal?: AbortSignal,
  engine: OcrEngineType = 'tesseract'
): Promise<LabReport> {
  if (abortSignal?.aborted) {
    throw new DOMException('Tác vụ đọc file đã bị hủy.', 'AbortError');
  }

  if (file.size > FILE_LIMITS.maxFileSize) {
    throw new Error(
      `Dung lượng file "${file.name}" (${(file.size / 1024 / 1024).toFixed(1)}MB) vượt quá giới hạn cho phép (tối đa 30MB).`
    );
  }

  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  let tesseractRawText = '';
  let scribeRawText = '';
  let previewDataUrl = '';

  // 1. Tesseract / PDF.js pass
  if (isPdf) {
    onProgress?.({ message: 'Đang mở tập tin PDF bằng PDF.js...', progress: 5 });
    const { text, pageDataUrls } = await extractTextFromPdf(file, onProgress, abortSignal);
    tesseractRawText = text;
    if (pageDataUrls.length > 0) {
      previewDataUrl = pageDataUrls[0];
    } else {
      previewDataUrl = await readFileAsDataUrl(file);
    }
  } else {
    previewDataUrl = await readFileAsDataUrl(file);
    if (engine === 'tesseract' || engine === 'both') {
      onProgress?.({ message: 'Đang chuẩn hóa ảnh và quét Tesseract OCR...', progress: 10 });
      tesseractRawText = await extractTextFromImage(file, onProgress, abortSignal);
    }
  }

  if (abortSignal?.aborted) {
    throw new DOMException('Tác vụ đã bị hủy.', 'AbortError');
  }

  // 2. Scribe.js pass if requested
  if (engine === 'scribe' || engine === 'both') {
    onProgress?.({ message: 'Đang khởi động và nhận dạng bằng Scribe.js OCR...', progress: engine === 'both' ? 60 : 15 });
    try {
      const { extractTextWithScribe } = await import('./scribeEngine');
      scribeRawText = await extractTextWithScribe(file, {
        langs: ['vie', 'eng'],
        onProgress: (info) => {
          if (engine === 'both') {
            onProgress?.({
              message: `[Scribe.js] ${info.message}`,
              progress: Math.min(95, Math.round(55 + (info.progress * 0.4))),
            });
          } else {
            onProgress?.({ message: `[Scribe.js] ${info.message}`, progress: info.progress });
          }
        },
      });
    } catch (err: any) {
      console.warn('Scribe.js OCR error:', err);
      if (engine === 'scribe') {
        onProgress?.({
          message: 'Scribe.js không khởi động được, đang chuyển sang Tesseract.js local...',
          progress: 60,
        });
        if (!tesseractRawText && !isPdf) {
          tesseractRawText = await extractTextFromImage(file, onProgress, abortSignal);
        }
      }
    }
  }

  if (abortSignal?.aborted) {
    throw new DOMException('Tác vụ đã bị hủy.', 'AbortError');
  }

  onProgress?.({ message: 'Đang bóc tách chỉ số xét nghiệm & đối chiếu danh mục...', progress: 96 });

  // Choose the active raw text for medical parser
  const activeRawText = (engine === 'scribe' ? scribeRawText : tesseractRawText) || scribeRawText || tesseractRawText;

  const parsedPartial = parseMedicalReportFromText(activeRawText, file.name);

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
    rawText: activeRawText,
    tesseractRawText: tesseractRawText || undefined,
    scribeRawText: scribeRawText || undefined,
    selectedEngine: engine,
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
