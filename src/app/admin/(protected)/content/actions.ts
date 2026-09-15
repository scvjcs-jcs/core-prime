"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { buildNaverBlogPackage, type BlogBuildingFacts, type BlogTemplateKey, type NaverBlogPackage } from "@/lib/blogContent";

async function loadBuildingFacts(buildingId: string): Promise<BlogBuildingFacts | null> {
  const supabase = await createClient();
  const [buildingRes, parkingRes, transportRes, scoreRes, listingRes] = await Promise.all([
    supabase.from("buildings").select("id,name,road_address,address,building_grade,completion_year,completion_month,basement_floors,above_ground_floors,gross_floor_area,efficiency_ratio,elevator_count,typical_floor_leasable_area_py,typical_floor_exclusive_area_py,data_last_verified_at,districts(name)").eq("id", buildingId).maybeSingle(),
    supabase.from("building_parking").select("total_spaces,free_parking_text,paid_parking_text").eq("building_id", buildingId).maybeSingle(),
    supabase.from("building_transportation").select("line_name,station_name,walk_minutes,description").eq("building_id", buildingId),
    supabase.from("building_scores").select("total_score,status").eq("building_id", buildingId).maybeSingle(),
    supabase.from("listings").select("floor,gross_area_py,exclusive_area_py,rent_per_py,maintenance_per_py,deposit_total_won,monthly_rent_total_won,management_fee_total_won,move_in_text,status,is_published").eq("building_id", buildingId).eq("is_published", true).in("status", ["available", "negotiating", "contracting"]),
  ]);
  const b: any = buildingRes.data;
  if (!b) return null;
  const p: any = parkingRes.data;
  const score: any = scoreRes.data;
  return {
    id: b.id,
    name: b.name,
    districtName: b.districts?.name ?? null,
    roadAddress: b.road_address ?? null,
    address: b.address ?? null,
    buildingGrade: b.building_grade ?? null,
    completionYear: b.completion_year ?? null,
    completionMonth: b.completion_month ?? null,
    basementFloors: b.basement_floors ?? null,
    aboveGroundFloors: b.above_ground_floors ?? null,
    grossFloorArea: b.gross_floor_area == null ? null : Number(b.gross_floor_area),
    efficiencyRatio: b.efficiency_ratio == null ? null : Number(b.efficiency_ratio),
    elevatorCount: b.elevator_count ?? null,
    typicalFloorLeasablePy: b.typical_floor_leasable_area_py == null ? null : Number(b.typical_floor_leasable_area_py),
    typicalFloorExclusivePy: b.typical_floor_exclusive_area_py == null ? null : Number(b.typical_floor_exclusive_area_py),
    dataLastVerifiedAt: b.data_last_verified_at ?? null,
    parkingTotal: p?.total_spaces ?? null,
    freeParkingText: p?.free_parking_text ?? null,
    paidParkingText: p?.paid_parking_text ?? null,
    transportation: (transportRes.data ?? []).map((t: any) => ({ lineName: t.line_name, stationName: t.station_name, walkMinutes: t.walk_minutes, description: t.description })),
    primeScore: score?.status === "PUBLISHED" && score?.total_score != null ? Number(score.total_score) : null,
    listings: (listingRes.data ?? []).map((l: any) => ({
      floor: l.floor ?? null,
      grossAreaPy: l.gross_area_py == null ? null : Number(l.gross_area_py),
      exclusiveAreaPy: l.exclusive_area_py == null ? null : Number(l.exclusive_area_py),
      rentPerPy: l.rent_per_py == null ? null : Number(l.rent_per_py),
      maintenancePerPy: l.maintenance_per_py == null ? null : Number(l.maintenance_per_py),
      depositTotalWon: l.deposit_total_won == null ? null : Number(l.deposit_total_won),
      monthlyRentTotalWon: l.monthly_rent_total_won == null ? null : Number(l.monthly_rent_total_won),
      managementFeeTotalWon: l.management_fee_total_won == null ? null : Number(l.management_fee_total_won),
      moveInText: l.move_in_text ?? null,
      status: l.status ?? null,
    })),
  };
}

