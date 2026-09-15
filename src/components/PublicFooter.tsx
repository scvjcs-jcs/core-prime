"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function PublicFooter() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;

  return (
    <footer className="border-t border-white/10 bg-navy text-white">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid gap-10 lg:grid-cols-[1.35fr_.65fr]">
          <div>
            <p className="font-display text-2xl tracking-[.06em]">CORE PRIME</p>
            <p className="mt-3 max-w-xl text-sm leading-6 text-silver kr-text">서울 주요 업무권역의 빌딩·공실 데이터를 검수해 제공하고, 기업의 인원·예산·입주 시점에 맞는 오피스 후보를 비교해 제안합니다.</p>
            <div className="mt-5 flex flex-wrap gap-2 text-[11px] text-silver"><span className="border border-white/15 px-2.5 py-1.5">검수 후 공개</span><span className="border border-white/15 px-2.5 py-1.5">자료 기준일 표시</span><span className="border border-white/15 px-2.5 py-1.5">기업 맞춤 자문</span></div>
          </div>
          <div className="text-sm lg:justify-self-end">
            <p className="mb-3 text-[11px] uppercase tracking-[.18em] text-silver">Explore</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1"><Link href="/buildings" className="block text-silver hover:text-white">오피스 찾기</Link><Link href="/compare" className="block text-silver hover:text-white">오피스 비교</Link><Link href="/advisory" className="block text-silver hover:text-white">기업 이전 상담</Link></div>
          </div>
        </div>
        <div className="mt-10 border-t border-white/10 pt-5 text-[11px] leading-5 text-silver kr-text">임대조건과 공실 정보는 변동될 수 있으며, 최종 계약조건은 임대인·관리주체 확인을 거쳐야 합니다.</div>
      </div>
    </footer>
  );
}
