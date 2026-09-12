import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "@/components/PrintButton";
import type { PublicProposal } from "@/lib/types";

async function getProposal(token: string): Promise<PublicProposal | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_proposal_by_token", { p_token: token });
  if (error || !data) return null;
  return data as PublicProposal;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const data = await getProposal(token);
  if (!data) return { title: "제안서를 찾을 수 없습니다 | CORE PRIME" };
  return {
    title: `${data.title ?? "오피스 제안서"} | CORE PRIME`,
    robots: { index: false, follow: false },
  };
}

export default async function PublicProposalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getProposal(token);
  if (!data) notFound();

  return (
    <main className="min-h-screen bg-fog px-6 py-16 print:bg-white print:py-0">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12 print:mb-8">
          <p className="uppercase tracking-[0.3em] text-silver text-xs mb-3">
            Office Advisory Proposal
          </p>
          <h1 className="font-display text-2xl md:text-3xl mb-3 kr-text">
            {data.title || "프라임 오피스 제안서"}
          </h1>
          <p className="text-silver kr-text">
            {data.company_name ? `${data.company_name} ` : ""}
            {data.customer_name} 님께 CORE PRIME이 추천드리는 오피스입니다.
          </p>
          <div className="mt-6 print:hidden">
            <PrintButton />
          </div>
        </div>

        <div className="space-y-6">
          {data.buildings.map((b, i) => (
            <div
              key={b.proposal_building_id}
              className="bg-white border border-silver/30 overflow-hidden print:break-inside-avoid"
            >
              <div className="md:flex">
                <div className="md:w-64 h-48 md:h-auto bg-navy shrink-0 relative overflow-hidden">
                  {b.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.image_url} alt={b.name} className="w-full h-full object-cover" />
                  ) : null}
                  <span className="absolute top-3 left-3 bg-white text-navy text-xs px-2 py-1">
                    추천 {b.recommendation_rank ?? i + 1}순위
                  </span>
                </div>
                <div className="p-6 flex-1">
                  <p className="text-xs text-silver mb-1">
                    {b.building_grade ? `${b.building_grade}등급 · ` : ""}
                    {b.completion_year ? `${b.completion_year}년 준공` : ""}
                  </p>
                  <h2 className="font-display text-xl mb-1 kr-text">{b.name}</h2>
                  <p className="text-sm text-silver mb-4 kr-text">{b.address ?? ""}</p>

                  {b.recommendation_reason && (
                    <p className="text-sm mb-4 kr-text">
                      <span className="text-navy">추천 사유 — </span>
                      {b.recommendation_reason}
                    </p>
                  )}

                  {(b.pros || b.cons) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 text-sm">
                      {b.pros && (
                        <div>
                          <p className="text-xs text-silver mb-1">장점</p>
                          <p className="kr-text whitespace-pre-wrap">{b.pros}</p>
                        </div>
                      )}
                      {b.cons && (
                        <div>
                          <p className="text-xs text-silver mb-1">유의사항</p>
                          <p className="kr-text whitespace-pre-wrap">{b.cons}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {b.listing && (
                    <dl className="grid grid-cols-2 md:grid-cols-4 gap-y-2 text-sm border-t border-silver/20 pt-4">
                      <dt className="text-silver">층</dt>
                      <dd>{b.listing.floor ?? "-"}</dd>
                      <dt className="text-silver">전용면적</dt>
                      <dd>{b.listing.exclusive_area ? `${b.listing.exclusive_area}㎡` : "-"}</dd>
                      <dt className="text-silver">보증금</dt>
                      <dd>{b.listing.deposit ? `${b.listing.deposit.toLocaleString()}만원` : "-"}</dd>
                      <dt className="text-silver">월 임대료</dt>
                      <dd>{b.listing.monthly_rent ? `${b.listing.monthly_rent.toLocaleString()}만원` : "-"}</dd>
                    </dl>
                  )}

                  {b.total_score !== null && (
                    <p className="text-xs text-silver mt-4">Prime Score {b.total_score}점</p>
                  )}
                </div>
              </div>
            </div>
          ))}

          {data.buildings.length === 0 && (
            <p className="text-center text-silver py-10">아직 추천 건물이 등록되지 않았습니다.</p>
          )}
        </div>

        <p className="text-center text-silver text-xs mt-12 print:hidden">
          본 제안서는 CORE PRIME에서 개인 맞춤으로 준비한 자료입니다. 문의사항은 담당자에게 연락해 주세요.
        </p>
      </div>
    </main>
  );
}
