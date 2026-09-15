import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { logPageView } from "@/lib/analytics";
import ComparePicker from "@/components/ComparePicker";
import FreshnessChip from "@/components/FreshnessChip";
import { activeListingStatus } from "@/lib/publicData";

export const metadata: Metadata = {
  title: "프라임 오피스 찾기",
  description: "서울 주요 업무권역의 프라임 오피스를 권역·면적·임대료·공실 여부로 검색하고 비교합니다.",
};

type RawBuilding = {
  id: string;
  name: string;
  name_en: string | null;
  slug: string;
  address: string | null;
  road_address: string | null;
  completion_year: number | null;
  above_ground_floors: number | null;
  gross_floor_area: number | null;
  building_grade: string | null;
  is_featured: boolean;
  data_last_verified_at: string | null;
  districts: { id: string; name: string; slug: string } | null;
  building_scores: { total_score: number; status: string } | { total_score: number; status: string }[] | null;
  building_images: { url: string; is_primary: boolean }[] | null;
  listings: { id: string; exclusive_area_py: number | null; rent_per_py: number | null; status: string; is_published: boolean; report_date: string | null }[] | null;
};

function primaryImageOf(b: RawBuilding): string | null {
  return b.building_images?.find((i) => i.is_primary)?.url ?? b.building_images?.[0]?.url ?? null;
}

function scoreOf(b: RawBuilding): number | null {
  if (!b.building_scores) return null;
  const s = Array.isArray(b.building_scores) ? b.building_scores[0] : b.building_scores;
  return s?.status === "PUBLISHED" ? s.total_score : null;
}

function activeListingsOf(b: RawBuilding) {
  return (b.listings ?? []).filter((l) => l.is_published && activeListingStatus(l.status));
}

function formatRent(n: number | null | undefined) {
  if (n == null) return null;
  return `${Number(n).toLocaleString("ko-KR")}원/평`;
}

