import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DeleteBuildingButton from "@/components/admin/DeleteBuildingButton";

const FILTERS = [
  { key: "active", label: "정상" },
  { key: "deleted", label: "삭제됨" },
  { key: "all", label: "전체" },
] as const;

export default async function AdminBuildingsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter: rawFilter } = await searchParams;
  const filter = (["active", "deleted", "all"] as const).includes(rawFilter as "active" | "deleted" | "all")
    ? (rawFilter as "active" | "deleted" | "all")
    : "active";

  const supabase = await createClient();

  let query = supabase
    .from("buildings")
    .select("id, name, status, is_published, completion_year, created_at, deleted_at, districts(name)")
    .order("created_at", { ascending: false });

  if (filter === "active") {
    query = query.is("deleted_at", null);
  } else if (filter === "deleted") {
    query = query.not("deleted_at", "is", null);
  }

  const { data: buildings, error } = await query;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl">건물 관리</h1>
        <Link
          href="/admin/buildings/new"
          className="text-sm bg-navy text-white px-4 py-2 hover:bg-charcoal transition-colors"
        >
          + 건물 등록
        </Link>
      </div>

      <div className="flex gap-2 mb-5">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "active" ? "/admin/buildings" : `/admin/buildings?filter=${f.key}`}
            className={`text-xs px-3 py-1.5 border transition-colors ${
              filter === f.key
                ? "bg-navy text-white border-navy"
                : "border-silver/40 text-silver hover:text-charcoal"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {error && (
        <p className="text-sm text-red-600 mb-4">
          건물 목록을 불러오지 못했습니다: {error.message}
        </p>
      )}

      <div className="bg-white border border-silver/30 overflow-x-auto">
        <table className="w-full text-sm min-w-[780px]">
          <thead>
            <tr className="text-left text-silver border-b border-silver/30">
              <th className="px-4 py-3 font-normal">건물명</th>
              <th className="px-4 py-3 font-normal">지역</th>
              <th className="px-4 py-3 font-normal">준공연도</th>
              <th className="px-4 py-3 font-normal">상태</th>
              <th className="px-4 py-3 font-normal">공개여부</th>
              <th className="px-4 py-3 font-normal">삭제여부</th>
              <th className="px-4 py-3 font-normal text-right">관리</th>
            </tr>
          </thead>
          <tbody>
            {(buildings ?? []).map((b) => (
              <tr key={b.id} className="border-b border-silver/20 last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/admin/buildings/${b.id}`} className="hover:underline">
                    {b.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-silver">
                  {(b.districts as unknown as { name: string } | null)?.name ?? "-"}
                </td>
                <td className="px-4 py-3 text-silver">{b.completion_year ?? "-"}</td>
                <td className="px-4 py-3 text-silver">{b.status}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      b.is_published
                        ? "text-green-700 bg-green-50 px-2 py-0.5 text-xs border border-green-200"
                        : "text-silver bg-fog px-2 py-0.5 text-xs border border-silver/30"
                    }
                  >
                    {b.is_published ? "공개" : "비공개"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {b.deleted_at ? (
                    <span className="text-red-700 bg-red-50 px-2 py-0.5 text-xs border border-red-200">
                      삭제됨
                    </span>
                  ) : (
                    <span className="text-silver text-xs">정상</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right space-x-3">
                  <Link href={`/admin/buildings/${b.id}`} className="text-navy hover:underline">
                    수정
                  </Link>
                  <DeleteBuildingButton id={b.id} name={b.name} deletedAt={b.deleted_at} />
                </td>
              </tr>
            ))}
            {(!buildings || buildings.length === 0) && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-silver">
                  {filter === "deleted"
                    ? "삭제(보관)된 건물이 없습니다."
                    : "아직 등록된 건물이 없습니다. 우측 상단의 '건물 등록' 버튼으로 첫 건물을 등록해 보세요."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
