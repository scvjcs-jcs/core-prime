export type PrimeScoreRecommendationInput = {
  districtName?: string | null;
  completionYear?: number | null;
  grossFloorAreaSqm?: number | null;
  aboveGroundFloors?: number | null;
  elevatorCount?: number | null;
  efficiencyRatio?: number | null;
  buildingGrade?: string | null;
  hvacType?: string | null;
  buildingUse?: string | null;
  transportation?: Array<{ station_name?: string | null; line_name?: string | null; walk_minutes?: number | null }>;
  parking?: {
    total_spaces?: number | null;
    self_parking?: boolean | null;
    mechanical_parking?: boolean | null;
    ev_charging?: boolean | null;
  } | null;
  imageTypes?: string[];
};

export type PrimeScoreRecommendation = {
  location_score: number;
  transportation_score: number;
  building_quality_score: number;
  parking_score: number;
  amenities_score: number;
  corporate_image_score: number;
  employee_access_score: number;
  total_score: number;
  confidence: number;
  coverage: number;
  algorithm_version: string;
  reasons: Record<string, string[]>;
};

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(n)));
const mean = (xs: number[]) => Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100;

function districtBase(name?: string | null) {
  const n = (name ?? "").toLowerCase();
  if (!n) return 60;
  if (/광화문|종로|cbd/.test(n)) return 90;
  if (/강남|역삼|삼성|선릉|테헤란|gbd/.test(n)) return 88;
  if (/여의도|ybd/.test(n)) return 87;
  if (/용산/.test(n)) return 84;
  if (/판교/.test(n)) return 83;
  if (/성수/.test(n)) return 82;
  if (/마포/.test(n)) return 80;
  return 74;
}

function transportScore(items: PrimeScoreRecommendationInput["transportation"], reasons: string[]) {
  const valid = (items ?? []).filter((x) => x.station_name || x.line_name || x.walk_minutes != null);
  if (!valid.length) {
    reasons.push("교통 데이터가 부족해 중립값을 적용했습니다.");
    return 60;
  }
  const walks = valid.map((x) => x.walk_minutes).filter((v): v is number => typeof v === "number" && v >= 0);
  const minWalk = walks.length ? Math.min(...walks) : null;
  let score = 65;
  if (minWalk != null) {
    score = minWalk <= 3 ? 96 : minWalk <= 5 ? 91 : minWalk <= 7 ? 84 : minWalk <= 10 ? 74 : minWalk <= 15 ? 62 : 50;
    reasons.push(`가장 가까운 역 도보 ${minWalk}분 기준.`);
  }
  const stationCount = new Set(valid.map((x) => x.station_name).filter(Boolean)).size;
  const lineCount = new Set(valid.map((x) => x.line_name).filter(Boolean)).size;
  if (stationCount >= 2) { score += 5; reasons.push(`접근 가능한 역 ${stationCount}개.`); }
  if (lineCount >= 2) { score += 5; reasons.push(`이용 가능 노선 ${lineCount}개.`); }
  return clamp(score);
}

function gradeBonus(grade?: string | null) {
  const g = (grade ?? "").toUpperCase();
  if (!g) return 0;
  if (g.includes("PRIME") || g === "S") return 10;
  if (g.includes("A+")) return 9;
  if (g === "A" || g.includes("GRADE A")) return 7;
  if (g.includes("B+")) return 3;
  if (g === "B" || g.includes("GRADE B")) return 1;
  return 0;
}

