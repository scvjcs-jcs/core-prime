"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="border border-silver/50 px-3 py-1.5 text-xs hover:bg-white hover:text-navy transition-colors"
    >
      로그아웃
    </button>
  );
}
