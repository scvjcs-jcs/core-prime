import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logPageView } from "@/lib/analytics";

type FeaturedBuilding = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  completion_year: number | null;
  building_grade: string | null;
  data_last_verified_at: string | null;
  districts: { name: string } | null;
  building_images: { url: string; is_primary: boolean }[] | null;
  listings: { id: string; status: string; is_published: boolean; exclusive_area_py: number | null; rent_per_py: number | null }[] | null;
};

function activeListingsOf(building: FeaturedBuilding) {
  return (building.listings ?? []).filter((l) => l.is_published && ["available", "negotiating"].includes(l.status));
}

export default async function HomePage() {
  const supabase = await createClient();

  const [, { data: districts }, { data: buildingsRaw }, { count: availableListings }, { count: publishedBuildings }] = await Promise.all([
    logPageView("/"),
    supabase.from("districts").select("id, name, slug").eq("is_published", true).order("name"),
    supabase
      .from("buildings")
      .select("id, name, slug, address, completion_year, building_grade, data_last_verified_at, districts(name), building_images(url, is_primary), listings(id,status,is_published,exclusive_area_py,rent_per_py)")
      .eq("is_published", true)
      .is("deleted_at", null)
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(6),
    supabase.from("listings").select("*", { count: "exact", head: true }).eq("is_published", true).in("status", ["available", "negotiating"]),
    supabase.from("buildings").select("*", { count: "exact", head: true }).eq("is_published", true).is("deleted_at", null),
  ]);

  const buildings = (buildingsRaw ?? []) as unknown as FeaturedBuilding[];

  return (
    <main>
      <section className="bg-navy text-white">
        <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-12 px-6 py-20 lg:grid-cols-[1.15fr_.85fr]">
          <div>
            <p className="mb-5 text-xs uppercase tracking-[0.3em] text-silver">Prime Office Advisory · Seoul</p>
            <h1 className="max-w-4xl font-display text-4xl leading-[1.15] md:text-6xl kr-text">
              좋은 빌딩을 찾는 것보다,
              <br />
              우리 회사에 맞는 빌딩을 찾습니다.
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-7 text-silver md:text-lg kr-text">
              강남·여의도·광화문·성수·용산·판교의 프라임 오피스 데이터를 한곳에서 비교하고,
              인원·면적·예산·입주 시점에 맞는 후보를 받아보세요.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/buildings" className="bg-white px-6 py-3 text-sm font-medium text-navy transition-colors hover:bg-fog">
                오피스 직접 찾기
              </Link>
              <Link href="/advisory" className="border border-white/40 px-6 py-3 text-sm text-white transition-colors hover:border-white hover:bg-white hover:text-navy">
                조건만 남기고 제안받기
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 border-t border-white/15 pt-5 text-xs text-silver">
              <span>공개 빌딩 <b className="ml-1 text-base font-medium text-white tabular-nums">{publishedBuildings ?? 0}</b></span>
              <span>현재 공실 <b className="ml-1 text-base font-medium text-white tabular-nums">{availableListings ?? 0}</b></span>
              <span>승인된 자료만 고객 화면에 반영</span>
            </div>
          </div>

          <div className="border border-white/15 bg-white/5 p-5 backdrop-blur-sm md:p-7">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-silver">Quick Search</p>
                <h2 className="mt-1 text-xl font-medium kr-text">조건으로 바로 찾아보세요</h2>
              </div>
              <span className="text-xs text-silver">1분 검색</span>
            </div>
            <form action="/buildings" method="get" className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs text-silver">업무권역</label>
                <select name="district" className="w-full bg-white px-3 py-3 text-sm text-charcoal">
                  <option value="">전체 권역</option>
                  {(districts ?? []).map((d) => <option key={d.id} value={d.slug}>{d.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs text-silver">최소 전용면적</label>
                  <div className="relative"><input name="minAreaPy" type="number" min="0" className="w-full bg-white px-3 py-3 pr-10 text-sm text-charcoal" placeholder="100"/><span className="absolute right-3 top-3 text-xs text-charcoal/60">평</span></div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-silver">공실</label>
                  <select name="availableOnly" className="w-full bg-white px-3 py-3 text-sm text-charcoal"><option value="1">현재 공실만</option><option value="">전체 빌딩</option></select>
                </div>
              </div>
              <button className="w-full bg-white px-4 py-3 text-sm font-medium text-navy hover:bg-fog">조건에 맞는 빌딩 보기</button>
            </form>
            <p className="mt-4 text-xs leading-5 text-silver kr-text">정확한 임대조건은 수시로 바뀝니다. 상세페이지의 기준일을 확인하고, 최종 조건은 상담 시 다시 검증합니다.</p>
          </div>
        </div>
      </section>

      <section className="border-b border-silver/20 bg-white">
        <div className="mx-auto grid max-w-7xl gap-0 px-6 py-10 md:grid-cols-3 md:py-0">
          {[
            ["01", "검색", "권역·면적·임대료·공실 여부로 후보를 빠르게 좁힙니다."],
            ["02", "비교", "최대 4개 빌딩의 규모·주차·교통·임대조건을 한눈에 비교합니다."],
            ["03", "제안", "조건을 남기면 담당자가 실제 공실을 다시 확인해 후보를 제안합니다."],
          ].map(([no, title, text]) => (
            <div key={no} className="border-silver/20 py-6 md:border-r md:px-8 md:py-9 first:md:pl-0 last:md:border-r-0">
              <p className="font-display text-sm text-silver">{no}</p>
              <h2 className="mt-2 text-lg font-medium">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-silver kr-text">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {buildings.length > 0 && (
        <section className="mx-auto max-w-7xl px-6 py-20">
          <div className="mb-9 flex items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.2em] text-silver">Selected Buildings</p>
              <h2 className="font-display text-3xl kr-text">주요 프라임 오피스</h2>
            </div>
            <Link href="/buildings" className="text-sm text-navy hover:underline">전체 빌딩 보기 →</Link>
          </div>
          <div className="grid grid-cols-1 gap-7 md:grid-cols-2 lg:grid-cols-3">
            {buildings.map((b) => {
              const img = b.building_images?.find((i) => i.is_primary)?.url ?? b.building_images?.[0]?.url ?? null;
              const active = activeListingsOf(b);
              const minArea = active.map((l) => l.exclusive_area_py).filter((n): n is number => n != null).sort((a,b)=>a-b)[0];
              return (
                <Link key={b.id} href={`/buildings/${b.slug}`} className="group block overflow-hidden border border-silver/25 bg-white transition hover:-translate-y-0.5 hover:shadow-xl">
                  <div className="relative h-52 overflow-hidden bg-fog">
                    {img ? <img src={img} alt={b.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"/> : <div className="flex h-full items-center justify-center bg-gradient-to-br from-fog to-silver/20 text-xs tracking-[0.18em] text-silver">CORE PRIME</div>}
                    <span className="absolute left-3 top-3 bg-white/95 px-2.5 py-1 text-xs text-navy">{active.length > 0 ? `공실 ${active.length}건` : "공실 문의"}</span>
                  </div>
                  <div className="p-5">
                    <div className="flex items-center justify-between gap-3 text-xs text-silver"><span>{b.districts?.name ?? "권역 미정"}</span><span>{b.building_grade ?? "등급 미정"}</span></div>
                    <h3 className="mt-2 font-display text-xl kr-text">{b.name}</h3>
                    <p className="mt-2 min-h-[2.5rem] text-xs leading-5 text-silver kr-text">{b.address ?? "주소 정보 준비중"}</p>
                    <div className="mt-4 flex items-center justify-between border-t border-silver/20 pt-3 text-xs text-charcoal"><span>{b.completion_year ? `${b.completion_year}년 준공` : "준공연도 미정"}</span><span>{minArea ? `전용 ${Number(minArea).toLocaleString()}평부터` : "면적 문의"}</span></div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {(districts ?? []).length > 0 && (
        <section className="bg-fog py-16">
          <div className="mx-auto max-w-7xl px-6">
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-silver">Business Districts</p>
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <h2 className="font-display text-3xl kr-text">업무권역별로 찾아보기</h2>
              <div className="flex flex-wrap gap-2">
                {(districts ?? []).map((d) => <Link key={d.id} href={`/buildings?district=${d.slug}`} className="border border-silver/40 bg-white px-4 py-2 text-sm transition hover:border-navy hover:bg-navy hover:text-white">{d.name}</Link>)}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-5xl px-6 py-20 text-center">
        <p className="mb-3 text-xs uppercase tracking-[0.2em] text-silver">Office Advisory</p>
        <h2 className="font-display text-3xl md:text-4xl kr-text">매물을 일일이 찾기 어렵다면 조건만 남겨주세요.</h2>
        <p className="mx-auto mt-5 max-w-2xl text-sm leading-6 text-silver kr-text">희망 권역, 인원, 전용면적, 월 예산, 입주 시점을 기준으로 후보를 정리해 연락드립니다.</p>
        <Link href="/advisory" className="mt-8 inline-block bg-navy px-7 py-3 text-sm text-white hover:bg-charcoal">맞춤 제안 요청하기</Link>
      </section>
    </main>
  );
}
