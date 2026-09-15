"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const nav = [
  { href: "/buildings", label: "오피스 찾기" },
  { href: "/compare", label: "비교하기" },
  { href: "/advisory", label: "기업 이전 상담" },
];

export default function PublicHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  if (pathname.startsWith("/admin")) return null;

  const isActive = (href: string) => href === "/compare"
    ? pathname === "/compare"
    : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-50 border-b border-silver/20 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <a href="#main-content" className="skip-link">본문 바로가기</a>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-6">
        <Link href="/" className="group flex items-baseline gap-2" aria-label="CORE PRIME 홈" onClick={() => setOpen(false)}>
          <span className="font-display text-xl tracking-[0.08em] text-navy">CORE PRIME</span>
          <span className="hidden text-[10px] uppercase tracking-[0.2em] text-silver sm:inline">Office Advisory</span>
        </Link>
        <nav className="hidden items-center gap-1 text-sm md:flex" aria-label="주요 메뉴">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className={`rounded-sm px-3 py-2 transition-colors ${isActive(item.href) ? "bg-fog text-navy" : "text-charcoal hover:bg-fog hover:text-navy"}`}>
              {item.label}
            </Link>
          ))}
        </nav>
        <button type="button" className="inline-flex h-10 w-10 items-center justify-center border border-silver/30 text-navy md:hidden" aria-label={open ? "메뉴 닫기" : "메뉴 열기"} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <span className="text-lg leading-none">{open ? "×" : "☰"}</span>
        </button>
      </div>
      {open && (
        <nav className="border-t border-silver/20 bg-white px-5 py-3 md:hidden" aria-label="모바일 메뉴">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={`block border-b border-silver/15 px-1 py-3 text-sm last:border-b-0 ${isActive(item.href) ? "font-medium text-navy" : "text-charcoal"}`}>
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
