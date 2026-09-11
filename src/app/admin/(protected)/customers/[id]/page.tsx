import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CustomerDetailPanel from "@/components/admin/CustomerDetailPanel";
import type { CustomerStatus } from "@/lib/types";

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: customer }, { data: requirements }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("customer_requirements")
      .select("*, districts(name)")
      .eq("customer_id", id),
  ]);

  if (!customer) notFound();

  const req = requirements?.[0] as
    | (Record<string, unknown> & { districts: { name: string } | null })
    | undefined;

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin/customers" className="text-sm text-silver hover:text-navy">
          ← 목록으로
        </Link>
        <h1 className="font-display text-2xl mt-2">
          {customer.contact_name}
          {customer.company_name ? ` (${customer.company_name})` : ""}
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <section className="bg-white border border-silver/30 p-6">
            <h2 className="text-sm tracking-wide text-silver mb-4 border-b border-silver/20 pb-2">
              연락처 정보
            </h2>
            <dl className="grid grid-cols-2 gap-y-3 text-sm">
              <dt className="text-silver">회사명</dt>
              <dd>{customer.company_name ?? "-"}</dd>
              <dt className="text-silver">담당자</dt>
              <dd>{customer.contact_name}</dd>
              <dt className="text-silver">전화번호</dt>
              <dd>{customer.phone ?? "-"}</dd>
              <dt className="text-silver">이메일</dt>
              <dd>{customer.email ?? "-"}</dd>
              <dt className="text-silver">임직원 수</dt>
              <dd>{customer.headcount ?? "-"}</dd>
              <dt className="text-silver">접수 경로</dt>
              <dd>{customer.inquiry_channel ?? "-"}</dd>
              <dt className="text-silver">접수일</dt>
              <dd>{new Date(customer.created_at).toLocaleString("ko-KR")}</dd>
            </dl>
          </section>

          {req && (
            <section className="bg-white border border-silver/30 p-6">
              <h2 className="text-sm tracking-wide text-silver mb-4 border-b border-silver/20 pb-2">
                희망 조건
              </h2>
              <dl className="grid grid-cols-2 gap-y-3 text-sm">
                <dt className="text-silver">희망 업무권역</dt>
                <dd>{req.districts?.name ?? "-"}</dd>
                <dt className="text-silver">희망 건물 등급</dt>
                <dd>{(req.preferred_grade as string) ?? "-"}</dd>
                <dt className="text-silver">희망 전용면적</dt>
                <dd>
                  {req.min_exclusive_area || req.max_exclusive_area
                    ? `${req.min_exclusive_area ?? "-"} ~ ${req.max_exclusive_area ?? "-"} ㎡`
                    : "-"}
                </dd>
                <dt className="text-silver">희망 예산(월)</dt>
                <dd>
                  {req.min_budget || req.max_budget
                    ? `${Number(req.min_budget ?? 0).toLocaleString()} ~ ${Number(
                        req.max_budget ?? 0
                      ).toLocaleString()} 만원`
                    : "-"}
                </dd>
                <dt className="text-silver">희망 입주 시기</dt>
                <dd>{(req.move_in_date as string) ?? "-"}</dd>
              </dl>
              {req.etc_notes ? (
                <div className="mt-4 pt-4 border-t border-silver/20">
                  <p className="text-xs text-silver mb-1">추가 요청사항</p>
                  <p className="text-sm whitespace-pre-wrap kr-text">{req.etc_notes as string}</p>
                </div>
              ) : null}
            </section>
          )}
        </div>

        <aside>
          <CustomerDetailPanel
            customerId={customer.id}
            initialStatus={customer.status as CustomerStatus}
            initialMemo={customer.memo}
          />
        </aside>
      </div>
    </div>
  );
}
