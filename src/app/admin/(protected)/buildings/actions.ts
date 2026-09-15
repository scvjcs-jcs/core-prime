"use server";

import { getBuildingReadiness } from "@/lib/buildingAutomation";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { BuildingParking, BuildingScores, BuildingTransportation } from "@/lib/types";
import { normalizeBuildingName } from "@/lib/normalizeBuildingName";
import { calculatePrimeScoreRecommendation } from "@/lib/primeScoreRecommendation";

export type BuildingFormPayload = {
  basic: {
    name: string;
    name_en: string;
    alias: string;
    building_code: string;
    district_id: string;
    slug: string;
  };
  info: {
    completion_year: number | null;
    completion_month: number | null;
    basement_floors: number | null;
    above_ground_floors: number | null;
    gross_floor_area: number | null;
    land_area: number | null;
    building_area: number | null;
    efficiency_ratio: number | null;
    elevator_count: number | null;
    elevator_detail: string;
    freight_elevator_count: number | null;
    typical_floor_leasable_area_sqm: number | null;
    typical_floor_leasable_area_py: number | null;
    typical_floor_exclusive_area_sqm: number | null;
    typical_floor_exclusive_area_py: number | null;
    building_use: string;
    hvac_type: string;
    hvac_hours: string;
    building_grade: string;
  };
  location: {
    address: string;
    road_address: string;
    jibun_address: string;
    postal_code: string;
    latitude: number | null;
    longitude: number | null;
  };
  transportation: BuildingTransportation[];
  parking: Omit<BuildingParking, "building_id">;
  scores: Omit<BuildingScores, "building_id" | "total_score">;
  publish: {
    status: string;
    is_published: boolean;
    is_featured: boolean;
    meta_title: string;
    meta_description: string;
  };
};

function slugify(input: string): string {
  // 한글이 슬러그(URL 주소)에 들어가면 일부 환경에서 건물 상세페이지가
  // 404로 뜨는 문제가 있어, 영문/숫자만 남기고 한글은 제거합니다.
  // (건물명 자체는 그대로 표시되고, 한글이 사라지는 건 주소창의 영문 부분뿐입니다.)
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  const random = Math.random().toString(36).slice(2, 7);
  return base ? `${base}-${random}` : `building-${random}`;
}

// 관리자가 URL 슬러그를 직접 입력한 경우에도 한글/특수문자가 섞이면 상세페이지가
// 404로 뜨는 문제가 있어, 영문/숫자/하이픈만 남기고 나머지는 제거합니다.
function sanitizeManualSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Prime Score를 '공개(PUBLISHED)'로 설정하려면 7개 세부 점수가 모두 입력되어 있어야 합니다.
// (일부만 입력된 상태로 고객에게 노출되는 것을 막기 위한 검증입니다.)
function validateScoresForPublish(scores: BuildingFormPayload["scores"]): string | null {
  if (scores.status !== "PUBLISHED") return null;
  const required = [
    scores.location_score,
    scores.transportation_score,
    scores.building_quality_score,
    scores.parking_score,
    scores.amenities_score,
    scores.corporate_image_score,
    scores.employee_access_score,
  ];
  if (required.some((v) => v === null || v === undefined)) {
    return "Prime Score를 '공개'로 설정하려면 [Prime Score] 탭의 7개 세부 점수를 모두 입력해야 합니다.";
  }
  return null;
}

