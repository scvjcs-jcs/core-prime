import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CUSTOMER_STATUS_LABEL, SOURCE_DOCUMENT_STATUS_LABEL } from "@/lib/labels";

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const [
    { count: totalBuildings }, { count: publishedBuildings }, { count: totalListings }, { count: activeListings },
    { count: newInquiries }, { count: totalProposals }, { count: reviewImports }, { count: failedImports }, { count: unverifiedBuildings },
  ] = await Promise.all([
    supabase.from("buildings").select("*", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("buildings").select("*", { count: "exact", head: true }).eq("is_published", true).is("deleted_at", null),
    supabase.from("listings").select("*", { count: "exact", head: true }),
    supabase.from("listings").select("*", { count: "exact", head: true }).eq("is_published", true).in("status", ["available", "negotiating"]),
    supabase.from("customers").select("*", { count: "exact", head: true }).eq("status", "NEW"),
    supabase.from("proposals").select("*", { count: "exact", head: true }),
    supabase.from("source_documents").select("*", { count: "exact", head: true }).eq("status", "REVIEW_REQUIRED"),
    supabase.from("source_documents").select("*", { count: "exact", head: true }).eq("status", "FAILED"),
    supabase.from("buildings").select("*", { count: "exact", head: true }).is("deleted_at", null).is("data_last_verified_at", null),
  ]);

  const [{ data: recentInquiries }, { data: reviewDocs }, { data: staleListings }] = await Promise.all([
    supabase.from("customers").select("id,contact_name,company_name,status,created_at").order("created_at", { ascending: false }).limit(6),
    supabase.from("source_documents").select("id,title,status,report_date,warning_count").in("status", ["REVIEW_REQUIRED", "FAILED"]).order("uploaded_at", { ascending: false }).limit(6),
    supabase.from("listings").select("id,floor,verified_at,report_date,buildings(name)").eq("is_published", true).in("status", ["available", "negotiating"]).order("verified_at", { ascending: true, nullsFirst: true }).limit(6),
  ]);

  const cards = [
    { label: "공개 빌딩", value: publishedBuildings ?? 0, sub: `전체 ${totalBuildings ?? 0}`, href: "/admin/buildings" },
    { label: "현재 공개 공실", value: activeListings ?? 0, sub: `전체 매물 ${totalListings ?? 0}`, href: "/admin/listings" },
    { label: "신규 상담", value: newInquiries ?? 0, sub: "빠른 확인 필요", href: "/admin/customers" },
    { label: "자료 검수 대기", value: reviewImports ?? 0, sub: failedImports ? `실패 ${failedImports}건` : "실패 없음", href: "/admin/imports" },
    { label: "제안서", value: totalProposals ?? 0, sub: "작성된 제안서", href: "/admin/proposals" },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs uppercase tracking-[.2em] text-silver">Operations</p><h1 className="mt-1 font-display text-3xl">관리 대시보드</h1></div><p className="text-xs text-silver">자료 → 검수 → 공실 → 상담 → 제안 흐름을 한곳에서 확인합니다.</p></div>

      {(reviewImports ?? 0) + (failedImports ?? 0) + (newInquiries ?? 0) > 0 && (
        <div className="mb-6 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <b>확인이 필요한 작업이 있습니다.</b> {reviewImports ? `자료 검수 ${reviewImports}건` : ""}{reviewImports && newInquiries ? " · " : ""}{newInquiries ? `신규 상담 ${newInquiries}건` : ""}{failedImports ? ` · 처리 실패 ${failedImports}건` : ""}
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-5">
        {cards.map((c) => <Link key={c.label} href={c.href} className="border border-silver/25 bg-white p-5 transition hover:border-navy hover:shadow-sm"><p className="text-xs text-silver">{c.label}</p><p className="mt-1 font-display text-3xl tabular-nums">{c.value}</p><p className="mt-2 text-[11px] text-silver">{c.sub}</p></Link>)}
      </div>

      <section className="mb-8 border border-silver/25 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div><p className="text-xs uppercase tracking-[.18em] text-silver">Quality Control</p><h2 className="mt-1 text-lg font-medium">오늘 먼저 확인할 운영 품질</h2><p className="mt-1 text-xs leading-5 text-silver">공개보다 데이터 검증을 우선합니다. 미검증 건물과 자료 검수 대기를 먼저 처리하세요.</p></div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Link href="/admin/buildings" className="border border-silver/25 px-4 py-3 hover:border-navy"><p className="text-[10px] text-silver">비공개 건물</p><p className="mt-1 text-xl font-display">{Math.max(0,(totalBuildings??0)-(publishedBuildings??0))}</p></Link>
            <Link href="/admin/buildings" className="border border-silver/25 px-4 py-3 hover:border-navy"><p className="text-[10px] text-silver">검증일 없음</p><p className="mt-1 text-xl font-display">{unverifiedBuildings ?? 0}</p></Link>
            <Link href="/admin/imports" className="border border-silver/25 px-4 py-3 hover:border-navy"><p className="text-[10px] text-silver">자료 검수</p><p className="mt-1 text-xl font-display">{(reviewImports??0)+(failedImports??0)}</p></Link>
          </div>
        </div>
      </section>

      <div className="mb-8 grid gap-3 md:grid-cols-4">
        <Link href="/admin/imports/new" className="bg-navy p-4 text-white hover:bg-charcoal"><p className="text-[10px] uppercase tracking-[.16em] text-silver">01 Data</p><p className="mt-1 text-sm">PDF 자료 등록</p></Link>
        <Link href="/admin/imports" className="border border-silver/25 bg-white p-4 hover:border-navy"><p className="text-[10px] uppercase tracking-[.16em] text-silver">02 Review</p><p className="mt-1 text-sm">자료 구조화·검수</p></Link>
        <Link href="/admin/listings" className="border border-silver/25 bg-white p-4 hover:border-navy"><p className="text-[10px] uppercase tracking-[.16em] text-silver">03 Leasing</p><p className="mt-1 text-sm">공실·임대조건 관리</p></Link>
        <Link href="/admin/customers" className="border border-silver/25 bg-white p-4 hover:border-navy"><p className="text-[10px] uppercase tracking-[.16em] text-silver">04 Advisory</p><p className="mt-1 text-sm">상담·추천·제안서</p></Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="border border-silver/25 bg-white">
          <div className="flex items-center justify-between border-b border-silver/20 px-4 py-3"><h2 className="text-sm font-medium">최근 상담</h2><Link href="/admin/customers" className="text-xs text-navy hover:underline">전체보기</Link></div>
          {(recentInquiries ?? []).length ? <div>{(recentInquiries ?? []).map((c) => <Link key={c.id} href={`/admin/customers/${c.id}`} className="flex items-center justify-between gap-3 border-b border-silver/15 px-4 py-3 text-sm last:border-0 hover:bg-fog"><div><p>{c.company_name ?? c.contact_name}</p><p className="mt-1 text-xs text-silver">{c.company_name ? c.contact_name : "개인 문의"}</p></div><span className="text-xs text-silver">{CUSTOMER_STATUS_LABEL[c.status] ?? c.status}</span></Link>)}</div> : <p className="px-4 py-8 text-center text-sm text-silver">상담 내역이 없습니다.</p>}
        </section>

        <section className="border border-silver/25 bg-white">
          <div className="flex items-center justify-between border-b border-silver/20 px-4 py-3"><h2 className="text-sm font-medium">검수 필요한 자료</h2><Link href="/admin/imports" className="text-xs text-navy hover:underline">전체보기</Link></div>
          {(reviewDocs ?? []).length ? <div>{(reviewDocs ?? []).map((d) => <Link key={d.id} href={`/admin/imports/${d.id}`} className="flex items-center justify-between gap-3 border-b border-silver/15 px-4 py-3 text-sm last:border-0 hover:bg-fog"><div className="min-w-0"><p className="truncate">{d.title}</p><p className="mt-1 text-xs text-silver">기준 {d.report_date ?? "-"}{d.warning_count ? ` · 경고 ${d.warning_count}` : ""}</p></div><span className={`shrink-0 text-xs ${d.status === "FAILED" ? "text-red-700" : "text-amber-700"}`}>{SOURCE_DOCUMENT_STATUS_LABEL[d.status] ?? d.status}</span></Link>)}</div> : <p className="px-4 py-8 text-center text-sm text-silver">검수 대기 자료가 없습니다.</p>}
        </section>

        <section className="border border-silver/25 bg-white">
          <div className="flex items-center justify-between border-b border-silver/20 px-4 py-3"><h2 className="text-sm font-medium">오래된 공실 우선 확인</h2><Link href="/admin/listings" className="text-xs text-navy hover:underline">공실관리</Link></div>
          {(staleListings ?? []).length ? <div>{(staleListings ?? []).map((l) => { const b=(l.buildings as unknown as {name:string}|null)?.name ?? "건물 미정"; return <Link key={l.id} href={`/admin/listings/${l.id}`} className="flex items-center justify-between gap-3 border-b border-silver/15 px-4 py-3 text-sm last:border-0 hover:bg-fog"><div><p>{b} · {l.floor ?? "층 미정"}</p><p className="mt-1 text-xs text-silver">확인일 {l.verified_at ? new Date(l.verified_at).toLocaleDateString("ko-KR") : l.report_date ?? "미확인"}</p></div><span className="text-xs text-silver">확인 →</span></Link>})}</div> : <p className="px-4 py-8 text-center text-sm text-silver">공개 공실이 없습니다.</p>}
        </section>
      </div>
    </div>
  );
}
