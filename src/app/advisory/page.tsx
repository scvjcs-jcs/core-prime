import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OFFICE ADVISORY | CORE PRIME",
  description: "기업의 조건을 먼저 분석하고 공간을 제안합니다.",
};

// 상담 신청(고객 CRM 연동) 기능은 Phase 3에서 구현 예정입니다.
export default function AdvisoryPage() {
  return (
    <main className="min-h-screen bg-fog flex items-center justify-center px-6">
      <div className="max-w-lg text-center">
        <p className="uppercase tracking-[0.3em] text-silver text-xs mb-3">
          Office Advisory
        </p>
        <h1 className="font-display text-2xl md:text-3xl mb-4 kr-text">
          기업의 조건을 먼저 분석하고 공간을 제안합니다.
        </h1>
        <p className="text-silver mb-8 kr-text">
          온라인 상담 신청 기능은 준비 중입니다. 지금 바로 상담을 원하시면 아래 이메일로
          연락해 주세요.
        </p>
        <a
          href="mailto:scvjcs@naver.com"
          className="inline-block bg-navy text-white px-6 py-3 text-sm hover:bg-charcoal transition-colors"
        >
          이메일로 상담 문의하기
        </a>
      </div>
    </main>
  );
}