export async function generateVerifiedBlogDraft(buildingId: string, templateKey: BlogTemplateKey, compareBuildingId?: string | null): Promise<{ error?: string; draft?: NaverBlogPackage }> {
  const primary = await loadBuildingFacts(buildingId);
  if (!primary) return { error: "건물 정보를 찾을 수 없습니다." };
  const compare = compareBuildingId ? await loadBuildingFacts(compareBuildingId) : null;
  if (templateKey === "comparison" && !compare) return { error: "비교할 두 번째 건물을 선택해 주세요." };
  return { draft: buildNaverBlogPackage(primary, templateKey, compare) };
}

export async function refineVerifiedBlogDraft(input: { buildingId: string; title: string; body: string; tags: string[] }): Promise<{ error?: string; title?: string; body?: string; tags?: string[] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: "AI 다듬기를 사용하려면 Vercel에 ANTHROPIC_API_KEY가 필요합니다. '검증 데이터로 초안 만들기'는 API 키 없이도 사용할 수 있습니다." };
  const facts = await loadBuildingFacts(input.buildingId);
  if (!facts) return { error: "건물 정보를 찾을 수 없습니다." };
  const verified = buildNaverBlogPackage(facts, "building_intro");
  const prompt = `당신은 CORE PRIME의 네이버 블로그 편집자입니다. 아래 초안을 읽기 좋게 다듬되, [검증된 사실]에 없는 새로운 사실·수치·평가·역세권 표현·호재를 절대 추가하지 마세요. 과장 광고 문구를 피하고 B2B 오피스 전문 톤을 유지하세요. 본문은 약 1,500~2,200자 범위가 적당합니다. 제목 1개, 본문, 해시태그를 JSON으로만 반환하세요.\n\n[검증된 사실]\n${verified.factLines.join("\n")}\n\n[초안 제목]\n${input.title}\n\n[초안 본문]\n${input.body}\n\n[태그]\n${input.tags.join(", ")}\n\nJSON 형식: {"title":"...","body":"...","tags":["..."]}`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5", max_tokens: 3000, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) return { error: `AI 요청 실패 (${res.status})` };
    const data = await res.json();
    const raw = String(data?.content?.[0]?.text ?? "").trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(raw);
    if (!parsed?.title || !parsed?.body) return { error: "AI 응답 형식이 올바르지 않습니다." };
    return { title: String(parsed.title), body: String(parsed.body), tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 12) : input.tags };
  } catch {
    return { error: "AI 다듬기 중 오류가 발생했습니다. 검증 데이터 초안은 그대로 사용할 수 있습니다." };
  }
}

export async function saveNaverBlogDraft(input: { buildingId: string; title: string; body: string; tags: string[]; templateKey: BlogTemplateKey; sourceSnapshot: Record<string, unknown> }): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("building_contents").insert({
    building_id: input.buildingId,
    content_type: "blog",
    body: input.body,
    status: "draft",
    title: input.title,
    platform: "naver_blog",
    template_key: input.templateKey,
    tags: input.tags,
    source_snapshot: input.sourceSnapshot,
  }).select("id").single();
  if (error) return { error: error.message.includes("column") ? "콘텐츠 센터용 SQL이 아직 적용되지 않았습니다. SUPABASE-APPLY-v1.22-CONTENT-CENTER.sql을 먼저 실행해 주세요." : error.message };
  revalidatePath(`/admin/content/${input.buildingId}`);
  revalidatePath("/admin/content");
  return { id: data.id };
}

export async function updateBlogPublishState(input: { id: string; buildingId: string; status: "draft" | "review" | "approved" | "published"; publishedUrl?: string | null }): Promise<{ error?: string }> {
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status: input.status };
  if (input.status === "published") {
    if (!input.publishedUrl?.trim()) return { error: "발행 완료로 바꾸려면 네이버 블로그 게시글 URL을 입력해 주세요." };
    patch.published_url = input.publishedUrl.trim();
    patch.published_at = new Date().toISOString();
  } else if (input.publishedUrl !== undefined) {
    patch.published_url = input.publishedUrl?.trim() || null;
  }
  const { error } = await supabase.from("building_contents").update(patch).eq("id", input.id).eq("building_id", input.buildingId);
  if (error) return { error: error.message };
  revalidatePath(`/admin/content/${input.buildingId}`);
  revalidatePath("/admin/content");
  return {};
}
