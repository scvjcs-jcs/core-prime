import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import AdvisoryForm from "@/components/AdvisoryForm";
import { logPageView } from "@/lib/analytics";

export const metadata: Metadata = {
  title: "OFFICE ADVISORY | CORE PRIME",
  description: "기업의 조건을 먼저 분석하고 공간을 제안합니다.",
};

export default async function AdvisoryPage({
  searchParams,
}: {
  searchParams: Promise<{ building?: string }>;
}) {
  const { building } = await searchParams;
  const supabase = await createClient();
  const [, { data: districts }] = await Promise.all([
    logPageView("/advisory"),
    supabase.from("districts").select("id, name").eq("is_published", true).order("name"),
  ]);

  const defaultNotes = building ? `관심 건물: ${building}` : undefined;

  return (
    <main className="min-h-screen bg-fog px-6 py-20">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-12">
          <p className="uppercase tracking-[0.3em] text-silver text-xs mb-3">
            Office Advisory
          </p>
          <h1 className="font-display text-2xl md:text-3xl mb-4 kr-text">
            기업의 조건을 먼저 분석하고 공간을 제안합니다.
          </h1>
          <p className="text-silver kr-text">
            아래 정보를 남겨주시면 담당자가 확인 후 빠르게 연락드립니다.
          </p>
        </div>

        <AdvisoryForm districts={districts ?? []} defaultNotes={defaultNotes} />

        <p className="text-center text-silver text-xs mt-8 kr-text">
          바로 상담을 원하시면{" "}
          <a href="mailto:scvjcs@naver.com" className="underline hover:text-navy">
            이메일
          </a>
          로도 문의하실 수 있습니다.
        </p>
      </div>
    </main>
  );
}
