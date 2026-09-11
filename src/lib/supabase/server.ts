// 서버(Server Component / Server Action / Route Handler)에서 사용하는 Supabase 클라이언트
// 로그인한 관리자의 세션 쿠키를 그대로 사용하므로, DB의 RLS(행 단위 보안) 정책이
// "이 사람이 진짜 관리자인가"를 함께 검증해 줍니다.
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component에서 호출된 경우 쿠키를 쓸 수 없는데,
            // middleware가 세션 갱신을 담당하므로 무시해도 안전합니다.
          }
        },
      },
    }
  );
}