export async function createBuilding(
  payload: BuildingFormPayload
): Promise<{ error?: string; id?: string }> {
  const scoreError = validateScoresForPublish(payload.scores);
  if (scoreError) return { error: scoreError };

  const supabase = await createClient();

  const manualSlug = sanitizeManualSlug(payload.basic.slug ?? "");
  const slug = manualSlug || slugify(payload.basic.name_en || payload.basic.name);

  const { data: building, error } = await supabase
    .from("buildings")
    .insert({
      name: payload.basic.name,
      name_en: payload.basic.name_en || null,
      alias: payload.basic.alias || null,
      building_code: payload.basic.building_code || null,
      district_id: payload.basic.district_id || null,
      slug,
      // 건물명 기반 정규화 이름 — 나중에 PDF Import가 같은 건물인지 매칭할 때 사용합니다.
      normalized_name: normalizeBuildingName(payload.basic.name),
      completion_year: payload.info.completion_year,
      completion_month: payload.info.completion_month,
      basement_floors: payload.info.basement_floors,
      above_ground_floors: payload.info.above_ground_floors,
      gross_floor_area: payload.info.gross_floor_area,
      land_area: payload.info.land_area,
      building_area: payload.info.building_area,
      efficiency_ratio: payload.info.efficiency_ratio,
      elevator_count: payload.info.elevator_count,
      elevator_detail: payload.info.elevator_detail || null,
      freight_elevator_count: payload.info.freight_elevator_count,
      typical_floor_leasable_area_sqm: payload.info.typical_floor_leasable_area_sqm,
      typical_floor_leasable_area_py: payload.info.typical_floor_leasable_area_py,
      typical_floor_exclusive_area_sqm: payload.info.typical_floor_exclusive_area_sqm,
      typical_floor_exclusive_area_py: payload.info.typical_floor_exclusive_area_py,
      building_use: payload.info.building_use || null,
      hvac_type: payload.info.hvac_type || null,
      hvac_hours: payload.info.hvac_hours || null,
      building_grade: payload.info.building_grade || null,
      address: payload.location.address || null,
      road_address: payload.location.road_address || null,
      jibun_address: payload.location.jibun_address || null,
      postal_code: payload.location.postal_code || null,
      latitude: payload.location.latitude,
      longitude: payload.location.longitude,
      // 주차 대수는 building_parking.total_spaces가 기준값(source of truth)입니다.
      // buildings.parking_total 컬럼은 중복 저장을 막기 위해 더 이상 여기서 쓰지 않습니다
      // (컬럼 자체는 남겨두되, 제거 여부는 추후 별도 검토).
      status: payload.publish.status || "active",
      is_published: payload.publish.is_published,
      is_featured: payload.publish.is_featured,
      meta_title: payload.publish.meta_title || null,
      meta_description: payload.publish.meta_description || null,
    })
    .select("id")
    .single();

  if (error || !building) {
    return { error: error?.message || "건물 등록 중 오류가 발생했습니다." };
  }

  await saveRelatedTables(payload, building.id);

  revalidatePath("/admin/buildings");
  revalidatePath("/admin");
  return { id: building.id };
}

export async function updateBuilding(
  id: string,
  payload: BuildingFormPayload
): Promise<{ error?: string }> {
  const scoreError = validateScoresForPublish(payload.scores);
  if (scoreError) return { error: scoreError };

  const supabase = await createClient();

  const { error } = await supabase
    .from("buildings")
    .update({
      name: payload.basic.name,
      name_en: payload.basic.name_en || null,
      alias: payload.basic.alias || null,
      building_code: payload.basic.building_code || null,
      district_id: payload.basic.district_id || null,
      slug: sanitizeManualSlug(payload.basic.slug ?? "") || undefined,
      normalized_name: normalizeBuildingName(payload.basic.name),
      completion_year: payload.info.completion_year,
      completion_month: payload.info.completion_month,
      basement_floors: payload.info.basement_floors,
      above_ground_floors: payload.info.above_ground_floors,
      gross_floor_area: payload.info.gross_floor_area,
      land_area: payload.info.land_area,
      building_area: payload.info.building_area,
      efficiency_ratio: payload.info.efficiency_ratio,
      elevator_count: payload.info.elevator_count,
      elevator_detail: payload.info.elevator_detail || null,
      freight_elevator_count: payload.info.freight_elevator_count,
      typical_floor_leasable_area_sqm: payload.info.typical_floor_leasable_area_sqm,
      typical_floor_leasable_area_py: payload.info.typical_floor_leasable_area_py,
      typical_floor_exclusive_area_sqm: payload.info.typical_floor_exclusive_area_sqm,
      typical_floor_exclusive_area_py: payload.info.typical_floor_exclusive_area_py,
      building_use: payload.info.building_use || null,
      hvac_type: payload.info.hvac_type || null,
      hvac_hours: payload.info.hvac_hours || null,
      building_grade: payload.info.building_grade || null,
      address: payload.location.address || null,
      road_address: payload.location.road_address || null,
      jibun_address: payload.location.jibun_address || null,
      postal_code: payload.location.postal_code || null,
      latitude: payload.location.latitude,
      longitude: payload.location.longitude,
      // buildings.parking_total은 더 이상 여기서 갱신하지 않습니다 (주차 대수 기준값 = building_parking.total_spaces).
      status: payload.publish.status || "active",
      is_published: payload.publish.is_published,
      is_featured: payload.publish.is_featured,
      meta_title: payload.publish.meta_title || null,
      meta_description: payload.publish.meta_description || null,
    })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  await saveRelatedTables(payload, id);

  revalidatePath("/admin/buildings");
  revalidatePath(`/admin/buildings/${id}`);
  revalidatePath("/admin");
  return {};
}

