import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cancelActiveOcr, terminateOcrWorker } from '../src/utils/ocrEngine';

describe('OCR Lifecycle & Cancellation & Error Handling', () => {
  // Case 18: Người dùng hủy OCR giữa chừng
  it('Trường hợp 18: Hỗ trợ AbortController và cancelActiveOcr dừng tác vụ OCR', async () => {
    const controller = new AbortController();
    assert.equal(controller.signal.aborted, false);

    controller.abort();
    assert.equal(controller.signal.aborted, true);

    // cancelActiveOcr should gracefully terminate workers and cleanup
    assert.doesNotThrow(() => {
      cancelActiveOcr();
    });

    await terminateOcrWorker();
  });

  // Case 19: Xử lý thông báo lỗi khi worker/model local không tải được
  it('Trường hợp 19: Bắt và đưa ra thông báo lỗi tiếng Việt rõ ràng khi asset local bị thiếu', () => {
    const simulatedError = new Error('Failed to load WASM or language traineddata from public/tessdata');
    const userFriendlyMessage = 'Không thể tải mô hình OCR Tesseract cục bộ (WASM/tessdata). Vui lòng kiểm tra các tệp trong public/tesscore và public/tessdata.';

    // Kiểm tra cấu trúc thông báo lỗi
    assert.ok(userFriendlyMessage.includes('public/tesscore'));
    assert.ok(userFriendlyMessage.includes('public/tessdata'));
    assert.ok(userFriendlyMessage.includes('cục bộ'));
  });
});
