import type { ExtractedField, ParsedBuilding, ParsedListing, ParserPage, ParserResult } from "../types";

export const NAI_PARSER_VERSION = "NAI-v1.1.0";

const field = <T>(value: T | null, raw: string | null, page: number, confidence: number): ExtractedField<T> => ({
  value, raw_text: raw, source_page: page, confidence,
});

function num(raw?: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[\s·._\-()\[\]{}]/g, "").trim();
}

function cleanName(raw: string): string | null {
  const name = raw
    .replace(/\s+(?:Location|Floor Plan|Space Availability).*$/i, "")
    .replace(/^\s*(?:GBD|CBD|YBD)\s+/i, "")
    .replace(/\s+[가-힣A-Za-z0-9()·]+역$/, "")
    .trim();
  if (!name || name.length > 50) return null;
  if (/^(?:Location|Floor Plan|General Information|Space Availability|Contact|상담문의|Leasing)$/i.test(name)) return null;
  if (/^\d+\.?\s+/.test(name)) return null;
  return name;
}

function findBuildingName(text: string): string | null {
  if (/빌딩명을\s*클릭하세요/.test(text)) return null;
  const lines = text.split(/\n/).map((x) => x.trim()).filter(Boolean);

  for (const line of lines.slice(0, 16)) {
    const m = line.match(/^(.+?)\s+(?:Location|Space Availability)(?:\s|$)/i);
    const cleaned = m ? cleanName(m[1]) : null;
    if (cleaned) return cleaned;
  }

  // Some NAI pages render "Location" first and the building name directly below it.
  const locIdx = lines.findIndex((x) => /^Location(?:\s|$)/i.test(x) || /Location\s+Floor Plan/i.test(x));
  if (locIdx >= 0) {
    for (let i = locIdx + 1; i < Math.min(lines.length, locIdx + 5); i++) {
      const candidate = cleanName(lines[i]);
      if (candidate && !/(Floor Plan|General Information)/i.test(candidate)) return candidate;
    }
  }

  return null;
}

function matchOne(text: string, re: RegExp): string | null {
  return text.match(re)?.[1]?.trim() ?? null;
}

function buildingData(text: string, page: number, name: string, warnings: string[]) {
  const address = matchOne(text, /주소\s*([^\n]+?)(?=\s{2,}(?:층|대지면적|연면적|빌딩규모)|\n)/);
  const gfa = text.match(/연면적\s*([\d,.]+)\s*㎡\s*\(([\d,.]+)\s*py\)/i);
  const floors = text.match(/빌딩규모\s*지상\s*(\d+)\s*층\s*(?:\/)?\s*지하\s*(\d+)\s*층/i);
  const completion = matchOne(text, /사용승인일\s*((?:\d{4}-\d{2}-\d{2})|(?:\d{4}년\s*\d{1,2}월))/);
  const efficiency = matchOne(text, /전용률\s*([\d.]+)\s*%/);
  const parking = matchOne(text, /(?:^|\n)\s*주차\s*[^\n]*?(\d+)\s*대/m);
  const passenger = matchOne(text, /엘리베이터[^\n]*?(?:승용|승객용)\s*(\d+)\s*대/);
  const emergency = matchOne(text, /엘리베이터[^\n]*?(?:비상용)\s*(\d+)\s*대/);
  const use = matchOne(text, /(?:주용도|건물주용도|건축물주용도)\s*([^\n]+)/);
  const access = matchOne(text, /접근성\s*([^\n]+)/);
  const station = access ? access.match(/([가-힣A-Za-z0-9()·]+역)/)?.[1] ?? null : null;
  const walk = access ? access.match(/도보\s*(?:약\s*)?(\d+)\s*분/)?.[1] ?? null : null;
  const freeParking = matchOne(text, /무료주차\s*([^\n]+)/);
  const typical = text.match(/기준층면적[\s\S]{0,120}?임대:\s*([\d,.]+)\s*㎡\s*\(([\d,.]+)\s*py\)/i);
  const completionYearMatch = completion?.match(/^(\d{4})/);

  const data: Record<string, unknown> = {
    _parser: field(NAI_PARSER_VERSION, null, page, 1),
    building_name_kr: field(name, name, page, 1),
    road_address: field(address, address, page, address ? 0.9 : 0),
    gross_floor_area_sqm: field(num(gfa?.[1]), gfa?.[1] ?? null, page, gfa ? 1 : 0),
    gross_floor_area_py: field(num(gfa?.[2]), gfa?.[2] ?? null, page, gfa ? 1 : 0),
    above_ground_floors: field(num(floors?.[1]), floors?.[1] ?? null, page, floors ? 1 : 0),
    basement_floors: field(num(floors?.[2]), floors?.[2] ?? null, page, floors ? 1 : 0),
    completion_date: field(completion, completion, page, completion ? 0.9 : 0),
    completion_year: field(completionYearMatch ? Number(completionYearMatch[1]) : null, completion, page, completionYearMatch ? 1 : 0),
    efficiency_ratio: field(num(efficiency), efficiency, page, efficiency ? 1 : 0),
    passenger_elevators: field(num(passenger), passenger, page, passenger ? 0.9 : 0),
    emergency_elevators: field(num(emergency), emergency, page, emergency ? 0.9 : 0),
    parking_total: field(num(parking), parking, page, parking ? 0.85 : 0),
    free_parking_ratio: field(freeParking, freeParking, page, freeParking ? 0.9 : 0),
    nearest_station: field(station, access, page, station ? 0.85 : 0),
    walking_minutes: field(num(walk), access, page, walk ? 0.9 : 0),
    building_use: field(use, use, page, use ? 0.85 : 0),
    typical_floor_area_sqm: field(num(typical?.[1]), typical?.[1] ?? null, page, typical ? 1 : 0),
    typical_floor_area_py: field(num(typical?.[2]), typical?.[2] ?? null, page, typical ? 1 : 0),
  };

  const year = completionYearMatch ? Number(completionYearMatch[1]) : null;
  if (year && (year < 1900 || year > new Date().getFullYear() + 5)) warnings.push("INVALID_COMPLETION_YEAR");
  if (/공실\s*없음/.test(text)) data.vacancy_status = field("NO_VACANCY", "공실 없음", page, 1);
  return data;
}

