import type { ExtractedField, ParsedBuilding, ParsedListing, ParserPage, ParserResult } from "../types";

export const CBRE_PARSER_VERSION = "CBRE-v1.2.0";

const f = <T>(value: T | null, raw: string | null, page: number, confidence: number): ExtractedField<T> => ({
  value,
  raw_text: raw,
  source_page: page,
  confidence,
});

const n = (v?: string | null) => {
  if (!v) return null;
  const x = Number(v.replace(/,/g, "").replace(/^@/, ""));
  return Number.isFinite(x) ? x : null;
};

const compactNorm = (v: string) => v.toLowerCase().replace(/[\s·._\-()[\]{}]/g, "");

const HUMAN_ROLE_RE = /(상무|부장|차장|과장|대리|사원|이사|대표|전무|팀장)$/;
const BAD_TITLE_PARTS = [
  "confidential & proprietary",
  "building image",
  "general information",
  "location map",
  "availabilities",
  "cbre contacts",
  "floorplan",
  "facilities",
  "appendix",
  "accessibility",
  "입주가능시기",
  "임대면적",
  "전용면적",
  "준공년도",
  "주차대수",
  "무료주차",
  "유료주차",
  "지하철역",
  "공실 뒷장",
  "평 sqm",
  "규모 ",
  "전용률 ",
  "연면적 ",
  "주소 ",
  "담당자 문의",
];

const FLOOR_RE = /^(?:(?:지상|지하)\s*)?(?:(?:B|P)\d+(?:\s*[~–-]\s*(?:(?:B|P)?\d+))?(?:층|F)?|\d+(?:\s*[~–-]\s*(?:B?\d+))?(?:층|F))(?:\s*\(\d+\))?(?:\s*(?:일부|전체))?/i;
const NUMBER_RE = /@?(\d+(?:,\d{3})*(?:\.\d+)?)/g;

function linesOf(text: string): string[] {
  return text.split(/\n/).map((x) => x.trim()).filter(Boolean);
}

function matchingNameFromTitle(title: string): string {
  // Bilingual CBRE heading -> Korean name is usually the best key for matching.
  // Descriptive trailing parentheses are removed before extracting the Korean segment.
  const outsideTrailingParen = title.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const firstKorean = outsideTrailingParen.search(/[가-힣]/);
  if (firstKorean >= 0) {
    const kr = outsideTrailingParen.slice(firstKorean).replace(/^가칭\s*/, "").trim();
    if (kr.length >= 2) return kr;
  }
  const inner = title.match(/\((?:가칭\s*)?([^)]*[가-힣][^)]*)\)/)?.[1]?.trim();
  return inner && inner.length >= 2 ? inner : title;
}

