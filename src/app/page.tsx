import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logPageView } from "@/lib/analytics";
import FreshnessChip from "@/components/FreshnessChip";
import { freshnessLabel, rangeLabel } from "@/lib/publicData";

type FeaturedBuilding = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  road_address: string | null;
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
  const [, { data: districts }, { data: buildingsRaw }, { data: availabilitySource }, { count: publishedBuildings }] = await Promise.all([
    logPageView("/"),
    supabase.from("districts").select("id, name, slug").eq("is_published", true).order("name"),
    supabase.from("buildings").select("id,name,slug,address,road_address,completion_year,building_grade,data_last_verified_at,districts(name,slug),building_images(url,is_primary),listings(id,status,is_published,exclusive_area_py,rent_per_py,report_date)").eq("is_published", true).is("deleted_at", null).order("is_featured", { ascending: false }).order("created_at", { ascending: false }).limit(6),
    supabase.from("buildings").select("id,listings(id,status,is_published)").eq("is_published", true).is("deleted_at", null),
    supabase.from("buildings").select("*", { count: "exact", head: true }).eq("is_published", true).is("deleted_at", null),
  ]);

  const buildings = (buildingsRaw ?? []) as unknown as FeaturedBuilding[];
  const publishedCount = Math.max(publishedBuildings ?? 0, availabilitySource?.length ?? 0, buildings.length);
  const availableListings = (availabilitySource ?? []).reduce((sum: number, row: any) => sum + (row.listings ?? []).filter((l: any) => l.is_published && ["available", "negotiating", "contracting"].includes(l.status)).length, 0);
  const hasPublishedData = publishedCount > 0;
  const heroBuilding = buildings[0] ?? null;
  const heroImage = heroBuilding?.building_images?.find((i) => i.is_primary)?.url ?? heroBuilding?.building_images?.[0]?.url ?? null;
  const heroLatestReport = heroBuilding ? activeListingsOf(heroBuilding).map((l) => l.report_date).filter((v): v is string => Boolean(v)).sort().at(-1) ?? heroBuilding.data_last_verified_at : null;
  const heroFreshness = freshnessLabel(heroLatestReport);

  return (
    <main id="main-content">
      <section className="relative overflow-hidden bg-navy text-white">
        <div className="absolute inset-0 opacity-[.12] [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:48px_48px]" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-6 py-14 md:py-20 lg:grid-cols-[1.03fr_.97fr] lg:items-stretch">
          <div className="flex flex-col justify-center py-2 lg:py-8">
            <div className="mb-5 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[.18em] text-silver"><span>Seoul Prime Office</span><span className="h-px w-8 bg-white/25"/><span>Verified Data</span></div>
            <h1 className="max-w-3xl font-display text-[42px] leading-[1.08] md:text-6xl kr-text">확인된 정보만,<br className="hidden md:block"/> 프라임 오피스를 말합니다.</h1>
            <div className="mt-6 max-w-2xl border-l border-white/25 pl-4">
              <p className="text-base font-medium leading-7 text-white kr-text">추측 대신 기록으로 확인하는 오피스.</p>
              <p className="mt-1 text-base font-medium leading-7 text-white kr-text">검증되지 않은 정보는 공개하지 않습니다.</p>
            </div>
            <p className="mt-5 max-w-2xl text-[15px] leading-7 text-silver md:text-base kr-text">건물 정보와 현재 공실을 원문 기준으로 검수하고, 기업의 면적·예산·입주 일정에 맞는 후보를 같은 기준으로 비교해 좁혀드립니다.</p>
            <div className="mt-8 flex flex-wrap gap-3"><Link href="/buildings" className="bg-white px-6 py-3 text-sm font-medium text-navy transition hover:bg-fog">오피스 찾기</Link><Link href="/advisory" className="border border-white/35 px-6 py-3 text-sm text-white transition hover:bg-white hover:text-navy">맞춤 후보 제안받기</Link></div>
            {hasPublishedData ? <div className="mt-9 grid max-w-xl grid-cols-3 border-t border-white/15 pt-5">
              <div><p className="text-[10px] uppercase tracking-[.14em] text-silver">Published</p><p className="mt-1 font-display text-2xl tabular-nums">{publishedCount}</p><p className="mt-1 text-[11px] text-silver">공개 빌딩</p></div>
              <div className="border-l border-white/10 pl-5"><p className="text-[10px] uppercase tracking-[.14em] text-silver">Availability</p><p className="mt-1 font-display text-2xl tabular-nums">{availableListings}</p><p className="mt-1 text-[11px] text-silver">현재 공실</p></div>
              <div className="border-l border-white/10 pl-5"><p className="text-[10px] uppercase tracking-[.14em] text-silver">Quality</p><p className="mt-1 text-sm font-medium">검수 후 공개</p><p className="mt-1 text-[11px] text-silver">기준일 표시</p></div>
            </div> : <div className="mt-9 grid max-w-xl grid-cols-3 border-t border-white/15 pt-5">
              <div><p className="text-[10px] uppercase tracking-[.14em] text-silver">DATA</p><p className="mt-1 text-sm font-medium">검수 진행중</p><p className="mt-1 text-[11px] text-silver">원문 기반 구조화</p></div>
              <div className="border-l border-white/10 pl-5"><p className="text-[10px] uppercase tracking-[.14em] text-silver">PUBLISH</p><p className="mt-1 text-sm font-medium">순차 공개</p><p className="mt-1 text-[11px] text-silver">검증 완료 후 노출</p></div>
              <div className="border-l border-white/10 pl-5"><p className="text-[10px] uppercase tracking-[.14em] text-silver">ADVISORY</p><p className="mt-1 text-sm font-medium">상담 가능</p><p className="mt-1 text-[11px] text-silver">비공개 후보 별도 확인</p></div>
            </div>}
          </div>

          <div className="relative min-h-[480px] overflow-hidden border border-white/15 bg-white/5 lg:min-h-[560px]">
            {heroImage ? <img src={heroImage} alt={heroBuilding?.name ?? "서울 프라임 오피스"} className="absolute inset-0 h-full w-full object-cover"/> : <div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_18%,rgba(255,255,255,.14),transparent_28%),radial-gradient(circle_at_20%_82%,rgba(255,255,255,.07),transparent_34%),linear-gradient(145deg,#1b2d4b,#0d1b30_62%,#182843)]"/>}
            <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/25 to-transparent"/>
            {heroBuilding ? <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8"><p className="text-[10px] uppercase tracking-[.18em] text-silver">Selected Building</p><div className="mt-2 flex items-end justify-between gap-4"><div><p className="font-display text-2xl">{heroBuilding.name}</p><p className="mt-1 text-xs text-silver">{heroBuilding.districts?.name ?? "서울"} · {heroBuilding.building_grade ?? "등급 확인중"}</p></div><Link href={`/buildings/${heroBuilding.slug}`} className="border border-white/30 px-3 py-2 text-xs hover:bg-white hover:text-navy">상세보기 →</Link></div></div> : <div className="absolute inset-0 flex items-center justify-center p-6 md:p-10"><div className="w-full max-w-md border border-white/15 bg-navy/55 p-6 backdrop-blur-sm md:p-8"><p className="text-[10px] uppercase tracking-[.2em] text-silver">CORE PRIME DATA WORKFLOW</p><h2 className="mt-3 font-display text-2xl kr-text">공개 전 데이터는<br/>검수 단계를 거칩니다.</h2><div className="mt-8 grid grid-cols-2 gap-px bg-white/10">{[["01","자료 수집"],["02","구조화"],["03","오류 검수"],["04","순차 공개"]].map(([n,label])=><div key={n} className="bg-navy/80 p-4"><p className="text-[10px] text-silver">{n}</p><p className="mt-3 text-sm">{label}</p></div>)}</div><p className="mt-5 text-xs leading-5 text-silver kr-text">현재 공개 전 데이터도 기업 조건을 남기면 별도로 확인해 후보를 제안할 수 있습니다.</p><Link href="/advisory" className="mt-5 inline-block border border-white/30 px-4 py-2 text-xs hover:bg-white hover:text-navy">맞춤 후보 요청 →</Link></div></div>}
            {heroBuilding && <div className="absolute right-5 top-5 border border-white/20 bg-navy/75 px-3 py-2 text-[11px] text-white backdrop-blur"><span className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${heroFreshness.tone === "stale" ? "bg-amber-300" : heroFreshness.tone === "muted" ? "bg-silver" : "bg-emerald-300"}`}/>{heroFreshness.label}</div>}
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto -mt-6 max-w-6xl px-6">
        <div className="border border-silver/25 bg-white p-5 shadow-xl shadow-navy/5 md:p-6">
          {hasPublishedData ? <>
            <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between"><div><p className="text-[10px] uppercase tracking-[.18em] text-silver">Office Search</p><h2 className="mt-1 font-display text-2xl kr-text">핵심 조건으로 바로 좁혀보세요</h2></div><p className="text-xs text-silver">현재 공개 공실 기준 · 최대 4개 비교 가능</p></div>
            <form action="/buildings" method="get" className="grid gap-3 md:grid-cols-[1.2fr_.8fr_.8fr_auto]">
              <select name="district" className="border border-silver/40 bg-white px-3 py-3 text-sm text-charcoal"><option value="">전체 업무권역</option>{(districts ?? []).map((d) => <option key={d.id} value={d.slug}>{d.name}</option>)}</select>
              <div className="relative"><input name="minAreaPy" type="number" min="0" className="w-full border border-silver/40 px-3 py-3 pr-10 text-sm" placeholder="최소 전용면적"/><span className="absolute right-3 top-3.5 text-xs text-silver">평</span></div>
              <div className="relative"><input name="maxRentPerPy" type="number" min="0" className="w-full border border-silver/40 px-3 py-3 pr-12 text-sm" placeholder="평당 임대료 최대"/><span className="absolute right-3 top-3.5 text-xs text-silver">원</span></div>
              <input type="hidden" name="availableOnly" value="1"/><button className="bg-navy px-6 py-3 text-sm font-medium text-white hover:bg-charcoal">검색</button>
            </form>
            {(districts ?? []).length>0&&<div className="mt-4 flex flex-wrap items-center gap-2"><span className="mr-1 text-[11px] text-silver">빠른 권역</span>{(districts ?? []).slice(0,8).map((d)=><Link key={d.id} href={`/buildings?district=${d.slug}&availableOnly=1`} className="border border-silver/30 px-3 py-1.5 text-xs text-charcoal transition hover:border-navy hover:text-navy">{d.name}</Link>)}</div>}
          </> : <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center"><div><p className="text-[10px] uppercase tracking-[.18em] text-silver">Office Advisory</p><h2 className="mt-1 font-display text-2xl kr-text">공개 데이터는 검수 완료 순서대로 열립니다.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-silver kr-text">현재 공개 전 데이터도 보유하고 있습니다. 원하는 권역·면적·예산·입주 시점을 남겨주시면 먼저 확인해 후보를 정리해드립니다.</p></div><div className="flex flex-wrap gap-2"><Link href="/advisory" className="bg-navy px-5 py-3 text-sm font-medium text-white hover:bg-charcoal">맞춤 후보 요청</Link><Link href="/buildings" className="border border-silver/40 px-5 py-3 text-sm text-charcoal hover:border-navy">공개 DB 확인</Link></div></div>}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="grid gap-10 lg:grid-cols-[.78fr_1.22fr] lg:items-start">
          <div className="lg:sticky lg:top-28"><p className="mb-3 text-[10px] uppercase tracking-[.2em] text-silver">Decision Framework</p><h2 className="font-display text-3xl leading-tight kr-text">매물을 찾는 데서 끝나지 않습니다.<br/>비교하고, 검증하고, 결정할 수 있게 만듭니다.</h2><p className="mt-4 max-w-md text-sm leading-6 text-silver kr-text">후보를 많이 보여주는 것보다, 비교할 이유가 있는 후보만 남기는 것이 더 중요합니다.</p><Link href="/advisory" className="mt-6 inline-block text-sm font-medium text-navy hover:underline">기업 조건으로 추천받기 →</Link></div>
          <div className="grid gap-px border border-silver/20 bg-silver/20 md:grid-cols-2">
            {[["01","Search","권역·면적·예산으로 후보군을 좁힙니다."],["02","Compare","공실·주차·교통·건물정보를 같은 기준으로 비교합니다."],["03","Verify","자료 기준일과 출처를 확인해 오래된 정보를 걸러냅니다."],["04","Advise","기업 조건과 우선순위를 반영해 shortlist를 제안합니다."]].map(([n,t,d])=><div key={n} className="bg-white p-7"><p className="font-display text-sm text-silver">{n}</p><h3 className="mt-6 text-sm font-medium uppercase tracking-[.12em] text-navy">{t}</h3><p className="mt-3 text-sm leading-6 text-silver kr-text">{d}</p></div>)}
          </div>
        </div>
      </section>

      {buildings.length > 0 && <section className="border-y border-silver/20 bg-fog py-20"><div className="mx-auto max-w-7xl px-6"><div className="mb-9 flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-silver">Selected Buildings</p><h2 className="font-display text-3xl kr-text">현재 확인 가능한 주요 오피스</h2></div><Link href="/buildings" className="text-sm font-medium text-navy hover:underline">전체 데이터베이스 보기 →</Link></div><div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">{buildings.map((b)=>{const img=b.building_images?.find((i)=>i.is_primary)?.url??b.building_images?.[0]?.url??null;const active=activeListingsOf(b);const areaRange=rangeLabel(active.map((l)=>l.exclusive_area_py),"평");const rentRange=rangeLabel(active.map((l)=>l.rent_per_py),"원/평");const latestReport=active.map((l)=>l.report_date).filter((v):v is string=>Boolean(v)).sort().at(-1)??b.data_last_verified_at;return <Link key={b.id} href={`/buildings/${b.slug}`} className="group overflow-hidden border border-silver/25 bg-white transition hover:-translate-y-1 hover:shadow-2xl hover:shadow-navy/10"><div className="relative h-56 overflow-hidden bg-white">{img?<img src={img} alt={b.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]"/>:<div className="flex h-full items-center justify-center bg-gradient-to-br from-fog to-silver/20 text-xs tracking-[.18em] text-silver">CORE PRIME</div>}<div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 to-transparent"/><span className={`absolute left-3 top-3 px-2.5 py-1 text-[11px] ${active.length?"bg-navy text-white":"bg-white/95 text-silver"}`}>{active.length?`공실 ${active.length}건`:"공실 문의"}</span><div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-3 text-white"><div><p className="text-[11px] text-white/70">{b.districts?.name??"권역 미정"}</p><h3 className="mt-1 font-display text-xl">{b.name}</h3></div><span className="text-[11px] text-white/80">{b.building_grade??"등급 확인중"}</span></div></div><div className="p-5"><p className="min-h-[2.5rem] text-xs leading-5 text-silver kr-text">{b.road_address ?? b.address ?? "주소 정보 준비중"}</p><div className="mt-4 grid grid-cols-2 gap-3 border-t border-silver/20 pt-4 text-xs"><div><p className="text-silver">전용면적</p><p className="mt-1 font-medium">{areaRange??"문의"}</p></div><div><p className="text-silver">평당 임대료</p><p className="mt-1 font-medium">{rentRange??"문의"}</p></div></div><div className="mt-4 flex items-center justify-between"><span className="text-[11px] text-silver">{b.completion_year?`${b.completion_year}년 준공`:"준공연도 확인중"}</span><FreshnessChip date={latestReport}/></div></div></Link>})}</div></div></section>}

      <section className="mx-auto max-w-7xl px-6 py-20"><div className="grid gap-8 lg:grid-cols-3"><div className="lg:col-span-1"><p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-silver">Why CORE PRIME</p><h2 className="font-display text-3xl kr-text">데이터와 자문의 중간을 채웁니다.</h2></div><div className="grid gap-4 md:grid-cols-3 lg:col-span-2"><div className="border border-silver/25 p-5"><p className="text-sm font-medium">검수된 데이터</p><p className="mt-2 text-xs leading-5 text-silver kr-text">PDF 원문을 구조화하고 오류 검수 후 공개합니다.</p></div><div className="border border-silver/25 p-5"><p className="text-sm font-medium">비교 가능한 기준</p><p className="mt-2 text-xs leading-5 text-silver kr-text">면적·임대료·주차·접근성·Prime Score를 같은 기준으로 봅니다.</p></div><div className="border border-silver/25 p-5"><p className="text-sm font-medium">기업 맞춤 shortlist</p><p className="mt-2 text-xs leading-5 text-silver kr-text">조건을 남기면 공개 전 후보까지 확인해 우선순위를 정리합니다.</p></div></div></div></section>

      <section className="bg-navy py-16 text-white"><div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-7 px-6 md:flex-row md:items-center"><div><p className="text-[10px] uppercase tracking-[.2em] text-silver">Office Advisory</p><h2 className="mt-2 font-display text-3xl kr-text">직접 찾는 시간이 아깝다면, 조건만 남겨주세요.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-silver kr-text">인원·예산·희망 권역·입주 시점에 맞춰 실제 검토할 만한 후보만 정리해 드립니다.</p></div><Link href="/advisory" className="shrink-0 bg-white px-6 py-3 text-sm font-medium text-navy">맞춤 제안 요청</Link></div></section>
    </main>
  );
}
