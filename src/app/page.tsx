import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logPageView } from "@/lib/analytics";
import FreshnessChip from "@/components/FreshnessChip";
import { rangeLabel } from "@/lib/publicData";

type FeaturedBuilding = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  completion_year: number | null;
  building_grade: string | null;
  data_last_verified_at: string | null;
  districts: { name: string; slug: string } | null;
  building_images: { url: string; is_primary: boolean }[] | null;
  listings: { id: string; status: string; is_published: boolean; exclusive_area_py: number | null; rent_per_py: number | null; report_date: string | null }[] | null;
};

function activeListingsOf(building: FeaturedBuilding) {
  return (building.listings ?? []).filter((l) => l.is_published && ["available", "negotiating", "contracting"].includes(l.status));
}

export default async function HomePage() {
  const supabase = await createClient();
  const [, { data: districts }, { data: buildingsRaw }, { count: availableListings }, { count: publishedBuildings }] = await Promise.all([
    logPageView("/"),
    supabase.from("districts").select("id, name, slug").eq("is_published", true).order("name"),
    supabase.from("buildings").select("id,name,slug,address,completion_year,building_grade,data_last_verified_at,districts(name,slug),building_images(url,is_primary),listings(id,status,is_published,exclusive_area_py,rent_per_py,report_date)").eq("is_published", true).is("deleted_at", null).order("is_featured", { ascending: false }).order("created_at", { ascending: false }).limit(6),
    supabase.from("listings").select("*", { count: "exact", head: true }).eq("is_published", true).in("status", ["available", "negotiating", "contracting"]),
    supabase.from("buildings").select("*", { count: "exact", head: true }).eq("is_published", true).is("deleted_at", null),
  ]);

  const buildings = (buildingsRaw ?? []) as unknown as FeaturedBuilding[];

  return (
    <main id="main-content">
      <section className="bg-navy text-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-16 md:py-24 lg:grid-cols-[1.12fr_.88fr] lg:items-center">
          <div>
            <p className="mb-5 text-xs uppercase tracking-[0.3em] text-silver">Prime Office Intelligence · Seoul</p>
            <h1 className="max-w-4xl font-display text-4xl leading-[1.12] md:text-6xl kr-text">
              서울 프라임 오피스를<br />데이터로 좁히고, 전문가가 다시 확인합니다.
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-7 text-silver md:text-lg kr-text">
              건물 정보와 현재 공실을 한곳에서 비교하고, 기업의 인원·예산·입주 일정에 맞는 후보를 선별합니다. 공개 전 데이터는 관리자 검수와 최신성 확인을 거칩니다.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/buildings" className="bg-white px-6 py-3 text-sm font-medium text-navy hover:bg-fog">오피스 검색 시작</Link>
              <Link href="/advisory" className="border border-white/40 px-6 py-3 text-sm text-white hover:border-white hover:bg-white hover:text-navy">맞춤 후보 제안받기</Link>
            </div>
            <div className="mt-8 grid max-w-xl grid-cols-3 gap-3 border-t border-white/15 pt-5">
              <div><p className="text-[11px] text-silver">공개 빌딩</p><p className="mt-1 font-display text-2xl tabular-nums">{publishedBuildings ?? 0}</p></div>
              <div><p className="text-[11px] text-silver">현재 공실</p><p className="mt-1 font-display text-2xl tabular-nums">{availableListings ?? 0}</p></div>
              <div><p className="text-[11px] text-silver">운영 원칙</p><p className="mt-1 text-sm font-medium">검수 후 공개</p></div>
            </div>
          </div>

          <div className="border border-white/15 bg-white/5 p-5 backdrop-blur-sm md:p-7">
            <div className="mb-5 flex items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.18em] text-silver">Quick Search</p><h2 className="mt-1 text-xl font-medium kr-text">핵심 조건으로 먼저 좁혀보세요</h2></div><span className="text-xs text-silver">검색 후 비교 가능</span></div>
            <form action="/buildings" method="get" className="space-y-4">
              <div><label className="mb-1.5 block text-xs text-silver">업무권역</label><select name="district" className="w-full bg-white px-3 py-3 text-sm text-charcoal"><option value="">전체 권역</option>{(districts ?? []).map((d) => <option key={d.id} value={d.slug}>{d.name}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="mb-1.5 block text-xs text-silver">최소 전용면적</label><div className="relative"><input name="minAreaPy" type="number" min="0" className="w-full bg-white px-3 py-3 pr-10 text-sm text-charcoal" placeholder="100"/><span className="absolute right-3 top-3 text-xs text-charcoal/60">평</span></div></div>
                <div><label className="mb-1.5 block text-xs text-silver">평당 임대료 최대</label><div className="relative"><input name="maxRentPerPy" type="number" min="0" className="w-full bg-white px-3 py-3 pr-9 text-sm text-charcoal" placeholder="150000"/><span className="absolute right-3 top-3 text-xs text-charcoal/60">원</span></div></div>
              </div>
              <input type="hidden" name="availableOnly" value="1" />
              <button className="w-full bg-white px-4 py-3 text-sm font-medium text-navy hover:bg-fog">현재 공실 기준으로 검색</button>
            </form>
            <p className="mt-4 text-xs leading-5 text-silver kr-text">임대조건은 수시로 변동됩니다. 상세페이지의 기준일과 최신성 표시를 확인하고, 계약 전 조건은 다시 검증합니다.</p>
          </div>
        </div>
      </section>

      <section className="border-b border-silver/20 bg-white">
        <div className="mx-auto grid max-w-7xl px-6 md:grid-cols-4">
          {[
            ["01", "Search", "권역·면적·임대료로 후보를 좁힙니다."],
            ["02", "Compare", "건물·공실·주차·교통을 한 화면에서 비교합니다."],
            ["03", "Verify", "자료 기준일과 원문을 바탕으로 최신성을 확인합니다."],
            ["04", "Advise", "기업 조건에 맞는 후보와 우선순위를 제안합니다."],
          ].map(([no, title, text]) => <div key={no} className="border-silver/20 py-7 md:border-r md:px-6 first:md:pl-0 last:md:border-r-0"><p className="font-display text-sm text-silver">{no}</p><h2 className="mt-2 text-sm font-medium uppercase tracking-[.08em]">{title}</h2><p className="mt-2 text-sm leading-6 text-silver kr-text">{text}</p></div>)}
        </div>
      </section>

      {buildings.length > 0 && (
        <section className="mx-auto max-w-7xl px-6 py-20">
          <div className="mb-9 flex items-end justify-between gap-4"><div><p className="mb-2 text-xs uppercase tracking-[0.2em] text-silver">Selected Buildings</p><h2 className="font-display text-3xl kr-text">현재 확인 가능한 주요 오피스</h2></div><Link href="/buildings" className="text-sm text-navy hover:underline">전체 빌딩 보기 →</Link></div>
          <div className="grid grid-cols-1 gap-7 md:grid-cols-2 lg:grid-cols-3">
            {buildings.map((b) => {
              const img = b.building_images?.find((i) => i.is_primary)?.url ?? b.building_images?.[0]?.url ?? null;
              const active = activeListingsOf(b);
              const areaRange = rangeLabel(active.map((l) => l.exclusive_area_py), "평");
              const rentRange = rangeLabel(active.map((l) => l.rent_per_py), "원/평");
              const latestReport = active.map((l) => l.report_date).filter((v): v is string => Boolean(v)).sort().at(-1) ?? b.data_last_verified_at;
              return <Link key={b.id} href={`/buildings/${b.slug}`} className="group block overflow-hidden border border-silver/25 bg-white transition hover:-translate-y-0.5 hover:shadow-xl">
                <div className="relative h-52 overflow-hidden bg-fog">{img ? <img src={img} alt={b.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"/> : <div className="flex h-full items-center justify-center bg-gradient-to-br from-fog to-silver/20 text-xs tracking-[0.18em] text-silver">CORE PRIME</div>}<span className={`absolute left-3 top-3 px-2.5 py-1 text-xs ${active.length ? "bg-navy text-white" : "bg-white/95 text-silver"}`}>{active.length ? `공실 ${active.length}건` : "공실 문의"}</span></div>
                <div className="p-5"><div className="flex items-center justify-between gap-3 text-xs text-silver"><span>{b.districts?.name ?? "권역 미정"}</span><span>{b.building_grade ?? "등급 미정"}</span></div><h3 className="mt-2 font-display text-xl kr-text">{b.name}</h3><p className="mt-2 min-h-[2.5rem] text-xs leading-5 text-silver kr-text">{b.address ?? "주소 정보 준비중"}</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-silver/20 pt-4 text-xs"><div><p className="text-silver">전용면적</p><p className="mt-1 font-medium">{areaRange ?? "문의"}</p></div><div><p className="text-silver">평당 임대료</p><p className="mt-1 font-medium">{rentRange ?? "문의"}</p></div></div>
                  <div className="mt-4 flex items-center justify-between gap-2"><span className="text-[11px] text-silver">{b.completion_year ? `${b.completion_year}년 준공` : "준공연도 미정"}</span><FreshnessChip date={latestReport} /></div>
                </div>
              </Link>;
            })}
          </div>
        </section>
      )}

      <section className="bg-fog py-16"><div className="mx-auto max-w-7xl px-6"><div className="grid gap-10 lg:grid-cols-[.9fr_1.1fr]"><div><p className="mb-2 text-xs uppercase tracking-[0.2em] text-silver">Business Districts</p><h2 className="font-display text-3xl kr-text">업무권역별로 빠르게 탐색</h2><p className="mt-4 max-w-xl text-sm leading-6 text-silver kr-text">서울 주요 업무권역을 기준으로 공개 빌딩과 현재 공실을 확인합니다. 필요하면 비교표에 후보를 담아 한 번에 검토할 수 있습니다.</p></div><div className="flex flex-wrap content-start gap-2">{(districts ?? []).map((d) => <Link key={d.id} href={`/buildings?district=${d.slug}`} className="border border-silver/40 bg-white px-4 py-2 text-sm transition hover:border-navy hover:bg-navy hover:text-white">{d.name}</Link>)}</div></div></div></section>

      <section className="mx-auto max-w-5xl px-6 py-20 text-center"><p className="mb-3 text-xs uppercase tracking-[0.2em] text-silver">Office Advisory</p><h2 className="font-display text-3xl md:text-4xl kr-text">검색 결과를 넘어, 실제 이전 후보를 정리합니다.</h2><p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-silver kr-text">인원·면적·예산·주차·입주 시점을 남기면 공개 공실뿐 아니라 검증 가능한 후보를 다시 확인해 우선순위를 정리합니다.</p><Link href="/advisory" className="mt-7 inline-block bg-navy px-6 py-3 text-sm text-white">맞춤 제안 요청하기</Link></section>
    </main>
  );
}
