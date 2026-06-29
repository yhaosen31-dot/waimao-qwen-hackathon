import { strFromU8, unzipSync } from "fflate";
import * as XLSX from "xlsx";
import type { ColumnMapping, EntityId, ImportRow } from "@/types";
import { cleanCompanyName, normalizeCompanyName } from "@/services/companyNormalizeService";

export interface SpreadsheetRow {
  rowIndex: number;
  rawData: Record<string, string>;
}

export interface ParsedSpreadsheet {
  headers: string[];
  rows: SpreadsheetRow[];
  totalRows: number;
}

const columnAliases = {
  companyNameColumn: [
    "公司名",
    "公司名称",
    "企业名称",
    "进口商",
    "买家",
    "Importer",
    "Buyer",
    "Company",
    "Company Name"
  ],
  countryColumn: ["国家", "Country", "Import Country"],
  productDescriptionColumn: [
    "产品描述",
    "商品描述",
    "Product Description",
    "Goods Description",
    "Description"
  ],
  transactionSummaryColumn: [
    "交易记录",
    "提单",
    "Import Record",
    "Transaction",
    "Bill of Lading"
  ],
  sourceKeywordColumn: ["来源关键词", "关键词", "Keyword", "Source Keyword"]
} as const;

const importColumnAliases = {
  companyNameColumn: [
    "公司名",
    "公司名称",
    "企业名称",
    "进口商",
    "进口商名称",
    "买家",
    "Importer",
    "Buyer",
    "Company",
    "Company Name",
    ...columnAliases.companyNameColumn
  ],
  countryColumn: [
    "国家",
    "目的国",
    "进口国",
    "买家国家",
    "Country",
    "Import Country",
    "Destination Country",
    ...columnAliases.countryColumn
  ],
  productDescriptionColumn: [
    "产品描述",
    "商品描述",
    "Product Description",
    "Goods Description",
    "Description",
    ...columnAliases.productDescriptionColumn
  ],
  transactionSummaryColumn: [
    "交易记录",
    "提单",
    "主提单",
    "提单号",
    "Import Record",
    "Transaction",
    "Bill of Lading",
    ...columnAliases.transactionSummaryColumn
  ],
  sourceKeywordColumn: [
    "来源关键词",
    "关键词",
    "产品",
    "Keyword",
    "Source Keyword",
    "Product",
    ...columnAliases.sourceKeywordColumn
  ]
} as const;

export async function parseSpreadsheetFile(fileName: string, buffer: Uint8Array) {
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (extension === "xlsx") return parseXlsx(buffer);
  if (extension === "csv") return parseTextTable(buffer);
  if (extension === "xls") return parseXlsCompatible(buffer);

  throw new Error("Unsupported file type. Please upload .xlsx, .xls, or .csv.");
}

export function detectColumnMapping(importJobId: EntityId, headers: string[]): ColumnMapping {
  return {
    importJobId,
    companyNameColumn: findColumn(headers, importColumnAliases.companyNameColumn),
    countryColumn: findColumn(headers, importColumnAliases.countryColumn),
    productDescriptionColumn: findColumn(headers, importColumnAliases.productDescriptionColumn),
    transactionSummaryColumn: findColumn(headers, importColumnAliases.transactionSummaryColumn),
    sourceKeywordColumn: findColumn(headers, importColumnAliases.sourceKeywordColumn)
  };
}

export function mapSpreadsheetRows(
  importJobId: EntityId,
  rows: SpreadsheetRow[],
  mapping: ColumnMapping
): ImportRow[] {
  const timestamp = new Date().toISOString();

  return rows.map((row) => {
    const companyName = cleanCompanyName(readMappedValue(row.rawData, mapping.companyNameColumn));
    const country = cleanCompanyName(readMappedValue(row.rawData, mapping.countryColumn));
    const productDescription = cleanCompanyName(
      readMappedValue(row.rawData, mapping.productDescriptionColumn)
    );
    const transactionSummary = cleanCompanyName(
      readMappedValue(row.rawData, mapping.transactionSummaryColumn)
    );
    const sourceKeyword = cleanCompanyName(readMappedValue(row.rawData, mapping.sourceKeywordColumn));

    return {
      id: `import_row_${importJobId}_${row.rowIndex}`,
      importJobId,
      rowIndex: row.rowIndex,
      rawData: row.rawData,
      companyName,
      normalizedCompanyName: normalizeCompanyName(companyName),
      country,
      productDescription,
      transactionSummary,
      sourceKeyword,
      status: companyName ? "parsed" : "missing_company",
      createdAt: timestamp,
      updatedAt: timestamp
    };
  });
}

