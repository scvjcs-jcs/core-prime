// 홈페이지 (Phase 1: 최소 버전 — 정식 디자인은 다음 단계에서 확장 예정)
export default function HomePage() {
  return (
    <main className="min-h-screen bg-navy text-white flex flex-col items-center justify-center px-6 text-center">
      <p className="uppercase tracking-[0.3em] text-silver text-xs mb-6">
        Prime Office Advisory
      </p>
      <h1 className="font-display text-3xl md:text-5xl leading-snug max-w-3xl kr-text">
        서울의 프라임 오피스를
        <br />
        기업의 관점에서 제안합니다.
      </h1>
      <p className="mt-6 text-silver max-w-xl kr-text">
        강남, 여의도, 광화문, 성수, 용산, 판교 등 서울 주요 업무권역의 프라임
        오피스를 선별하고 기업의 규모와 이전 목적에 맞는 최적의 공간을
        제안합니다.
      </p>
      <a
        href="/admin"
        className="mt-10 inline-block border border-silver px-6 py-3 text-sm tracking-wide hover:bg-white hover:text-navy transition-colors"
      >
        관리자 화면으로 이동
      </a>
    </main>
  );
}
