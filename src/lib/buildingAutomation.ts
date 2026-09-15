export type BuildingAutomationInput = {
  name?: string | null;
  road_address?: string | null;
  address?: string | null;
  completion_year?: number | null;
  gross_floor_area?: number | null;
  above_ground_floors?: number | null;
  basement_floors?: number | null;
  elevator_count?: number | null;
  efficiency_ratio?: number | null;
  data_last_verified_at?: string | null;
  district_id?: string | null;
  district_name?: string | null;
  parking_total?: number | null;
  transportation_count?: number;
  image_count?: number;
  active_listing_count?: number;
  score_status?: string | null;
  has_score_recommendation?: boolean;
};

export type BuildingReadiness = {
  score: number;
  ready: boolean;
  blockers: string[];
  warnings: string[];
  freshness: "fresh" | "aging" | "stale" | "unknown";
  freshnessLabel: string;
  daysSinceVerified: number | null;
};

function hasText(v?: string | null) {
  return Boolean(v && v.trim());
}

export function getBuildingReadiness(input: BuildingAutomationInput, now = new Date()): BuildingReadiness {
  let score = 0;
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (hasText(input.name)) score += 8;
  else blockers.push("건물명 미입력");

  const hasAddress = hasText(input.road_address) || hasText(input.address);
  if (hasAddress) score += 18;
  else blockers.push("주소 미입력");

  const hasDistrict = hasText(input.district_id) || hasText(input.district_name);
  if (hasDistrict) score += 14;
  else blockers.push("업무권역 미지정");

  const hasScale = (input.gross_floor_area != null && Number(input.gross_floor_area) > 0)
    || (input.above_ground_floors != null && input.above_ground_floors > 0);
  if (hasScale) score += 18;
  else blockers.push("건물 규모 정보 미입력");

  if (input.completion_year != null) score += 8;
  else warnings.push("준공연도 미입력");

  if (input.gross_floor_area != null && Number(input.gross_floor_area) > 0) score += 8;
  else warnings.push("연면적 미입력");

  if (input.above_ground_floors != null && input.above_ground_floors > 0) score += 6;
  else warnings.push("지상층수 미입력");

  if (input.basement_floors != null) score += 2;
  else warnings.push("지하층수 미입력");

  if (input.elevator_count != null && input.elevator_count > 0) score += 4;
  else warnings.push("엘리베이터 정보 미입력");

  if (input.efficiency_ratio != null && Number(input.efficiency_ratio) > 0) score += 4;
  else warnings.push("전용률 미입력");

  if (input.parking_total != null && input.parking_total > 0) score += 6;
  else warnings.push("주차대수 미입력");

  if ((input.transportation_count ?? 0) > 0) score += 4;
  else warnings.push("교통정보 미입력");

  if ((input.image_count ?? 0) > 0) score += 4;
  else warnings.push("대표 이미지 미등록");

  // 건물 공개와 '현재 공실 존재'는 분리합니다.
  // 공실 0건도 건물 DB로는 공개할 수 있어야 하므로 차단하지 않고 안내만 남깁니다.
  if ((input.active_listing_count ?? 0) > 0) score += 4;
  else warnings.push("현재 공개 공실 0건 · 건물정보만 공개 가능");

  if (input.score_status === "PUBLISHED") score += 4;
  else if (input.has_score_recommendation) {
    score += 2;
    warnings.push("Prime Score 추천값 검토 필요");
  } else warnings.push("Prime Score 추천 미생성");

  let freshness: BuildingReadiness["freshness"] = "unknown";
  let freshnessLabel = "확인일 없음";
  let daysSinceVerified: number | null = null;
  if (input.data_last_verified_at) {
    const verified = new Date(input.data_last_verified_at);
    if (!Number.isNaN(verified.getTime())) {
      daysSinceVerified = Math.max(0, Math.floor((now.getTime() - verified.getTime()) / 86400000));
      if (daysSinceVerified <= 60) { freshness = "fresh"; freshnessLabel = `${daysSinceVerified}일 전 확인`; score += 4; }
      else if (daysSinceVerified <= 120) { freshness = "aging"; freshnessLabel = `${daysSinceVerified}일 전 · 재확인 권장`; warnings.push("데이터 재확인 권장"); }
      else { freshness = "stale"; freshnessLabel = `${daysSinceVerified}일 전 · 재검수 필요`; warnings.push("데이터 재검수 필요"); }
    }
  } else {
    warnings.push("데이터 확인일 없음");
  }

  return {
    score: Math.min(100, score),
    ready: blockers.length === 0,
    blockers,
    warnings: Array.from(new Set(warnings)),
    freshness,
    freshnessLabel,
    daysSinceVerified,
  };
}
