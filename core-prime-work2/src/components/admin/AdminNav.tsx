"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "./LogoutButton";

const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: "최고 관리자", ADMIN: "관리자", EDITOR: "에디터" };
const NAV = [
  ["/admin", "대시보드"],
  ["/admin/imports", "자료 검수"],
  ["/admin/buildings", "건물"],
  ["/admin/listings", "공실"],
  ["/admin/customers", "상담"],
  ["/admin/proposals", "제안서"],
  ["/admin/analytics", "통계"],
] as const;

export default function AdminNav({ name, role }: { name: string; role: string }) {
  const pathname = usePathname();
  const active = (href: string) => href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-50 bg-navy text-white shadow-sm">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-7">
          <Link href="/admin" className="shrink-0 font-display text-lg tracking-wide">CORE PRIME <span className="text-[10px] text-silver">ADMIN</span></Link>
          <nav className="hidden items-center gap-1 text-sm lg:flex" aria-label="관리자 메뉴">
            {NAV.map(([href,label]) => <Link key={href} href={href} className={`px-3 py-2 transition-colors ${active(href)?"bg-white/10 text-white":"text-silver hover:bg-white/5 hover:text-white"}`}>{label}</Link>)}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs md:text-sm"><span className="hidden text-silver sm:inline">{name} · {ROLE_LABEL[role] ?? role}</span><Link href="/" target="_blank" className="hidden border border-white/20 px-2.5 py-1.5 text-silver hover:text-white md:inline">고객화면 ↗</Link><LogoutButton /></div>
      </div>
      <nav className="overflow-x-auto whitespace-nowrap border-t border-white/10 px-4 py-2 text-xs lg:hidden"><div className="flex min-w-max gap-1">{NAV.map(([href,label]) => <Link key={href} href={href} className={`px-3 py-1.5 ${active(href)?"bg-white/10 text-white":"text-silver"}`}>{label}</Link>)}</div></nav>
    </header>
  );
}
