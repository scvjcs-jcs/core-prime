"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/buildings", label: "오피스 찾기" },
  { href: "/compare", label: "비교하기" },
  { href: "/advisory", label: "기업 이전 상담" },
];

export default function PublicHeader() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;

  return (
    <header className="sticky top-0 z-50 border-b border-silver/20 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-6">
        <Link href="/" className="group flex items-baseline gap-2" aria-label="CORE PRIME 홈">
          <span className="font-display text-xl tracking-[0.08em] text-navy">CORE PRIME</span>
          <span className="hidden text-[10px] uppercase tracking-[0.2em] text-silver sm:inline">Office Advisory</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm" aria-label="주요 메뉴">
          {nav.map((item) => {
            const active = item.href === "/compare"
              ? pathname === "/compare"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-sm px-3 py-2 transition-colors ${
                  active ? "bg-fog text-navy" : "text-charcoal hover:bg-fog hover:text-navy"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
