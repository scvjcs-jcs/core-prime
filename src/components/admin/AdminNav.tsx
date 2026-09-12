import Link from "next/link";
import LogoutButton from "./LogoutButton";

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "최고 관리자",
  ADMIN: "관리자",
  EDITOR: "에디터",
};

export default function AdminNav({
  name,
  role,
}: {
  name: string;
  role: string;
}) {
  return (
    <header className="bg-navy text-white">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/admin" className="font-display text-lg tracking-wide">
            CORE PRIME <span className="text-silver text-xs">ADMIN</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-silver">
            <Link href="/admin" className="hover:text-white transition-colors">
              대시보드
            </Link>
            <Link href="/admin/buildings" className="hover:text-white transition-colors">
              건물 관리
            </Link>
            <Link href="/admin/listings" className="hover:text-white transition-colors">
              매물 관리
            </Link>
            <Link href="/admin/customers" className="hover:text-white transition-colors">
              고객 상담
            </Link>
            <Link href="/admin/proposals" className="hover:text-white transition-colors">
              제안서
            </Link>
            <Link href="/admin/analytics" className="hover:text-white transition-colors">
              통계
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-silver">
            {name} · {ROLE_LABEL[role] ?? role}
          </span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