function detectPageRates(text: string): { deposit: number | null; rent: number | null; maintenance: number | null; raw: string | null } {
  const rateLine = text.split(/\n+/).map((s) => s.trim()).find((s) => /^단가\b/.test(s));
  if (!rateLine) return { deposit: null, rent: null, maintenance: null, raw: null };
  const nums = [...rateLine.matchAll(/[\d,.]+/g)].map((m) => num(m[0])).filter((x): x is number => x !== null);
  // Typical NAI line: 단가 NOC 297,662 1,200,000 120,000 43,000
  if (nums.length >= 4) return { deposit: nums[nums.length - 3], rent: nums[nums.length - 2], maintenance: nums[nums.length - 1], raw: rateLine };
  if (nums.length >= 3) return { deposit: nums[nums.length - 3], rent: nums[nums.length - 2], maintenance: nums[nums.length - 1], raw: rateLine };
  return { deposit: null, rent: null, maintenance: null, raw: rateLine };
}

function parseListingRows(text: string, page: number): ParsedListing[] {
  if (/공실\s*없음/.test(text)) return [];
  const rows: ParsedListing[] = [];
  const lines = text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const pageRates = detectPageRates(text);

  for (const line of lines) {
    if (/^(합계|단가|층\b|뒷면참조|VAT|Space Availability)/.test(line)) continue;
    const floorMatch = line.match(/((?:B?\d+F|\d+층)(?:\s*[~–-]\s*(?:B?\d+F|\d+층))?(?:\([^)]*\)|(?:일부|전체|협의))?)\s+(?=[\d(])/i);
    if (!floorMatch) continue;
    const floorRaw = floorMatch[1].replace(/\s+/g, "").trim();
    const remainder = line.slice((floorMatch.index ?? 0) + floorMatch[0].length).trim();
    const tokens = [...remainder.matchAll(/\(?[\d,.]+\)?/g)].map((m) => ({ raw: m[0], value: num(m[0].replace(/[()]/g, "")) }));
    if (tokens.length < 2) continue;

    const warnings: string[] = [];
    const range = /[~–-]/.test(floorRaw);
    let grossPy: number | null = null;
    let exclusivePy: number | null = null;
    let areaRaw: string | null = null;
    let rateStart = 2;

    // Most NAI availability tables use two 평 values: 임대면적 / 전용면적.
    // Lucen Tower is a known ambiguous exception with one printed area + parenthesized value;
    // preserve the raw area and avoid inventing a second field.
    if (tokens[1].raw.startsWith("(")) {
      grossPy = tokens[0].value;
      areaRaw = `${tokens[0].raw} ${tokens[1].raw}`;
      rateStart = 2;
      warnings.push("AMBIGUOUS_AREA_LAYOUT");
    } else {
      grossPy = tokens[0].value;
      exclusivePy = tokens[1].value;
      areaRaw = `${tokens[0].raw} ${tokens[1].raw}`;
      rateStart = 2;
    }

    const moveMatch = remainder.match(/(즉시|협의|\d{4}[-./]\d{1,2}(?:[-./]\d{1,2})?|\d{1,2}월(?:\s*말|\s*초|\s*중순)?)(?:\s*)$/);
    const move = moveMatch?.[1] ?? null;
    const numericRates = tokens.slice(rateStart).map((t) => t.value).filter((x): x is number => x !== null);

    let depositPerPy: number | null = null;
    let rentPerPy: number | null = null;
    let maintenancePerPy: number | null = null;
    let depositTotal: number | null = null;
    let rentTotal: number | null = null;
    let maintenanceTotal: number | null = null;

    if (pageRates.deposit !== null || pageRates.rent !== null || pageRates.maintenance !== null) {
      depositPerPy = pageRates.deposit;
      rentPerPy = pageRates.rent;
      maintenancePerPy = pageRates.maintenance;
      if (numericRates.length >= 3) {
        depositTotal = numericRates[0];
        rentTotal = numericRates[1];
        maintenanceTotal = numericRates[2];
      }
    } else if (numericRates.length >= 3) {
      // No separate 단가 row: the page table itself is the per-py rate table.
      depositPerPy = numericRates[0];
      rentPerPy = numericRates[1];
      maintenancePerPy = numericRates[2];
    }

    if (grossPy !== null && exclusivePy !== null && exclusivePy > grossPy) warnings.push("EXCLUSIVE_AREA_GT_GROSS_AREA");
    rows.push({
      floor: range ? null : floorRaw,
      unit: null,
      source_page: page,
      warnings,
      extracted_data: {
        floor_raw: field(floorRaw, floorRaw, page, 1),
        area_raw: field(areaRaw, areaRaw, page, areaRaw ? (warnings.includes("AMBIGUOUS_AREA_LAYOUT") ? 0.55 : 0.95) : 0),
        gross_area_py: field(grossPy, tokens[0]?.raw ?? null, page, grossPy !== null ? (warnings.includes("AMBIGUOUS_AREA_LAYOUT") ? 0.55 : 0.95) : 0),
        exclusive_area_py: field(exclusivePy, tokens[1]?.raw ?? null, page, exclusivePy !== null ? 0.95 : 0),
        deposit_per_py: field(depositPerPy, pageRates.raw ?? tokens[rateStart]?.raw ?? null, page, depositPerPy !== null ? 0.9 : 0),
        rent_per_py: field(rentPerPy, pageRates.raw ?? tokens[rateStart + 1]?.raw ?? null, page, rentPerPy !== null ? 0.9 : 0),
        maintenance_per_py: field(maintenancePerPy, pageRates.raw ?? tokens[rateStart + 2]?.raw ?? null, page, maintenancePerPy !== null ? 0.9 : 0),
        deposit_total_raw: field(depositTotal, depositTotal !== null ? String(depositTotal) : null, page, depositTotal !== null ? 0.85 : 0),
        rent_total_raw: field(rentTotal, rentTotal !== null ? String(rentTotal) : null, page, rentTotal !== null ? 0.85 : 0),
        maintenance_total_raw: field(maintenanceTotal, maintenanceTotal !== null ? String(maintenanceTotal) : null, page, maintenanceTotal !== null ? 0.85 : 0),
        move_in_text: field(move, move, page, move ? 0.95 : 0),
      },
    });
  }
  return rows;
}

