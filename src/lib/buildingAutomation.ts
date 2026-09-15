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

  if (hasText(input.name)) score += 5;
  const hasAddress = hasText(input.road_address) || hasText(input.address);
  if (hasAddress) score += 15; else blockers.push("주소 미입력");

  if (input.completion_year != null) score += 10; else blockers.push("준공연도 미입력");
  if (input.gross_floor_area != null && Number(input.gross_floor_area) > 0) score += 15; else blockers.push("연면적 미입력");
  if (input.above_ground_floors != null && input.above_ground_floors > 0) score += 10; else blockers.push("지상층수 미입력");

  if (input.basement_floors != null) score += 3; else warnings.push("지하층수 미입력");
  if (input.elevator_count != null && input.elevator_count > 0) score += 5; else warnings.push("엘리베이터 정보 미입력");
  if (input.efficiency_ratio != null && Number(input.efficiency_ratio) > 0) score += 5; else warnings.push("전용률 미입력");

  if (input.parking_total != null && input.parking_total > 0) score += 10; else blockers.push("주차대수 미입력");
  if ((input.transportation_count ?? 0) > 0) score += 7; else warnings.push("교통정보 미입력");
  if ((input.image_count ?? 0) > 0) score += 5; else warnings.push("대표 이미지 미등록");
  if ((input.active_listing_count ?? 0) > 0) score += 10; else blockers.push("공개 가능한 공실 없음");

  if (input.score_status === "PUBLISHED") score += 5;
  else if (input.has_score_recommendation) { score += 3; warnings.push("Prime Score 추천값 검토 필요"); }
  else warnings.push("Prime Score 추천 미생성");

  let freshness: BuildingReadiness["freshness"] = "unknown";
  let freshnessLabel = "확인일 없음";
  let daysSinceVerified: number | null = null;
  if (input.data_last_verified_at) {
    const verified = new Date(input.data_last_verified_at);
    if (!Number.isNaN(verified.getTime())) {
      daysSinceVerified = Math.max(0, Math.floor((now.getTime() - verified.getTime()) / 86400000));
      if (daysSinceVerified <= 60) { freshness = "fresh"; freshnessLabel = `${daysSinceVerified}일 전 확인`; }
      else if (daysSinceVerified <= 120) { freshness = "aging"; freshnessLabel = `${daysSinceVerified}일 전 · 재확인 권장`; }
      else { freshness = "stale"; freshnessLabel = `${daysSinceVerified}일 전 · 재검수 필요`; }
    }
  }

  return {
    score: Math.min(100, score),
    ready: blockers.length === 0,
    blockers,
    warnings,
    freshness,
    freshnessLabel,
    daysSinceVerified,
  };
}
