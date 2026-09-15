import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 50;

export default async function AdminContentPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; status?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);
  const status = ["all", "draft", "published", "none"].includes(sp.status ?? "") ? (sp.status ?? "all") : "all";
  const supabase = await createClient();

  let statusBuildingIds: string[] | null = null;
  if (status !== "all") {
    const { data: statusContents } = await supabase
      .from("building_contents")
      .select("building_id,status")
      .eq("content_type", "blog");
    const grouped = new Map<string, string[]>();
    for (const c of statusContents ?? []) grouped.set(c.building_id, [...(grouped.get(c.building_id) ?? []), c.status]);
    if (status === "draft") statusBuildingIds = Array.from(grouped.entries()).filter(([, values]) => values.some((v) => v !== "published")).map(([id]) => id);
    if (status === "published") statusBuildingIds = Array.from(grouped.entries()).filter(([, values]) => values.includes("published")).map(([id]) => id);
    if (status === "none") {
      const { data: allIds } = await supabase.from("buildings").select("id").is("deleted_at", null);
      const has = new Set(grouped.keys());
      statusBuildingIds = (allIds ?? []).map((x: any) => x.id).filter((id: string) => !has.has(id));
    }
  }

  let query = supabase
    .from("buildings")
    .select("id,name,is_published,data_last_verified_at,road_address,address,districts(name)", { count: "exact" })
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (q) query = query.ilike("name", `%${q.replace(/[%_]/g, "")}%`);
  if (statusBuildingIds) {
    if (statusBuildingIds.length === 0) {
      query = query.eq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      query = query.in("id", statusBuildingIds);
    }
  }
  const { data: buildings, count, error } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const ids = (buildings ?? []).map((b: any) => b.id);
  const { data: contents } = ids.length
    ? await supabase.from("building_contents").select("id,building_id,status,title,platform,published_url,created_at,updated_at").in("building_id", ids).eq("content_type", "blog").order("created_at", { ascending: false })
    : { data: [] as any[] };

  const byBuilding = new Map<string, any[]>();
  for (const c of contents ?? []) byBuilding.set(c.building_id, [...(byBuilding.get(c.building_id) ?? []), c]);
  let rows = (buildings ?? []).map((b: any) => {
    const cs = byBuilding.get(b.id) ?? [];
    const published = cs.filter((c) => c.status === "published");
    return { ...b, contents: cs, draftCount: cs.filter((c) => c.status !== "published").length, publishedCount: published.length, latest: cs[0] ?? null };
  });
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const hrefFor = (nextPage: number) => `/admin/content?q=${encodeURIComponent(q)}&status=${status}&page=${nextPage}`;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="font-display text-2xl">블로그 콘텐츠 센터</h1><p className="mt-1 text-xs text-silver">검증된 건물·공실 데이터로 네이버 블로그 초안을 만들고, 발행 이력을 관리합니다.</p></div>
      <a href="https://blog.naver.com/" target="_blank" rel="noreferrer" className="border border-navy px-4 py-2 text-sm text-navy hover:bg-navy hover:text-white">네이버 블로그 열기 ↗</a>
    </div>

    <div className="grid gap-3 md:grid-cols-4">
      <div className="border border-silver/30 bg-white p-4"><div className="text-xs text-silver">현재 페이지 건물</div><div className="mt-1 text-2xl font-display">{rows.length}</div></div>
      <div className="border border-silver/30 bg-white p-4"><div className="text-xs text-silver">초안 있음</div><div className="mt-1 text-2xl font-display">{rows.filter((r:any)=>r.draftCount>0).length}</div></div>
      <div className="border border-silver/30 bg-white p-4"><div className="text-xs text-silver">발행 이력 있음</div><div className="mt-1 text-2xl font-display">{rows.filter((r:any)=>r.publishedCount>0).length}</div></div>
      <div className="border border-silver/30 bg-fog p-4"><div className="text-xs text-silver">운영 원칙</div><div className="mt-1 text-sm font-medium">검증되지 않은 수치는 자동 작성하지 않음</div></div>
    </div>

    <form className="flex flex-wrap gap-2 border border-silver/25 bg-fog p-4" action="/admin/content">
      <input name="q" defaultValue={q} placeholder="건물명 검색" className="min-w-[240px] flex-1 border border-silver/40 bg-white px-3 py-2 text-sm" />
      <select name="status" defaultValue={status} className="border border-silver/40 bg-white px-3 py-2 text-sm"><option value="all">전체</option><option value="none">콘텐츠 없음</option><option value="draft">초안 있음</option><option value="published">발행 이력 있음</option></select>
      <button className="bg-navy px-4 py-2 text-sm text-white">검색</button>
    </form>

    {error && <p className="text-sm text-red-600">건물 목록을 불러오지 못했습니다: {error.message}</p>}
    <div className="overflow-x-auto border border-silver/25 bg-white">
      <table className="min-w-[900px] w-full text-left text-sm"><thead className="bg-fog text-xs text-silver"><tr><th className="px-4 py-3">건물</th><th className="px-4 py-3">공개상태</th><th className="px-4 py-3">데이터 확인일</th><th className="px-4 py-3">초안</th><th className="px-4 py-3">발행</th><th className="px-4 py-3">작업</th></tr></thead>
      <tbody>{rows.map((r:any)=><tr key={r.id} className="border-t border-silver/15"><td className="px-4 py-3"><div className="font-medium">{r.name}</div><div className="mt-0.5 text-xs text-silver">{r.districts?.name ?? ""} {r.road_address || r.address || ""}</div></td><td className="px-4 py-3"><span className={`text-xs ${r.is_published?"text-green-700":"text-silver"}`}>{r.is_published?"공개":"비공개"}</span></td><td className="px-4 py-3 text-xs text-silver">{r.data_last_verified_at?new Date(r.data_last_verified_at).toLocaleDateString("ko-KR"):"미확인"}</td><td className="px-4 py-3 tabular-nums">{r.draftCount}</td><td className="px-4 py-3 tabular-nums">{r.publishedCount}</td><td className="px-4 py-3"><Link href={`/admin/content/${r.id}`} className="bg-navy px-3 py-1.5 text-xs text-white">원고 만들기</Link></td></tr>)}</tbody></table>
      {rows.length===0&&<div className="p-10 text-center text-sm text-silver">조건에 맞는 건물이 없습니다.</div>}
    </div>

    <div className="flex items-center justify-between text-sm"><span className="text-silver">전체 {count ?? 0}개 · {page}/{totalPages} 페이지</span><div className="flex gap-2">{page>1&&<Link href={hrefFor(page-1)} className="border px-3 py-1.5">이전</Link>}{page<totalPages&&<Link href={hrefFor(page+1)} className="border px-3 py-1.5">다음</Link>}</div></div>
  </div>;
}
