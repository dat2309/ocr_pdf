import { LabReport, LabTestItem, LabTestStatus, PatientInfo } from '../types';
import { LAB_CATALOG } from '../data/labCatalog';

interface CatalogMatch {
  catalogId: string;
  code: string;
  name: string;
  category: string;
  defaultUnit: string;
  defaultRefRange: string;
  defaultRefMin?: number;
  defaultRefMax?: number;
}

// Synonyms and aliases mapping
const TEST_ALIASES: Array<{
  code: string;
  patterns: RegExp[];
  catalogId: string;
}> = [
  // Hematology
  { code: 'WBC', patterns: [/\bWBC\b/i, /bạch\s*cầu/i, /\bwhite\s*blood\s*cell/i], catalogId: 'wbc' },
  { code: 'RBC', patterns: [/\bRBC\b/i, /hồng\s*cầu/i, /\bred\s*blood\s*cell/i], catalogId: 'rbc' },
  { code: 'HGB', patterns: [/\bHGB\b/i, /\bHB\b/i, /huyết\s*sắc\s*tố/i, /hemoglobin/i], catalogId: 'hgb' },
  { code: 'HCT', patterns: [/\bHCT\b/i, /hematocrit/i], catalogId: 'hct' },
  { code: 'MCV', patterns: [/\bMCV\b/i, /thể\s*tích\s*(tb|trung\s*bình)\s*hồng\s*cầu/i], catalogId: 'mcv' },
  { code: 'MCH', patterns: [/\bMCH\b/i, /lượng\s*hb\s*(tb|trung\s*bình)/i], catalogId: 'mch' },
  { code: 'MCHC', patterns: [/\bMCHC\b/i, /nồng\s*độ\s*hb\s*(tb|trung\s*bình)/i], catalogId: 'mchc' },
  { code: 'PLT', patterns: [/\bPLT\b/i, /tiểu\s*cầu/i, /platelet/i], catalogId: 'plt' },
  { code: 'NEU%', patterns: [/\bNEU%?\b/i, /\bNEUT%?\b/i, /trung\s*tính/i, /neutrophil/i], catalogId: 'neu_percent' },
  { code: 'LYM%', patterns: [/\bLYM%?\b/i, /\bLYMPH%?\b/i, /lympho/i, /lymphocyte/i], catalogId: 'lym_percent' },
  { code: 'MONO%', patterns: [/\bMONO%?\b/i, /monocyte/i], catalogId: 'mono_percent' },
  { code: 'EOS%', patterns: [/\bEOS%?\b/i, /ái\s*toan/i, /eosinophil/i], catalogId: 'eos_percent' },
  { code: 'BASO%', patterns: [/\bBASO%?\b/i, /ái\s*kiềm/i, /basophil/i], catalogId: 'baso_percent' },
  { code: 'RDW-CV', patterns: [/\bRDW[- ]?CV\b/i, /\bRDW\b/i, /dải\s*phân\s*bố/i], catalogId: 'rdw_cv' },
  { code: 'MPV', patterns: [/\bMPV\b/i, /thể\s*tích\s*tiểu\s*cầu/i], catalogId: 'mpv' },

  // Biochemistry
  { code: 'GLU', patterns: [/\bGLU\b/i, /glucose/i, /đường\s*huyết/i, /đường\s*máu/i], catalogId: 'glu' },
  { code: 'HbA1c', patterns: [/\bHbA1c\b/i, /\bA1C\b/i], catalogId: 'hba1c' },
  { code: 'UREA', patterns: [/\bUREA?\b/i, /urê/i, /ure\s*máu/i], catalogId: 'ure' },
  { code: 'CREA', patterns: [/\bCREA(TININE)?\b/i, /creatinin/i], catalogId: 'creatinin' },
  { code: 'eGFR', patterns: [/\beGFR\b/i, /lọc\s*cầu\s*thận/i], catalogId: 'egfr' },
  { code: 'URIC', patterns: [/\bURIC\b/i, /acid\s*uric/i, /axit\s*uric/i], catalogId: 'acid_uric' },
  { code: 'AST', patterns: [/\bAST\b/i, /\bSGOT\b/i, /\bGOT\b/i, /men\s*gan\s*ast/i], catalogId: 'ast_got' },
  { code: 'ALT', patterns: [/\bALT\b/i, /\bSGPT\b/i, /\bGPT\b/i, /men\s*gan\s*alt/i], catalogId: 'alt_gpt' },
  { code: 'GGT', patterns: [/\bGGT\b/i, /\bGamma-GT\b/i], catalogId: 'ggt' },
  { code: 'CHOL', patterns: [/\bCHOL(ESTEROL)?\b/i, /cholesterol\s*toàn\s*phần/i], catalogId: 'cholesterol' },
  { code: 'TRIG', patterns: [/\bTRIG(LYCERIDE)?\b/i, /triglycerit/i], catalogId: 'triglyceride' },
  { code: 'HDL-C', patterns: [/\bHDL[- ]?C?\b/i], catalogId: 'hdl_c' },
  { code: 'LDL-C', patterns: [/\bLDL[- ]?C?\b/i], catalogId: 'ldl_c' },

  // Urine
  { code: 'pH', patterns: [/\bpH\b/i, /độ\s*ph/i], catalogId: 'uri_ph' },
  { code: 'SG', patterns: [/\bSG\b/i, /tỷ\s*trọng/i, /specific\s*gravity/i], catalogId: 'uri_sg' },
  { code: 'PRO', patterns: [/\bPRO(TEIN)?\b/i, /đạm\s*niệu/i], catalogId: 'uri_pro' },
  { code: 'GLU-U', patterns: [/\bGLU[- ]?U\b/i, /đường\s*nước\s*tiểu/i], catalogId: 'uri_glu' },
  { code: 'LEU', patterns: [/\bLEU(KOCYTE)?\b/i, /bạch\s*cầu\s*niệu/i], catalogId: 'uri_leu' },
];