export function extractHeadersFromRows(rows: Array<{ rawData: Record<string, string> }>) {
  const headers: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    for (const header of Object.keys(row.rawData)) {
      if (seen.has(header)) continue;
      seen.add(header);
      headers.push(header);
    }
  }

  return headers;
}

function parseXlsx(buffer: Uint8Array): ParsedSpreadsheet {
  const files = unzipSync(buffer);
  const sheetFile =
    files["xl/worksheets/sheet1.xml"] ??
    Object.entries(files).find(([name]) => /(^|\/)xl\/worksheets\/sheet\d+\.xml$/i.test(name))?.[1];

  if (!sheetFile) {
    throw new Error("No worksheet found in the uploaded .xlsx file.");
  }

  const sharedStrings = parseSharedStrings(files["xl/sharedStrings.xml"]);
  const matrix = parseWorksheetRows(strFromU8(sheetFile), sharedStrings);
  return matrixToSpreadsheet(matrix);
}

function parseXlsCompatible(buffer: Uint8Array): ParsedSpreadsheet {
  if (isZipFile(buffer)) return parseXlsx(buffer);

  if (isLegacyBinaryXls(buffer)) {
    return parseLegacyBinaryXls(buffer);
  }

  const text = decodeTableText(buffer);
  if (/<table[\s>]/i.test(text)) {
    return matrixToSpreadsheet(parseHtmlTable(text));
  }

  return textToSpreadsheet(text);
}

function parseLegacyBinaryXls(buffer: Uint8Array): ParsedSpreadsheet {
  const workbook = XLSX.read(buffer, {
    type: "array",
    bookVBA: false,
    cellFormula: false,
    cellHTML: false,
    cellNF: false,
    cellStyles: false,
    cellText: true,
    WTF: false
  });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("No worksheet found in the uploaded .xls file.");
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: false
  });

  return matrixToSpreadsheet(matrix.map((row) => row.map((cell) => cleanCompanyName(String(cell)))));
}

function parseTextTable(buffer: Uint8Array): ParsedSpreadsheet {
  return textToSpreadsheet(decodeTableText(buffer));
}

function textToSpreadsheet(text: string): ParsedSpreadsheet {
  const delimiter = guessDelimiter(text);
  return matrixToSpreadsheet(parseDelimited(text, delimiter));
}

function matrixToSpreadsheet(matrix: string[][]): ParsedSpreadsheet {
  const nonEmptyRows = matrix
    .map((row, index) => ({
      row,
      rowIndex: index + 1
    }))
    .filter((item) => item.row.some((cell) => cleanCompanyName(cell).length > 0));
  const headerRowPosition = findHeaderRowPosition(nonEmptyRows.map((item) => item.row));
  const rawHeaders = nonEmptyRows[headerRowPosition]?.row ?? [];
  const headers = uniquifyHeaders(rawHeaders);
  const rows = nonEmptyRows.slice(headerRowPosition + 1).map<SpreadsheetRow>((item) => {
    const rawData: Record<string, string> = {};
    headers.forEach((header, columnIndex) => {
      rawData[header] = cleanCompanyName(item.row[columnIndex]);
    });

    return {
      rowIndex: item.rowIndex,
      rawData
    };
  });

  return {
    headers,
    rows,
    totalRows: rows.length
  };
}

function findHeaderRowPosition(rows: string[][]) {
  const maxRowsToInspect = Math.min(rows.length, 20);
  let bestPosition = 0;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < maxRowsToInspect; index += 1) {
    const score = scoreHeaderCandidate(rows[index]);
    if (score > bestScore) {
      bestScore = score;
      bestPosition = index;
    }
  }

  return bestPosition;
}

function scoreHeaderCandidate(row: string[]) {
  const normalizedCells = row.map(normalizeHeader).filter(Boolean);
  const nonEmptyCellCount = normalizedCells.length;
  if (nonEmptyCellCount === 0) return Number.NEGATIVE_INFINITY;

  let score = nonEmptyCellCount > 1 ? Math.min(nonEmptyCellCount, 12) : -8;
  const aliasGroups = Object.values(importColumnAliases).map((aliases) => aliases.map(normalizeHeader));

  for (const aliases of aliasGroups) {
    const matched = normalizedCells.some((cell) =>
      aliases.some((alias) => cell === alias || cell.includes(alias) || alias.includes(cell))
    );
    if (matched) score += 8;
  }

  const commonTradeHeaders = [
    "日期",
    "进口商地址",
    "出口商",
    "出口商地址",
    "原产国",
    "起运港",
    "卸货港",
    "hs编码",
    "数量",
    "重量",
    "金额usd"
  ];
  score += normalizedCells.filter((cell) =>
    commonTradeHeaders.some((header) => cell === header || cell.includes(header))
  ).length;

  return score;
}