export default async function BuildingsPage({ searchParams }: { searchParams: Promise<{ q?: string; district?: string; minYear?: string; minScore?: string; grade?: string; minAreaPy?: string; maxRentPerPy?: string; availableOnly?: string; sort?: string; page?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();

  const [, { data: districts }, { data: buildingsRaw }] = await Promise.all([
    logPageView("/buildings"),
    supabase.from("districts").select("id, name, slug").eq("is_published", true).order("name"),
    supabase
      .from("buildings")
      .select(`id, name, name_en, slug, address, road_address, completion_year, above_ground_floors, gross_floor_area, building_grade, is_featured, data_last_verified_at,
         districts(id, name, slug), building_scores(total_score, status), building_images(url, is_primary),
         listings(id, exclusive_area_py, rent_per_py, status, is_published, report_date)`)
      .eq("is_published", true)
      .is("deleted_at", null)
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  let buildings = (buildingsRaw ?? []) as unknown as RawBuilding[];
  const q = params.q?.trim().toLowerCase();
  if (q) buildings = buildings.filter((b) => [b.name, b.name_en, b.address, b.road_address].some((v) => v?.toLowerCase().includes(q)));
  if (params.district) buildings = buildings.filter((b) => b.districts?.slug === params.district);
  if (params.minYear && Number.isFinite(Number(params.minYear))) buildings = buildings.filter((b) => (b.completion_year ?? 0) >= Number(params.minYear));
  if (params.minScore && Number.isFinite(Number(params.minScore))) buildings = buildings.filter((b) => (scoreOf(b) ?? 0) >= Number(params.minScore));
  if (params.grade) buildings = buildings.filter((b) => (b.building_grade ?? "").toLowerCase().includes(params.grade!.trim().toLowerCase()));
  if (params.availableOnly === "1") buildings = buildings.filter((b) => activeListingsOf(b).length > 0);
  if (params.minAreaPy && Number.isFinite(Number(params.minAreaPy))) {
    const a = Number(params.minAreaPy);
    buildings = buildings.filter((b) => activeListingsOf(b).some((l) => (l.exclusive_area_py ?? 0) >= a));
  }
  if (params.maxRentPerPy && Number.isFinite(Number(params.maxRentPerPy))) {
    const r = Number(params.maxRentPerPy);
    buildings = buildings.filter((b) => activeListingsOf(b).some((l) => l.rent_per_py !== null && l.rent_per_py <= r));
  }

  const sort = params.sort ?? "recommended";
  const minRent = (b: RawBuilding) => { const xs=activeListingsOf(b).map(l=>l.rent_per_py).filter((v):v is number=>v!=null); return xs.length?Math.min(...xs):Number.POSITIVE_INFINITY; };
  const minArea = (b: RawBuilding) => { const xs=activeListingsOf(b).map(l=>l.exclusive_area_py).filter((v):v is number=>v!=null); return xs.length?Math.min(...xs):Number.POSITIVE_INFINITY; };
  if (sort === "rent") buildings.sort((a,b)=>minRent(a)-minRent(b));
  if (sort === "area") buildings.sort((a,b)=>minArea(a)-minArea(b));
  if (sort === "score") buildings.sort((a,b)=>(scoreOf(b)??-1)-(scoreOf(a)??-1));
  if (sort === "latest") buildings.sort((a,b)=>String(b.data_last_verified_at??"").localeCompare(String(a.data_last_verified_at??"")));

  const totalBuildings = buildings.length;
  const pageSize = 24;
  const totalPages = Math.max(1, Math.ceil(totalBuildings / pageSize));
  const requestedPage = Number(params.page ?? "1");
  const currentPage = Number.isFinite(requestedPage) ? Math.min(totalPages, Math.max(1, Math.floor(requestedPage))) : 1;
  const pageBuildings = buildings.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const queryStringForPage = (page: number) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (key !== "page" && value) query.set(key, String(value));
    });
    if (page > 1) query.set("page", String(page));
    return `/buildings${query.toString() ? `?${query.toString()}` : ""}`;
  };

  const hasFilters = Boolean(q || params.district || params.minYear || params.minScore || params.grade || params.minAreaPy || params.maxRentPerPy || params.availableOnly === "1");

  return (
    <main id="main-content" className="min-h-screen bg-fog">
      <section className="bg-navy px-6 py-14 text-white">
        <div className="mx-auto max-w-7xl">
          <p className="mb-2 text-xs uppercase tracking-[0.28em] text-silver">Prime Office Database</p>
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="font-display text-4xl kr-text">프라임 오피스 찾기</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-silver kr-text">건물 자체 정보와 현재 공개 공실을 함께 확인하고, 필요한 후보는 최대 4개까지 비교할 수 있습니다.</p>
            </div>
            <Link href="/advisory" className="w-fit border border-white/35 px-5 py-2.5 text-sm hover:bg-white hover:text-navy">직접 찾기 어렵다면 맞춤 제안 요청 →</Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 py-9">
        <form method="get" className="mb-6 border border-silver/25 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <label className="mb-1.5 block text-xs text-silver">건물명 또는 주소</label>
              <input name="q" defaultValue={params.q ?? ""} className="w-full border border-silver/45 px-3 py-2.5 text-sm focus:border-navy focus:outline-none" placeholder="예: 파크원, 테헤란로" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-silver">업무권역</label>
              <select name="district" defaultValue={params.district ?? ""} className="w-full border border-silver/45 px-3 py-2.5 text-sm"><option value="">전체 권역</option>{(districts ?? []).map((d) => <option key={d.id} value={d.slug}>{d.name}</option>)}</select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-silver">최소 전용면적(평)</label>
              <input type="number" min="0" name="minAreaPy" defaultValue={params.minAreaPy ?? ""} className="w-full border border-silver/45 px-3 py-2.5 text-sm" placeholder="예: 100" />
            </div>
          </div>

          <details className="mt-4 border-t border-silver/20 pt-4" open={Boolean(params.minYear || params.grade || params.minScore || params.maxRentPerPy)}>
            <summary className="cursor-pointer text-xs font-medium text-navy">상세 조건 더보기</summary>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div><label className="mb-1.5 block text-xs text-silver">준공연도 이후</label><input type="number" name="minYear" defaultValue={params.minYear ?? ""} className="w-full border border-silver/45 px-3 py-2.5 text-sm" placeholder="예: 2010" /></div>
              <div><label className="mb-1.5 block text-xs text-silver">건물 등급</label><input name="grade" defaultValue={params.grade ?? ""} className="w-full border border-silver/45 px-3 py-2.5 text-sm" placeholder="예: Prime, A+" /></div>
              <div><label className="mb-1.5 block text-xs text-silver">Prime Score 최소</label><input type="number" min="0" max="100" name="minScore" defaultValue={params.minScore ?? ""} className="w-full border border-silver/45 px-3 py-2.5 text-sm" placeholder="예: 80" /></div>
              <div><label className="mb-1.5 block text-xs text-silver">평당 임대료 최대(원)</label><input type="number" min="0" name="maxRentPerPy" defaultValue={params.maxRentPerPy ?? ""} className="w-full border border-silver/45 px-3 py-2.5 text-sm" placeholder="예: 150000" /></div>
            </div>
          </details>

          <div className="mt-4 flex flex-col gap-3 border-t border-silver/20 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="availableOnly" value="1" defaultChecked={params.availableOnly === "1"} /> 현재 공실이 있는 건물만 보기</label>
            <div className="flex gap-2"><Link href="/buildings" className="border border-silver/40 px-4 py-2 text-sm text-silver hover:text-charcoal">조건 초기화</Link><button type="submit" className="bg-navy px-6 py-2 text-sm text-white hover:bg-charcoal">검색하기</button></div>
          </div>
        </form>

        <div className="sticky top-[68px] z-20 -mx-2 mb-5 flex flex-col gap-3 border-y border-silver/20 bg-fog/95 px-2 py-3 backdrop-blur lg:flex-row lg:items-center lg:justify-between">
          <div><p className="text-sm text-charcoal"><b className="tabular-nums">{totalBuildings}</b>개 건물</p>{hasFilters && <p className="mt-1 text-xs text-silver">현재 입력한 조건을 적용한 결과입니다.</p>}</div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <form method="get" className="flex items-center gap-2">
              {Object.entries(params).filter(([k,v])=>k!=="sort" && k!=="page" && v).map(([k,v])=><input key={k} type="hidden" name={k} value={String(v)} />)}
              <label className="text-xs text-silver" htmlFor="sort">정렬</label>
              <select id="sort" name="sort" defaultValue={sort} onChange={undefined} className="border border-silver/40 bg-white px-3 py-2 text-xs">
                <option value="recommended">추천순</option><option value="latest">최근 확인순</option><option value="rent">임대료 낮은순</option><option value="area">면적 작은순</option><option value="score">Prime Score순</option>
              </select>
              <button className="border border-silver/40 bg-white px-3 py-2 text-xs">적용</button>
            </form>
            {totalBuildings >= 2 && <ComparePicker items={buildings.map((b) => ({ id: b.id, name: b.name }))} />}
          </div>
        </div>

        {totalBuildings === 0 ? (
          <div className="border border-dashed border-silver/40 bg-white px-6 py-20 text-center"><h2 className="text-lg font-medium">조건에 맞는 공개 빌딩이 없습니다.</h2><p className="mt-2 text-sm text-silver kr-text">조건을 조금 넓히거나 상담을 남겨주시면 공개 전 공실까지 포함해 확인해 드립니다.</p><Link href="/advisory" className="mt-6 inline-block bg-navy px-5 py-2.5 text-sm text-white">맞춤 제안 요청</Link></div>
        ) : (
          <div className="grid grid-cols-1 gap-7 md:grid-cols-2 lg:grid-cols-3">
            {pageBuildings.map((b) => {
              const img = primaryImageOf(b);
              const score = scoreOf(b);
              const active = activeListingsOf(b);
              const areas = active.map((l) => l.exclusive_area_py).filter((v): v is number => v != null).sort((a, c) => a - c);
              const rents = active.map((l) => l.rent_per_py).filter((v): v is number => v != null).sort((a, c) => a - c);
              const latestReport = active.map((l) => l.report_date).filter((v): v is string => Boolean(v)).sort().at(-1) ?? null;
              return (
                <Link key={b.id} href={`/buildings/${b.slug}`} className="public-card-hover group block overflow-hidden border border-silver/25 bg-white">
                  <div className="relative h-48 overflow-hidden bg-fog">{img ? <img src={img} alt={b.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" /> : <div className="flex h-full items-center justify-center bg-gradient-to-br from-fog to-silver/20 text-xs tracking-[.18em] text-silver">CORE PRIME</div>}<span className={`absolute left-3 top-3 px-2.5 py-1 text-xs ${active.length ? "bg-navy text-white" : "bg-white/95 text-silver"}`}>{active.length ? `현재 공실 ${active.length}건` : "공실 문의"}</span></div>
                  <div className="p-5"><div className="flex items-center justify-between gap-3 text-xs text-silver"><span>{b.districts?.name ?? "권역 미정"}</span><span>{b.building_grade ?? "등급 미정"}</span></div><h2 className="mt-2 font-display text-xl kr-text">{b.name}</h2><p className="mt-2 min-h-[2.5rem] text-xs leading-5 text-silver kr-text">{b.road_address ?? b.address ?? "주소 정보 준비중"}</p>
                    <div className="mt-4 grid grid-cols-2 gap-2 border-t border-silver/20 pt-4 text-xs"><div><p className="text-silver">전용면적</p><p className="mt-1 font-medium">{areas.length ? `${Number(areas[0]).toLocaleString()}평부터` : "문의"}</p></div><div><p className="text-silver">평당 임대료</p><p className="mt-1 font-medium">{rents.length ? `${formatRent(rents[0])}부터` : "문의"}</p></div></div>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-silver"><span>{b.completion_year ? `${b.completion_year}년 준공` : "준공연도 미정"}</span><span>{score !== null ? `Prime Score ${score}` : "Prime Score 평가 준비중"}</span></div><div className="mt-3 flex items-center justify-between gap-2">{latestReport && <span className="text-[11px] text-silver">공실 기준 {latestReport}</span>}<FreshnessChip date={latestReport ?? b.data_last_verified_at} /></div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {totalBuildings > pageSize && (
          <nav className="mt-10 flex flex-wrap items-center justify-center gap-2" aria-label="오피스 검색 페이지">
            <Link aria-disabled={currentPage === 1} href={queryStringForPage(Math.max(1, currentPage - 1))} className={`border px-3 py-2 text-xs ${currentPage === 1 ? "pointer-events-none border-silver/20 text-silver/50" : "border-silver/40 bg-white text-charcoal hover:border-navy"}`}>이전</Link>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <Link key={page} aria-current={page === currentPage ? "page" : undefined} href={queryStringForPage(page)} className={`min-w-9 border px-3 py-2 text-center text-xs ${page === currentPage ? "border-navy bg-navy text-white" : "border-silver/40 bg-white text-charcoal hover:border-navy"}`}>{page}</Link>
            ))}
            <Link aria-disabled={currentPage === totalPages} href={queryStringForPage(Math.min(totalPages, currentPage + 1))} className={`border px-3 py-2 text-xs ${currentPage === totalPages ? "pointer-events-none border-silver/20 text-silver/50" : "border-silver/40 bg-white text-charcoal hover:border-navy"}`}>다음</Link>
          </nav>
        )}
        {totalBuildings > pageSize && <p className="mt-3 text-center text-[11px] text-silver">{totalBuildings}개 중 {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalBuildings)} 표시</p>}
      </div>
    </main>
  );
}