export function findCatalogMatch(text: string): CatalogMatch | null {
  const clean = text.trim();

  // Try exact code or pattern match
  for (const alias of TEST_ALIASES) {
    for (const pattern of alias.patterns) {
      if (pattern.test(clean)) {
        const item = LAB_CATALOG.find((c) => c.id === alias.catalogId);
        if (item) {
          return {
            catalogId: item.id,
            code: item.code,
            name: item.name,
            category: item.category,
            defaultUnit: item.defaultUnit,
            defaultRefRange: item.defaultRefRange,
            defaultRefMin: item.defaultRefMin,
            defaultRefMax: item.defaultRefMax,
          };
        }
      }
    }
  }

  // Fallback: check LAB_CATALOG codes directly
  for (const item of LAB_CATALOG) {
    const codeRegex = new RegExp(`\\b${item.code.replace('%', '\\%')}\\b`, 'i');
    if (codeRegex.test(clean) || clean.toLowerCase().includes(item.name.toLowerCase())) {
      return {
        catalogId: item.id,
        code: item.code,
        name: item.name,
        category: item.category,
        defaultUnit: item.defaultUnit,
        defaultRefRange: item.defaultRefRange,
        defaultRefMin: item.defaultRefMin,
        defaultRefMax: item.defaultRefMax,
      };
    }
  }

  return null;
}

export function parseReferenceRange(refStr: string): { min?: number; max?: number } {
  if (!refStr) return {};

  const clean = refStr.replace(/,/g, '.').trim();

  // Min - Max e.g. "4.0 - 10.0" or "4.20 – 5.40"
  const rangeMatch = clean.match(/([0-9.]+)\s*[-–—~to]\s*([0-9.]+)/i);
  if (rangeMatch) {
    const min = parseFloat(rangeMatch[1]);
    const max = parseFloat(rangeMatch[2]);
    return {
      min: isNaN(min) ? undefined : min,
      max: isNaN(max) ? undefined : max,
    };
  }

  // Less than e.g. "< 5.2" or "<= 100"
  const lessMatch = clean.match(/[<≤]\s*([0-9.]+)/);
  if (lessMatch) {
    const max = parseFloat(lessMatch[1]);
    return { max: isNaN(max) ? undefined : max };
  }

  // Greater than e.g. "> 90" or ">= 1.03"
  const greaterMatch = clean.match(/[>≥]\s*([0-9.]+)/);
  if (greaterMatch) {
    const min = parseFloat(greaterMatch[1]);
    return { min: isNaN(min) ? undefined : min };
  }

  return {};
}

