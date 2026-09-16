import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMedicalReportFromText,
  parseReferenceRange,
  evaluateStatus,
  checkSuspiciousValue,
  cleanOcrArtifacts,
} from '../src/utils/medicalParser';

describe('Medical Parser & Clinical Safety Rules', () => {
  // Case 12: Dấu thập phân nhỏ
  it('Trường hợp 12: Bóc tách chính xác các dấu thập phân nhỏ (5.9, 65.1, 2.37, 0.74)', () => {
    const rawSample = `
      BỆNH VIỆN ĐA KHOA HOÀN MỸ
      Họ và tên: NGUYỄN VĂN A     Giới tính: Nam     Năm sinh: 1980
      KẾT QUẢ XÉT NGHIỆM SINH HÓA
      1. Glucose (SH/QTKT-01)          5.9     mmol/L    3.9 - 6.4
      2. Creatinine (SH/QTKT-02)       65.1    µmol/L    62 - 106
      3. Triglyceride                  2.37 *  mmol/L    0.46 - 1.88
    `;

    const parsed = parseMedicalReportFromText(rawSample);
    const glu = parsed.tests?.find((t) => t.code === 'GLU');
    const crea = parsed.tests?.find((t) => t.code === 'CREA');
    const trig = parsed.tests?.find((t) => t.code === 'TRIG');

    assert.ok(glu, 'Phải tìm thấy Glucose');
    assert.equal(glu.value, '5.9', 'Glucose phải là 5.9, không được nhầm thành 59');
    assert.equal(glu.numericValue, 5.9);
    assert.equal(glu.unit, 'mmol/L');

    assert.ok(crea, 'Phải tìm thấy Creatinine');
    assert.equal(crea.value, '65.1', 'Creatinine phải là 65.1, không được nhầm thành 651');
    assert.equal(crea.numericValue, 65.1);

    assert.ok(trig, 'Phải tìm thấy Triglyceride');
    assert.equal(trig.value, '2.37', 'Triglyceride phải là 2.37, không được nhầm thành 237');
    assert.equal(trig.status, 'high');
  });

  // Case 13: Dấu * sau kết quả
  it('Trường hợp 13: Dấu * sau kết quả được ghi nhận bất thường, không xóa mất ý nghĩa', () => {
    const raw = `
      1. Glucose 7.8 * mmol/L 3.9 - 6.4
      2. GGT     52 *  U/L    5 - 50
    `;
    const parsed = parseMedicalReportFromText(raw);

    const glu = parsed.tests?.find((t) => t.code === 'GLU');
    assert.ok(glu);
    assert.equal(glu.value, '7.8');
    assert.equal(glu.status, 'high');

    const ggt = parsed.tests?.find((t) => t.code === 'GGT');
    assert.ok(ggt);
    assert.equal(ggt.value, '52');
    assert.equal(ggt.status, 'high');
  });

  // Case 14: Đơn vị µmol/L, umol/L, mg/dL, mmol/L, U/L không thành một phần tên xét nghiệm
  it('Trường hợp 14: Chuẩn hóa đơn vị µmol/L, umol/L, mg/dL, U/L và tách rời khỏi tên xét nghiệm', () => {
    const raw = `
      Creatinine umoVL 88 µmol/L 53 - 106
      Glucose 106 mei, 70 - 115
      Men gan AST 35 U/L 10 - 40
      Độ lọc cầu thận eGFR 96 mL/phat 90 - 120
    `;
    const parsed = parseMedicalReportFromText(raw);

    const crea = parsed.tests?.find((t) => t.code === 'CREA');
    assert.ok(crea);
    assert.ok(!crea.name.includes('µmol/L'), 'Tên xét nghiệm không được chứa đơn vị');
    assert.ok(!crea.name.includes('umol/L'));
    assert.equal(crea.unit, 'µmol/L');

    const glu = parsed.tests?.find((t) => t.code === 'GLU');
    assert.ok(glu);
    assert.equal(glu.unit, 'mg/dL', 'mei phải được chuẩn hóa thành mg/dL');

    const ast = parsed.tests?.find((t) => t.code === 'AST');
    assert.ok(ast);
    assert.equal(ast.unit, 'U/L');

    const egfr = parsed.tests?.find((t) => t.code === 'eGFR');
    assert.ok(egfr);
    assert.ok(egfr.unit.includes('mL/phút') || egfr.unit.includes('mL/min'));
  });

  // Case 15: Khoảng tham chiếu có <, >, ≤, ≥
  it('Trường hợp 15: Xử lý chính xác các toán tử so sánh khoảng tham chiếu <, >, ≤, ≥', () => {
    // < 5.2
    const resLess = evaluateStatus('5.0', '< 5.2');
    assert.equal(resLess.status, 'normal');
    const resLessOver = evaluateStatus('5.5', '< 5.2');
    assert.equal(resLessOver.status, 'high');

    // <= 100
    const resLessEq = evaluateStatus('100', '<= 100');
    assert.equal(resLessEq.status, 'normal');
    const resLessEqOver = evaluateStatus('100.1', '≤ 100');
    assert.equal(resLessEqOver.status, 'high');

    // > 90
    const resGreater = evaluateStatus('96', '> 90');
    assert.equal(resGreater.status, 'normal');
    const resGreaterUnder = evaluateStatus('85', '> 90');
    assert.equal(resGreaterUnder.status, 'low');

    // >= 90
    const resGreaterEq = evaluateStatus('90', '>= 90');
    assert.equal(resGreaterEq.status, 'normal');
    const resGreaterEqUnder = evaluateStatus('89.9', '≥ 90');
    assert.equal(resGreaterEqUnder.status, 'low');
  });

  // Case 16: Khoảng tham chiếu khác nhau theo giới tính
  it('Trường hợp 16: Phân biệt khoảng tham chiếu theo giới tính Nam/Nữ và cắm cờ nếu thiếu giới tính', () => {
    const genderRange = 'Nam: 62 - 106; Nữ: 44 - 88';

    // Bệnh nhân Nam
    const maleRes = evaluateStatus('95', genderRange, '', 'Nam');
    assert.equal(maleRes.status, 'normal', '95 nằm trong 62 - 106 của Nam');
    assert.equal(maleRes.refMin, 62);
    assert.equal(maleRes.refMax, 106);

    // Bệnh nhân Nữ
    const femaleRes = evaluateStatus('95', genderRange, '', 'Nữ');
    assert.equal(femaleRes.status, 'high', '95 cao hơn 88 của Nữ');
    assert.equal(femaleRes.refMin, 44);
    assert.equal(femaleRes.refMax, 88);

    // Giới tính chưa rõ -> Không được tự đoán!
    const unknownRes = evaluateStatus('95', genderRange, '', 'Chưa rõ');
    assert.equal(unknownRes.needsReview, true);
    assert.ok(unknownRes.warning?.includes('chưa xác định được giới tính'));
  });

  // Case 17: Giá trị nghi ngờ mất dấu thập phân - an toàn y tế (KHÔNG tự ý sửa số)
  it('Trường hợp 17: Giá trị nghi ngờ mất dấu thập phân (59 vs 3.9-6.4) KHÔNG bị tự sửa, đánh dấu needsReview', () => {
    // Kiểm tra trực tiếp checkSuspiciousValue
    const check = checkSuspiciousValue('GLU', '59', 'mmol/L', '3.9 - 6.4', 3.9, 6.4);
    assert.equal(check.isSuspicious, true);
    assert.equal(check.confidence, 55);
    assert.ok(check.warning?.includes('mất dấu thập phân'));

    // Kiểm tra qua parser toàn diện
    const rawSuspicious = `
      Bệnh nhân: NGUYỄN VĂN B
      Glucose: 59 mmol/L (3.9 - 6.4)
    `;
    const parsed = parseMedicalReportFromText(rawSuspicious);
    const glu = parsed.tests?.find((t) => t.code === 'GLU');

    assert.ok(glu);
    assert.equal(glu.value, '59', 'Tuyệt đối không tự ý đổi 59 thành 5.9!');
    assert.equal(glu.rawValue, '59');
    assert.equal(glu.normalizedValue, null);
    assert.equal(glu.needsReview, true, 'Phải có cờ needsReview');
    assert.ok(glu.warning?.includes('mất dấu thập phân'));
  });

  // Case 18: Khử sạch mã quy trình SH/QTKT-xx để không bị nhầm thành giá trị
  it('Trường hợp 18: Khử mã quy trình SH/QTKT-xx và không nhầm thành số đo', () => {
    const raw = `
      1. Glucose (SH/QTKT-12) 5.9 mmol/L 3.9 - 6.4
      2. Creatinine SH/QTKT-05* 65.1 µmol/L 62 - 106
    `;
    const parsed = parseMedicalReportFromText(raw);

    const glu = parsed.tests?.find((t) => t.code === 'GLU');
    assert.ok(glu);
    assert.equal(glu.value, '5.9', 'Không nhầm 12 của SH/QTKT-12 thành giá trị');

    const crea = parsed.tests?.find((t) => t.code === 'CREA');
    assert.ok(crea);
    assert.equal(crea.value, '65.1', 'Không nhầm 05 của SH/QTKT-05 thành giá trị');
  });

  it('Trường hợp 19: Không bỏ sót dòng phụ khi OCR lặp lại tên xét nghiệm với đơn vị khác', () => {
    const raw = `
      XN SINH HÓA
      Glucose        5.9    mmol/L   3.9 - 6.4
      Glucose        106    mg/dL    70 - 115
      Creatinine     65.1   µmol/L   62 - 106
      Creatinine     0.74   mg/dL    0.6 - 1.2
    `;

    const parsed = parseMedicalReportFromText(raw);
    const tests = parsed.tests || [];

    assert.ok(tests.find((t) => t.code === 'GLU' && t.unit === 'mmol/L' && t.value === '5.9'));
    assert.ok(tests.find((t) => t.code === 'GLU' && t.unit === 'mg/dL' && t.value === '106'));
    assert.ok(tests.find((t) => t.code === 'CREA' && t.unit === 'µmol/L' && t.value === '65.1'));
    assert.ok(tests.find((t) => t.code === 'CREA' && t.unit === 'mg/dL' && t.value === '0.74'));
  });

  // Test tổng hợp phiếu mẫu cụ thể theo yêu cầu đề bài
  it('Trường hợp Phiếu Mẫu: Bóc tách đúng Glucose (5.9 mmol/L & 106 mg/dL), Creatinine (65.1 µmol/L & 0.74 mg/dL), eGFR (96 mL/phút), Triglyceride (2.37 mmol/L & 210 mg/dL), GGT (52 U/L)', () => {
    const reportText = `
      BỆNH VIỆN ĐA KHOA QUỐC TẾ
      PHIẾU KẾT QUẢ XÉT NGHIỆM SINH HÓA MÁU
      Họ và tên: PHẠM THÀNH LONG     Giới tính: Nam     Năm sinh: 1978
      Mã BN: BN-2026-8819           Ngày nhận mẫu: 15/09/2026

      TÊN XÉT NGHIỆM                  KẾT QUẢ   ĐƠN VỊ      KHOẢNG THAM CHIẾU
      1. Glucose (SH/QTKT-01)          5.9       mmol/L      3.9 - 6.4
                                       106       mg/dL       70 - 115
      2. Creatinine (SH/QTKT-02)       65.1      µmol/L      62 - 106
                                       0.74      mg/dL       0.6 - 1.2
      3. eGFR (Độ lọc cầu thận CKD)   96        mL/phút     >= 90
      4. Triglyceride (SH/QTKT-05)     2.37 *    mmol/L      0.46 - 1.88
                                       210 *     mg/dL       < 200
      5. GGT (Men gan GGT)            52 *      U/L         5 - 50
    `;

    const parsed = parseMedicalReportFromText(reportText);
    const tests = parsed.tests || [];

    // 1. Glucose
    const gluMmol = tests.find((t) => t.code === 'GLU' && t.unit === 'mmol/L');
    assert.ok(gluMmol, 'Phải có Glucose mmol/L');
    assert.equal(gluMmol.value, '5.9', 'Không nhầm 5.9 thành 59');
    assert.equal(gluMmol.status, 'normal');

    const gluMg = tests.find((t) => t.code === 'GLU' && t.unit === 'mg/dL');
    assert.ok(gluMg, 'Phải có Glucose mg/dL');
    assert.equal(gluMg.value, '106');

    // 2. Creatinine
    const creaUmol = tests.find((t) => t.code === 'CREA' && t.unit === 'µmol/L');
    assert.ok(creaUmol, 'Phải có Creatinine µmol/L');
    assert.equal(creaUmol.value, '65.1', 'Không nhầm 65.1 thành 651');

    const creaMg = tests.find((t) => t.code === 'CREA' && t.unit === 'mg/dL');
    assert.ok(creaMg, 'Phải có Creatinine mg/dL');
    assert.equal(creaMg.value, '0.74', 'Không nhầm 0.74 thành 074');

    // 3. eGFR
    const egfr = tests.find((t) => t.code === 'eGFR');
    assert.ok(egfr, 'Phải có eGFR');
    assert.equal(egfr.value, '96');
    assert.equal(egfr.status, 'normal');

    // 4. Triglyceride
    const trigMmol = tests.find((t) => t.code === 'TRIG' && t.unit === 'mmol/L');
    assert.ok(trigMmol, 'Phải có Triglyceride mmol/L');
    assert.equal(trigMmol.value, '2.37', 'Không nhầm 2.37 thành 237');
    assert.equal(trigMmol.status, 'high');

    const trigMg = tests.find((t) => t.code === 'TRIG' && t.unit === 'mg/dL');
    assert.ok(trigMg, 'Phải có Triglyceride mg/dL');
    assert.equal(trigMg.value, '210');
    assert.equal(trigMg.status, 'high');

    // 5. GGT
    const ggt = tests.find((t) => t.code === 'GGT');
    assert.ok(ggt, 'Phải có GGT');
    assert.equal(ggt.value, '52');
    assert.equal(ggt.status, 'high');
  });

  // Case 22: Bóc tách toàn diện 22 chỉ số từ phiếu sinh hóa OCR thực tế
  it('Trường hợp 22: Bóc tách chính xác 22 chỉ số từ dữ liệu OCR ảnh thực tế (sửa S2 -> 52, 0.74 ml, -> 0.74 mg/dL, cờ * từ %)', () => {
    const realImageOcrText = `
(Test)                                      (Results)              (Units)               (Ref. ranges)                (Procedure)
XN SINH HÓA
(BIOCHEMISTRY)
Glucose                                                              5.9*              mmol/L            3.9- 5.6 mmol/L          SH/QTKT-17**
. Glucose                                                       106 *              mg/dL              70-101 mg/dL
Crontiting                                                                      65.1                  amor, | NERT4- 14: Nữ 5S 961 orgy. aes
umol/L
„ Creatinine                                                                  0.74                 mgd, | NEE 08 ig 066-| cr/QTKT-03**
.  eGFR (CKD-EPI 2021)                                             96                 mL/phút           >= 60 ml/ph/1.73 m2
Cholesterol                                                                  4.94                mmol/L               3.9-5.2mmol/L             SH/QTKT-05**
. Cholesterol                                                          191                 mg/dL               150- 200 mg/dL           SH/QTKT-05**
HDL Cholesterol                                                            1.38                 mmol/L                >0.9mmol/L              SH/QTKT-06**
. HDL Cholesterol                                                 53                 mg/dL                 > 35 mg/dL              SH/QTKT-06**
Non - HDL Cholesterol                                                 3.56                mmol/L                   mmol/L
.  Non- HDL Cholesterol                                            137.5                 mg/dL                      mg/dL
LDL Cholesterol                                                           3.13                mmol/L                <3.4 mmol/L              SH/QTKT-21**
. LDL Cholesterol                                              121               mg/dL               < 131 mg/dL
Triglyceride                                                          237 *              mmol/L            0.46-1.88 mmol/L          SH/QTKT-23**
. Triglyceride                                                     210 *               mg/dL               40-166 mg/dL
GOT/ASAT                                                                     23                     U/L         Nam <40 U/L; Nữ <31 U/L| SH/QTKT-07**
GPT/ALAT                                                          19                 U/L        Nam <41 U/L; Nữ <31 U/L| SH/QTKT-08**
Đo hoạt độ GGT                                                            52%                   U/L                      <40 U/L                 SH/QTKT-09**
Natri                                                                             140                 mmol/L             136 — 146 mmol/L            SH/QTKT-27
Kali                                                                                  4.11                  mmol/L               3.4 —5.1 mmol/L              SH/QTKT-27
Định lượng Clo                                                              106                 mmol/L              98 — 109 mmol/L             SH/QTKT-27
Định lượng Calci toàn phần                                                 2.35                  mmol/L             2.10 — 2.55 mmol/L          SHQTKT-18**
    `;

    const parsed = parseMedicalReportFromText(realImageOcrText, 'real_image.jpg');
    const tests = parsed.tests || [];

    assert.equal(tests.length, 22, 'Phải bóc tách đủ 22 chỉ số từ ảnh');

    // Glucose 2 đơn vị
    const gluMmol = tests.find((t) => t.code === 'GLU' && t.unit === 'mmol/L');
    assert.ok(gluMmol);
    assert.equal(gluMmol.value, '5.9');
    assert.equal(gluMmol.status, 'high');

    const gluMg = tests.find((t) => t.code === 'GLU' && t.unit === 'mg/dL');
    assert.ok(gluMg);
    assert.equal(gluMg.value, '106');
    assert.equal(gluMg.status, 'high');

    // Creatinine 2 đơn vị
    const creaUmol = tests.find((t) => t.code === 'CREA' && t.unit === 'µmol/L');
    assert.ok(creaUmol);
    assert.equal(creaUmol.value, '65.1');

    const creaMg = tests.find((t) => t.code === 'CREA' && t.unit === 'mg/dL');
    assert.ok(creaMg);
    assert.equal(creaMg.value, '0.74');

    // eGFR
    const egfr = tests.find((t) => t.code === 'eGFR');
    assert.ok(egfr);
    assert.equal(egfr.value, '96');
    assert.equal(egfr.unit, 'mL/phút');

    // GGT (sửa từ 52%)
    const ggt = tests.find((t) => t.code === 'GGT');
    assert.ok(ggt);
    assert.equal(ggt.value, '52');
    assert.equal(ggt.status, 'high');

    // Triglyceride nghi ngờ mất dấu thập phân
    const trigMmol = tests.find((t) => t.code === 'TRIG' && t.unit === 'mmol/L');
    assert.ok(trigMmol);
    assert.equal(trigMmol.value, '237');
    assert.equal(trigMmol.needsReview, true, 'Giá trị 237 mmol/L phải được cắm cờ needsReview');

    // Điện giải
    const na = tests.find((t) => t.code === 'Na');
    assert.ok(na);
    assert.equal(na.value, '140');

    const k = tests.find((t) => t.code === 'K');
    assert.ok(k);
    assert.equal(k.value, '4.11');

    const cl = tests.find((t) => t.code === 'Cl');
    assert.ok(cl);
    assert.equal(cl.value, '106');

    const ca = tests.find((t) => t.code === 'Ca');
    assert.ok(ca);
    assert.equal(ca.value, '2.35');
  });
});