function mergeBuildingPage(current: ParsedBuilding, text: string, page: number, name: string) {
  const newData = buildingData(text, page, name, current.warnings);
  for (const [k, v] of Object.entries(newData)) {
    const old = current.extracted_data[k] as ExtractedField<unknown> | undefined;
    const fresh = v as ExtractedField<unknown>;
    if (!old || old.value == null) current.extracted_data[k] = fresh;
  }
  current.listings.push(...parseListingRows(text, page));
}

export function parseNAIPages(pages: ParserPage[]): ParserResult {
  const sorted = [...pages].sort((a,b) => a.page_number - b.page_number);
  const buildings: ParsedBuilding[] = [];
  let current: ParsedBuilding | null = null;

  for (const p of sorted) {
    const text = p.extracted_text ?? "";
    if (!text.trim() || /빌딩명을\s*클릭하세요/.test(text)) continue;
    const name = findBuildingName(text);
    const normalized = name ? normalizeName(name) : null;

    if (name && current && normalizeName(current.raw_building_name) === normalized) {
      mergeBuildingPage(current, text, p.page_number, name);
      continue;
    }

    if (name) {
      current = {
        raw_building_name: name,
        normalized_building_name: normalized!,
        primary_source_page: p.page_number,
        extracted_data: {},
        listings: [],
        warnings: [],
      };
      current.extracted_data = buildingData(text, p.page_number, name, current.warnings);
      current.listings.push(...parseListingRows(text, p.page_number));
      buildings.push(current);
      continue;
    }

    if (current && (/Space Availability|입주시기|보증금|월\s*임대료|공실\s*없음/.test(text))) {
      mergeBuildingPage(current, text, p.page_number, current.raw_building_name);
    }
  }

  let warningCount = 0;
  for (const b of buildings) {
    warningCount += b.warnings.length;
    for (const l of b.listings) warningCount += l.warnings.length;
  }
  return { parser_version: NAI_PARSER_VERSION, buildings, warning_count: warningCount };
}