export function evaluateStatus(
  valStr: string,
  refRange: string,
  explicitFlag?: string
): { status: LabTestStatus; numVal?: number; refMin?: number; refMax?: number } {
  // Check explicit flags like 'H', 'High', '↑', '*', 'L', 'Low', '↓'
  if (explicitFlag) {
    const flag = explicitFlag.trim().toUpperCase();
    if (flag === 'H' || flag === 'HIGH' || flag === '↑' || flag === '*') {
      return { status: 'high' };
    }
    if (flag === 'L' || flag === 'LOW' || flag === '↓') {
      return { status: 'low' };
    }
  }

  const { min, max } = parseReferenceRange(refRange);
  const numVal = parseFloat(valStr.replace(/,/g, '.'));

  if (isNaN(numVal)) {
    // Check text values like Âm tính / Dương tính
    if (/dương\s*tính|positive/i.test(valStr)) {
      return { status: 'high' };
    }
    if (/âm\s*tính|negative/i.test(valStr)) {
      return { status: 'normal' };
    }
    return { status: 'normal' };
  }

  if (max !== undefined && numVal > max) {
    return { status: 'high', numVal, refMin: min, refMax: max };
  }
  if (min !== undefined && numVal < min) {
    return { status: 'low', numVal, refMin: min, refMax: max };
  }
  if (min !== undefined || max !== undefined) {
    return { status: 'normal', numVal, refMin: min, refMax: max };
  }

  return { status: 'normal', numVal };
}

/**
 * Main parser function to extract patient info and lab tests from OCR or PDF text
 */
