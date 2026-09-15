import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import BuildingPublishManager from "@/components/admin/BuildingPublishManager";
import { getBuildingReadiness } from "@/lib/buildingAutomation";

const FILTERS = [
  { key: "active", label: "정상" },
  { key: "deleted", label: "삭제됨" },
  { key: "all", label: "전체" },
] as const;

export default async function AdminBuildingsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter: rawFilter } = await searchParams;
  const filter = (["active", "deleted", "all"] as const).includes(rawFilter as "active" | "deleted" | "all")
    ? (rawFilter as "active" | "deleted" | "all")
    : "active";

  const supabase = await createClient();

  let query = supabase
    .from("buildings")
    .select("id, name, status, is_published, district_id, completion_year, gross_floor_area, above_ground_floors, basement_floors, elevator_count, efficiency_ratio, road_address, address, data_last_verified_at, created_at, deleted_at, districts(name)")
    .order("created_at", { ascending: false });

  if (filter === "active") query = query.is("deleted_at", null);
  else if (filter === "deleted") query = query.not("deleted_at", "is", null);

  const { data: buildings, error } = await query;
  const ids = (buildings ?? []).map((b) => b.id);

  const [parkingRes, transportRes, imagesRes, listingsRes, scoresRes, recsRes] = ids.length
    ? await Promise.all([
        supabase.from("building_parking").select("building_id,total_spaces").in("building_id", ids),
        supabase.from("building_transportation").select("building_id").in("building_id", ids),
        supabase.from("building_images").select("building_id").in("building_id", ids),
        supabase.from("listings").select("building_id").in("building_id", ids).in("status", ["available", "negotiating", "contracting"]),
        supabase.from("building_scores").select("building_id,status").in("building_id", ids),
        supabase.from("prime_score_recommendations").select("building_id").in("building_id", ids),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }] as any;

  const parking = new Map((parkingRes.data ?? []).map((x: any) => [x.building_id, x.total_spaces]));
  const transportCount = new Map<string, number>();
  for (const x of transportRes.data ?? []) transportCount.set(x.building_id, (transportCount.get(x.building_id) ?? 0) + 1);
  const imageCount = new Map<string, number>();
  for (const x of imagesRes.data ?? []) imageCount.set(x.building_id, (imageCount.get(x.building_id) ?? 0) + 1);
  const listingCount = new Map<string, number>();
  for (const x of listingsRes.data ?? []) listingCount.set(x.building_id, (listingCount.get(x.building_id) ?? 0) + 1);
  const scoreStatus = new Map((scoresRes.data ?? []).map((x: any) => [x.building_id, x.status]));
  const recommendationIds = new Set((recsRes.data ?? []).map((x: any) => x.building_id));

  const rows = (buildings ?? []).map((b) => {
    const readiness = getBuildingReadiness({
      name: b.name,
      road_address: b.road_address,
      address: b.address,
      completion_year: b.completion_year,
      gross_floor_area: b.gross_floor_area == null ? null : Number(b.gross_floor_area),
      above_ground_floors: b.above_ground_floors,
      basement_floors: b.basement_floors,
      elevator_count: b.elevator_count,
      efficiency_ratio: b.efficiency_ratio == null ? null : Number(b.efficiency_ratio),
      data_last_verified_at: b.data_last_verified_at,
      district_id: b.district_id,
      district_name: (b.districts as unknown as { name: string } | null)?.name ?? null,
      parking_total: parking.get(b.id) ?? null,
      transportation_count: transportCount.get(b.id) ?? 0,
      image_count: imageCount.get(b.id) ?? 0,
      active_listing_count: listingCount.get(b.id) ?? 0,
      score_status: scoreStatus.get(b.id) ?? null,
      has_score_recommendation: recommendationIds.has(b.id),
    });
    return {
      id: b.id,
      name: b.name,
      status: b.status,
      is_published: b.is_published,
      completion_year: b.completion_year,
      created_at: b.created_at,
      deleted_at: b.deleted_at,
      district_name: (b.districts as unknown as { name: string } | null)?.name ?? "",
      readiness_score: readiness.score,
      ready_to_publish: readiness.ready,
      blockers: readiness.blockers,
      warnings: readiness.warnings,
      freshness: readiness.freshness,
      freshness_label: readiness.freshnessLabel,
      has_score_recommendation: recommendationIds.has(b.id),
      score_status: scoreStatus.get(b.id) ?? null,
      active_listing_count: listingCount.get(b.id) ?? 0,
    };
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl">건물 관리</h1>
          <p className="mt-1 text-xs text-silver">공개 준비도·데이터 최신성·Prime Score 추천 상태까지 자동 점검합니다.</p>
        </div>
        <Link href="/admin/buildings/new" className="text-sm bg-navy text-white px-4 py-2 hover:bg-charcoal transition-colors">+ 건물 등록</Link>
      </div>

      <div className="flex gap-2 mb-5">
        {FILTERS.map((f) => (
          <Link key={f.key} href={f.key === "active" ? "/admin/buildings" : `/admin/buildings?filter=${f.key}`} className={`text-xs px-3 py-1.5 border transition-colors ${filter === f.key ? "bg-navy text-white border-navy" : "border-silver/40 text-silver hover:text-charcoal"}`}>{f.label}</Link>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 mb-4">건물 목록을 불러오지 못했습니다: {error.message}</p>}
      <BuildingPublishManager buildings={rows} />
    </div>
  );
}
