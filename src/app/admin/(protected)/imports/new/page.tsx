import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ImportUploadForm from "@/components/admin/ImportUploadForm";

export default async function NewImportPage() {
  const supabase = await createClient();
  const { data: sources } = await supabase.from("sources").select("id, name, code, type, priority, is_active").eq("is_active", true).order("priority");
  return <div className="max-w-5xl">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs uppercase tracking-[.18em] text-silver">Data Intake</p><h1 className="mt-1 font-display text-3xl">PDF 자료 등록</h1><p className="mt-2 text-sm text-silver">출처·기준일·PDF만 확인하면 됩니다. Parser는 출처사에 맞게 자동 추천됩니다.</p></div><Link href="/admin/imports" className="text-xs text-navy hover:underline">← 자료검수 목록</Link></div>
    <ImportUploadForm sources={sources ?? []}/>
  </div>;
}
