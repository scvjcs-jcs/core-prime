import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import AdvisoryForm from "@/components/AdvisoryForm";
import { logPageView } from "@/lib/analytics";

export const metadata: Metadata = {
  title: "기업 이전 상담",
  description: "희망 권역, 인원, 면적, 예산, 입주 시점을 남기면 조건에 맞는 프라임 오피스 후보를 제안합니다.",
};

export default async function AdvisoryPage({ searchParams }: { searchParams: Promise<{ building?: string }> }) {
  const { building } = await searchParams;
  const supabase = await createClient();
  const [, { data: districts }] = await Promise.all([
    logPageView("/advisory"),
    supabase.from("districts").select("id, name").eq("is_published", true).order("name"),
  ]);
  const defaultNotes = building ? `관심 건물: ${building}` : undefined;

  return (
    <main id="main-content" className="min-h-screen bg-fog">
      <section className="bg-navy px-6 py-14 text-white">
        <div className="mx-auto max-w-4xl text-center">
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-silver">Office Advisory</p>
          <h1 className="font-display text-3xl md:text-4xl kr-text">조건을 남기면, 실제 공실을 다시 확인해 제안합니다.</h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-silver kr-text">온라인에 공개된 매물만 고르는 방식이 아니라 기업의 인원·예산·입주 일정과 우선순위를 기준으로 후보를 정리합니다.</p>
        </div>
      </section>
      <div className="mx-auto grid max-w-5xl gap-8 px-6 py-10 lg:grid-cols-[1fr_2fr]">
        <aside className="space-y-4">
          {[['01','조건 접수','권역·면적·예산·입주 시점을 확인합니다.'],['02','공실 재확인','자료 기준일과 현재 임대 가능 여부를 다시 점검합니다.'],['03','후보 제안','비교 가능한 후보와 핵심 조건을 정리해 안내합니다.']].map(([n,t,d])=><div key={n} className="border border-silver/25 bg-white p-4"><p className="font-display text-sm text-silver">{n}</p><h2 className="mt-1 font-medium">{t}</h2><p className="mt-1 text-xs leading-5 text-silver kr-text">{d}</p></div>)}
          <p className="text-xs leading-5 text-silver kr-text">임대조건은 수시로 변동될 수 있어 계약 전 임대인·관리주체를 통해 최종 확인합니다.</p>
        </aside>
        <AdvisoryForm districts={districts ?? []} defaultNotes={defaultNotes} />
      </div>
    </main>
  );
}