function titleCandidates(text: string): Array<{ title: string; score: number }> {
  const lines = linesOf(text);
  const officeIdx = lines.findIndex((x) => /^Office\s*\|\s*For Lease/i.test(x));
  if (officeIdx < 0) return [];

  const candidates: Array<{ title: string; score: number; order: number }> = [];
  const max = Math.min(lines.length, officeIdx + 100);

  for (let i = officeIdx + 1; i < max; i += 1) {
    const line = lines[i];
    const lower = line.toLowerCase();
    if (line.length < 3 || line.length > 110) continue;
    if (BAD_TITLE_PARTS.some((x) => lower.includes(x))) continue;
    if (/^[*※•\-(]/.test(line)) continue;
    if (line.includes("@") || /^010-/.test(line) || /^\d+$/.test(line)) continue;
    if (HUMAN_ROLE_RE.test(line)) continue;
    if (/\d{1,3}(?:,\d{3})+(?:원)?/.test(line) && !/(타워|빌딩|Tower|Building)/i.test(line)) continue;

    const hasKorean = /[가-힣]/.test(line);
    const hasEnglish = /[A-Za-z]/.test(line);
    // The CBRE package uses bilingual building titles. This condition blocks contacts,
    // table labels and descriptive Korean sentences from becoming fake buildings.
    if (!(hasKorean && hasEnglish)) continue;

    let score = 5;
    if (/(타워|빌딩|센터|스퀘어|플레이스|사옥|Tower|Building|Center|Square|Place|Plaza|Cube|Grove|City|Park)/i.test(line)) score += 3;
    const next = lines[i + 1] ?? "";
    if (next === "주소" || next.startsWith("주소 ")) score += 8;
    if (line.split(/\s+/).length > 10) score -= 4;
    candidates.push({ title: line, score, order: i });
  }

  return candidates.sort((a, b) => b.score - a.score || a.order - b.order).map(({ title, score }) => ({ title, score }));
}

function detectTitle(text: string, currentTitle: string | null): string | null {
  // Continuation pages often repeat the building title at an arbitrary location because
  // PDF text items are not emitted in visual row order. Exact current-title reuse is safest.
  if (currentTitle && text.includes(currentTitle)) return currentTitle;
  const best = titleCandidates(text)[0];
  if (best) return best.title;
  if (currentTitle && /(Availabilities|Facilities|Floorplan|ACCESSIBILITY)/i.test(text)) return currentTitle;
  return null;
}

function oneJoined(text: string, re: RegExp): string | null {
  return linesOf(text).join(" ").match(re)?.[1]?.trim() ?? null;
}

function parseBuildingFacts(text: string, page: number) {
  const joined = linesOf(text).join(" ");
  const address = joined.match(/주소\s+(.+?)(?=\s+지하철역|\s+연면적|\s+준공년도|\s+규모)/i)?.[1]?.trim() ?? null;
  const gfa = joined.match(/연면적\s+([\d,.]+)\s*㎡\s*\(([\d,.]+)\s*평\)/i);
  const completion = joined.match(/준공년도\s+(\d{4})(?:년(?:\s*(\d{1,2})월)?)?/i);
  const exclusiveRatio = joined.match(/전용률\s+([^\s]+(?:\s*[:：]\s*[^\s]+)?)/i)?.[1]?.trim() ?? null;
  const parking = joined.match(/주차대수\s+(?:총\s*)?([\d,]+)대/i)?.[1] ?? null;

  return {
    road_address: f(address, address, page, address ? 0.92 : 0),
    gross_floor_area_sqm: f(n(gfa?.[1]), gfa?.[1] ?? null, page, gfa?.[1] ? 0.96 : 0),
    gross_floor_area_py: f(n(gfa?.[2]), gfa?.[2] ?? null, page, gfa?.[2] ? 0.96 : 0),
    completion_year: f(n(completion?.[1]), completion?.[0] ?? null, page, completion?.[1] ? 0.95 : 0),
    completion_month: f(n(completion?.[2]), completion?.[0] ?? null, page, completion?.[2] ? 0.9 : 0),
    exclusive_ratio_text: f(exclusiveRatio, exclusiveRatio, page, exclusiveRatio ? 0.75 : 0),
    parking_total: f(n(parking), parking, page, parking ? 0.9 : 0),
  };
}

function rateValues(blob: string): number[] {
  return [...blob.matchAll(/@?([\d,]{4,})\s*원/g)]
    .map((m) => n(m[1]))
    .filter((x): x is number => x !== null);
}

function parseListingRows(text: string, page: number): { listings: ParsedListing[]; warnings: string[] } {
  const lines = linesOf(text);
  const out: ParsedListing[] = [];
  const warnings: string[] = [];
  let wing: string | null = null;
  let sawFloorCandidate = false;

  for (let i = 0; i < lines.length;) {
    const line = lines[i];

    if (/^[A-Z가-힣0-9]+동$/.test(line) && i + 1 < lines.length && /(임대면적|전용면적)/.test(lines[i + 1])) {
      wing = line;
      i += 1;
      continue;
    }

    const floorMatch = line.match(FLOOR_RE);
    if (!floorMatch || /^(층|합계)/.test(line)) {
      i += 1;
      continue;
    }

    sawFloorCandidate = true;
    let floorRaw = floorMatch[0].replace(/\s+/g, " ").trim();
    const chunks: string[] = [line.slice(floorMatch[0].length).trim()];
    let j = i + 1;

    if (j < lines.length && /^\(표기\s*[^)]+\)$/.test(lines[j])) {
      floorRaw = `${floorRaw} ${lines[j]}`;
      j += 1;
    }

    while (j < lines.length) {
      const next = lines[j];
      if (FLOOR_RE.test(next) || /^합계/.test(next) || /^CBRE Contacts/i.test(next) || /^Confidential/i.test(next)) break;
      if (/^[A-Z가-힣0-9]+동$/.test(next) && j + 1 < lines.length && /(임대면적|전용면적)/.test(lines[j + 1])) break;
      chunks.push(next);
      j += 1;
    }

    const blob = chunks.filter(Boolean).join(" ");
    const nums = [...blob.matchAll(NUMBER_RE)].map((m) => n(m[1])).filter((x): x is number => x !== null);
    if (nums.length >= 4) {
      const [grossPy, grossSqm, exclusivePy, exclusiveSqm] = nums;
      const grossRatio = grossPy > 0 ? grossSqm / grossPy : 0;
      const exclusiveRatio = exclusivePy > 0 ? exclusiveSqm / exclusivePy : 3.3058;
      const areaLooksValid = grossPy > 0 && exclusivePy >= 0 && grossRatio >= 2.75 && grossRatio <= 3.65 && exclusiveRatio >= 2.75 && exclusiveRatio <= 3.65 && exclusivePy <= grossPy * 1.15;

      if (areaLooksValid) {
        const move = blob.match(/(즉시\s*가능|즉시가능|즉시|협의\s*필요|협의|\d{4}년\s*\d{1,2}월(?:\s*\d{1,2}일|\s*중|\s*\([^)]*\))?)/)?.[1]?.replace(/\s+/g, " ") ?? null;
        const rates = rateValues(blob).filter((x) => x >= 10_000);
        // CBRE also contains floor-total rent tables. Only treat values as per-pyeong when
        // they are in a plausible per-pyeong range. Larger totals remain unassigned.
        const plausiblePerPy = rates.filter((x) => x <= 1_000_000);
        const rent = plausiblePerPy[0] ?? null;
        const maintenance = plausiblePerPy[1] ?? null;
        const sourceFloor = wing ? `${wing} ${floorRaw}` : floorRaw;
        const rowWarnings: string[] = [];
        if (/^[^\d]*(?:\d+\s*[~–-]\s*\d+|B\d+\s*[~–-]\s*B?\d+)/i.test(floorRaw)) rowWarnings.push("층 범위 표기: 원문 범위를 유지하고 자동 분할하지 않음");
        if (rates.some((x) => x > 1_000_000)) rowWarnings.push("층별 총액형 임대조건 감지: 평당 단가로 추정하지 않음");

        out.push({
          floor: sourceFloor,
          unit: null,
          source_page: page,
          warnings: rowWarnings,
          extracted_data: {
            floor_raw: f(sourceFloor, sourceFloor, page, 1),
            gross_area_py: f(grossPy, String(grossPy), page, 0.98),
            gross_area_sqm: f(grossSqm, String(grossSqm), page, 0.98),
            exclusive_area_py: f(exclusivePy, String(exclusivePy), page, 0.98),
            exclusive_area_sqm: f(exclusiveSqm, String(exclusiveSqm), page, 0.98),
            rent_per_py: f(rent, rent !== null ? String(rent) : null, page, rent !== null ? 0.78 : 0),
            maintenance_per_py: f(maintenance, maintenance !== null ? String(maintenance) : null, page, maintenance !== null ? 0.78 : 0),
            move_in_text: f(move, move, page, move ? 0.9 : 0),
            _source_row: blob,
          },
        });
      }
    }

    i = Math.max(j, i + 1);
  }

  if (sawFloorCandidate && out.length === 0 && /Availabilities/i.test(text) && !/공실\s*뒷장\s*참고/.test(text)) {
    warnings.push(`p.${page}: 공실 층 표기는 감지했지만 면적 행을 구조화하지 못함`);
  }
  return { listings: out, warnings };
}

