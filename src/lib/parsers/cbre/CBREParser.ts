import type { ExtractedField, ParsedBuilding, ParsedListing, ParserPage, ParserResult } from "../types";

export const CBRE_PARSER_VERSION = "CBRE-v1.7.0";

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

const HUMAN_ROLE_RE = /(상무|부장|차장|과장|대리|사원|이사|대표|전무|팀장)/;
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


function collapsedText(text: string): string {
  return text.replace(/[\u00a0\t\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

function cleanTitle(raw: string): string | null {
  let title = raw
    .replace(/^CBD\s+/i, "")
    .replace(/^GBD\s+/i, "")
    .replace(/^YBD\s+/i, "")
    .replace(/^Office\s*\|\s*For Lease\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  title = title.replace(/\s+(?:Building Image|General Information|Location Map|Availabilities|FACILITIES|Floorplans?|ACCESSIBILITY).*$/i, "").trim();
  if (title.length < 3 || title.length > 140) return null;
  if (/^(?:sqm|평|층|주소|지하철역|연면적|준공년도|규모|전용률|주차대수|기준층|임대면적|전용면적)(?:\s|$)/i.test(title)) return null;
  if (/^(?:B\d+\s*\/\s*\d+F|\d+F\s*\/\s*B\d+)/i.test(title)) return null;
  if (/^(?:서울특별시|서울시|경기도|인천광역시|부산광역시|대구광역시|대전광역시|광주광역시|울산광역시|세종특별자치시)/.test(title)) return null;
  if (/(?:호선|지하철역|도보\s*\d)/.test(title) && !/(tower|building|center|square|place|plaza|타워|빌딩|센터|스퀘어|플레이스)/i.test(title)) return null;
  const lower = title.toLowerCase();
  if (BAD_TITLE_PARTS.some((x) => lower.includes(x))) return null;
  if (title.includes("@") || /010[-\s]?\d/.test(title) || HUMAN_ROLE_RE.test(title)) return null;
  if (!/[가-힣A-Za-z]/.test(title)) return null;
  return title;
}



function isGenericTitleLine(line: string): boolean {
  const lower = line.toLowerCase();
  if (!line || line.length < 2 || line.length > 120) return true;
  if (BAD_TITLE_PARTS.some((x) => lower.includes(x))) return true;
  if (/^(?:office|for lease|cbre contacts:?|confidential|proprietary|floorplan|floorplans|availabilities|facilities|general information|building image|location map)$/i.test(line)) return true;
  if (/^[|｜]$/.test(line)) return true;
  if (/^\d+$/.test(line)) return true;
  if (/010[-\s]?\d/.test(line) || /@/.test(line)) return true;
  if (HUMAN_ROLE_RE.test(line)) return true;
  if (/(?:호선|도보\s*\d|지하철역)/.test(line) && !/(tower|building|center|square|place|plaza|타워|빌딩|센터|스퀘어|플레이스)/i.test(line)) return true;
  if (/^(?:서울특별시|서울시|경기도|인천광역시|부산광역시|대구광역시|대전광역시|광주광역시|울산광역시|세종특별자치시)\b/.test(line)) return true;
  if (/(?:대로|로|길)\s*\d{1,4}(?:[- ]\d+)?$/.test(line) && !/(tower|building|center|square|place|plaza|타워|빌딩|센터|스퀘어|플레이스)/i.test(line)) return true;
  return false;
}

function itemStreamTitleCandidates(text: string): Array<{ title: string; score: number }> {
  // pdf.js / unpdf often emits every text item as a separate line and the visual
  // header order is not the same as reading order.  In CBRE files the building
  // title is usually an English item immediately followed by a Korean item, e.g.
  // `Seoul Finance Center` + `서울파이낸스센터`.  Detect that pair anywhere on
  // the lease page instead of assuming it follows `Office | For Lease`.
  const lines = linesOf(text);
  const candidates: Array<{ title: string; score: number; order: number }> = [];

  for (let i = 0; i < lines.length; i += 1) {
    const a = lines[i];
    if (isGenericTitleLine(a)) continue;

    if (/^[*※•]/.test(a)) continue;
    const aHasLatin = /[A-Za-z]/.test(a);
    const aHasKorean = /[가-힣]/.test(a);

    // Some CBRE buildings use an English-only official name (for example G1 Seoul).
    // If it appears immediately before the address block, it is a strong title signal.
    if (aHasLatin && !aHasKorean && lines.slice(i + 1, i + 8).includes("주소")) {
      const cleaned = cleanTitle(a);
      if (cleaned) {
        let score = 29;
        if (/(tower|building|center|square|place|plaza|city|park|cube|grove|seoul)/i.test(cleaned)) score += 3;
        candidates.push({ title: cleaned, score, order: i });
      }
    }

    // Same-item bilingual title (works with pdftotext-like extractors).
    if (aHasLatin && aHasKorean) {
      const cleaned = cleanTitle(a);
      if (cleaned) {
        let score = 18;
        if ((cleaned.match(/[A-Za-z]{2,}/g) ?? []).length >= 2) score += 8;
        if (/(tower|building|center|square|place|plaza|city|park|cube|grove|타워|빌딩|센터|스퀘어|플레이스)/i.test(cleaned)) score += 3;
        if (lines.slice(i + 1, i + 12).includes("주소")) score += 6;
        candidates.push({ title: cleaned, score, order: i });
      }
    }

    // Split-item bilingual title (the dominant unpdf case).
    if (aHasLatin && !aHasKorean) {
      for (let j = i + 1; j <= Math.min(i + 4, lines.length - 1); j += 1) {
        const b = lines[j];
        if (isGenericTitleLine(b)) continue;
        if (/^[(*※•]/.test(b)) continue;
        if (!/[가-힣]/.test(b) || /[A-Za-z]/.test(b)) continue;
        if (b.length > 80 || /^(주소|지하철역|연면적|준공년도|규모|전용률|주차대수|기준층|임대면적|전용면적|입주가능시기|층|평|sqm)$/i.test(b)) continue;

        const combined = cleanTitle(`${a} ${b}`);
        if (!combined) continue;
        let score = 20;
        if ((combined.match(/[A-Za-z]{2,}/g) ?? []).length >= 2) score += 8;
        if (/(tower|building|center|square|place|plaza|city|park|cube|grove|타워|빌딩|센터|스퀘어|플레이스)/i.test(combined)) score += 3;
        if (lines.slice(j + 1, j + 18).includes("주소")) score += 8;
        if (i > 0 && /^CBRE Contacts:?$/i.test(lines[i - 1])) score += 2;
        candidates.push({ title: combined, score, order: i });
        break;
      }
    }
  }

  return candidates
    .sort((x, y) => y.score - x.score || x.order - y.order)
    .map(({ title, score }) => ({ title, score }));
}

function markerSliceTitle(text: string): string | null {
  // Robust fallback for extractors that collapse the entire page into one stream.
  const marker = /Office\s*[|｜]\s*For\s+Lease/i;
  const hit = marker.exec(text);
  if (!hit || hit.index === undefined) return null;

  let rest = text.slice(hit.index + hit[0].length, hit.index + hit[0].length + 1200);
  rest = rest.replace(/^[\s\u00a0:：\-–—]+/, "");
  const stop = rest.search(/(?:Building\s*Image|General\s*Information|Location\s*Map|Availabilit(?:y|ies)|FACILITIES|Floorplans?|ACCESSIBILITY|CBRE\s*Contacts?)/i);
  if (stop >= 0) rest = rest.slice(0, stop);
  rest = rest.replace(/Confidential\s*&\s*Proprietary.*$/i, "");
  const candidate = rest.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  if (!candidate) return null;
  const words = candidate.split(/\s+/).slice(0, 18).join(" ");
  return cleanTitle(words);
}

function anchorTitle(text: string): string | null {
  const collapsed = collapsedText(text);
  // unpdf can flatten a visually multi-line page into one text stream.  Anchor the
  // heading between "Office | For Lease" and the first known section label.
  const m = collapsed.match(/Office\s*\|\s*For Lease\s+(.{3,180}?)(?=\s+(?:Building Image|General Information|Location Map|Availabilities|FACILITIES|Floorplans?|ACCESSIBILITY|CBRE Contacts:?))/i);
  return m ? cleanTitle(m[1]) : null;
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
  const collapsed = collapsedText(text);
  if (currentTitle && (text.includes(currentTitle) || collapsed.includes(collapsedText(currentTitle)))) return currentTitle;

  // First try the item-stream strategy. This specifically matches the text order
  // produced by the production unpdf extractor, where `Office`, `|`, `For Lease`,
  // section labels and contacts may appear before the actual building title.
  const streamBest = itemStreamTitleCandidates(text)[0];
  if (streamBest) return streamBest.title;

  const anchored = anchorTitle(text);
  if (anchored) return anchored;
  const markerFallback = markerSliceTitle(text);
  if (markerFallback) return markerFallback;
  const best = titleCandidates(text)[0];
  if (best) return cleanTitle(best.title) ?? best.title;
  if (currentTitle && /(Availabilities|Facilities|Floorplans?|ACCESSIBILITY)/i.test(text)) return currentTitle;
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



function extractPageWideTerms(text: string, page: number) {
  const joined = linesOf(text).join(" ");
  const move = joined.match(/(즉시\s*가능|즉시가능|즉시|협의\s*필요|협의|\d{4}년\s*\d{1,2}월(?:\s*\d{1,2}일|\s*중|\s*\([^)]*\)|\s*\(예정\))?)/)?.[1]?.replace(/\s+/g, " ") ?? null;
  const rent = joined.match(/(?:임대료\s*\/?3\.3㎡|임대료\s*\(원\/?평\)|임대료)\s*[:：]?\s*@?([\d,]+)\s*원/i)?.[1] ?? null;
  const maintenance = joined.match(/(?:관리비\s*\/?3\.3㎡|관리비\s*\(원\/?평\)|관리비)\s*[:：]?\s*@?([\d,]+)\s*원/i)?.[1] ?? null;

  // In many CBRE pages the values are visually below the headers and unpdf emits
  // the header tokens first, then the values later.  If direct header/value matching
  // fails, use the first plausible won-denominated rates after the availability block.
  const allRates = [...joined.matchAll(/@?([\d,]{4,})\s*원/g)]
    .map((m) => n(m[1]))
    .filter((x): x is number => x !== null && x >= 10_000 && x <= 1_000_000);

  const rentValue = n(rent) ?? allRates[0] ?? null;
  const maintenanceValue = n(maintenance) ?? allRates[1] ?? null;
  return {
    move_in_text: f(move, move, page, move ? 0.86 : 0),
    rent_per_py: f(rentValue, rentValue !== null ? String(rentValue) : null, page, rentValue !== null ? 0.74 : 0),
    maintenance_per_py: f(maintenanceValue, maintenanceValue !== null ? String(maintenanceValue) : null, page, maintenanceValue !== null ? 0.74 : 0),
  };
}

function parseTokenStreamListingRows(text: string, page: number): ParsedListing[] {
  const lines = linesOf(text);
  const out: ParsedListing[] = [];
  const start = lines.findIndex((x) => /^Availabilities$/i.test(x) || /^Availability$/i.test(x));
  if (start < 0) return out;

  const stopCandidates = [
    lines.findIndex((x, i) => i > start && /^합계/.test(x)),
    lines.findIndex((x, i) => i > start && /^CBRE Contacts:?$/i.test(x)),
  ].filter((x) => x > start);
  const stop = stopCandidates.length ? Math.min(...stopCandidates) : Math.min(lines.length, start + 240);
  const globalTerms = extractPageWideTerms(text, page);

  const isAreaNumber = (v: string) => /^\d{1,3}(?:,\d{3})*(?:\.\d+)?$/.test(v) || /^\d+(?:\.\d+)?$/.test(v);
  const headerNoise = /^(?:임대면적|전용면적|평|sqm|층|입주가능시기|임대료 \/3\.3㎡|관리비 \/3\.3㎡)$/i;

  for (let i = start + 1; i < stop; i += 1) {
    const floorLine = lines[i];
    const floorMatch = floorLine.match(FLOOR_RE);
    if (!floorMatch || /^(층|합계)/.test(floorLine)) continue;

    let floorRaw = floorMatch[0].replace(/\s+/g, " ").trim();
    const vals: Array<{ raw: string; value: number }> = [];
    let j = i + 1;
    while (j < stop && vals.length < 4) {
      const token = lines[j].trim();
      if (FLOOR_RE.test(token) && vals.length < 4) break;
      if (headerNoise.test(token) || !token) { j += 1; continue; }
      if (/^\(표기\s*[^)]+\)$/.test(token)) { floorRaw = `${floorRaw} ${token}`; j += 1; continue; }
      if (isAreaNumber(token)) {
        const value = n(token);
        if (value !== null) vals.push({ raw: token, value });
      }
      j += 1;
    }
    if (vals.length < 4) continue;

    const [grossPy, grossSqm, exclusivePy, exclusiveSqm] = vals.map((x) => x.value);
    const grossRatio = grossPy > 0 ? grossSqm / grossPy : 0;
    const exclusiveRatio = exclusivePy > 0 ? exclusiveSqm / exclusivePy : 3.3058;
    const areaLooksValid = grossPy > 0 && exclusivePy >= 0 && grossRatio >= 2.75 && grossRatio <= 3.65 && exclusiveRatio >= 2.75 && exclusiveRatio <= 3.65 && exclusivePy <= grossPy * 1.15;
    if (!areaLooksValid) continue;

    const rowWarnings = ["CBRE text-item stream parser로 구조화됨"];
    if (/\d+\s*[~–-]\s*\d+/.test(floorRaw)) rowWarnings.push("층 범위 표기: 원문 범위를 유지하고 자동 분할하지 않음");
    out.push({
      floor: floorRaw,
      unit: null,
      source_page: page,
      warnings: rowWarnings,
      extracted_data: {
        floor_raw: f(floorRaw, floorRaw, page, 0.98),
        gross_area_py: f(grossPy, vals[0].raw, page, 0.98),
        gross_area_sqm: f(grossSqm, vals[1].raw, page, 0.98),
        exclusive_area_py: f(exclusivePy, vals[2].raw, page, 0.98),
        exclusive_area_sqm: f(exclusiveSqm, vals[3].raw, page, 0.98),
        ...globalTerms,
        _source_row: [floorRaw, ...vals.map((x) => x.raw)].join(" "),
        _fallback: "TOKEN_STREAM_V1",
      },
    });
  }
  return out;
}

function parseFlattenedListingRows(text: string, page: number): ParsedListing[] {
  const collapsed = collapsedText(text);
  if (!/Availabilities/i.test(collapsed)) return [];
  const out: ParsedListing[] = [];
  // Fallback for unpdf output where table rows lose line breaks but preserve token order.
  const rowRe = /(?:^|\s)((?:B\d+|\d+)(?:층|F)(?:\s*\([^)]*\))?(?:\s*(?:일부|전체))?)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)/gi;
  for (const m of collapsed.matchAll(rowRe)) {
    const floorRaw = m[1].replace(/\s+/g, " ").trim();
    const grossPy=n(m[2]), grossSqm=n(m[3]), exclusivePy=n(m[4]), exclusiveSqm=n(m[5]);
    if ([grossPy,grossSqm,exclusivePy,exclusiveSqm].some((x)=>x===null)) continue;
    const gp=grossPy as number, gs=grossSqm as number, ep=exclusivePy as number, es=exclusiveSqm as number;
    const grossRatio=gp>0?gs/gp:0, exclusiveRatio=ep>0?es/ep:3.3058;
    if (!(gp>0 && ep>=0 && grossRatio>=2.75 && grossRatio<=3.65 && exclusiveRatio>=2.75 && exclusiveRatio<=3.65 && ep<=gp*1.15)) continue;
    const start=(m.index ?? 0)+m[0].length;
    const tail=collapsed.slice(start, Math.min(collapsed.length,start+180));
    const move=tail.match(/(즉시\s*가능|즉시가능|즉시|협의\s*필요|협의|\d{4}년\s*\d{1,2}월(?:\s*\d{1,2}일|\s*중|\s*\([^)]*\))?)/)?.[1]?.replace(/\s+/g," ") ?? null;
    const rates=rateValues(tail).filter((x)=>x>=10_000 && x<=1_000_000);
    out.push({
      floor: floorRaw, unit:null, source_page:page, warnings:["PDF 표 행이 한 줄로 평탄화되어 fallback parser로 구조화됨"],
      extracted_data:{
        floor_raw:f(floorRaw,floorRaw,page,0.96),
        gross_area_py:f(gp,m[2],page,0.96), gross_area_sqm:f(gs,m[3],page,0.96),
        exclusive_area_py:f(ep,m[4],page,0.96), exclusive_area_sqm:f(es,m[5],page,0.96),
        rent_per_py:f(rates[0] ?? null,rates[0]!==undefined?String(rates[0]):null,page,rates[0]!==undefined?0.7:0),
        maintenance_per_py:f(rates[1] ?? null,rates[1]!==undefined?String(rates[1]):null,page,rates[1]!==undefined?0.7:0),
        move_in_text:f(move,move,page,move?0.78:0), _source_row:m[0].trim(), _fallback:"FLATTENED_ROW_V1"
      }
    });
  }
  return out;
}

function parseListingRows(text: string, page: number): { listings: ParsedListing[]; warnings: string[] } {
  // CBRE overview pages often show the full building facts table and the phrase
  // "공실 뒷장 참고". Numbers such as B5 / 15F, typical-floor areas, parking, etc.
  // must never be interpreted as vacancy rows. The actual vacancies are on the next page.
  if (/공실\s*뒷장\s*참고/.test(text)) return { listings: [], warnings: [] };
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

  const tokenStream = parseTokenStreamListingRows(text, page);
  const fallback = parseFlattenedListingRows(text, page);
  // Prefer the line-aware parser when it successfully recovered vacancy rows.
  // Token-stream/flattened parsers are fallbacks for extraction orders that lose row boundaries.
  // Combining all three created duplicate rows such as `지상 14층` + `14층`.
  const combined = dedupeListings(out.length > 0 ? out : tokenStream.length > 0 ? tokenStream : fallback);
  const globalTerms = extractPageWideTerms(text, page);
  for (const row of combined) {
    const rent = row.extracted_data.rent_per_py as ExtractedField<number> | undefined;
    const maintenance = row.extracted_data.maintenance_per_py as ExtractedField<number> | undefined;
    const move = row.extracted_data.move_in_text as ExtractedField<string> | undefined;
    if ((!rent || rent.value === null) && globalTerms.rent_per_py.value !== null) row.extracted_data.rent_per_py = globalTerms.rent_per_py;
    if ((!maintenance || maintenance.value === null) && globalTerms.maintenance_per_py.value !== null) row.extracted_data.maintenance_per_py = globalTerms.maintenance_per_py;
    if ((!move || move.value === null) && globalTerms.move_in_text.value !== null) row.extracted_data.move_in_text = globalTerms.move_in_text;
  }
  if ((sawFloorCandidate || /Availabilities/i.test(text)) && combined.length === 0 && !/공실\s*뒷장\s*참고/.test(text)) {
    warnings.push(`p.${page}: 공실 표를 감지했지만 면적 행을 구조화하지 못함`);
  }
  return { listings: combined, warnings };
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
    if (!text.trim()) continue;
    const isLeasePage = /Office\s*\|\s*For Lease/i.test(text);
    const isContinuation = Boolean(current && /(Availabilities|Facilities|Floorplans?|ACCESSIBILITY)/i.test(text));
    if (!isLeasePage && !isContinuation) continue;

    const title = detectTitle(text, current?.raw_building_name ?? null);
    if (!title) {
      if (/Availabilities/i.test(text)) globalWarnings += 1;
      continue;
    }

    const matchingName = matchingNameFromTitle(title);
    const key = compactNorm(title);
    let building = byName.get(key) ?? null;

    if (!building) {
      const titleConfidence = itemStreamTitleCandidates(text).some((x) => x.title === title) || titleCandidates(text).some((x) => x.title === title) ? 0.98 : 0.85;
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