async function saveRelatedTables(payload: BuildingFormPayload, buildingId: string) {
  const supabase = await createClient();

  // 주차 정보 upsert
  await supabase.from("building_parking").upsert(
    {
      building_id: buildingId,
      total_spaces: payload.parking.total_spaces,
      tenant_default_spaces: payload.parking.tenant_default_spaces,
      visitor_spaces: payload.parking.visitor_spaces,
      monthly_fee: payload.parking.monthly_fee,
      additional_fee: payload.parking.additional_fee,
      self_parking: payload.parking.self_parking,
      mechanical_parking: payload.parking.mechanical_parking,
      ev_charging: payload.parking.ev_charging,
      operating_hours: payload.parking.operating_hours || null,
      free_parking_text: payload.parking.free_parking_text || null,
      paid_parking_text: payload.parking.paid_parking_text || null,
      description: payload.parking.description || null,
    },
    { onConflict: "building_id" }
  );

  // Prime Score upsert (total_score는 DB 트리거가 자동 계산 — 세부 점수 중 하나라도 NULL이면
  // total_score도 자동으로 NULL이 됩니다. 여기서 NULL을 그대로 넘기는 것이 "미입력" 의미입니다.)
  await supabase.from("building_scores").upsert(
    {
      building_id: buildingId,
      location_score: payload.scores.location_score,
      transportation_score: payload.scores.transportation_score,
      building_quality_score: payload.scores.building_quality_score,
      parking_score: payload.scores.parking_score,
      amenities_score: payload.scores.amenities_score,
      corporate_image_score: payload.scores.corporate_image_score,
      employee_access_score: payload.scores.employee_access_score,
      status: payload.scores.status,
    },
    { onConflict: "building_id" }
  );

  // 교통 정보: 기존 것 삭제 후 다시 저장 (가장 단순하고 안전한 방식)
  await supabase.from("building_transportation").delete().eq("building_id", buildingId);
  const transportRows = payload.transportation
    .filter((t) => t.station_name || t.line_name)
    .map((t) => ({
      building_id: buildingId,
      transport_type: t.transport_type || null,
      line_name: t.line_name || null,
      station_name: t.station_name || null,
      walk_minutes: t.walk_minutes,
      description: t.description || null,
    }));
  if (transportRows.length > 0) {
    await supabase.from("building_transportation").insert(transportRows);
  }
}

// 건물 삭제 = Soft Delete(보관). 실제 DELETE는 하지 않습니다.
// 연결된 매물/사진/Prime Score/제안서 기록이 함께 사라지는 것을 막기 위한 조치입니다.
export async function deleteBuilding(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("buildings")
    .update({ deleted_at: new Date().toISOString(), is_published: false })
    .eq("id", id);
  if (error) {
    return { error: error.message };
  }
  revalidatePath("/admin/buildings");
  revalidatePath("/admin");
  return {};
}

// 삭제(보관)된 건물을 복구합니다. 홈페이지 공개 여부(is_published)는 복구 시 자동으로
// 다시 켜지 않습니다 — 관리자가 확인 후 직접 공개 여부를 정하도록 합니다.
export async function restoreBuilding(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("buildings")
    .update({ deleted_at: null })
    .eq("id", id);
  if (error) {
    return { error: error.message };
  }
  revalidatePath("/admin/buildings");
  revalidatePath("/admin");
  return {};
}

