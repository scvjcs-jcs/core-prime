import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type FeaturedBuilding = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  completion_year: number | null;
  districts: { name: string } | null;
  building_images: { url: string; is_primary: boolean }[] | null;
};

export default async function HomePage() {
  const supabase = await createClient();

  const [{ data: districts }, { data: buildingsRaw }] = await Promise.all([
    supabase.from("districts").select("id, name, slug").eq("is_published", true).order("name"),
    supabase
      .from("buildings")
      .select("id, name, slug, address, completion_year, districts(name), building_images(url, is_primary)")
      .eq("is_published", true)
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const buildings = (buildingsRaw ?? []) as unknown as FeaturedBuilding[];

  return (
    <main>
      <section className="min-h-screen bg-navy text-white flex flex-col items-center justify-center px-6 text-center">
        <p className="uppercase tracking-[0.3em] text-silver text-xs mb-6">
          Prime Office Advisory
        </p>
        <h1 className="font-display text-3xl md:text-5xl leading-snug max-w-3xl kr-text">
          서울의 프라임 오피스를
          <br />
          기업의 관점에서 제안합니다.
        </h1>
        <p className="mt-6 text-silver max-w-xl kr-text">
          강남, 여의도, 광화문, 성수, 용산, 판교 등 서울 주요 업무권역의 프라임
          오피스를 선별하고 기업의 규모와 이전 목적에 맞는 최적의 공간을
          제안합니다.
        </p>
        <div className="mt-10 flex flex-wrap gap-4 justify-center">
          <Link
            href="/buildings"
            className="inline-block border border-white bg-white text-navy px-6 py-3 text-sm tracking-wide hover:bg-transparent hover:text-white transition-colors"
          >
            프라임 오피스 찾기
          </Link>
          <Link
            href="/advisory"
            className="inline-block border border-silver px-6 py-3 text-sm tracking-wide hover:bg-white hover:text-navy transition-colors"
          >
            기업 이전 상담
          </Link>
        </div>
      </section>

      {buildings.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 py-20">
          <div className="flex items-end justify-between mb-10">
            <h2 className="font-display text-2xl md:text-3xl kr-text">PRIME BUILDINGS</h2>
            <Link href="/buildings" className="text-sm text-navy hover:underline">
              전체보기 →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {buildings.map((b) => {
              const img =
                b.building_images?.find((i) => i.is_primary)?.url ??
                b.building_images?.[0]?.url ??
                null;
              return (
                <Link
                  key={b.id}
                  href={`/buildings/${b.slug}`}
                  className="block border border-silver/30 hover:shadow-lg transition-shadow"
                >
                  <div className="h-44 bg-fog overflow-hidden">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt={b.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-silver text-xs">
                        NO IMAGE
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <p className="text-xs text-silver mb-1">{b.districts?.name ?? "-"}</p>
                    <h3 className="font-display text-lg kr-text">{b.name}</h3>
                    <p className="text-xs text-silver mt-2 kr-text">{b.address ?? ""}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {districts && districts.length > 0 && (
        <section className="bg-fog py-20">
          <div className="max-w-6xl mx-auto px-6">
            <h2 className="font-display text-2xl md:text-3xl mb-10 kr-text">BUSINESS DISTRICTS</h2>
            <div className="flex flex-wrap gap-3">
              {districts.map((d) => (
                <Link
                  key={d.id}
                  href={`/buildings?district=${d.slug}`}
                  className="border border-silver/40 px-5 py-2.5 text-sm hover:bg-navy hover:text-white hover:border-navy transition-colors"
                >
                  {d.name}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="max-w-6xl mx-auto px-6 py-20 text-center">
        <p className="uppercase tracking-[0.2em] text-silver text-xs mb-4">Office Advisory</p>
        <h2 className="font-display text-2xl md:text-3xl mb-6 kr-text">
          기업의 조건을 먼저 분석하고 공간을 제안합니다.
        </h2>
        <Link
          href="/admin"
          className="inline-block border border-silver px-6 py-3 text-sm tracking-wide hover:bg-navy hover:text-white hover:border-navy transition-colors"
        >
          관리자 화면으로 이동
        </Link>
      </section>
    </main>
  );
}
