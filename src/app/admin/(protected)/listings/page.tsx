import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DeleteListingButton from "@/components/admin/DeleteListingButton";
import { LISTING_STATUS_LABEL } from "@/lib/labels";

export default async function AdminListingsPage() {
  const supabase = await createClient();

  const { data: listings, error } = await supabase
    .from("listings")
    .select("id, listing_code, floor, exclusive_area, monthly_rent, status, is_published, buildings(name)")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl">매물 관리</h1>
        <Link
          href="/admin/listings/new"
          className="text-sm bg-navy text-white px-4 py-2 hover:bg-charcoal transition-colors"
        >
          + 매물 등록
        </Link>
      </div>

      {error && (
        <p className="text-sm text-red-600 mb-4">
          목록을 불러오지 못했습니다: {error.message}
        </p>
      )}

      <div className="bg-white border border-silver/30 overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="text-left text-silver border-b border-silver/30">
              <th className="px-4 py-3 font-normal">건물</th>
              <th className="px-4 py-3 font-normal">층</th>
              <th className="px-4 py-3 font-normal">전용면적</th>
              <th className="px-4 py-3 font-normal">월 임대료</th>
              <th className="px-4 py-3 font-normal">상태</th>
              <th className="px-4 py-3 font-normal">공개여부</th>
              <th className="px-4 py-3 font-normal text-right">관리</th>
            </tr>
          </thead>
          <tbody>
            {(listings ?? []).map((l) => {
              const buildingName =
                (l.buildings as unknown as { name: string } | null)?.name ?? "-";
              return (
                <tr key={l.id} className="border-b border-silver/20 last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/admin/listings/${l.id}`} className="hover:underline">
                      {buildingName}
                      {l.listing_code ? ` · ${l.listing_code}` : ""}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-silver">{l.floor ?? "-"}</td>
                  <td className="px-4 py-3 text-silver">
                    {l.exclusive_area ? `${l.exclusive_area} ㎡` : "-"}
                  </td>
                  <td className="px-4 py-3 text-silver">
                    {l.monthly_rent ? `${l.monthly_rent.toLocaleString()}만원` : "-"}
                  </td>
                  <td className="px-4 py-3 text-silver">
                    {LISTING_STATUS_LABEL[l.status] ?? l.status}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        l.is_published
                          ? "text-green-700 bg-green-50 px-2 py-0.5 text-xs border border-green-200"
                          : "text-silver bg-fog px-2 py-0.5 text-xs border border-silver/30"
                      }
                    >
                      {l.is_published ? "공개" : "비공개"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-3">
                    <Link href={`/admin/listings/${l.id}`} className="text-navy hover:underline">
                      수정
                    </Link>
                    <DeleteListingButton id={l.id} label={`${buildingName} ${l.floor ?? ""}`} />
                  </td>
                </tr>
              );
            })}
            {(!listings || listings.length === 0) && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-silver">
                  아직 등록된 매물이 없습니다. 우측 상단의 &apos;매물 등록&apos; 버튼으로 첫 매물을 등록해 보세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
