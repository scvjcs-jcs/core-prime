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
      <section className="relative overflow-hidden bg-navy px-6 py-16 text-white md:py-20">
        <div className="absolute inset-0 opacity-[.1] [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:48px_48px]"/>
        <div className="relative mx-auto max-w-5xl">
          <p className="mb-3 text-[10px] uppercase tracking-[0.22em] text-silver">Office Advisory</p>
          <div className="grid gap-8 lg:grid-cols-[1.15fr_.85fr] lg:items-end">
            <div><h1 className="font-display text-4xl leading-tight md:text-5xl kr-text">조건을 남기면,<br/>실제 검토할 후보만 추려드립니다.</h1><p className="mt-5 max-w-2xl text-sm leading-7 text-silver kr-text">온라인에 공개된 매물만 고르는 방식이 아니라 기업의 인원·예산·입주 일정과 우선순위를 기준으로 현재 공실을 다시 확인해 shortlist를 만듭니다.</p></div>
            <div className="border-l border-white/15 pl-6 text-sm text-silver"><p className="text-[10px] uppercase tracking-[.16em]">You will receive</p><p className="mt-3 leading-6 kr-text">후보 건물 비교 · 핵심 임대조건 · 우선순위 · 확인이 필요한 리스크를 정리해 안내합니다.</p></div>
          </div>
        </div>
      </section>
      <div className="mx-auto grid max-w-5xl gap-8 px-6 py-12 lg:grid-cols-[.85fr_2fr]">
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="border border-silver/25 bg-white p-5"><p className="text-[10px] uppercase tracking-[.18em] text-silver">Process</p>{[['01','조건 확인','권역·면적·예산·입주 시점을 정리합니다.'],['02','공실 재확인','자료 기준일과 현재 임대 가능 여부를 확인합니다.'],['03','후보 제안','비교 가능한 후보와 핵심 조건을 정리합니다.']].map(([n,t,d])=><div key={n} className="border-b border-silver/15 py-4 last:border-b-0"><div className="flex gap-3"><span className="font-display text-sm text-silver">{n}</span><div><h2 className="text-sm font-medium">{t}</h2><p className="mt-1 text-xs leading-5 text-silver kr-text">{d}</p></div></div></div>)}</div>
          <div className="border border-silver/25 bg-white p-5"><p className="text-sm font-medium">검수 원칙</p><p className="mt-2 text-xs leading-5 text-silver kr-text">임대조건은 수시로 변동될 수 있어 계약 전 임대인·관리주체를 통해 최종 확인합니다.</p></div>
        </aside>
        <div><div className="mb-4 flex items-end justify-between"><div><p className="text-[10px] uppercase tracking-[.18em] text-silver">Request brief</p><h2 className="mt-1 font-display text-2xl kr-text">기업 이전 조건 입력</h2></div><span className="text-[11px] text-silver">필요한 정보만 입력</span></div><AdvisoryForm districts={districts ?? []} defaultNotes={defaultNotes} /></div>
      </div>
    </main>
  );
}