// "오늘 날짜로 확인 완료" — 관리자가 건물 정보를 직접 눈으로 확인했다는 시각을 남깁니다.
// 나중에 PDF Import가 들어오면 이 값은 자동으로 갱신됩니다.
export async function markBuildingVerifiedNow(id: string): Promise<{ error?: string; verifiedAt?: string }> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("buildings")
    .update({ data_last_verified_at: now })
    .eq("id", id);
  if (error) {
    return { error: error.message };
  }
  revalidatePath(`/admin/buildings/${id}`);
  return { verifiedAt: now };
}


export async function generatePrimeScoreRecommendation(buildingId: string): Promise<{
  error?: string;
  recommendation?: ReturnType<typeof calculatePrimeScoreRecommendation>;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { data: admin } = await supabase
    .from("admins")
    .select("id,is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (!admin?.is_active) return { error: "관리자 권한이 필요합니다." };

  const [buildingRes, transportRes, parkingRes, imagesRes] = await Promise.all([
    supabase
      .from("buildings")
      .select("id,name,district_id,completion_year,gross_floor_area,above_ground_floors,elevator_count,efficiency_ratio,building_grade,hvac_type,building_use,districts(name)")
      .eq("id", buildingId)
      .maybeSingle(),
    supabase
      .from("building_transportation")
      .select("station_name,line_name,walk_minutes")
      .eq("building_id", buildingId),
    supabase
      .from("building_parking")
      .select("total_spaces,self_parking,mechanical_parking,ev_charging")
      .eq("building_id", buildingId)
      .maybeSingle(),
    supabase
      .from("building_images")
      .select("type")
      .eq("building_id", buildingId),
  ]);

  if (buildingRes.error) return { error: buildingRes.error.message };
  if (!buildingRes.data) return { error: "건물을 찾을 수 없습니다." };
  if (transportRes.error) return { error: transportRes.error.message };
  if (parkingRes.error) return { error: parkingRes.error.message };
  if (imagesRes.error) return { error: imagesRes.error.message };

  const districtRel = buildingRes.data.districts as unknown as { name?: string | null } | { name?: string | null }[] | null;
  const districtName = Array.isArray(districtRel) ? districtRel[0]?.name ?? null : districtRel?.name ?? null;

  const input = {
    districtName,
    completionYear: buildingRes.data.completion_year,
    grossFloorAreaSqm: buildingRes.data.gross_floor_area == null ? null : Number(buildingRes.data.gross_floor_area),
    aboveGroundFloors: buildingRes.data.above_ground_floors,
    elevatorCount: buildingRes.data.elevator_count,
    efficiencyRatio: buildingRes.data.efficiency_ratio == null ? null : Number(buildingRes.data.efficiency_ratio),
    buildingGrade: buildingRes.data.building_grade,
    hvacType: buildingRes.data.hvac_type,
    buildingUse: buildingRes.data.building_use,
    transportation: transportRes.data ?? [],
    parking: parkingRes.data ?? null,
    imageTypes: (imagesRes.data ?? []).map((x: { type: string | null }) => x.type).filter((v: string | null): v is string => Boolean(v)),
  };

  const recommendation = calculatePrimeScoreRecommendation(input);
  const { error: saveError } = await supabase
    .from("prime_score_recommendations")
    .upsert({
      building_id: buildingId,
      location_score: recommendation.location_score,
      transportation_score: recommendation.transportation_score,
      building_quality_score: recommendation.building_quality_score,
      parking_score: recommendation.parking_score,
      amenities_score: recommendation.amenities_score,
      corporate_image_score: recommendation.corporate_image_score,
      employee_access_score: recommendation.employee_access_score,
      total_score: recommendation.total_score,
      confidence: recommendation.confidence,
      coverage: recommendation.coverage,
      algorithm_version: recommendation.algorithm_version,
      reasons: recommendation.reasons,
      inputs_snapshot: input,
      generated_by: user.id,
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "building_id" });

  if (saveError) return { error: saveError.message };
  revalidatePath(`/admin/buildings/${buildingId}`);
  return { recommendation };
}

// v1.13 — 건물 공개/비공개 일괄 변경
// 관리자 건물 목록에서 검수가 끝난 건물을 선택하여 한 번에 고객 사이트에 공개하거나
// 다시 비공개로 전환할 때 사용합니다. Soft-deleted 건물은 항상 제외합니다.
export async function bulkSetBuildingPublished(
  buildingIds: string[],
  isPublished: boolean
): Promise<{ error?: string; updated?: number }> {
  const ids = Array.from(new Set((buildingIds ?? []).filter(Boolean)));
  if (ids.length === 0) return { error: "선택된 건물이 없습니다." };
  if (ids.length > 500) return { error: "한 번에 최대 500개 건물까지 변경할 수 있습니다." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { data: admin } = await supabase
    .from("admins")
    .select("id,is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (!admin?.is_active) return { error: "관리자 권한이 필요합니다." };

  // 대상이 실제 존재하고 삭제 상태가 아닌지 먼저 확인합니다.
  const { data: eligible, error: eligibleError } = await supabase
    .from("buildings")
    .select("id")
    .in("id", ids)
    .is("deleted_at", null);

  if (eligibleError) return { error: eligibleError.message };
  const eligibleIds = (eligible ?? []).map((row) => row.id);
  if (eligibleIds.length === 0) {
    return { error: "변경 가능한 정상 건물이 없습니다. 삭제된 건물은 공개할 수 없습니다." };
  }

  const { data: updatedRows, error } = await supabase
    .from("buildings")
    .update({ is_published: isPublished })
    .in("id", eligibleIds)
    .is("deleted_at", null)
    .select("id");

  if (error) return { error: error.message };

  // 가능하면 공개/비공개 변경 이력을 남깁니다. audit_logs 스키마 차이로 실패해도 본 변경은 유지합니다.
  try {
    await supabase.from("audit_logs").insert({
      action: isPublished ? "BULK_PUBLISH_BUILDINGS" : "BULK_UNPUBLISH_BUILDINGS",
      entity_type: "buildings",
      entity_id: null,
      metadata: {
        building_ids: eligibleIds,
        requested_count: ids.length,
        updated_count: updatedRows?.length ?? eligibleIds.length,
      },
      actor_id: user.id,
    });
  } catch {
    // audit_logs 컬럼 구성이 다른 운영 DB에서도 공개상태 변경 자체는 실패시키지 않습니다.
  }

  revalidatePath("/admin/buildings");
  revalidatePath("/buildings");
  revalidatePath("/");
  revalidatePath("/admin");

  return { updated: updatedRows?.length ?? eligibleIds.length };
}


// v1.15 — 선택 건물 Prime Score 추천 일괄 생성
// 공식 점수(building_scores)는 변경하지 않고 recommendation만 생성합니다.
export async function bulkGeneratePrimeScoreRecommendations(
  buildingIds: string[]
): Promise<{ error?: string; generated?: number; failed?: number; messages?: string[] }> {
  const ids = Array.from(new Set((buildingIds ?? []).filter(Boolean))).slice(0, 50);
  if (ids.length === 0) return { error: "추천점수를 생성할 건물을 선택해 주세요." };

  let generated = 0;
  let failed = 0;
  const messages: string[] = [];
  for (const id of ids) {
    const result = await generatePrimeScoreRecommendation(id);
    if (result.error) {
      failed += 1;
      if (messages.length < 5) messages.push(result.error);
    } else generated += 1;
  }
  revalidatePath("/admin/buildings");
  revalidatePath("/admin");
  return { generated, failed, messages };
}

// v1.22.1 — 공개 준비 완료 건물만 서버에서 다시 검증한 뒤 공개합니다.
// 공개 필수 기준은 고객이 건물을 식별/검색/비교할 수 있는 최소 정보로 제한합니다.
// 필수: 건물명, 주소, 업무권역, 기본 규모(연면적 또는 지상층수).
// 준공/주차/교통/이미지/Prime Score/현재 공실은 공개 품질 경고로 관리하되 건물 공개 자체를 막지 않습니다.
export async function bulkPublishReadyBuildings(
  buildingIds: string[]
): Promise<{ error?: string; published?: number; blocked?: number; blockedNames?: string[] }> {
  const ids = Array.from(new Set((buildingIds ?? []).filter(Boolean))).slice(0, 500);
  if (ids.length === 0) return { error: "건물을 선택해 주세요." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };
  const { data: admin } = await supabase.from("admins").select("id,is_active").eq("id", user.id).maybeSingle();
  if (!admin?.is_active) return { error: "관리자 권한이 필요합니다." };

  const [buildingRes, parkingRes, transportRes, imagesRes, listingsRes, scoresRes, recsRes] = await Promise.all([
    supabase.from("buildings").select("id,name,district_id,road_address,address,completion_year,gross_floor_area,above_ground_floors,basement_floors,elevator_count,efficiency_ratio,data_last_verified_at,deleted_at,districts(name)").in("id", ids),
    supabase.from("building_parking").select("building_id,total_spaces").in("building_id", ids),
    supabase.from("building_transportation").select("building_id").in("building_id", ids),
    supabase.from("building_images").select("building_id").in("building_id", ids),
    supabase.from("listings").select("building_id").in("building_id", ids).in("status", ["available", "negotiating", "contracting"]),
    supabase.from("building_scores").select("building_id,status").in("building_id", ids),
    supabase.from("prime_score_recommendations").select("building_id").in("building_id", ids),
  ]);
  if (buildingRes.error) return { error: buildingRes.error.message };

  const parking = new Map<string, number | null>((parkingRes.data ?? []).map((x: any) => [x.building_id, x.total_spaces]));
  const transportCount = new Map<string, number>();
  for (const x of transportRes.data ?? []) transportCount.set(x.building_id, (transportCount.get(x.building_id) ?? 0) + 1);
  const imageCount = new Map<string, number>();
  for (const x of imagesRes.data ?? []) imageCount.set(x.building_id, (imageCount.get(x.building_id) ?? 0) + 1);
  const listingCount = new Map<string, number>();
  for (const x of listingsRes.data ?? []) listingCount.set(x.building_id, (listingCount.get(x.building_id) ?? 0) + 1);
  const scoreStatus = new Map((scoresRes.data ?? []).map((x: any) => [x.building_id, x.status]));
  const recommendationIds = new Set((recsRes.data ?? []).map((x: any) => x.building_id));

  const readyIds: string[] = [];
  const blockedNames: string[] = [];
  for (const b of buildingRes.data ?? []) {
    if (b.deleted_at) continue;
    const districtRel = b.districts as unknown as { name?: string | null } | { name?: string | null }[] | null;
    const districtName = Array.isArray(districtRel) ? districtRel[0]?.name ?? null : districtRel?.name ?? null;
    const readiness = getBuildingReadiness({
      name: b.name,
      road_address: b.road_address,
      address: b.address,
      district_id: b.district_id,
      district_name: districtName,
      completion_year: b.completion_year,
      gross_floor_area: b.gross_floor_area == null ? null : Number(b.gross_floor_area),
      above_ground_floors: b.above_ground_floors,
      basement_floors: b.basement_floors,
      elevator_count: b.elevator_count,
      efficiency_ratio: b.efficiency_ratio == null ? null : Number(b.efficiency_ratio),
      data_last_verified_at: b.data_last_verified_at,
      parking_total: parking.get(b.id) ?? null,
      transportation_count: transportCount.get(b.id) ?? 0,
      image_count: imageCount.get(b.id) ?? 0,
      active_listing_count: listingCount.get(b.id) ?? 0,
      score_status: scoreStatus.get(b.id) ?? null,
      has_score_recommendation: recommendationIds.has(b.id),
    });
    if (readiness.ready) readyIds.push(b.id);
    else if (blockedNames.length < 20) blockedNames.push(`${b.name ?? b.id} (${readiness.blockers.join(", ")})`);
  }

  if (readyIds.length > 0) {
    const { error } = await supabase.from("buildings").update({ is_published: true }).in("id", readyIds).is("deleted_at", null);
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/buildings");
  revalidatePath("/buildings");
  revalidatePath("/");
  revalidatePath("/admin");
  return { published: readyIds.length, blocked: ids.length - readyIds.length, blockedNames };
}
