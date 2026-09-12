import { createClient } from "@/lib/supabase/server";

// 페이지 방문을 page_views 테이블에 기록합니다.
// 통계 기록이 실패해도 실제 페이지 렌더링에는 영향을 주지 않도록 조용히 무시합니다.
export async function logPageView(path: string, buildingId?: string | null) {
  try {
    const supabase = await createClient();
    await supabase.from("page_views").insert({ path, building_id: buildingId ?? null });
  } catch {
    // ignore
  }
}
