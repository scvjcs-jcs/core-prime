import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BlogContentStudio from "@/components/admin/BlogContentStudio";

export default async function BlogContentBuildingPage({ params }: { params: Promise<{ buildingId: string }> }) {
  const { buildingId } = await params;
  const supabase = await createClient();
  const [{ data: building }, { data: allBuildings }, { data: contents }] = await Promise.all([
    supabase.from("buildings").select("id,name,is_published,data_last_verified_at,road_address,address,districts(name)").eq("id", buildingId).maybeSingle(),
    supabase.from("buildings").select("id,name,districts(name)").is("deleted_at", null).neq("id", buildingId).order("name").limit(500),
    supabase.from("building_contents").select("*").eq("building_id", buildingId).eq("content_type", "blog").order("created_at", { ascending: false }),
  ]);
  if (!building) notFound();
  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><Link href="/admin/content" className="text-xs text-silver hover:text-navy">← 콘텐츠 센터</Link><h1 className="mt-2 font-display text-2xl">{building.name} · 네이버 블로그</h1><p className="mt-1 text-xs text-silver">등록된 검증 데이터만 사용해 초안을 만들고, 직접 확인 후 네이버에 발행합니다.</p></div><Link href={`/admin/buildings/${buildingId}`} className="border px-3 py-2 text-xs">건물정보 확인</Link></div>
    <BlogContentStudio buildingId={buildingId} buildingName={building.name} compareBuildings={(allBuildings ?? []).map((b:any)=>({ id:b.id, name:b.name, districtName:b.districts?.name ?? "" }))} initialContents={(contents ?? []).map((c:any)=>({ id:c.id, title:c.title ?? "제목 없음", body:c.body ?? "", status:c.status, tags:Array.isArray(c.tags)?c.tags:[], templateKey:c.template_key ?? "building_intro", publishedUrl:c.published_url ?? null, publishedAt:c.published_at ?? null, createdAt:c.created_at }))} />
  </div>;
}
