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

  // Resolve base URL properly for GitHub Pages or nested subpaths
  if (typeof window !== 'undefined') {
    let tessdataPath: string;
    try {
      // In production, scribeEngine is bundled into assets/scribeEngine.js
      // ../tessdata points directly to the app's tessdata directory
      tessdataPath = new URL('../tessdata', import.meta.url).href;
    } catch {
      let pathname = window.location.pathname;
      if (!pathname.endsWith('/')) {
        if (!pathname.split('/').pop()?.includes('.')) {
          pathname += '/';
        } else {
          pathname = pathname.substring(0, pathname.lastIndexOf('/') + 1);
        }
      }
      tessdataPath = new URL('tessdata', `${window.location.origin}${pathname}`).href;
    }
    scribe.opt.langPath = tessdataPath.replace(/\/+$/, '');
  }

  // Convert blob/file if needed
  let input: File;
  if (fileOrBlob instanceof File) {
    input = fileOrBlob;
  } else {
    input = new File([fileOrBlob], 'input-image.png', { type: fileOrBlob.type || 'image/png' });
  }

  onProgress?.({ message: 'Scribe.js đang phân tích tài liệu...', progress: 35 });

  try {
    const text = await scribe.extractText([input], langs, 'txt');
    onProgress?.({ message: 'Scribe.js hoàn tất!', progress: 100 });
    return typeof text === 'string' ? text.trim() : String(text || '').trim();
  } catch (err: any) {
    console.warn('Scribe.js OCR failed with local tessdata path, trying fallback CDN...', err);

    // Fallback: If local traineddata fetch fails (404/CORS), allow Scribe to fetch from jsdelivr CDN
    try {
      scribe.opt.langPath = null;
      onProgress?.({ message: 'Đang thử lại Scribe.js với CDN...', progress: 50 });
      const fallbackText = await scribe.extractText([input], langs, 'txt');
      onProgress?.({ message: 'Scribe.js hoàn tất!', progress: 100 });
      return typeof fallbackText === 'string' ? fallbackText.trim() : String(fallbackText || '').trim();
    } catch (fallbackErr: any) {
      console.error('Scribe.js OCR fallback error:', fallbackErr);
      throw new Error(`Scribe.js OCR thất bại: ${err?.message || fallbackErr?.message || err}`);
    }
  }
}
