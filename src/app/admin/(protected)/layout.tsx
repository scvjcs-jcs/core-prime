import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminNav from "@/components/admin/AdminNav";

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const { data: admin } = await supabase
    .from("admins")
    .select("id, name, email, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!admin || !admin.is_active) {
    redirect("/admin/login?error=" + encodeURIComponent("관리자 권한이 없는 계정입니다."));
  }

  return (
    <div className="min-h-screen bg-fog">
      <AdminNav name={admin.name} role={admin.role} />
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">{children}</div>
    </div>
  );
}
