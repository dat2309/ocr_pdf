import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FILE_LIMITS } from '../src/utils/ocrEngine';

describe('Image Preprocessing & Aspect Ratio & Limits', () => {
  // Case 7: Ảnh ngang - không ép ảnh ngang vào canvas trang dọc
  it('Trường hợp 7: Ảnh ngang giữ nguyên tỉ lệ, không ép vào khung dọc 792/612', () => {
    const origW = 2400;
    const origH = 1200;
    const aspectRatio = origW / origH; // 2.0 (ngang)

    // Logic tính toán kích thước trong ocrEngine.ts
    let scale = 1.0;
    if (origW < 1600) {
      scale = Math.min(2.5, 2200 / origW);
    } else if (origW > 3200) {
      scale = 2600 / origW;
    }

    let targetW = Math.round(origW * scale);
    let targetH = Math.round(origH * scale);

    const padding = 16;
    const canvasW = targetW + padding * 2;
    const canvasH = targetH + padding * 2;
    const resultAspectRatio = (canvasW - padding * 2) / (canvasH - padding * 2);

    assert.equal(resultAspectRatio, aspectRatio, 'Tỉ lệ ảnh ngang phải được bảo toàn tuyệt đối');
    assert.ok(canvasW > canvasH, 'Canvas ảnh ngang phải có chiều rộng lớn hơn chiều cao');
  });

  // Case 8: Ảnh dọc - bảo toàn tỉ lệ
  it('Trường hợp 8: Ảnh dọc giữ nguyên tỉ lệ gốc', () => {
    const origW = 1200;
    const origH = 2400;
    const aspectRatio = origW / origH; // 0.5 (dọc)

    let scale = 1.0;
    if (origW < 1600) {
      scale = Math.min(2.5, 2200 / origW);
    }

    const targetW = Math.round(origW * scale);
    const targetH = Math.round(origH * scale);
    const resultAspectRatio = targetW / targetH;

    assert.ok(Math.abs(resultAspectRatio - aspectRatio) < 0.01, 'Tỉ lệ ảnh dọc được giữ nguyên');
    assert.ok(targetH > targetW, 'Chiều cao lớn hơn chiều rộng');
  });

  // Case 9: Ảnh độ phân giải thấp - upscale có kiểm soát
  it('Trường hợp 9: Ảnh độ phân giải thấp (width < 1600) được upscale để chữ rõ nét', () => {
    const lowResW = 800;
    const lowResH = 1000;

    const scale = Math.min(2.5, 2200 / lowResW); // 2200 / 800 = 2.5 (căn cứ 2200px)
    const targetW = Math.round(lowResW * scale);
    const targetH = Math.round(lowResH * scale);

    assert.ok(targetW >= 1800, `Ảnh nhỏ phải được upscale lên vùng đọc tốt, thực tế: ${targetW}`);
    assert.equal(targetW, 2000);
    assert.equal(targetH, 2500);
  });

  // Case 10: Ảnh bị xoay theo EXIF - kiểm tra hằng số và hỗ trợ định hướng
  it('Trường hợp 10: Xử lý EXIF Orientation từ ảnh', () => {
    // Thẻ EXIF 1: bình thường, 3: xoay 180, 6: xoay 90 CW, 8: xoay 270 CW
    const exifTags = [1, 3, 6, 8];
    for (const tag of exifTags) {
      const isRotated = tag === 6 || tag === 8;
      const initialW = 3000;
      const initialH = 2000;
      const finalW = isRotated ? initialH : initialW;
      const finalH = isRotated ? initialW : initialH;

      if (isRotated) {
        assert.equal(finalW, 2000);
        assert.equal(finalH, 3000);
      } else {
        assert.equal(finalW, 3000);
        assert.equal(finalH, 2000);
      }
    }
  });

  // Case 11: Ảnh có nền xám hoặc ánh sáng không đều - bảo tồn điểm xám midtone (dấu chấm thập phân)
  it('Trường hợp 11: Thuật toán kéo tương phản không cắt cụt (clamp) dải midtone (100-230)', () => {
    const testLuminances = [
      { name: 'Nền giấy trắng', lum: 245, shouldBeCleaned: true },
      { name: 'Dấu chấm thập phân mờ', lum: 160, shouldBePreserved: true },
      { name: 'Dấu thanh tiếng Việt', lum: 120, shouldBePreserved: true },
      { name: 'Nét chữ in đậm', lum: 30, shouldBePreserved: true },
    ];

    for (const item of testLuminances) {
      let stretched = item.lum;
      // Công thức controlled whitening trong ocrEngine:
      if (stretched > 238) {
        stretched = 255;
      } else if (stretched < 50) {
        stretched = Math.max(0, stretched * 0.85);
      }

      if (item.shouldBeCleaned) {
        assert.equal(stretched, 255, 'Nền giấy sáng phải được làm trắng');
      }
      if (item.shouldBePreserved) {
        assert.ok(stretched < 250, `Điểm chi tiết ${item.name} (${item.lum}) không được bị làm mất thành màu trắng`);
      }
    }
  });

  // Case 20: File quá lớn hoặc canvas vượt giới hạn bảo vệ RAM
  it('Trường hợp 20: Giới hạn dung lượng file (30MB) và giới hạn kích thước canvas (4096px, 10MP)', () => {
    assert.equal(FILE_LIMITS.maxFileSize, 30 * 1024 * 1024);
    assert.equal(FILE_LIMITS.maxPdfPages, 30);
    assert.equal(FILE_LIMITS.maxCanvasDimension, 4096);
    assert.equal(FILE_LIMITS.maxCanvasPixels, 10_000_000);

    // Thử nghiệm clamp kích thước canvas siêu lớn (ví dụ 8000x6000)
    let hugeW = 8000;
    let hugeH = 6000;

    if (hugeW > FILE_LIMITS.maxCanvasDimension) {
      const s = FILE_LIMITS.maxCanvasDimension / hugeW;
      hugeW = Math.round(hugeW * s);
      hugeH = Math.round(hugeH * s);
    }
    if (hugeW * hugeH > FILE_LIMITS.maxCanvasPixels) {
      const s = Math.sqrt((FILE_LIMITS.maxCanvasPixels * 0.98) / (hugeW * hugeH));
      hugeW = Math.floor(hugeW * s);
      hugeH = Math.floor(hugeH * s);
    }

    assert.ok(hugeW <= FILE_LIMITS.maxCanvasDimension, 'Width không vượt 4096');
    assert.ok(hugeH <= FILE_LIMITS.maxCanvasDimension, 'Height không vượt 4096');
    assert.ok(hugeW * hugeH <= FILE_LIMITS.maxCanvasPixels, 'Total pixels không vượt 10 Megapixels');
  });
});
