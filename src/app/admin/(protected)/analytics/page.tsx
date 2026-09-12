import { createClient } from "@/lib/supabase/server";

const PATH_LABEL: Record<string, string> = {
  "/": "홈페이지",
  "/buildings": "건물 검색",
  "/advisory": "상담 신청",
};

export default async function AdminAnalyticsPage() {
  const supabase = await createClient();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: totalViews },
    { count: last7Views },
    { data: recentRows },
  ] = await Promise.all([
    supabase.from("page_views").select("*", { count: "exact", head: true }),
    supabase
      .from("page_views")
      .select("*", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo),
    // 통계 계산용 원본 데이터 (최근 5000건까지) — 집계는 화면단(JS)에서 처리
    supabase
      .from("page_views")
      .select("path, building_id")
      .order("created_at", { ascending: false })
      .limit(5000),
  ]);

  const rows = recentRows ?? [];

  // 페이지별 방문 수 집계
  const pathCounts = new Map<string, number>();
  for (const r of rows) {
    pathCounts.set(r.path, (pathCounts.get(r.path) ?? 0) + 1);
  }
  const pathStats = [...pathCounts.entries()].sort((a, b) => b[1] - a[1]);
  const maxPathCount = pathStats[0]?.[1] ?? 1;

  // 건물별 조회 수 집계 (상위 5개)
  const buildingCounts = new Map<string, number>();
  for (const r of rows) {
    if (!r.building_id) continue;
    buildingCounts.set(r.building_id, (buildingCounts.get(r.building_id) ?? 0) + 1);
  }
  const topBuildingIds = [...buildingCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);

  const { data: topBuildings } =
    topBuildingIds.length > 0
      ? await supabase.from("buildings").select("id, name").in("id", topBuildingIds)
      : { data: [] as { id: string; name: string }[] };

  const buildingNameOf = (id: string) =>
    (topBuildings ?? []).find((b) => b.id === id)?.name ?? "(삭제된 건물)";

  const buildingStats = topBuildingIds.map((id) => ({
    id,
    name: buildingNameOf(id),
    count: buildingCounts.get(id) ?? 0,
  }));
  const maxBuildingCount = buildingStats[0]?.count ?? 1;

  const cards = [
    { label: "전체 방문 수", value: totalViews ?? 0 },
    { label: "최근 7일 방문 수", value: last7Views ?? 0 },
  ];

  return (
    <div>
      <h1 className="font-display text-2xl mb-6">방문자 통계</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {cards.map((c) => (
          <div key={c.label} className="bg-white border border-silver/30 p-5">
            <p className="text-xs text-silver mb-1">{c.label}</p>
            <p className="text-2xl font-display">{c.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <section className="bg-white border border-silver/30 p-6">
          <h2 className="text-sm tracking-wide text-silver mb-4 border-b border-silver/20 pb-2">
            인기 건물 TOP 5
          </h2>
          {buildingStats.length === 0 ? (
            <p className="text-sm text-silver py-8 text-center">
              아직 건물 상세페이지 조회 기록이 없습니다.
            </p>
          ) : (
            <div className="space-y-3">
              {buildingStats.map((b, i) => (
                <div key={b.id} className="text-xs">
                  <div className="flex justify-between mb-1">
                    <span className="kr-text">
                      {i + 1}. {b.name}
                    </span>
                    <span className="text-silver">{b.count}회</span>
                  </div>
                  <div className="h-1.5 bg-fog">
                    <div
                      className="h-1.5 bg-navy"
                      style={{ width: `${Math.max(4, (b.count / maxBuildingCount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white border border-silver/30 p-6">
          <h2 className="text-sm tracking-wide text-silver mb-4 border-b border-silver/20 pb-2">
            페이지별 방문 수
          </h2>
          {pathStats.length === 0 ? (
            <p className="text-sm text-silver py-8 text-center">아직 방문 기록이 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {pathStats.slice(0, 8).map(([path, count]) => (
                <div key={path} className="text-xs">
                  <div className="flex justify-between mb-1">
                    <span className="kr-text">{PATH_LABEL[path] ?? path}</span>
                    <span className="text-silver">{count}회</span>
                  </div>
                  <div className="h-1.5 bg-fog">
                    <div
                      className="h-1.5 bg-navy"
                      style={{ width: `${Math.max(4, (count / maxPathCount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <p className="text-xs text-silver mt-8">
        * 최근 5,000건의 방문 기록을 기준으로 집계합니다. 검색엔진 크롤러 등 자동화된 접속도 함께
        집계될 수 있습니다.
      </p>
    </div>
  );
}