function parseSharedStrings(file: Uint8Array | undefined) {
  if (!file) return [];

  const xml = strFromU8(file);
  const strings: string[] = [];
  const itemPattern = /<si[^>]*>([\s\S]*?)<\/si>/g;
  let itemMatch: RegExpExecArray | null;

  while ((itemMatch = itemPattern.exec(xml))) {
    const text = Array.from(itemMatch[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g))
      .map((match) => decodeXml(match[1]))
      .join("");
    strings.push(text);
  }

  return strings;
}

function parseWorksheetRows(xml: string, sharedStrings: string[]) {
  const rows: string[][] = [];
  const rowPattern = /<row\b([^>]*)>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  let fallbackRowIndex = 0;

  while ((rowMatch = rowPattern.exec(xml))) {
    const rowAttributes = rowMatch[1];
    const rowIndex = Number(rowAttributes.match(/\br="(\d+)"/)?.[1] ?? fallbackRowIndex + 1) - 1;
    fallbackRowIndex = rowIndex + 1;
    const row: string[] = rows[rowIndex] ?? [];
    const cellPattern = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellPattern.exec(rowMatch[2]))) {
      const attributes = cellMatch[1];
      const body = cellMatch[2];
      const ref = attributes.match(/\br="([A-Z]+)\d+"/)?.[1];
      if (!ref) continue;
      row[columnIndex(ref)] = readCellValue(attributes, body, sharedStrings);
    }

    rows[rowIndex] = row;
  }

  return rows.filter(Boolean);
}

function parseHtmlTable(html: string) {
  const rows: string[][] = [];
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowPattern.exec(html))) {
    const cells = Array.from(rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)).map(
      (match) => stripHtml(match[1])
    );
    if (cells.length > 0) rows.push(cells);
  }

  return rows;
}

function parseDelimited(text: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(value);
      value = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && nextChar === "\n") index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  row.push(value);
  rows.push(row);
  return rows;
}

function readCellValue(attributes: string, body: string, sharedStrings: string[]) {
  const type = attributes.match(/\bt="([^"]+)"/)?.[1];
  const value = body.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? "";

  if (type === "s") return sharedStrings[Number(value)] ?? "";
  if (type === "inlineStr") {
    return Array.from(body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g))
      .map((match) => decodeXml(match[1]))
      .join("");
  }

  return decodeXml(value);
}

function readMappedValue(rawData: Record<string, string>, columnName: string | undefined) {
  if (!columnName) return "";
  return rawData[columnName] ?? "";
}

function findColumn(headers: string[], aliases: readonly string[]) {
  const normalizedAliases = aliases.map(normalizeHeader);
  const exactMatch = headers.find((header) => normalizedAliases.includes(normalizeHeader(header)));
  if (exactMatch) return exactMatch;

  return headers.find((header) => {
    const normalizedHeader = normalizeHeader(header);
    return normalizedAliases.some((alias) => normalizedHeader.includes(alias));
  });
}

function normalizeHeader(value: string) {
  return cleanCompanyName(value)
    .toLowerCase()
    .replace(/[：:]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniquifyHeaders(headers: string[]) {
  const counts = new Map<string, number>();

  return headers.map((header, index) => {
    const base = cleanCompanyName(header) || `Column ${index + 1}`;
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    return count === 0 ? base : `${base} ${count + 1}`;
  });
}

function guessDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  const semicolonCount = (firstLine.match(/;/g) ?? []).length;

  if (tabCount > commaCount && tabCount >= semicolonCount) return "\t";
  if (semicolonCount > commaCount) return ";";
  return ",";
}

function decodeTableText(buffer: Uint8Array) {
  const utf8 = stripBom(new TextDecoder("utf-8").decode(buffer));

  if (!utf8.includes("\uFFFD")) return utf8;

  try {
    const gb18030 = stripBom(new TextDecoder("gb18030").decode(buffer));
    const utf8BadChars = (utf8.match(/\uFFFD/g) ?? []).length;
    const gbBadChars = (gb18030.match(/\uFFFD/g) ?? []).length;
    return gbBadChars < utf8BadChars ? gb18030 : utf8;
  } catch {
    return utf8;
  }
}

function stripBom(value: string) {
  return value.replace(/^\uFEFF/, "");
}

function stripHtml(value: string) {
  return decodeXml(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " "));
}

function decodeXml(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function columnIndex(column: string) {
  return column.split("").reduce((index, char) => index * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function isZipFile(buffer: Uint8Array) {
  return buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function isLegacyBinaryXls(buffer: Uint8Array) {
  return (
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  );
}
