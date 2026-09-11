"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const next = String(formData.get("next") || "/admin");

  if (!email || !password) {
    redirect(`/admin/login?error=${encodeURIComponent("이메일과 비밀번호를 입력해 주세요.")}`);
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    redirect(`/admin/login?error=${encodeURIComponent("이메일 또는 비밀번호가 올바르지 않습니다.")}`);
  }

  // 이 사용자가 admins 테이블에 등록된 "활성 관리자"인지 확인합니다.
  const { data: adminRow } = await supabase
    .from("admins")
    .select("id, is_active")
    .eq("id", data.user!.id)
    .maybeSingle();

  if (!adminRow || !adminRow.is_active) {
    await supabase.auth.signOut();
    redirect(
      `/admin/login?error=${encodeURIComponent(
        "관리자 계정으로 등록되어 있지 않거나 비활성화된 계정입니다. 관리자에게 문의하세요."
      )}`
    );
  }

  await supabase
    .from("admins")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", data.user!.id);

  redirect(next || "/admin");
}