export function parseMedicalReportFromText(
  rawText: string,
  fileName: string = 'xet-nghiem.pdf'
): Partial<LabReport> {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // 1. Extract Patient Info
  const patient: PatientInfo = {
    fullName: 'Chưa rõ',
    gender: 'Chưa rõ',
    birthYearOrAge: 'Chưa rõ',
    patientCode: '',
    sampleDate: '',
    resultDate: new Date().toLocaleDateString('vi-VN'),
    doctor: '',
    facility: '',
    diagnosis: '',
  };

  let reportTitle = 'Phiếu kết quả xét nghiệm';

  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const line = lines[i];

    // Hospital / Facility
    if (!patient.facility && /bệnh\s*viện|phòng\s*khám|trung\s*tâm\s*y\s*tế|khoa\s*xét\s*nghiệm|medlatec|lab/i.test(line)) {
      patient.facility = line.replace(/^[•*\-\s]+/, '').trim();
    }

    // Title
    if (/phiếu\s*kết\s*quả|xét\s*nghiệm\s*máu|huyết\s*học|sinh\s*hóa|nước\s*tiểu|tổng\s*phân\s*tích/i.test(line)) {
      if (!line.toLowerCase().includes('họ và tên') && !line.toLowerCase().includes('bác sĩ')) {
        reportTitle = line.replace(/^[•*\-\s]+/, '').trim();
      }
    }

    // Patient Name
    const nameMatch = line.match(/(?:họ\s*(?:và\s*)?tên|bệnh\s*nhân|tên\s*bn|người\s*bệnh)\s*[:.]\s*([A-ZÀ-Ỹa-zà-ỹ\s]{3,40})/i);
    if (nameMatch && patient.fullName === 'Chưa rõ') {
      patient.fullName = nameMatch[1].trim().toUpperCase();
    }

    // Gender
    const genderMatch = line.match(/giới\s*tính\s*[:.]\s*(nam|nữ|male|female)/i);
    if (genderMatch) {
      patient.gender = /nam|male/i.test(genderMatch[1]) ? 'Nam' : 'Nữ';
    } else if (patient.gender === 'Chưa rõ' && /\b(Nam|Nữ)\b/.test(line)) {
      const g = line.match(/\b(Nam|Nữ)\b/);
      if (g) patient.gender = g[1];
    }

    // Birth Year or Age
    const yearMatch = line.match(/(?:năm\s*sinh|ns|ngày\s*sinh|tuổi)\s*[:.]\s*([0-9]{1,4}(?:\s*tuổi)?)/i);
    if (yearMatch && patient.birthYearOrAge === 'Chưa rõ') {
      patient.birthYearOrAge = yearMatch[1].trim();
    } else if (patient.birthYearOrAge === 'Chưa rõ') {
      const standAloneYear = line.match(/\b(19[4-9]\d|20[0-2]\d)\b/);
      if (standAloneYear) {
        patient.birthYearOrAge = standAloneYear[1];
      }
    }

    // Patient Code
    const codeMatch = line.match(/(?:mã\s*bn|mã\s*bệnh\s*nhân|mã\s*số|số\s*phiếu|mã\s*y\s*tế|pid|sid|stt\s*bn)\s*[:.]\s*([A-Za-z0-9-_/]+)/i);
    if (codeMatch && !patient.patientCode) {
      patient.patientCode = codeMatch[1].trim();
    }

    // Result Date
    const resDateMatch = line.match(/(?:ngày\s*trả\s*(?:kq|kết\s*quả)?|ngày\s*in|thời\s*gian\s*trả)\s*[:.]\s*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4}(?:\s+[0-9]{1,2}:[0-9]{1,2})?)/i);
    if (resDateMatch) {
      patient.resultDate = resDateMatch[1].trim();
    }

    // Sample Date
    const sampleDateMatch = line.match(/(?:ngày\s*lấy\s*mẫu|ngày\s*nhận|thời\s*gian\s*lấy)\s*[:.]\s*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4}(?:\s+[0-9]{1,2}:[0-9]{1,2})?)/i);
    if (sampleDateMatch) {
      patient.sampleDate = sampleDateMatch[1].trim();
    }

    // Doctor
    const docMatch = line.match(/(?:bác\s*sĩ\s*chỉ\s*định|bs\s*chỉ\s*định|bác\s*sĩ|bs\s*điều\s*trị)\s*[:.]\s*([A-ZÀ-Ỹa-zà-ỹ.\s]{3,40})/i);
    if (docMatch && !patient.doctor) {
      patient.doctor = docMatch[1].trim();
    }

    // Diagnosis
    const diagMatch = line.match(/(?:chẩn\s*đoán|lý\s*do\s*khám|triệu\s*chứng)\s*[:.]\s*([^,\n\r]+)/i);
    if (diagMatch && !patient.diagnosis) {
      patient.diagnosis = diagMatch[1].trim();
    }
  }

  // 2. Extract Lab Tests
  const tests: LabTestItem[] = [];
  const processedCodes = new Set<string>();

  // Regular expression to identify lab test row
  // e.g. "1  WBC  11.2  10^9/L  4.0 - 10.0  H"
  // or "Glucose: 5.8 mmol/L (3.9 - 6.4)"
  // or "HGB 11.2 g/dL 12.0 - 15.5 L"

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip common header/footer lines
    if (
      /bệnh\s*viện|phòng\s*khám|họ\s*và\s*tên|bác\s*sĩ|chữ\s*ký|trưởng\s*khoa|kỹ\s*thuật\s*viên|tổng\s*tiền|địa\s*chỉ|hotline/i.test(
        line
      ) &&
      !line.match(/\b(wbc|rbc|plt|glu|ast|alt|ure|crea)\b/i)
    ) {
      continue;
    }

    // Check if line contains a known lab test match
    const catalogMatch = findCatalogMatch(line);

    // Look for numbers representing results and reference ranges
    // Pattern: [TestName/Code] ... [NumberVal] ... [Unit]? ... [RefRange]? ... [Flag]?
    const numberRegex = /([0-9]+[.,][0-9]+|[0-9]+)/g;
    const allNumbers = line.match(numberRegex);

    if (catalogMatch) {
      if (processedCodes.has(catalogMatch.code)) continue;

      // Extract value
      let testVal = '';
      let testUnit = catalogMatch.defaultUnit;
      let testRefRange = catalogMatch.defaultRefRange;
      let explicitFlag = '';

      // Check for flag (H, L, *, High, Low, ↑, ↓)
      const flagMatch = line.match(/\b([HL])\b|[↑↓*]/);
      if (flagMatch) {
        explicitFlag = flagMatch[0];
      }

      // Try to parse reference range from line
      const refMatch = line.match(/([0-9]+[.,]?[0-9]*\s*[-–—~]\s*[0-9]+[.,]?[0-9]*|[<≤>≥]\s*[0-9]+[.,]?[0-9]*)/);
      if (refMatch) {
        testRefRange = refMatch[1].trim();
      }

      // Find unit in line if present
      const unitMatch = line.match(/(10\^[0-9]+\/L|G\/L|T\/L|g\/dL|g\/L|mmol\/L|µmol\/L|umol\/L|mg\/dL|U\/L|UI\/mL|%|fL|pg|Leu\/µL)/i);
      if (unitMatch) {
        testUnit = unitMatch[0];
      }

      // Find value: the number that appears after the test code/name and before the unit or reference range
      if (allNumbers && allNumbers.length > 0) {
        // If there's a reference range, don't take numbers that are part of the reference range
        const refNumbers: string[] = testRefRange.match(numberRegex) || [];
        const candidateNumbers = allNumbers.filter((n) => !refNumbers.includes(n));

        if (candidateNumbers.length > 0) {
          testVal = candidateNumbers[0];
        } else {
          testVal = allNumbers[0];
        }
      } else {
        // Check for qualitative values like Âm tính / Dương tính
        if (/âm\s*tính|negative/i.test(line)) testVal = 'Âm tính';
        else if (/dương\s*tính|positive/i.test(line)) testVal = 'Dương tính';
      }

      if (testVal) {
        const evalRes = evaluateStatus(testVal, testRefRange, explicitFlag);
        processedCodes.add(catalogMatch.code);

        tests.push({
          id: `test-${Date.now()}-${tests.length}`,
          name: catalogMatch.name,
          code: catalogMatch.code,
          rawName: catalogMatch.code,
          value: testVal,
          numericValue: evalRes.numVal ?? null,
          unit: testUnit,
          referenceRange: testRefRange,
          refMin: evalRes.refMin ?? catalogMatch.defaultRefMin ?? null,
          refMax: evalRes.refMax ?? catalogMatch.defaultRefMax ?? null,
          status: evalRes.status,
          matchedCategory: catalogMatch.category,
          confidence: 95,
          isUnmapped: false,
        });
      }
    } else {
      // Unmapped line detection: line has index/code/name, a numeric value, a unit or range
      const genericTestLineMatch = line.match(/^([0-9]{1,2}[.\s]+)?([A-Za-z0-9%_-]{2,15}|[A-ZÀ-Ỹa-zà-ỹ\s]{3,25})\s+([0-9]+[.,][0-9]+|[0-9]+)\s+([A-Za-z0-9%^/µ]+)?\s*([0-9<≤>≥].*)?$/);

      if (genericTestLineMatch && !line.includes('BN') && !line.includes('199') && !line.includes('202')) {
        const rawName = (genericTestLineMatch[2] || '').trim();
        const rawVal = (genericTestLineMatch[3] || '').trim();
        const rawUnit = (genericTestLineMatch[4] || '').trim();
        const rawRef = (genericTestLineMatch[5] || '').trim();

        if (rawName && rawVal && rawName.length <= 20 && !processedCodes.has(rawName)) {
          const evalRes = evaluateStatus(rawVal, rawRef);
          processedCodes.add(rawName);

          tests.push({
            id: `test-${Date.now()}-${tests.length}`,
            name: rawName,
            code: rawName,
            rawName: rawName,
            value: rawVal,
            numericValue: evalRes.numVal ?? null,
            unit: rawUnit || '',
            referenceRange: rawRef || '',
            refMin: evalRes.refMin ?? null,
            refMax: evalRes.refMax ?? null,
            status: evalRes.status,
            matchedCategory: 'Khác',
            confidence: 82,
            isUnmapped: true, // Marked as unmapped for user review in UI dropdown
          });
        }
      }
    }
  }

  const abnormalCount = tests.filter((t) => t.status === 'low' || t.status === 'high' || t.status === 'abnormal').length;
  const unmappedCount = tests.filter((t) => t.isUnmapped).length;
  const avgConfidence =
    tests.length > 0
      ? Math.round(tests.reduce((acc, cur) => acc + (cur.confidence || 90), 0) / tests.length)
      : 90;

  return {
    id: `rep-${Date.now()}`,
    title: reportTitle,
    fileName,
    patient,
    tests,
    totalDetected: tests.length,
    abnormalCount,
    unmappedCount,
    avgConfidence,
    rawSummary: `Đọc được ${tests.length} chỉ số · ${unmappedCount} chỉ tiêu chưa khớp danh mục · ${abnormalCount} chỉ số bất thường · Độ tin cậy trung bình ${avgConfidence}%`,
    rawText,
    createdAt: new Date().toISOString(),
  };
}
