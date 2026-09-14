import { createClient } from "@/lib/supabase/server";
import ImportUploadForm from "@/components/admin/ImportUploadForm";

export default async function NewImportPage() {
  const supabase = await createClient();

  const { data: sources } = await supabase
    .from("sources")
    .select("id, name, code, type, priority, is_active")
    .eq("is_active", true)
    .order("priority");

  return (
    <div>
      <h1 className="font-display text-2xl mb-2">PDF 자료 등록</h1>
      <p className="text-sm text-silver mb-6">
        출처사별 임대 현황 PDF를 업로드하고 기본 정보를 등록합니다. 이 단계에서는 PDF 내용을 분석하지
        않으며, 원본 파일만 안전하게 보관합니다.
      </p>
      <ImportUploadForm sources={sources ?? []} />
    </div>
  );
}
