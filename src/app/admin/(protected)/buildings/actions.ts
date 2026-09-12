"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { BuildingParking, BuildingScores, BuildingTransportation } from "@/lib/types";

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
    basement_floors: number | null;
    above_ground_floors: number | null;
    gross_floor_area: number | null;
    land_area: number | null;
    building_area: number | null;
    efficiency_ratio: number | null;
    elevator_count: number | null;
    freight_elevator_count: number | null;
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

export async function createBuilding(
  payload: BuildingFormPayload
): Promise<{ error?: string; id?: string }> {
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
      completion_year: payload.info.completion_year,
      basement_floors: payload.info.basement_floors,
      above_ground_floors: payload.info.above_ground_floors,
      gross_floor_area: payload.info.gross_floor_area,
      land_area: payload.info.land_area,
      building_area: payload.info.building_area,
      efficiency_ratio: payload.info.efficiency_ratio,
      elevator_count: payload.info.elevator_count,
      freight_elevator_count: payload.info.freight_elevator_count,
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
      parking_total: payload.parking.total_spaces,
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
      completion_year: payload.info.completion_year,
      basement_floors: payload.info.basement_floors,
      above_ground_floors: payload.info.above_ground_floors,
      gross_floor_area: payload.info.gross_floor_area,
      land_area: payload.info.land_area,
      building_area: payload.info.building_area,
      efficiency_ratio: payload.info.efficiency_ratio,
      elevator_count: payload.info.elevator_count,
      freight_elevator_count: payload.info.freight_elevator_count,
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
      parking_total: payload.parking.total_spaces,
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
      description: payload.parking.description || null,
    },
    { onConflict: "building_id" }
  );

  // Prime Score upsert (total_score는 DB 트리거가 자동 계산)
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

export async function deleteBuilding(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("buildings").delete().eq("id", id);
  if (error) {
    return { error: error.message };
  }
  revalidatePath("/admin/buildings");
  revalidatePath("/admin");
  return {};
}
