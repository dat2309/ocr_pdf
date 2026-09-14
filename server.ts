import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { createWorker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseMedicalReportFromText } from './src/utils/medicalParser';

dotenv.config();

const app = express();
const PORT = 3000;

// Support large payload for high-res medical images and PDFs
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

/**
 * Extract structured text from PDF buffer using PDF.js
 */
async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdfDoc = await loadingTask.promise;
  let fullText = '';

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const lineMap = new Map<number, Array<{ x: number; str: string }>>();

    for (const item of textContent.items as any[]) {
      if (!item.str || item.str.trim() === '') continue;
      const y = Math.round(item.transform[5] / 4) * 4;
      const x = item.transform[4];
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y)!.push({ x, str: item.str });
    }

    const sortedYs = Array.from(lineMap.keys()).sort((a, b) => b - a);
    for (const y of sortedYs) {
      const lineItems = lineMap.get(y)!;
      lineItems.sort((a, b) => a.x - b.x);
      fullText += lineItems.map((it) => it.str).join('  ') + '\n';
    }
  }

  return fullText;
}

/**
 * Extract text from Image buffer using Tesseract.js (Vietnamese + English)
 */
async function extractTextFromImageBuffer(buffer: Buffer): Promise<string> {
  const worker = await createWorker(['vie', 'eng']);
  try {
    const ret = await worker.recognize(buffer);
    return ret.data.text;
  } finally {
    await worker.terminate();
  }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    engine: 'PDF.js & Tesseract OCR (Không dùng AI)',
  });
});

// Endpoint to analyze medical test image or PDF via PDF.js & Tesseract
app.post('/api/analyze-lab-test', async (req, res) => {
  try {
    const { fileBase64, mimeType, fileName } = req.body;

    if (!fileBase64) {
      return res.status(400).json({ error: 'Vui lòng cung cấp dữ liệu file (ảnh hoặc PDF)' });
    }

    const detectedMime = mimeType || (fileName?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
    const isPdf = detectedMime.includes('pdf') || fileName?.toLowerCase().endsWith('.pdf');

    // Clean base64 data if it contains data URI prefix
    const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, '');
    const fileBuffer = Buffer.from(cleanBase64, 'base64');

    let extractedText = '';

    if (isPdf) {
      extractedText = await extractTextFromPdfBuffer(fileBuffer);
      // If digital text extraction is empty or too short (scanned PDF), run Tesseract OCR
      if (!extractedText.trim() || extractedText.trim().length < 50) {
        try {
          extractedText = await extractTextFromImageBuffer(fileBuffer);
        } catch (ocrErr) {
          console.warn('Scanned PDF OCR fallback failed:', ocrErr);
        }
      }
    } else {
      extractedText = await extractTextFromImageBuffer(fileBuffer);
    }

    const parsedData = parseMedicalReportFromText(extractedText, fileName || 'xet-nghiem.jpg');

    const report = {
      ...parsedData,
      id: `rep-${Date.now()}`,
      fileName: fileName || (isPdf ? 'xet-nghiem.pdf' : 'xet-nghiem.jpg'),
      fileType: isPdf ? 'pdf' : 'image',
      fileDataUrl: `data:${detectedMime};base64,${cleanBase64}`,
    };

    res.json(report);
  } catch (err: any) {
    console.error('Error analyzing lab test with PDF.js & Tesseract:', err);
    res.status(500).json({
      error: err.message || 'Lỗi xử lý file với PDF.js và Tesseract OCR. Vui lòng kiểm tra lại hình ảnh/PDF.',
    });
  }
});

// Vite middleware setup
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