function mergeFacts(target: Record<string, unknown>, facts: Record<string, ExtractedField<unknown>>) {
  for (const [key, value] of Object.entries(facts)) {
    const current = target[key] as ExtractedField<unknown> | undefined;
    if ((!current || current.value === null) && value.value !== null) target[key] = value;
  }
}

function merge(current: ParsedBuilding, text: string, page: number) {
  mergeFacts(current.extracted_data, parseBuildingFacts(text, page) as Record<string, ExtractedField<unknown>>);
  const rows = parseListingRows(text, page);
  current.listings.push(...rows.listings);
  current.warnings.push(...rows.warnings);
  if (/공실\s*(?:없음|없습니다)/.test(text)) current.extracted_data.vacancy_status = f("NO_VACANCY", "공실 없음", page, 1);
}

function dedupeListings(listings: ParsedListing[]): ParsedListing[] {
  const seen = new Set<string>();
  return listings.filter((row) => {
    const gross = (row.extracted_data.gross_area_py as ExtractedField<number> | undefined)?.value ?? "";
    const exclusive = (row.extracted_data.exclusive_area_py as ExtractedField<number> | undefined)?.value ?? "";
    const key = `${row.source_page}|${row.floor ?? ""}|${gross}|${exclusive}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseCBREPages(pages: ParserPage[]): ParserResult {
  const buildings: ParsedBuilding[] = [];
  const byName = new Map<string, ParsedBuilding>();
  let current: ParsedBuilding | null = null;
  let globalWarnings = 0;

  for (const p of [...pages].sort((a, b) => a.page_number - b.page_number)) {
    const text = p.extracted_text ?? "";
    if (!text.trim() || !/Office\s*\|\s*For Lease/i.test(text)) continue;

    const title = detectTitle(text, current?.raw_building_name ?? null);
    if (!title) {
      if (/Availabilities/i.test(text)) globalWarnings += 1;
      continue;
    }

    const matchingName = matchingNameFromTitle(title);
    const key = compactNorm(title);
    let building = byName.get(key) ?? null;

    if (!building) {
      const titleConfidence = titleCandidates(text).some((x) => x.title === title) ? 0.98 : 0.85;
      building = {
        raw_building_name: title,
        normalized_building_name: key,
        primary_source_page: p.page_number,
        warnings: [],
        listings: [],
        extracted_data: {
          _parser: f(CBRE_PARSER_VERSION, null, p.page_number, 1),
          building_name_source: f(title, title, p.page_number, titleConfidence),
          building_name_kr: f(matchingName, matchingName, p.page_number, matchingName !== title ? 0.92 : 0.75),
          ...parseBuildingFacts(text, p.page_number),
        },
      };
      buildings.push(building);
      byName.set(key, building);
    }

    current = building;
    merge(building, text, p.page_number);
  }

  for (const building of buildings) {
    building.listings = dedupeListings(building.listings);
    if (!building.raw_building_name || HUMAN_ROLE_RE.test(building.raw_building_name)) {
      building.warnings.push("비정상 건물명 후보: 관리자 확인 필요");
    }
  }

  return {
    parser_version: CBRE_PARSER_VERSION,
    buildings,
    warning_count: globalWarnings + buildings.reduce((sum, b) => sum + b.warnings.length + b.listings.reduce((x, l) => x + l.warnings.length, 0), 0),
  };
}
