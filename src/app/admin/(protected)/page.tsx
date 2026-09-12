import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const [
    { count: totalBuildings },
    { count: publishedBuildings },
    { count: totalListings },
    { count: newInquiries },
    { count: totalProposals },
  ] = await Promise.all([
    supabase.from("buildings").select("*", { count: "exact", head: true }),
    supabase
      .from("buildings")
      .select("*", { count: "exact", head: true })
      .eq("is_published", true),
    supabase.from("listings").select("*", { count: "exact", head: true }),
    supabase
      .from("customers")
      .select("*", { count: "exact", head: true })
      .eq("status", "NEW"),
    supabase.from("proposals").select("*", { count: "exact", head: true }),
  ]);

  const { data: recentBuildings } = await supabase
    .from("buildings")
    .select("id, name, status, is_published, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  const { data: recentInquiries } = await supabase
    .from("customers")
    .select("id, contact_name, company_name, status, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  const cards = [
    { label: "총 건물 수", value: totalBuildings ?? 0 },
    { label: "공개 건물 수", value: publishedBuildings ?? 0 },
    { label: "등록 매물 수", value: totalListings ?? 0 },
    { label: "신규 상담 문의", value: newInquiries ?? 0 },
    { label: "작성된 제안서", value: totalProposals ?? 0 },
  ];

  return (
    <div>
      <h1 className="font-display text-2xl mb-6">대시보드</h1>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
        {cards.map((c) => (
          <div key={c.label} className="bg-white border border-silver/30 p-5">
            <p className="text-xs text-silver mb-1">{c.label}</p>
            <p className="text-2xl font-display">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm tracking-wide text-charcoal">최근 등록 건물</h2>
        <Link
          href="/admin/buildings/new"
          className="text-sm bg-navy text-white px-4 py-2 hover:bg-charcoal transition-colors"
        >
          + 건물 등록
        </Link>
      </div>

      <div className="bg-white border border-silver/30">
        {recentBuildings && recentBuildings.length > 0 ? (
          <table className="w-full text-sm">
            <tbody>
              {recentBuildings.map((b) => (
                <tr key={b.id} className="border-b border-silver/20 last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/buildings/${b.id}`}
                      className="hover:underline"
                    >
                      {b.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-silver">{b.status}</td>
                  <td className="px-4 py-3 text-silver">
                    {b.is_published ? "공개" : "비공개"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-4 py-8 text-center text-silver text-sm">
            아직 등록된 건물이 없습니다.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between mb-4 mt-10">
        <h2 className="text-sm tracking-wide text-charcoal">최근 상담 신청</h2>
        <Link href="/admin/customers" className="text-sm text-navy hover:underline">
          전체보기 →
        </Link>
      </div>

      <div className="bg-white border border-silver/30">
        {recentInquiries && recentInquiries.length > 0 ? (
          <table className="w-full text-sm">
            <tbody>
              {recentInquiries.map((c) => (
                <tr key={c.id} className="border-b border-silver/20 last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/admin/customers/${c.id}`} className="hover:underline">
                      {c.contact_name}
                      {c.company_name ? ` (${c.company_name})` : ""}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-silver">{c.status}</td>
                  <td className="px-4 py-3 text-silver">
                    {new Date(c.created_at).toLocaleDateString("ko-KR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-4 py-8 text-center text-silver text-sm">
            아직 접수된 상담 신청이 없습니다.
          </p>
        )}
      </div>
    </div>
  );
}
