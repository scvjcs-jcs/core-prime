import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const TEXT_EXTRACT_PARSER_VERSION = "TEXT-EXTRACT-v1.0.0";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { data: admin } = await supabase.from("admins").select("id,is_active").eq("id", user.id).maybeSingle();
  if (!admin?.is_active) return new NextResponse("Forbidden", { status: 403 });

  const { data: doc } = await supabase
    .from("source_documents")
    .select("id,title,original_filename,parser_type,page_count")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return new NextResponse("Document not found", { status: 404 });

  const { data: run } = await supabase
    .from("parsing_runs")
    .select("id,status,parser_type,parser_version,total_pages,processed_pages,created_at")
    .eq("source_document_id", id)
    .eq("parser_version", TEXT_EXTRACT_PARSER_VERSION)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run) return new NextResponse("Text extraction run not found", { status: 404 });

  const { data: rows, error } = await supabase
    .from("source_document_pages")
    .select("page_number,status,extracted_text,warnings")
    .eq("parsing_run_id", run.id)
    .order("page_number", { ascending: true });
  if (error) return new NextResponse(error.message, { status: 500 });

  const all = rows ?? [];
  const selectedNumbers = new Set<number>();
  for (const row of all) {
    const p = row.page_number as number;
    const text = String(row.extracted_text ?? "");
    if (p <= 40) selectedNumbers.add(p);
    if (p % 25 === 0) selectedNumbers.add(p);
    if (/Office/i.test(text) && /For\s+Lease/i.test(text) && selectedNumbers.size < 90) selectedNumbers.add(p);
    if (/Availabilit(?:y|ies)/i.test(text) && selectedNumbers.size < 110) selectedNumbers.add(p);
  }

  const selected = all.filter((row) => selectedNumbers.has(row.page_number as number)).slice(0, 120);
  const payload = {
    generated_at: new Date().toISOString(),
    purpose: "CORE PRIME CBRE production extracted_text diagnostic. Contains admin-only source text samples; do not publish.",
    document: doc,
    extraction_run: run,
    counts: {
      all_pages: all.length,
      done: all.filter((r) => r.status === "DONE").length,
      failed: all.filter((r) => r.status === "FAILED").length,
      non_empty: all.filter((r) => String(r.extracted_text ?? "").trim()).length,
      office_for_lease_loose: all.filter((r) => /Office/i.test(String(r.extracted_text ?? "")) && /For\s+Lease/i.test(String(r.extracted_text ?? ""))).length,
      office_pipe_for_lease: all.filter((r) => /Office\s*[|｜]\s*For\s+Lease/i.test(String(r.extracted_text ?? ""))).length,
      availabilities: all.filter((r) => /Availabilit(?:y|ies)/i.test(String(r.extracted_text ?? ""))).length,
      selected_pages: selected.length,
    },
    pages: selected.map((r) => ({
      page_number: r.page_number,
      status: r.status,
      warnings: r.warnings,
      extracted_text: r.extracted_text,
    })),
  };

  const safeName = String(doc.original_filename ?? "cbre").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/\.pdf$/i, "");
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}-production-text-diagnostic.json"`,
      "Cache-Control": "no-store",
    },
  });
}
