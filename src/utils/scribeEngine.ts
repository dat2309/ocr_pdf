// @ts-ignore
import scribe from 'scribe.js-ocr';

export interface ScribeOcrOptions {
  langs?: string[];
  onProgress?: (info: { message: string; progress: number }) => void;
}

/**
 * Extracts raw text from an image or PDF file using Scribe.js
 */
export async function extractTextWithScribe(
  fileOrBlob: File | Blob,
  options: ScribeOcrOptions = {}
): Promise<string> {
  const { langs = ['vie', 'eng'], onProgress } = options;

  onProgress?.({ message: 'Khởi chạy Scribe.js OCR...', progress: 10 });

  // Resolve base URL properly for GitHub Pages, Vite dev, and nested subpaths.
  // document.baseURI follows the <base>/current page path, while import.meta.url
  // points at the bundled chunk under assets/.
  if (typeof window !== 'undefined') {
    const tessdataPath = new URL('tessdata/', document.baseURI || window.location.href).href;
    scribe.opt.langPath = tessdataPath.replace(/\/+$/, '');
    scribe.opt.workerN = 1;
    scribe.opt.inProcess = true;
  }

  // Convert blob/file if needed
  let input: File;
  if (fileOrBlob instanceof File) {
    input = fileOrBlob;
  } else {
    input = new File([fileOrBlob], 'input-image.png', { type: fileOrBlob.type || 'image/png' });
  }

  onProgress?.({ message: 'Scribe.js đang phân tích tài liệu...', progress: 35 });

  let doc: any = null;
  try {
    doc = await scribe.openDocument([input]);
    onProgress?.({ message: 'Scribe.js đang nhận diện bằng Tesseract LSTM...', progress: 50 });
    await doc.recognize({
      langs,
      vanillaMode: true,
      modeAdv: 'lstm',
      ocrPages: 'all',
      config: {
        tessedit_pageseg_mode: '3',
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      },
    });
    const text = await doc.exportData('txt');
    onProgress?.({ message: 'Scribe.js hoàn tất!', progress: 100 });
    return typeof text === 'string' ? text.trim() : String(text || '').trim();
  } catch (err: any) {
    console.warn('Scribe.js OCR failed with local tessdata path:', err);
    throw new Error(`Scribe.js OCR thất bại: ${err?.message || err}`);
  } finally {
    if (doc) {
      try {
        await doc.close();
      } catch {
        // Ignore cleanup errors.
      }
    }
    await scribe.terminate().catch(() => {});
  }
}
