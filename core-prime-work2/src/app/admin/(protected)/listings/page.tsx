import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DeleteListingButton from "@/components/admin/DeleteListingButton";
import { LISTING_STATUS_LABEL } from "@/lib/labels";

export default async function AdminListingsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; published?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: listings, error } = await supabase
    .from("listings")
    .select("id, listing_code, floor, exclusive_area, exclusive_area_py, monthly_rent, rent_per_py, status, is_published, report_date, buildings(name)")
    .order("created_at", { ascending: false });

  let rows = listings ?? [];
  const q = params.q?.trim().toLowerCase();
  if (q) rows = rows.filter((l) => {
    const buildingName = (l.buildings as unknown as { name: string } | null)?.name ?? "";
    return [buildingName, l.listing_code, l.floor].some((v) => v?.toLowerCase().includes(q));
  });
  if (params.status) rows = rows.filter((l) => l.status === params.status);
  if (params.published === "1") rows = rows.filter((l) => l.is_published);
  if (params.published === "0") rows = rows.filter((l) => !l.is_published);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs uppercase tracking-[.18em] text-silver">Vacancy Management</p><h1 className="mt-1 font-display text-2xl">공실·매물 관리</h1><p className="mt-1 text-xs text-silver">고객 화면에 노출되는 공실의 상태와 가격, 공개 여부를 관리합니다.</p></div>
        <Link href="/admin/listings/new" className="w-fit bg-navy px-4 py-2 text-sm text-white hover:bg-charcoal">+ 직접 매물 등록</Link>
      </div>

      <form className="mb-4 grid gap-2 border border-silver/25 bg-white p-4 sm:grid-cols-[1fr_180px_150px_auto]">
        <input name="q" defaultValue={params.q ?? ""} className="border border-silver/40 px-3 py-2 text-sm" placeholder="건물명·층·매물코드 검색" />
        <select name="status" defaultValue={params.status ?? ""} className="border border-silver/40 px-3 py-2 text-sm"><option value="">전체 상태</option>{Object.entries(LISTING_STATUS_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
        <select name="published" defaultValue={params.published ?? ""} className="border border-silver/40 px-3 py-2 text-sm"><option value="">전체 공개여부</option><option value="1">공개</option><option value="0">비공개</option></select>
        <button className="bg-charcoal px-4 py-2 text-sm text-white">조회</button>
      </form>

      {error && <p className="mb-4 text-sm text-red-600">목록을 불러오지 못했습니다: {error.message}</p>}
      <div className="mb-3 flex items-center justify-between text-xs text-silver"><span>검색 결과 {rows.length}건</span><Link href="/admin/listings" className="hover:text-navy">필터 초기화</Link></div>

      <div className="overflow-x-auto border border-silver/30 bg-white">
        <table className="w-full min-w-[920px] text-sm">
          <thead><tr className="border-b border-silver/30 text-left text-silver"><th className="px-4 py-3 font-normal">건물</th><th className="px-4 py-3 font-normal">층</th><th className="px-4 py-3 font-normal">전용면적</th><th className="px-4 py-3 font-normal">임대료</th><th className="px-4 py-3 font-normal">상태</th><th className="px-4 py-3 font-normal">자료 기준일</th><th className="px-4 py-3 font-normal">공개</th><th className="px-4 py-3 text-right font-normal">관리</th></tr></thead>
          <tbody>
            {rows.map((l) => {
              const buildingName=(l.buildings as unknown as {name:string}|null)?.name ?? "-";
              return <tr key={l.id} className="border-b border-silver/20 last:border-0"><td className="px-4 py-3"><Link href={`/admin/listings/${l.id}`} className="font-medium hover:underline">{buildingName}</Link>{l.listing_code&&<p className="mt-0.5 text-[11px] text-silver">{l.listing_code}</p>}</td><td className="px-4 py-3">{l.floor??"-"}</td><td className="px-4 py-3 text-silver">{l.exclusive_area_py?`${Number(l.exclusive_area_py).toLocaleString()}평`:l.exclusive_area?`${Number(l.exclusive_area).toLocaleString()}㎡`:"-"}</td><td className="px-4 py-3 text-silver">{l.rent_per_py?`${Number(l.rent_per_py).toLocaleString()}원/평`:l.monthly_rent?`${Number(l.monthly_rent).toLocaleString()}만원/월`:"-"}</td><td className="px-4 py-3"><span className="border border-silver/30 bg-fog px-2 py-0.5 text-xs">{LISTING_STATUS_LABEL[l.status]??l.status}</span></td><td className="px-4 py-3 text-silver">{l.report_date??"-"}</td><td className="px-4 py-3"><span className={l.is_published?"border border-green-200 bg-green-50 px-2 py-0.5 text-xs text-green-700":"border border-silver/30 bg-fog px-2 py-0.5 text-xs text-silver"}>{l.is_published?"공개":"비공개"}</span></td><td className="space-x-3 px-4 py-3 text-right"><Link href={`/admin/listings/${l.id}`} className="text-navy hover:underline">수정</Link><DeleteListingButton id={l.id} label={`${buildingName} ${l.floor??""}`}/></td></tr>;
            })}
            {rows.length===0&&<tr><td colSpan={8} className="px-4 py-12 text-center text-silver">조건에 맞는 매물이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
