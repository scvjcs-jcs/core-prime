import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DeleteProposalButton from "@/components/admin/DeleteProposalButton";

const STATUS_LABEL: Record<string, string> = {
  draft: "초안(비공개)",
  sent: "발송됨(공개)",
  accepted: "수락됨",
  rejected: "거절됨",
};

export default async function AdminProposalsPage() {
  const supabase = await createClient();

  const { data: proposals, error } = await supabase
    .from("proposals")
    .select("id, title, status, created_at, customers(contact_name, company_name)")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl">제안서 관리</h1>
        <Link
          href="/admin/proposals/new"
          className="text-sm bg-navy text-white px-4 py-2 hover:bg-charcoal transition-colors"
        >
          + 제안서 만들기
        </Link>
      </div>

      {error && (
        <p className="text-sm text-red-600 mb-4">
          목록을 불러오지 못했습니다: {error.message}
        </p>
      )}

      <div className="bg-white border border-silver/30 overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="text-left text-silver border-b border-silver/30">
              <th className="px-4 py-3 font-normal">제목</th>
              <th className="px-4 py-3 font-normal">고객</th>
              <th className="px-4 py-3 font-normal">상태</th>
              <th className="px-4 py-3 font-normal">작성일</th>
              <th className="px-4 py-3 font-normal text-right">관리</th>
            </tr>
          </thead>
          <tbody>
            {(proposals ?? []).map((p) => {
              const customer = p.customers as unknown as {
                contact_name: string;
                company_name: string | null;
              } | null;
              return (
                <tr key={p.id} className="border-b border-silver/20 last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/admin/proposals/${p.id}`} className="hover:underline">
                      {p.title || "(제목 없음)"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-silver">
                    {customer?.contact_name ?? "-"}
                    {customer?.company_name ? ` (${customer.company_name})` : ""}
                  </td>
                  <td className="px-4 py-3 text-silver">{STATUS_LABEL[p.status] ?? p.status}</td>
                  <td className="px-4 py-3 text-silver">
                    {new Date(p.created_at).toLocaleDateString("ko-KR")}
                  </td>
                  <td className="px-4 py-3 text-right space-x-3">
                    <Link href={`/admin/proposals/${p.id}`} className="text-navy hover:underline">
                      수정
                    </Link>
                    <DeleteProposalButton id={p.id} label={p.title || "제안서"} />
                  </td>
                </tr>
              );
            })}
            {(!proposals || proposals.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-silver">
                  아직 만든 제안서가 없습니다. 우측 상단의 &apos;제안서 만들기&apos; 버튼으로 시작해 보세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
