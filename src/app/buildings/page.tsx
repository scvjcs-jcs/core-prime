import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { logPageView } from "@/lib/analytics";

export const metadata: Metadata = {
  title: "PRIME BUILDINGS | CORE PRIME",
  description: "서울 주요 업무권역의 프라임 오피스 빌딩을 검색하고 비교합니다.",
};

type RawBuilding = {
  id: string;
  name: string;
  name_en: string | null;
  slug: string;
  address: string | null;
  completion_year: number | null;
  above_ground_floors: number | null;
  gross_floor_area: number | null;
  building_grade: string | null;
  is_featured: boolean;
  districts: { id: string; name: string; slug: string } | null;
  building_scores: { total_score: number } | { total_score: number }[] | null;
  building_images: { url: string; is_primary: boolean }[] | null;
};

function primaryImageOf(b: RawBuilding): string | null {
  if (!b.building_images || b.building_images.length === 0) return null;
  return b.building_images.find((i) => i.is_primary)?.url ?? b.building_images[0].url;
}

function scoreOf(b: RawBuilding): number | null {
  if (!b.building_scores) return null;
  const s = Array.isArray(b.building_scores) ? b.building_scores[0] : b.building_scores;
  return s ? s.total_score : null;
}

export default async function BuildingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    district?: string;
    minYear?: string;
    minScore?: string;
    grade?: string;
  }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const [, { data: districts }, { data: buildingsRaw }] = await Promise.all([
    logPageView("/buildings"),
    supabase.from("districts").select("id, name, slug").order("name"),
    supabase
      .from("buildings")
      .select(
        `id, name, name_en, slug, address, completion_year, above_ground_floors, gross_floor_area, building_grade, is_featured,
         districts(id, name, slug),
         building_scores(total_score),
         building_images(url, is_primary)`
      )
      .eq("is_published", true)
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  let buildings = (buildingsRaw ?? []) as unknown as RawBuilding[];

  if (params.district) {
    buildings = buildings.filter((b) => b.districts?.slug === params.district);
  }
  if (params.minYear) {
    const y = Number(params.minYear);
    buildings = buildings.filter((b) => (b.completion_year ?? 0) >= y);
  }
  if (params.minScore) {
    const s = Number(params.minScore);
    buildings = buildings.filter((b) => (scoreOf(b) ?? 0) >= s);
  }
  if (params.grade) {
    buildings = buildings.filter((b) => b.building_grade === params.grade);
  }

  return (
    <main className="min-h-screen bg-fog">
      <div className="bg-navy text-white py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <p className="uppercase tracking-[0.3em] text-silver text-xs mb-3">
            Prime Office Advisory
          </p>
          <h1 className="font-display text-3xl md:text-4xl kr-text">PRIME BUILDINGS</h1>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-10">
        <form
          method="get"
          className="bg-white border border-silver/30 p-5 mb-10 grid grid-cols-1 md:grid-cols-5 gap-4 items-end"
        >
          <div>
            <label className="block text-xs text-silver mb-1">지역</label>
            <select
              name="district"
              defaultValue={params.district ?? ""}
              className="w-full border border-silver/50 px-3 py-2 text-sm"
            >
              <option value="">전체</option>
              {(districts ?? []).map((d) => (
                <option key={d.id} value={d.slug}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-silver mb-1">준공연도(이후)</label>
            <input
              type="number"
              name="minYear"
              defaultValue={params.minYear ?? ""}
              className="w-full border border-silver/50 px-3 py-2 text-sm"
              placeholder="예: 2010"
            />
          </div>
          <div>
            <label className="block text-xs text-silver mb-1">건물 등급</label>
            <input
              type="text"
              name="grade"
              defaultValue={params.grade ?? ""}
              className="w-full border border-silver/50 px-3 py-2 text-sm"
              placeholder="예: Prime"
            />
          </div>
          <div>
            <label className="block text-xs text-silver mb-1">Prime Score(최소)</label>
            <input
              type="number"
              name="minScore"
              min={0}
              max={100}
              defaultValue={params.minScore ?? ""}
              className="w-full border border-silver/50 px-3 py-2 text-sm"
              placeholder="0-100"
            />
          </div>
          <button
            type="submit"
            className="bg-navy text-white px-6 py-2.5 text-sm hover:bg-charcoal transition-colors"
          >
            검색
          </button>
        </form>

        <p className="text-sm text-silver mb-6">{buildings.length}개 건물</p>

        {buildings.length === 0 ? (
          <p className="text-center text-silver py-24 border border-dashed border-silver/40">
            조건에 맞는 건물이 없습니다.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {buildings.map((b) => {
              const img = primaryImageOf(b);
              const score = scoreOf(b);
              return (
                <Link
                  key={b.id}
                  href={`/buildings/${b.slug}`}
                  className="block bg-white border border-silver/30 hover:shadow-lg transition-shadow"
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
                    <h3 className="font-display text-lg mb-2 kr-text">{b.name}</h3>
                    <p className="text-xs text-silver mb-3 kr-text">{b.address ?? ""}</p>
                    <div className="flex items-center justify-between text-xs text-charcoal border-t border-silver/20 pt-3">
                      <span>{b.completion_year ? `${b.completion_year}년 준공` : "-"}</span>
                      {score !== null && (
                        <span className="font-display text-navy">Score {score}</span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
