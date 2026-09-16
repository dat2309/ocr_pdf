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
  { code: 'GLU', patterns: [/\bGLU\b/i, /\bglucose\b/i, /đường\s*huyết/i, /đường\s*máu/i], catalogId: 'glu' },
  { code: 'HbA1c', patterns: [/\bHbA1c\b/i, /\bA1C\b/i], catalogId: 'hba1c' },
  { code: 'UREA', patterns: [/\bUREA?\b/i, /urê/i, /ure\s*máu/i], catalogId: 'ure' },
  { code: 'CREA', patterns: [/\bCREA(TININE)?\b/i, /creatinin/i], catalogId: 'creatinin' },
  { code: 'eGFR', patterns: [/\beGFR\b/i, /\b(?:\.?\s*)GFR\b/i, /lọc\s*cầu\s*thận/i, /CKD[- ]EPI/i], catalogId: 'egfr' },
  { code: 'URIC', patterns: [/\bURIC\b/i, /acid\s*uric/i, /axit\s*uric/i], catalogId: 'acid_uric' },
  { code: 'AST', patterns: [/\bAST\b/i, /\bSGOT\b/i, /\bGOT\b/i, /\bGOT\/ASAT\b/i, /men\s*gan\s*ast/i], catalogId: 'ast_got' },
  { code: 'ALT', patterns: [/\bALT\b/i, /\bSGPT\b/i, /\bGPT\b/i, /\bGPT\/ALAT\b/i, /men\s*gan\s*alt/i], catalogId: 'alt_gpt' },
  { code: 'GGT', patterns: [/\bGGT\b/i, /\bGamma-GT\b/i, /hoạt\s*độ\s*ggt/i], catalogId: 'ggt' },
  { code: 'Non-HDL', patterns: [/\bNon\s*-\s*HDL\b/i], catalogId: 'non_hdl_c' },
  { code: 'HDL-C', patterns: [/(?<!non\s*[- ]\s*)\bHDL(?:[- ]?C(?:holesterol)?)?\b/i], catalogId: 'hdl_c' },
  { code: 'LDL-C', patterns: [/\bLDL(?:[- ]?C(?:holesterol)?)?\b/i], catalogId: 'ldl_c' },
  { code: 'CHOL', patterns: [/(?<!non\s*-\s*|hdl\s*|ldl\s*)\bCHOL(?:ESTEROL)?\b/i, /cholesterol\s*toàn\s*phần/i], catalogId: 'cholesterol' },
  { code: 'TRIG', patterns: [/\bTRIG(?:LYCERID[ET]?)?\b/i, /triglycerit/i, /riglveeride/i], catalogId: 'triglyceride' },

  // Electrolytes
  { code: 'Na', patterns: [/\bNatri\b/i, /\bNa\+?\b/], catalogId: 'natri' },
  { code: 'K', patterns: [/\bKali\b/i, /\bK\+?\b/], catalogId: 'kali' },
  { code: 'Cl', patterns: [/\b(?:Định\s*lượng\s*)?Clo\b/i, /\bChloride\b/i], catalogId: 'clo' },
  { code: 'Ca', patterns: [/\b(?:Định\s*lượng\s*)?Calci\b/i, /\bCalcium\b/i], catalogId: 'calci' },

  // Thyroid / Immunology
  { code: 'TSH', patterns: [/\bTSH\b/i, /thyroid\s*stimulating/i], catalogId: 'tsh' },
  { code: 'FT4', patterns: [/\bFT4\b/i, /free\s*t4/i], catalogId: 'ft4' },

  // Urine (do NOT use /i for bare pH to prevent matching "PH" in Vietnamese words like "THÙY PHẢI" or "ml/ph")
  { code: 'pH', patterns: [/^(?:độ\s*)?pH\b/, /\bđộ\s*pH\b/i, /\bpH\s*nước\s*tiểu\b/i], catalogId: 'uri_ph' },
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

  // Fallback: check LAB_CATALOG codes directly (exclude pH to prevent false matches in ml/ph)
  for (const item of LAB_CATALOG) {
    if (item.code === 'pH') continue;
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

export interface ParsedRefRange {
  min?: number;
  max?: number;
  operator?: '<' | '<=' | '≤' | '>' | '>=' | '≥';
  isGenderAmbiguous?: boolean;
}

export function parseReferenceRange(refStr: string, gender?: string): ParsedRefRange {
  if (!refStr) return {};

  let clean = refStr.replace(/,/g, '.').trim();

  // Handle gender-specific blocks e.g. "Nam: 74 - 114; Nữ: 58 – 96" or "Nam <40 U/L; Nữ <31 U/L"
  const hasNam = /nam\s*[:.]/i.test(clean);
  const hasNu = /nữ|female/i.test(clean);

  if (hasNam && hasNu) {
    const isFemale = gender ? /nữ|female/i.test(gender) : false;
    const isMale = gender ? (/nam|male/i.test(gender) && !isFemale) : false;

    if (isFemale) {
      const femaleMatch = clean.match(/nữ\s*[:.]?\s*([<≤>≥]?\s*[0-9.]+(?:\s*%?\s*[-–—~to]\s*[0-9.]+)?)/i);
      if (femaleMatch) clean = femaleMatch[1];
    } else if (isMale) {
      const maleMatch = clean.match(/nam\s*[:.]?\s*([<≤>≥]?\s*[0-9.]+(?:\s*%?\s*[-–—~to]\s*[0-9.]+)?)/i);
      if (maleMatch) clean = maleMatch[1];
    } else {
      // Gender is missing or ambiguous in document -> Do NOT guess!
      return { isGenderAmbiguous: true };
    }
  }

  // Min - Max e.g. "4.0 - 10.0" or "4.20 – 5.40" or "4.4%-6.0%"
  const rangeMatch = clean.match(/([0-9.]+)\s*%?\s*[-–—~to]\s*([0-9.]+)/i);
  if (rangeMatch) {
    const min = parseFloat(rangeMatch[1]);
    const max = parseFloat(rangeMatch[2]);
    return {
      min: isNaN(min) ? undefined : min,
      max: isNaN(max) ? undefined : max,
    };
  }

  // Less than or equal e.g. "<= 100" or "≤ 100"
  const lessEqMatch = clean.match(/(?:<=|[≤])\s*([0-9.]+)/);
  if (lessEqMatch) {
    const max = parseFloat(lessEqMatch[1]);
    return { max: isNaN(max) ? undefined : max, operator: '<=' };
  }

  // Less than e.g. "< 5.2"
  const lessMatch = clean.match(/<\s*([0-9.]+)/);
  if (lessMatch) {
    const max = parseFloat(lessMatch[1]);
    return { max: isNaN(max) ? undefined : max, operator: '<' };
  }

  // Greater than or equal e.g. ">= 90" or "≥ 90"
  const greaterEqMatch = clean.match(/(?:>=|[≥])\s*([0-9.]+)/);
  if (greaterEqMatch) {
    const min = parseFloat(greaterEqMatch[1]);
    return { min: isNaN(min) ? undefined : min, operator: '>=' };
  }

  // Greater than e.g. "> 90"
  const greaterMatch = clean.match(/>\s*([0-9.]+)/);
  if (greaterMatch) {
    const min = parseFloat(greaterMatch[1]);
    return { min: isNaN(min) ? undefined : min, operator: '>' };
  }

  return {};
}

export interface StatusEvaluationResult {
  status: LabTestStatus;
  numVal?: number;
  refMin?: number;
  refMax?: number;
  needsReview?: boolean;
  warning?: string;
  hasAbnormalMark?: boolean;
}

export function evaluateStatus(
  valStr: string,
  refRange: string,
  explicitFlag?: string,
  gender?: string
): StatusEvaluationResult {
  const rangeInfo = parseReferenceRange(refRange, gender);
  const numVal = parseFloat(valStr.replace(/,/g, '.'));
  let status: LabTestStatus = 'normal';
  let needsReview = false;
  let warning: string | undefined;

  if (rangeInfo.isGenderAmbiguous) {
    needsReview = true;
    warning = 'Khoảng tham chiếu có phân biệt Nam/Nữ nhưng chưa xác định được giới tính bệnh nhân.';
  }

  if (isNaN(numVal)) {
    // Check text values like Âm tính / Dương tính
    if (/dương\s*tính|positive/i.test(valStr)) {
      status = 'high';
    } else if (/âm\s*tính|negative/i.test(valStr)) {
      status = 'normal';
    } else {
      status = 'normal';
      needsReview = true;
      warning = 'Kết quả định tính hoặc định lượng chưa chuẩn hóa được.';
    }
  } else {
    const { min, max, operator } = rangeInfo;
    if (operator === '<' && max !== undefined) {
      status = numVal < max ? 'normal' : 'high';
    } else if ((operator === '<=' || operator === '≤') && max !== undefined) {
      status = numVal <= max ? 'normal' : 'high';
    } else if (operator === '>' && min !== undefined) {
      status = numVal > min ? 'normal' : 'low';
    } else if ((operator === '>=' || operator === '≥') && min !== undefined) {
      status = numVal >= min ? 'normal' : 'low';
    } else {
      if (max !== undefined && numVal > max) {
        status = 'high';
      } else if (min !== undefined && numVal < min) {
        status = 'low';
      } else if (min !== undefined || max !== undefined) {
        status = 'normal';
      }
    }
  }

  // Explicit flag takes effect or augments
  const hasAbnormalMark = Boolean(explicitFlag && /[*↑↓HL]/i.test(explicitFlag));
  if (hasAbnormalMark && explicitFlag) {
    const flag = explicitFlag.trim().toUpperCase();
    if (flag === 'H' || flag === 'HIGH' || flag === '↑') {
      status = 'high';
    } else if (flag === 'L' || flag === 'LOW' || flag === '↓') {
      status = 'low';
    } else if (flag === '*') {
      // Retain asterisk significance without forcing abnormal to normal
      if (status === 'normal') {
        status = 'abnormal';
      }
    }
  }

  return {
    status,
    numVal: isNaN(numVal) ? undefined : numVal,
    refMin: rangeInfo.min,
    refMax: rangeInfo.max,
    needsReview,
    warning,
    hasAbnormalMark,
  };
}

/**
 * Cleans and normalizes raw OCR data immediately after scanning:
 * - Fixes missing decimal points in OCR text with lab-context rules (e.g. 59* -> 5.9 *, 235 -> 2.35)
 * - Fixes corrupted test names (. GFR -> . eGFR, LDLCholesterol -> LDL Cholesterol)
 * - Normalizes OCR typos in units (umoVL -> umol/L, mei -> mg/dL, mL/phat -> mL/phút)
 * - Normalizes column spacing so raw data matches digital PDF structure
 */
export function cleanOcrArtifacts(rawText: string): string {
  if (!rawText) return '';

  const lines = rawText.split(/\r?\n/);
  const processedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // 1. Skip watermark or test markers
    if (/^TEST\s*PDF\b/i.test(line.trim()) || /^CÓ\s*HÌNHÌNH\b/i.test(line.trim())) {
      continue;
    }

    // 2. Fix OCR artifacts and noise in prefixes: .„ Glucose -> . Glucose
    line = line.replace(/\\(?=\*)/g, '');
    line = line.replace(/^[.„~_|\s]*\b(?=Glucose|Creatinine|Cholesterol|HDL|Non|LDL|Triglyceride|eGFR|GFR)/i, '. ');

    // 2b. Fix OCR corrupted lab test names:
    // e.g. "Crontiting" / "Cirediinine" -> "Creatinine", "Do hoạt độ GGT" / "Po hoạt độ GGT" -> "Đo hoạt độ GGT"
    line = line.replace(/\b(?:Crontiting|Cirediinine)\b/gi, 'Creatinine');
    line = line.replace(/[DP]o\s*hoạt\s*độ\s*GGT/gi, 'Đo hoạt độ GGT');
    line = line.replace(/„\s*Creatinine/gi, '. Creatinine');

    // 3. Fix eGFR prefix when "e" was dropped by OCR: . GFR (CKD-EPI -> . eGFR (CKD-EPI
    line = line.replace(/\b(?:\.?\s*)GFR\s*\(/gi, 'eGFR (');

    // 4. Fix LDL Cholesterol formatting: .. LDLCholesterol -> . LDL Cholesterol
    line = line.replace(/\bLDLCholesterol\b/gi, 'LDL Cholesterol');

    // 6. Fix common gender-label OCR typos without forcing a specific lab context.
    line = line.replace(/\bNem\s*:/gi, 'Nam:');

    // 7. Fix % misread from * flag before medical units: 237% mmol/L -> 237 * mmol/L, 52% U/L -> 52 * U/L
    line = line.replace(/(\b\d+(?:[.,]\d+)?)\s*%(?=\s*(?:mmol|umol|µmol|amor|g\/dL|g\/L|mg\/dL|mgd|U\/L|UA|UI|mIU|pmol|mL))/gi, '$1 * ');

    // 8. Fix units typos:
    // First preserve mL/phút / mL/min (do NOT confuse with mg/dL)
    line = line.replace(/\bm[lL]\/(?:ph[au]t|min)\b/gi, 'mL/phút');

    // Unit typos: umoVL / umot, / amor -> umol/L, mgd, / mei, / ml, / m2, -> mg/dL, UA -> U/L
    line = line.replace(/\b(?:umo[tvVlLyY]+|amor)(?:\/L)?\b[,\s|/]*/gi, 'µmol/L ');
    line = line.replace(/\b(?:mldl|mgld|mgdl|mgd|mei)[,\s|/]+|\b(?:ml|m2),\s*/gi, 'mg/dL ');
    line = line.replace(/\bUA\b/gi, 'U/L');
    line = line.replace(/\bmmo\b(?!\/)/gi, 'mmol/L');

    // 8b. Fix OCR digit typos before medical units: S2 U/L -> 52 U/L, O.74 -> 0.74, l06 -> 106
    line = line.replace(/\bS([0-9]+(?:\.[0-9]+)?)\s*(?=(?:U\/L|UA|mmol|mg\/dL|µmol))/gi, '5$1 ');
    line = line.replace(/\bO([0-9]*\.[0-9]+)\s*(?=(?:U\/L|UA|mmol|mg\/dL|µmol))/gi, '0$1 ');
    line = line.replace(/\b[lI]([0-9]{2,}(?:\.[0-9]+)?)\s*(?=(?:U\/L|UA|mmol|mg\/dL|µmol))/gi, '1$1 ');

    // 8c. Remove table delimiters and fix procedure code typos:
    line = line.replace(/\s*\|\s*/g, '  ');
    line = line.replace(/\bSHQTKT\b/gi, 'SH/QTKT');

    // 9. Fix Vietnamese character typos in reference ranges: Nir <31 -> Nữ <31
    line = line.replace(/\bNir\b/gi, 'Nữ');

    // 10. Fix spaces around decimal dots and commas in numbers: e.g. "5 . 9" -> "5.9", "0 , 46" -> "0.46"
    line = line.replace(/([0-9]+)\s*[.,•·]\s*([0-9]+)/g, '$1.$2');

    // 11. Fix spaces around hyphens in ranges: e.g. "4.0 - 10.0" -> "4.0 - 10.0"
    line = line.replace(/([0-9]+(?:\.[0-9]+)?)\s*[-–—~]\s*([0-9]+(?:\.[0-9]+)?)/g, '$1 - $2');

    // 12. Format * flag with clean spaces: 5.9* -> 5.9 *
    line = line.replace(/(\d+(?:\.\d+)?)\*/g, '$1 *');

    // 13. Clean stray OCR symbols
    line = line.replace(/[©®™¢§¶~]/g, ' ');

    // 14. Fix concatenated words
    line = line
      .replace(/độlọccẩuthận/gi, 'Độ lọc cầu thận')
      .replace(/riglveeride/gi, 'Triglyceride')
      .replace(/cholestero[li]/gi, 'Cholesterol');

    // 15. Normalize excessive column spacing: 10-30 spaces -> 2 spaces
    line = line.replace(/[ \t]{3,}/g, '  ').trim();

    if (line.length > 0) {
      processedLines.push(line);
    }
  }

  return processedLines.join('\n');
}

/**
 * Checks whether an extracted test value is suspicious (e.g. integer value when clinical
 * reference range is small decimal, suggesting dropped decimal dot in OCR).
 *
 * CRITICAL SAFETY RULE:
 * Parser NEVER silently modifies numbers without high certainty. It flags suspicious
 * values with needsReview: true, warning text, and reduced confidence so user can verify.
 */
export interface SuspiciousValueCheck {
  isSuspicious: boolean;
  warning?: string;
  confidence: number;
}

export function checkSuspiciousValue(
  code: string,
  rawVal: string,
  unit: string,
  refRange: string,
  refMin?: number,
  refMax?: number
): SuspiciousValueCheck {
  if (!rawVal) return { isSuspicious: false, confidence: 95 };

  // If number already contains decimal point or comma, no obvious missing dot
  if (rawVal.includes('.') || rawVal.includes(',')) {
    return { isSuspicious: false, confidence: 95 };
  }

  const num = parseFloat(rawVal);
  if (isNaN(num)) return { isSuspicious: false, confidence: 90 };

  const min = refMin ?? 0;
  const max = refMax ?? 0;

  // Pattern A: Value is 10x or 100x larger than standard reference range max (when max is small decimal <= 20)
  // Example: Glucose ref: 3.9 - 6.4, but raw value is 59 -> likely 5.9
  // Example: Triglyceride ref: 0.46 - 2.2, but raw value is 237 -> likely 2.37
  if (max > 0 && max <= 20 && num > max * 2.5) {
    const div10 = num / 10;
    const div100 = num / 100;

    if (div10 >= min * 0.3 && div10 <= max * 2.5) {
      return {
        isSuspicious: true,
        warning: `Giá trị "${rawVal}" có thể bị mất dấu thập phân (${div10.toFixed(1)}). Khoảng tham chiếu: ${refRange || `${min} - ${max}`}.`,
        confidence: 55,
      };
    }

    if (div100 >= min * 0.3 && div100 <= max * 2.5) {
      return {
        isSuspicious: true,
        warning: `Giá trị "${rawVal}" có thể bị mất dấu thập phân (${div100.toFixed(2)}). Khoảng tham chiếu: ${refRange || `${min} - ${max}`}.`,
        confidence: 55,
      };
    }
  }

  // Pattern B: Creatinine in mg/dL: ref 0.6 - 1.2, but raw is 74 or 074 -> likely 0.74
  if (code === 'CREA' && /mg\/dL/i.test(unit) && num >= 40 && num <= 250) {
    return {
      isSuspicious: true,
      warning: `Creatinine "${rawVal} mg/dL" có thể bị mất dấu thập phân (${(num / 100).toFixed(2)}). Khoảng tham chiếu: ${refRange || '0.6 - 1.2'}.`,
      confidence: 55,
    };
  }

  return { isSuspicious: false, confidence: 95 };
}

/**
 * Main parser function to extract patient info and lab tests from OCR or PDF text
 */
export function parseMedicalReportFromText(
  rawText: string,
  fileName: string = 'xet-nghiem.pdf'
): Partial<LabReport> {
  const cleanedText = cleanOcrArtifacts(rawText);
  const lines = cleanedText
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
    const nameMatch = line.match(/(?:họ\s*(?:và\s*)?tên|bệnh\s*nhân|tên\s*bn|người\s*bệnh|ông\/bà)\s*[:.]\s*([A-ZÀ-Ỹa-zà-ỹ\s]{3,40})/i);
    if (nameMatch && patient.fullName === 'Chưa rõ') {
      patient.fullName = nameMatch[1].replace(/(?:ngày\s*sinh|ns|giới\s*tính|dob|gender).*/i, '').trim().toUpperCase();
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
    const yearMatch = line.match(/(?:năm\s*sinh|ns|ngày\s*sinh|tuổi)\s*[:.]\s*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4}|[0-9]{1,4}(?:\s*tuổi)?)/i);
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
    const sampleDateMatch = line.match(/(?:lấy\s*mẫu|ngày\s*lấy\s*mẫu|ngày\s*nhận|thời\s*gian\s*lấy)\s*[:.]\s*(?:[0-9]{1,2}:[0-9]{1,2}:[0-9]{1,2}\s+ngày\s+)?([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})/i);
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

  // Track if we are inside a diagnosis or administrative header block
  let inAdminSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Section headers that reset or enter admin sections
    if (/^chẩn\s*đoán|\(diagnosis\)/i.test(line)) {
      inAdminSection = true;
      continue;
    }
    if (/^xn\s*(sinh\s*hóa|miễn\s*dịch|huyết\s*học|nước\s*tiểu)|\(biochemistry\)|\(immunology\)|\(hematology\)|^xét\s*nghiệm\s*kết\s*quả/i.test(line)) {
      inAdminSection = false;
      continue;
    }

    // Skip lines in admin/diagnosis section unless a known test line begins
    if (inAdminSection) {
      if (/^(?:glucose|creatinine|cholesterol|triglyceride|got|gpt|ggt|ast|alt|ure|wbc|rbc|plt|natri|kali|clo|calci|tsh|ft4|hba1c)\b/i.test(line)) {
        inAdminSection = false;
      } else {
        continue;
      }
    }

    // Skip common administrative/footer lines
    if (
      /bệnh\s*viện|phòng\s*khám|trung\s*tâm|lý\s*do|bác\s*sĩ|họ\s*(?:và\s*)?tên|ông\/bà|địa\s*chỉ|mã\s*số|mã\s*bn|số\s*phiếu|số\s*hồ\s*sơ|số\s*nhập\s*viện|bệnh\s*phẩm|chất\s*lượng|nơi\s*gửi|quốc\s*tịch|passport|xác\s*nhận|nhận\s*mẫu|nhân\s*viên|phát\s*hành|ghi\s*chú|đạt\s*chuẩn|quy\s*trình|laboratory|procedure|sample\s*id|receiving|specimens|approved|address|dob|receipt/i.test(
        line
      ) &&
      !line.match(/^(?:glucose|creatinine|cholesterol|triglyceride|got|gpt|ggt|ast|alt|ure|wbc|rbc|plt|natri|kali|clo|calci|tsh|ft4|hba1c)/i)
    ) {
      continue;
    }

    // Check if line contains a known lab test match
    const catalogMatch = findCatalogMatch(line);

    if (catalogMatch) {
      // Handle multi-line table rows where test name is on line i and values are on line i+1
      let currentLine = line;
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const nextCat = findCatalogMatch(nextLine);
        if (!nextCat && (/[0-9]/.test(nextLine) || /mmol|umol|µmol|U\/L|g\/dL|g\/L/i.test(nextLine))) {
          // If currentLine has no candidate value, merge with next line
          const currentNums = currentLine.replace(new RegExp(`\\b${catalogMatch.code}\\b`, 'gi'), '').match(/[0-9]+/g) || [];
          if (currentNums.length === 0) {
            currentLine = line + ' ' + nextLine;
          }
        }
      }

      // Strip procedure numbers (e.g. SH/QTKT-xx), ISO ** marks, formula names, and units tags before extracting flags or values
      const strippedLine = currentLine
        .replace(/SH\/QTKT-[0-9*]+/gi, '')
        .replace(/\*{2,}/g, '') // remove ISO ** accreditation marks
        .replace(/\(CKD-EPI\s*[0-9]+\)/gi, '')
        .replace(/CKD-EPI\s*[0-9]*/gi, '')
        .replace(/\(HPLC[A-Z\s]*\)/gi, '')
        .replace(/\b10\^[0-9]+\/L\b/gi, '')
        .replace(/\bml\/ph\/1\.73\s*m2\b/gi, '');

      // Check for explicit abnormal flag:
      // 1) Single asterisk directly following a number or space: (?<=[0-9.,]\s*)\*(?!\*)
      // 2) Arrow ↑ or ↓
      // 3) Standalone [HL] not preceded by slash or letter
      let explicitFlag = '';
      const starMatch = strippedLine.match(/(?<=[0-9.,]\s*)\*(?!\*)/) || strippedLine.match(/[↑↓]/);
      if (starMatch) {
        explicitFlag = starMatch[0];
      } else {
        const hlMatch = strippedLine.match(/(?<![/a-zA-Z0-9])([HL])(?![a-zA-Z0-9])/);
        if (hlMatch) {
          explicitFlag = hlMatch[1];
        }
      }

      // Reference range from line, previous line, or next line
      let testRefRange = catalogMatch.defaultRefRange;
      const refMatch = strippedLine.match(/([0-9]+[.,]?[0-9]*\s*%?\s*[-–—~to]\s*[0-9]+[.,]?[0-9]*|(?:>=|<=|[<≤>≥])\s*[0-9]+[.,]?[0-9]*|Nam:.*Nữ:.*)/i);
      if (refMatch) {
        testRefRange = refMatch[0].trim();
      } else if (i > 0 && /^[0-9<≤>≥]|Nam:.*Nữ:/.test(lines[i - 1])) {
        // Look at previous line if OCR placed reference range above
        testRefRange = lines[i - 1].replace(/SH\/QTKT-[0-9*]+/gi, '').replace(/\*{2,}/g, '').replace(/\(HPLC[A-Z\s]*\)/gi, '').trim();
      } else if (i + 1 < lines.length && /^[0-9<≤>≥]|Nam:.*Nữ:/.test(lines[i + 1])) {
        // Or next line
        testRefRange = lines[i + 1].replace(/SH\/QTKT-[0-9*]+/gi, '').replace(/\*{2,}/g, '').trim();
      }

      // Find unit in line (prioritize multi-character medical units over '%' to avoid OCR '*' -> '%' artifact)
      let testUnit = catalogMatch.defaultUnit;
      const multiCharUnitMatch = currentLine.match(/(10\^[0-9]+\/L|G\/L|T\/L|g\/dL|g\/L|mmol\/L|µmol\/L|umol\/L|mg\/dL|U\/L|UI\/mL|mIU\/L|pmol\/L|fL|pg|mL\/(?:phút|min)|Leu\/µL)/i);
      if (multiCharUnitMatch) {
        testUnit = multiCharUnitMatch[0];
      } else if (catalogMatch.defaultUnit === '%' || /%/.test(currentLine)) {
        if (catalogMatch.defaultUnit === '%') {
          testUnit = '%';
        }
      }

      const primaryUnitKey = `${catalogMatch.code}:${testUnit.toLowerCase()}`;
      if (processedCodes.has(primaryUnitKey)) continue;

      // Clean line of test code and known acronyms so digits in code (e.g. FT4, HbA1c, eGFR) aren't taken as value
      let valueSearchLine = strippedLine
        .replace(/^\s*(?:[0-9]{1,3}[.)]?|\([0-9]{1,3}\))\s+(?=[A-ZÀ-Ỹa-zà-ỹ])/, '')
        .replace(/\bHbA1c\b/gi, '')
        .replace(/\bFT4\b/gi, '')
        .replace(/\beGFR\b/gi, '')
        .replace(/\bNon\s*-\s*HDL\b/gi, '')
        .replace(/\bHDL\b/gi, '')
        .replace(/\bLDL\b/gi, '')
        .replace(/\b(19[89]\d|20[0-2]\d)\b/g, ''); // ignore formula years like 2021

      if (catalogMatch.code) {
        valueSearchLine = valueSearchLine.replace(new RegExp(`\\b${catalogMatch.code}\\b`, 'gi'), '');
      }
      if (catalogMatch.code === 'eGFR') {
        valueSearchLine = valueSearchLine.replace(/\bGFR\b/gi, '');
      }

      // Extract value
      const numberRegex = /([0-9]+[.,][0-9]+|[0-9]+)/g;
      const allNumbers: string[] = valueSearchLine.match(numberRegex) || [];
      const refNumbers: string[] = (testRefRange && testRefRange.match(numberRegex)) || [];

      let testVal = '';
      if (allNumbers.length > 0) {
        const candidateNumbers = allNumbers.filter((n: string) => !refNumbers.includes(n));
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
        const evalRes = evaluateStatus(testVal, testRefRange, explicitFlag, patient.gender);

        // Effective reference range: prefer extracted evalRes min/max if available;
        // only fall back to catalog defaults if unit matches catalog default unit.
        const effectiveRefMin = evalRes.refMin ?? (catalogMatch.defaultUnit === testUnit ? catalogMatch.defaultRefMin : undefined);
        const effectiveRefMax = evalRes.refMax ?? (catalogMatch.defaultUnit === testUnit ? catalogMatch.defaultRefMax : undefined);

        // Check for suspicious missing decimal points WITHOUT modifying the raw number
        const check = checkSuspiciousValue(
          catalogMatch.code,
          testVal,
          testUnit,
          testRefRange,
          effectiveRefMin,
          effectiveRefMax
        );

        processedCodes.add(primaryUnitKey);

        const needsReview = check.isSuspicious || evalRes.needsReview || check.confidence < 60;
        const warning = check.warning || evalRes.warning;

        tests.push({
          id: `test-${Date.now()}-${tests.length}`,
          name: catalogMatch.name,
          code: catalogMatch.code,
          rawName: catalogMatch.code,
          value: testVal,
          rawValue: testVal,
          normalizedValue: null,
          numericValue: evalRes.numVal ?? null,
          unit: testUnit,
          referenceRange: testRefRange,
          refMin: evalRes.refMin ?? catalogMatch.defaultRefMin ?? null,
          refMax: evalRes.refMax ?? catalogMatch.defaultRefMax ?? null,
          status: evalRes.status,
          matchedCategory: catalogMatch.category,
          confidence: Math.min(check.confidence, evalRes.needsReview ? 65 : 95),
          isUnmapped: false,
          needsReview,
          warning,
          rawLine: line,
        });

        // Check if next line is a secondary unit row (e.g. Glucose 106 mg/dL, Creatinine 0.74 mg/dL, Triglyceride 210 mg/dL)
        if (i + 1 < lines.length) {
          const nextRow = lines[i + 1];
          const nextHasCat = findCatalogMatch(nextRow);
          if (!nextHasCat) {
            const secRowMatch = nextRow.match(/^[.„~_|\s]*([0-9]+(?:[.,][0-9]+)?)\s*([*↑↓HL]?)\s+(10\^[0-9]+\/L|G\/L|T\/L|g\/dL|g\/L|mmol\/L|µmol\/L|umol\/L|mg\/dL|U\/L|UI\/mL|mIU\/L|pmol\/L|fL|pg|mL\/(?:phút|min)|Leu\/µL)\s*([0-9<≤>≥].*)?$/i);
            if (secRowMatch && secRowMatch[3] !== testUnit) {
              const secVal = secRowMatch[1];
              const secFlag = secRowMatch[2] || explicitFlag;
              const secUnit = secRowMatch[3];
              const secRef = (secRowMatch[4] || '').trim();
              const secondaryUnitKey = `${catalogMatch.code}:${secUnit.toLowerCase()}`;

              if (processedCodes.has(secondaryUnitKey)) {
                continue;
              }

              const secEval = evaluateStatus(secVal, secRef, secFlag, patient.gender);
              const secCheck = checkSuspiciousValue(catalogMatch.code, secVal, secUnit, secRef);
              processedCodes.add(secondaryUnitKey);

              tests.push({
                id: `test-${Date.now()}-${tests.length}`,
                name: `${catalogMatch.name} (${secUnit})`,
                code: catalogMatch.code,
                rawName: `${catalogMatch.code} (${secUnit})`,
                value: secVal,
                rawValue: secVal,
                normalizedValue: null,
                numericValue: secEval.numVal ?? null,
                unit: secUnit,
                referenceRange: secRef,
                refMin: secEval.refMin ?? null,
                refMax: secEval.refMax ?? null,
                status: secEval.status,
                matchedCategory: catalogMatch.category,
                confidence: Math.min(secCheck.confidence, secEval.needsReview ? 65 : 92),
                isUnmapped: false,
                needsReview: secCheck.isSuspicious || secEval.needsReview,
                warning: secCheck.warning || secEval.warning,
                rawLine: nextRow,
              });

              i++; // Consumed secondary row
            }
          }
        }
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
          const evalRes = evaluateStatus(rawVal, rawRef, '', patient.gender);
          processedCodes.add(rawName);

          tests.push({
            id: `test-${Date.now()}-${tests.length}`,
            name: rawName,
            code: rawName,
            rawName: rawName,
            value: rawVal,
            rawValue: rawVal,
            normalizedValue: null,
            numericValue: evalRes.numVal ?? null,
            unit: rawUnit || '',
            referenceRange: rawRef || '',
            refMin: evalRes.refMin ?? null,
            refMax: evalRes.refMax ?? null,
            status: evalRes.status,
            matchedCategory: 'Khác',
            confidence: 80,
            isUnmapped: true, // Marked as unmapped for user review in UI dropdown
            needsReview: true,
            warning: 'Chỉ số chưa khớp danh mục chuẩn, vui lòng kiểm tra lại.',
            rawLine: line,
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
    rawText: cleanedText,
    createdAt: new Date().toISOString(),
  };
}
