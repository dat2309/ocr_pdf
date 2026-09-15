import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluatePdfTextQuality,
  reconstructPdfPageText,
  DEFAULT_PDF_QUALITY_CONFIG,
} from '../src/utils/ocrEngine';

describe('PDF Text Quality & Page-by-Page Evaluation', () => {
  // Case 1: PDF chỉ có text
  it('Trường hợp 1: PDF điện tử có text layer chuẩn xác (usable: true, điểm cao)', () => {
    const digitalText = `
      BỆNH VIỆN ĐA KHOA QUỐC TẾ - KHOA XÉT NGHIỆM
      PHIẾU KẾT QUẢ XÉT NGHIỆM
      Họ và tên: NGUYỄN VĂN AN     Giới tính: Nam     Năm sinh: 1985
      Mã bệnh nhân: BN-99821       Ngày trả kết quả: 15/09/2026
      Tên xét nghiệm          Kết quả    Đơn vị     Khoảng tham chiếu
      Glucose                 5.9        mmol/L     3.9 - 6.4
      Creatinine              88.5       µmol/L     62 - 106
      Acid Uric               320        µmol/L     180 - 420
      Triglyceride            1.85       mmol/L     0.46 - 2.20
    `;

    const dummyItems = [{ str: 'dummy' }];
    const result = evaluatePdfTextQuality(dummyItems, digitalText);

    assert.equal(result.usable, true);
    assert.ok(result.score >= 80, `Điểm phải >= 80, thực tế: ${result.score}`);
    assert.equal(result.metrics.hasMedicalKeywords, true);
    assert.equal(result.metrics.hasUnits, true);
    assert.equal(result.metrics.hasNumericValues, true);
    assert.equal(result.metrics.isWatermarkOnly, false);
  });

  // Case 2: PDF chỉ chứa ảnh scan (text rỗng hoặc chỉ có vài ký tự rác)
  it('Trường hợp 2: PDF scan không có text layer (usable: false, điểm thấp)', () => {
    const emptyOrSparseText = '  Scan 1   ';
    const result = evaluatePdfTextQuality([], emptyOrSparseText);

    assert.equal(result.usable, false);
    assert.ok(result.score < 60);
    assert.ok(result.reasons.some((r) => r.includes('quá ít')));
  });

  // Case 3: PDF hỗn hợp text và scan
  it('Trường hợp 3: PDF hỗn hợp đánh giá độc lập từng trang', () => {
    const page1Text = `
      KHOA XÉT NGHIỆM Y HỌC
      Bệnh nhân: TRẦN THỊ HỒNG
      Glucose: 5.4 mmol/L (3.9 - 6.4)
      Ure máu: 4.8 mmol/L (2.5 - 7.5)
      Creatinine: 72 µmol/L (44 - 88)
    `;
    const page2ScanText = '   '; // Trang scan không có text

    const p1Result = evaluatePdfTextQuality([], page1Text);
    const p2Result = evaluatePdfTextQuality([], page2ScanText);

    assert.equal(p1Result.usable, true, 'Trang 1 text thật phải là usable');
    assert.equal(p2Result.usable, false, 'Trang 2 scan phải là non-usable');
  });

  // Case 4: PDF có watermark nhưng bảng xét nghiệm là ảnh scan
  it('Trường hợp 4: PDF có watermark "TEST PDF / CONFIDENTIAL" nhưng nội dung bảng là scan (usable: false)', () => {
    const watermarkOnlyText = `
      TEST PDF
      CONFIDENTIAL
      Trang 1/2
    `;

    const result = evaluatePdfTextQuality([], watermarkOnlyText);
    assert.equal(result.usable, false);
    assert.equal(result.metrics.isWatermarkOnly, true);
    assert.ok(result.reasons.some((r) => r.includes('watermark') || r.includes('tiêu đề')));
  });

  // Case 5: PDF có text layer lỗi encoding (chứa \uFFFD hoặc chuỗi cid rác)
  it('Trường hợp 5: PDF có text layer lỗi font / replacement character (usable: false)', () => {
    const corruptedText = `
      X\uFFFDt nghi\uFFFDm m\uFFFD\uFFFD (cid:120)(cid:121)(cid:122)
      Gl\uFFFDc\uFFFDs\uFFFD: \uFFFD\uFFFD\uFFFD mm\uFFFDl/L
      Cr\uFFFD\uFFFDt\uFFFDn\uFFFDn\uFFFD: \uFFFD\uFFFD\uFFFD
    `;

    const result = evaluatePdfTextQuality([], corruptedText);
    assert.equal(result.usable, false);
    assert.ok(result.metrics.corruptedCharsCount >= 3);
    assert.ok(result.reasons.some((r) => r.includes('encoding') || r.includes('replacement')));
  });

  // Case 6: Dựng lại dòng text có khoảng cách cột chính xác
  it('Trường hợp 6: Dựng lại dòng và giữ khoảng cách cột từ textContent items', () => {
    const items = [
      { str: 'Glucose', transform: [1, 0, 0, 1, 50, 700], width: 45, height: 12 },
      { str: '5.9', transform: [1, 0, 0, 1, 200, 700], width: 20, height: 12 },
      { str: 'mmol/L', transform: [1, 0, 0, 1, 300, 700], width: 40, height: 12 },
      { str: '3.9 - 6.4', transform: [1, 0, 0, 1, 400, 700], width: 50, height: 12 },
      { str: 'Creatinine', transform: [1, 0, 0, 1, 50, 680], width: 55, height: 12 },
      { str: '65.1', transform: [1, 0, 0, 1, 200, 680], width: 25, height: 12 },
      { str: 'µmol/L', transform: [1, 0, 0, 1, 300, 680], width: 40, height: 12 },
      { str: '53 - 106', transform: [1, 0, 0, 1, 400, 680], width: 48, height: 12 },
    ];

    const reconstructed = reconstructPdfPageText(items);
    const lines = reconstructed.split('\n');

    assert.equal(lines.length, 2);
    assert.ok(lines[0].includes('Glucose') && lines[0].includes('5.9') && lines[0].includes('mmol/L'));
    assert.ok(lines[1].includes('Creatinine') && lines[1].includes('65.1') && lines[1].includes('µmol/L'));
  });

  // Case 7: Phát hiện văn bản lặp bất thường (character bomb / vector error)
  it('Trường hợp 7: Phát hiện văn bản lặp bất thường (abnormal repetition)', () => {
    const repetitiveText = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const result = evaluatePdfTextQuality([], repetitiveText);

    assert.equal(result.usable, false);
    assert.equal(result.metrics.hasAbnormalRepetition, true);
  });
});
