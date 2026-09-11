import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CUSTOMER_STATUS_LABEL } from "@/lib/labels";

export default async function AdminCustomersPage() {
  const supabase = await createClient();
  const { data: customers, error } = await supabase
    .from("customers")
    .select("id, company_name, contact_name, phone, email, status, created_at")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl">고객 상담 관리</h1>
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
              <th className="px-4 py-3 font-normal">접수일</th>
              <th className="px-4 py-3 font-normal">회사명</th>
              <th className="px-4 py-3 font-normal">담당자</th>
              <th className="px-4 py-3 font-normal">연락처</th>
              <th className="px-4 py-3 font-normal">상태</th>
              <th className="px-4 py-3 font-normal text-right">관리</th>
            </tr>
          </thead>
          <tbody>
            {(customers ?? []).map((c) => (
              <tr key={c.id} className="border-b border-silver/20 last:border-0">
                <td className="px-4 py-3 text-silver">
                  {new Date(c.created_at).toLocaleDateString("ko-KR")}
                </td>
                <td className="px-4 py-3">{c.company_name ?? "-"}</td>
                <td className="px-4 py-3">
                  <Link href={`/admin/customers/${c.id}`} className="hover:underline">
                    {c.contact_name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-silver">
                  {c.phone ?? c.email ?? "-"}
                </td>
                <td className="px-4 py-3">
                  <span className="text-navy bg-fog px-2 py-0.5 text-xs border border-silver/30">
                    {CUSTOMER_STATUS_LABEL[c.status] ?? c.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/customers/${c.id}`} className="text-navy hover:underline">
                    상세보기
                  </Link>
                </td>
              </tr>
            ))}
            {(!customers || customers.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-silver">
                  아직 접수된 상담 신청이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
