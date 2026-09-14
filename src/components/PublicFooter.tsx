"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function PublicFooter() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;

  return (
    <footer className="border-t border-white/10 bg-navy text-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-10 md:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="font-display text-xl tracking-wide">CORE PRIME</p>
          <p className="mt-3 max-w-xl text-sm leading-6 text-silver kr-text">
            서울 주요 업무권역의 프라임 오피스 데이터를 정리하고, 기업의 인원·예산·입주 시점에 맞는 후보를 비교해 제안합니다.
          </p>
          <p className="mt-4 text-xs text-silver kr-text">
            임대조건과 공실 정보는 변동될 수 있으며 최종 조건은 상담 과정에서 다시 확인합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3 text-sm md:justify-end">
          <Link href="/buildings" className="text-silver hover:text-white">오피스 찾기</Link>
          <Link href="/advisory" className="text-silver hover:text-white">기업 이전 상담</Link>
          <Link href="/admin" className="text-silver/70 hover:text-white">관리자</Link>
        </div>
      </div>
    </footer>
  );
}
