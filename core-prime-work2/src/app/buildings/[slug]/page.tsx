import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LISTING_STATUS_LABEL } from "@/lib/labels";
import { logPageView } from "@/lib/analytics";

async function getBuilding(slug: string) {
  const supabase = await createClient();
  const { data: building } = await supabase
    .from("buildings")
    .select("*, districts(id, name, slug)")
    .eq("slug", slug)
    .eq("is_published", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (!building) return null;

  const [{ data: images }, { data: transportation }, { data: parking }, { data: scores }, { data: listings }] =
    await Promise.all([
      supabase
        .from("building_images")
        .select("*")
        .eq("building_id", building.id)
        .eq("is_published", true)
        .order("sort_order"),
      supabase.from("building_transportation").select("*").eq("building_id", building.id),
      supabase.from("building_parking").select("*").eq("building_id", building.id).maybeSingle(),
      supabase.from("building_scores").select("*").eq("building_id", building.id).maybeSingle(),
      supabase
        .from("listings")
        .select("*")
        .eq("building_id", building.id)
        .eq("is_published", true)
        .in("status", ["available", "negotiating", "contracting"])
        .order("status", { ascending: true })
        .order("exclusive_area_py", { ascending: true }),
    ]);

  return {
    building,
    images: images ?? [],
    transportation: transportation ?? [],
    parking,
    scores,
    listings: listings ?? [],
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await getBuilding(slug);
  if (!data) return { title: "건물을 찾을 수 없습니다 | CORE PRIME" };

  const { building } = data;
  const title = building.meta_title || `${building.name} | CORE PRIME`;
  const description =
    building.meta_description ||
    `${building.name} — ${building.address ?? ""} 프라임 오피스 정보, Prime Score, 임대 안내`;

  return {
    title,
    description,
    alternates: { canonical: `/buildings/${building.slug}` },
    openGraph: {
      title,
      description,
      images: data.images[0]?.url ? [data.images[0].url] : undefined,
    },
  };
}

const SCORE_LABELS: [string, string][] = [
  ["location_score", "입지"],
  ["transportation_score", "교통"],
  ["building_quality_score", "건물 품질"],
  ["parking_score", "주차"],
  ["amenities_score", "편의시설"],
  ["corporate_image_score", "기업 이미지"],
  ["employee_access_score", "직원 접근성"],
];

export default async function BuildingDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getBuilding(slug);
  if (!data) notFound();

  const { building, images, transportation, parking, scores, listings } = data;
  const primaryImage = images.find((i) => i.is_primary)?.url ?? images[0]?.url ?? null;
  const supabase = await createClient();
  const { data: similarBuildings } = building.district_id ? await supabase
    .from("buildings")
    .select("id,name,slug,completion_year,building_grade")
    .eq("district_id", building.district_id)
    .eq("is_published", true)
    .is("deleted_at", null)
    .neq("id", building.id)
    .limit(4) : { data: [] as any[] };

  // 조회수 기록 — generateMetadata에서 한 번, 이 컴포넌트에서 한 번 getBuilding()이 호출되어
  // 중복 집계될 수 있으므로, 조회 기록은 반드시 이 페이지 컴포넌트에서만 남깁니다.
  await logPageView(`/buildings/${slug}`, building.id);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: building.name,
    address: building.address ?? undefined,
    url: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://core-prime-jade.vercel.app"}/buildings/${building.slug}`,
    image: primaryImage ?? undefined,
  };

  return (
    <main className="min-h-screen bg-white">
      {/* eslint-disable-next-line react/no-danger */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="h-[50vh] bg-navy relative overflow-hidden">
        {primaryImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={primaryImage} alt={building.name} className="w-full h-full object-cover opacity-80" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-navy/90 via-navy/20 to-transparent flex items-end">
          <div className="max-w-5xl mx-auto px-6 pb-10 w-full text-white">
            <p className="text-xs uppercase tracking-[0.3em] text-silver mb-2">
              {building.districts?.name ?? ""}
            </p>
            <h1 className="font-display text-3xl md:text-5xl kr-text">{building.name}</h1>
            <p className="text-silver mt-2 kr-text">{building.address}</p>
          </div>
        </div>
      </div>

      {images.length > 1 && (
        <div className="max-w-5xl mx-auto px-6 py-6 grid grid-cols-3 md:grid-cols-5 gap-2">
          {images.slice(0, 10).map((img) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={img.id}
              src={img.url}
              alt={img.alt_text ?? building.name}
              className="w-full h-20 object-cover"
            />
          ))}
        </div>
      )}

      <div className="max-w-5xl mx-auto px-6 py-12 grid grid-cols-1 md:grid-cols-3 gap-12">
        <div className="md:col-span-2 space-y-10">
          <section>
            <h2 className="text-sm tracking-wide text-silver mb-4 border-b border-silver/20 pb-2">
              건물 정보
            </h2>
            <dl className="grid grid-cols-2 gap-y-3 text-sm">
              <dt className="text-silver">준공연도</dt>
              <dd>{building.completion_year ?? "-"}</dd>
              <dt className="text-silver">규모</dt>
              <dd>
                지하 {building.basement_floors ?? "-"}층 / 지상 {building.above_ground_floors ?? "-"}층
              </dd>
              <dt className="text-silver">연면적</dt>
              <dd>{building.gross_floor_area ? `${building.gross_floor_area.toLocaleString()} ㎡` : "-"}</dd>
              <dt className="text-silver">전용률</dt>
              <dd>{building.efficiency_ratio ? `${building.efficiency_ratio}%` : "-"}</dd>
              <dt className="text-silver">건물 등급</dt>
              <dd>{building.building_grade ?? "-"}</dd>
              <dt className="text-silver">건물 용도</dt>
              <dd>{building.building_use ?? "-"}</dd>
            </dl>
          </section>

          {transportation.length > 0 && (
            <section>
              <h2 className="text-sm tracking-wide text-silver mb-4 border-b border-silver/20 pb-2">
                대중교통
              </h2>
              <ul className="space-y-2 text-sm">
                {transportation.map((t) => (
                  <li key={t.id} className="flex gap-3">
                    <span className="text-navy">{t.transport_type}</span>
                    <span>
                      {t.line_name} {t.station_name}
                      {t.walk_minutes ? ` · 도보 ${t.walk_minutes}분` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
              <h2 className="text-sm tracking-wide text-silver mb-4 border-b border-silver/20 pb-2">
                임대 매물
              </h2>
              <div className="space-y-3">
                {listings.map((l) => (
                  <div key={l.id} className="border border-silver/30 p-4 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div>
                      <p className="kr-text font-medium">
                        {l.floor ?? "층 미정"} · {l.exclusive_area_py ? `전용 ${Number(l.exclusive_area_py).toLocaleString()}평` : l.exclusive_area ? `전용 ${Number(l.exclusive_area).toLocaleString()}㎡` : "면적 문의"}
                      </p>
                      <p className="text-silver text-xs mt-1">
                        {l.rent_per_py ? `평당 임대료 ${Number(l.rent_per_py).toLocaleString()}원` : l.monthly_rent ? `월 임대료 ${Number(l.monthly_rent).toLocaleString()}만원` : "임대료 문의"}
                        {l.maintenance_per_py ? ` · 관리비 ${Number(l.maintenance_per_py).toLocaleString()}원/평` : ""}
                        {l.noc_per_py ? ` · NOC ${Number(l.noc_per_py).toLocaleString()}원/평` : ""}
                      </p>
                      <p className="text-silver text-xs mt-1">입주 {l.move_in_text ?? l.available_date ?? "협의"}{l.report_date ? ` · 기준 ${l.report_date}` : ""}</p>
                    </div>
                    <span className="text-xs text-navy bg-fog px-2 py-0.5 border border-silver/30">
                      {LISTING_STATUS_LABEL[l.status] ?? l.status}
                    </span>
                  </div>
                ))}
              </div>
            </section>

          {listings.length === 0 && <section className="border border-silver/30 bg-fog p-6"><p className="text-sm font-medium">현재 공개된 공실이 없습니다.</p><p className="mt-2 text-xs leading-5 text-silver kr-text">임대 자료는 수시로 변경됩니다. 희망 면적과 입주 시기를 남겨주시면 비공개·업데이트 예정 공실까지 함께 확인해 드립니다.</p><Link href={`/advisory?building=${encodeURIComponent(building.name)}`} className="mt-4 inline-block bg-navy px-4 py-2 text-xs text-white">이 건물 공실 문의</Link></section>}

          {parking && (
            <section>
              <h2 className="text-sm tracking-wide text-silver mb-4 border-b border-silver/20 pb-2">
                주차
              </h2>
              <dl className="grid grid-cols-2 gap-y-3 text-sm">
                <dt className="text-silver">총 주차대수</dt>
                <dd>{parking.total_spaces ?? "-"}대</dd>
                <dt className="text-silver">월 주차비</dt>
                <dd>{parking.monthly_fee ? `${parking.monthly_fee.toLocaleString()}원` : "-"}</dd>
                <dt className="text-silver">전기차 충전</dt>
                <dd>{parking.ev_charging ? "가능" : "-"}</dd>
              </dl>
            </section>
          )}
        </div>

        <aside>
          {/* Prime Score는 status가 PUBLISHED(공개)일 때만 고객에게 보여줍니다. */}
          {scores && scores.status === "PUBLISHED" && (
            <div className="bg-navy text-white p-6">
              <p className="text-xs uppercase tracking-[0.2em] text-silver mb-2">Prime Score</p>
              <p className="font-display text-5xl mb-6">{scores.total_score}</p>
              <div className="space-y-3">
                {SCORE_LABELS.map(([key, label]) => (
                  <div key={key} className="text-xs">
                    <div className="flex justify-between mb-1 text-silver">
                      <span>{label}</span>
                      <span>{(scores as unknown as Record<string, number>)[key]}</span>
                    </div>
                    <div className="h-1 bg-white/20">
                      <div
                        className="h-1 bg-white"
                        style={{ width: `${(scores as unknown as Record<string, number>)[key]}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(!scores || scores.status !== "PUBLISHED") && (
            <div className="border border-silver/30 bg-fog p-6">
              <p className="text-xs uppercase tracking-[0.2em] text-silver mb-2">Prime Score</p>
              <p className="text-lg font-medium">평가 준비중</p>
              <p className="text-xs text-silver mt-2">입지·교통·건물품질·주차·편의시설 등을 검토한 뒤 공개됩니다.</p>
            </div>
          )}

          <div className="mt-6 border border-silver/30 bg-white p-5"><p className="text-xs text-silver">현재 공개 공실</p><p className="mt-1 text-2xl font-display">{listings.length}건</p>{building.data_last_verified_at && <p className="mt-1 text-[11px] text-silver">건물정보 확인 {new Date(building.data_last_verified_at).toLocaleDateString("ko-KR")}</p>}</div>
          <Link href={`/advisory?building=${encodeURIComponent(building.name)}`} className="mt-3 block bg-navy px-6 py-3 text-center text-sm text-white transition-colors hover:bg-charcoal">이 건물로 상담 신청</Link>
        </aside>
      </div>

      {similarBuildings && similarBuildings.length > 0 && (
        <section className="max-w-5xl mx-auto px-6 pb-16">
          <div className="border-t border-silver/20 pt-8">
            <div className="flex items-center justify-between mb-4"><h2 className="font-display text-xl">비슷한 권역의 오피스</h2><Link href={`/buildings?district=${building.districts?.slug ?? ""}`} className="text-xs text-navy hover:underline">같은 권역 전체보기 →</Link></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">{similarBuildings.map((b:any)=><Link key={b.id} href={`/buildings/${b.slug}`} className="border border-silver/30 p-4 hover:border-navy"><p className="font-medium">{b.name}</p><p className="text-xs text-silver mt-1">{b.building_grade ?? "등급 미정"} · {b.completion_year ? `${b.completion_year}년` : "준공연도 미정"}</p></Link>)}</div>
          </div>
        </section>
      )}
    </main>
  );
}