export function calculatePrimeScoreRecommendation(input: PrimeScoreRecommendationInput): PrimeScoreRecommendation {
  const reasons: Record<string, string[]> = {
    location: [], transportation: [], building_quality: [], parking: [], amenities: [], corporate_image: [], employee_access: [],
  };

  const loc = districtBase(input.districtName);
  reasons.location.push(input.districtName ? `${input.districtName} 권역 기준.` : "권역 정보가 없어 중립값을 적용했습니다.");

  const transport = transportScore(input.transportation, reasons.transportation);

  const year = new Date().getFullYear();
  const age = input.completionYear ? Math.max(0, year - input.completionYear) : null;
  let quality = 60 + gradeBonus(input.buildingGrade);
  if (age != null) {
    quality += age <= 5 ? 18 : age <= 10 ? 14 : age <= 20 ? 8 : age <= 30 ? 2 : -5;
    reasons.building_quality.push(`준공 ${input.completionYear}년, 경과 ${age}년.`);
  } else reasons.building_quality.push("준공연도 미입력.");
  if (input.grossFloorAreaSqm) {
    quality += input.grossFloorAreaSqm >= 100000 ? 8 : input.grossFloorAreaSqm >= 50000 ? 6 : input.grossFloorAreaSqm >= 20000 ? 4 : 1;
    reasons.building_quality.push(`연면적 ${Math.round(input.grossFloorAreaSqm).toLocaleString()}㎡.`);
  }
  if (input.efficiencyRatio != null) {
    quality += input.efficiencyRatio >= 60 ? 5 : input.efficiencyRatio >= 50 ? 3 : 0;
    reasons.building_quality.push(`전용률 ${input.efficiencyRatio}%.`);
  }
  quality = clamp(quality);

  let parking = 58;
  const totalSpaces = input.parking?.total_spaces ?? null;
  if (totalSpaces != null && input.grossFloorAreaSqm) {
    const py = input.grossFloorAreaSqm / 3.3058;
    const spacesPer1000Py = py > 0 ? totalSpaces / (py / 1000) : 0;
    parking = spacesPer1000Py >= 30 ? 94 : spacesPer1000Py >= 22 ? 86 : spacesPer1000Py >= 16 ? 76 : spacesPer1000Py >= 10 ? 65 : 52;
    reasons.parking.push(`연면적 대비 1,000평당 약 ${spacesPer1000Py.toFixed(1)}대.`);
  } else if (totalSpaces != null) {
    parking = totalSpaces >= 500 ? 90 : totalSpaces >= 300 ? 82 : totalSpaces >= 150 ? 72 : totalSpaces >= 80 ? 64 : 55;
    reasons.parking.push(`총 주차 ${totalSpaces}대 기준.`);
  } else reasons.parking.push("주차 데이터가 부족해 중립값을 적용했습니다.");
  if (input.parking?.self_parking) parking += 4;
  if (input.parking?.ev_charging) parking += 3;
  parking = clamp(parking);

  let amenities = 55;
  if (input.hvacType) { amenities += 8; reasons.amenities.push(`냉난방 정보 확인: ${input.hvacType}.`); }
  if (input.parking?.ev_charging) { amenities += 5; reasons.amenities.push("EV 충전 지원."); }
  if (input.parking?.self_parking) { amenities += 4; reasons.amenities.push("자주식 주차 지원."); }
  const imageTypes = new Set(input.imageTypes ?? []);
  if (imageTypes.has("amenity")) { amenities += 8; reasons.amenities.push("편의시설 이미지 데이터 확인."); }
  if (imageTypes.has("lobby")) amenities += 3;
  if (!input.hvacType && !input.parking?.ev_charging && !imageTypes.has("amenity")) reasons.amenities.push("편의시설 데이터가 제한적이어서 보수적으로 추천했습니다.");
  amenities = clamp(amenities);

  let corp = 58 + gradeBonus(input.buildingGrade);
  if (input.grossFloorAreaSqm) corp += input.grossFloorAreaSqm >= 100000 ? 15 : input.grossFloorAreaSqm >= 50000 ? 11 : input.grossFloorAreaSqm >= 20000 ? 7 : 2;
  if (input.aboveGroundFloors) corp += input.aboveGroundFloors >= 30 ? 9 : input.aboveGroundFloors >= 20 ? 6 : input.aboveGroundFloors >= 12 ? 3 : 0;
  if (age != null && age <= 10) corp += 6;
  reasons.corporate_image.push("빌딩 등급·규모·층수·준공연도를 바탕으로 추천했습니다.");
  corp = clamp(corp);

  const employee = clamp(transport * 0.72 + parking * 0.13 + loc * 0.15);
  reasons.employee_access.push("대중교통 접근성 72%, 주차 13%, 권역 15%를 반영했습니다.");

  const scores = [loc, transport, quality, parking, amenities, corp, employee].map((v) => clamp(v));
  const availableFlags = [
    !!input.districtName,
    (input.transportation ?? []).some((x) => x.walk_minutes != null || x.station_name || x.line_name),
    input.completionYear != null,
    input.grossFloorAreaSqm != null,
    input.efficiencyRatio != null,
    totalSpaces != null,
    !!input.hvacType || imageTypes.has("amenity"),
    !!input.buildingGrade,
  ];
  const coverage = Math.round((availableFlags.filter(Boolean).length / availableFlags.length) * 100);
  const confidence = clamp(45 + coverage * 0.5, 45, 95);

  return {
    location_score: scores[0],
    transportation_score: scores[1],
    building_quality_score: scores[2],
    parking_score: scores[3],
    amenities_score: scores[4],
    corporate_image_score: scores[5],
    employee_access_score: scores[6],
    total_score: mean(scores),
    confidence,
    coverage,
    algorithm_version: "PRIME-SCORE-RULES-v1.0.0",
    reasons,
  };
}
