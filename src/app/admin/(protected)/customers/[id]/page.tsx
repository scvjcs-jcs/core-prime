import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CustomerDetailPanel from "@/components/admin/CustomerDetailPanel";
import type { CustomerStatus } from "@/lib/types";
import { scoreRecommendations, type RecommendationCandidate } from "@/lib/recommendations";

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

  const { data: recommendationRows } = await supabase
    .from("listings")
    .select("id,floor,exclusive_area,exclusive_area_py,monthly_rent,management_fee,rent_per_py,maintenance_per_py,move_in_text,available_date,buildings!inner(id,name,slug,district_id,building_grade,is_published,deleted_at)")
    .in("status", ["available", "negotiating"])
    .eq("is_published", true)
    .eq("buildings.is_published", true)
    .is("buildings.deleted_at", null)
    .limit(200);
  const recommendations = scoreRecommendations(req ? {
    preferred_district: (req.preferred_district as string) ?? null,
    min_exclusive_area: (req.min_exclusive_area as number) ?? null,
    max_exclusive_area: (req.max_exclusive_area as number) ?? null,
    min_budget: (req.min_budget as number) ?? null,
    max_budget: (req.max_budget as number) ?? null,
    preferred_grade: (req.preferred_grade as string) ?? null,
    required_parking: (req.required_parking as number) ?? null,
    move_in_date: (req.move_in_date as string) ?? null,
  } : null, (recommendationRows ?? []).map((r: any) => ({ ...r, building: Array.isArray(r.buildings) ? r.buildings[0] : r.buildings })) as RecommendationCandidate[]);

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin/customers" className="text-sm text-silver hover:text-navy">
          ← 목록으로
        </Link>
        <div className="flex items-center justify-between mt-2">
          <h1 className="font-display text-2xl">
            {customer.contact_name}
            {customer.company_name ? ` (${customer.company_name})` : ""}
          </h1>
          <Link
            href={`/admin/proposals/new?customer=${customer.id}`}
            className="text-sm bg-navy text-white px-4 py-2 hover:bg-charcoal transition-colors"
          >
            + 제안서 만들기
          </Link>
        </div>
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

          <section className="bg-white border border-silver/30 p-6">
            <div className="flex items-center justify-between mb-4 border-b border-silver/20 pb-2">
              <h2 className="text-sm tracking-wide text-silver">자동 추천 후보</h2>
              <span className="text-xs text-silver">조건 적합도 기준 · 최종 제안은 관리자 판단</span>
            </div>
            {recommendations.length===0 ? <p className="text-sm text-silver">현재 추천 가능한 공개 공실이 없습니다.</p> : <div className="space-y-3">
              {recommendations.slice(0,8).map((r:any)=><div key={r.id} className="border border-silver/20 p-3 flex items-start justify-between gap-4">
                <div><Link className="font-medium hover:underline" href={`/buildings/${r.building?.slug}`}>{r.building?.name ?? '-'}</Link><p className="text-xs text-silver mt-1">{r.floor ?? '-'} · 전용 {r.exclusive_area_py ? `${r.exclusive_area_py}평` : r.exclusive_area ? `${r.exclusive_area}㎡` : '-'} · {r.reasons.join(' · ') || '기본 후보'}</p></div>
                <div className="text-right"><span className="text-lg font-display">{r.score}</span><span className="text-xs text-silver">/100</span></div>
              </div>)}
            </div>}
          </section>
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
