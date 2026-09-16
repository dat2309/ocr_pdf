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

  // Point to local or CDN traineddata
  if (typeof window !== 'undefined') {
    scribe.opt.langPath = `${window.location.origin}/tessdata`;
  }

  // Convert blob/file if needed
  let input: File;
  if (fileOrBlob instanceof File) {
    input = fileOrBlob;
  } else {
    input = new File([fileOrBlob], 'input-image.png', { type: fileOrBlob.type || 'image/png' });
  }

  onProgress?.({ message: 'Scribe.js đang phân tích tài liệu...', progress: 30 });

  try {
    const text = await scribe.extractText([input], langs, 'txt');
    onProgress?.({ message: 'Scribe.js hoàn tất!', progress: 100 });
    return typeof text === 'string' ? text.trim() : String(text || '').trim();
  } catch (err: any) {
    console.error('Scribe.js OCR error:', err);
    throw new Error(`Scribe.js OCR thất bại: ${err?.message || err}`);
  }
}
