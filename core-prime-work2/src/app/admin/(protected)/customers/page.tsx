import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CUSTOMER_STATUS_LABEL } from "@/lib/labels";

export default async function AdminCustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const params=await searchParams;
  const supabase=await createClient();
  const {data:customers,error}=await supabase.from("customers").select("id, company_name, contact_name, phone, email, status, created_at").order("created_at",{ascending:false});
  let rows=customers??[]; const q=params.q?.trim().toLowerCase();
  if(q) rows=rows.filter((c)=>[c.company_name,c.contact_name,c.phone,c.email].some((v)=>v?.toLowerCase().includes(q)));
  if(params.status) rows=rows.filter((c)=>c.status===params.status);

  return <div>
    <div className="mb-6"><p className="text-xs uppercase tracking-[.18em] text-silver">Client Advisory CRM</p><h1 className="mt-1 font-display text-2xl">고객 상담 관리</h1><p className="mt-1 text-xs text-silver">신규 문의부터 제안·후속관리까지 고객별 진행상태를 확인합니다.</p></div>
    <form className="mb-4 grid gap-2 border border-silver/25 bg-white p-4 sm:grid-cols-[1fr_200px_auto]"><input name="q" defaultValue={params.q??""} className="border border-silver/40 px-3 py-2 text-sm" placeholder="회사명·담당자·연락처 검색"/><select name="status" defaultValue={params.status??""} className="border border-silver/40 px-3 py-2 text-sm"><option value="">전체 상태</option>{Object.entries(CUSTOMER_STATUS_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><button className="bg-charcoal px-4 py-2 text-sm text-white">조회</button></form>
    {error&&<p className="mb-4 text-sm text-red-600">목록을 불러오지 못했습니다: {error.message}</p>}
    <div className="mb-3 flex items-center justify-between text-xs text-silver"><span>검색 결과 {rows.length}건</span><Link href="/admin/customers" className="hover:text-navy">필터 초기화</Link></div>
    <div className="overflow-x-auto border border-silver/30 bg-white"><table className="w-full min-w-[820px] text-sm"><thead><tr className="border-b border-silver/30 text-left text-silver"><th className="px-4 py-3 font-normal">접수일</th><th className="px-4 py-3 font-normal">회사명</th><th className="px-4 py-3 font-normal">담당자</th><th className="px-4 py-3 font-normal">연락처</th><th className="px-4 py-3 font-normal">상태</th><th className="px-4 py-3 text-right font-normal">관리</th></tr></thead><tbody>{rows.map((c)=><tr key={c.id} className="border-b border-silver/20 last:border-0"><td className="px-4 py-3 text-silver">{new Date(c.created_at).toLocaleDateString("ko-KR")}</td><td className="px-4 py-3 font-medium">{c.company_name??"-"}</td><td className="px-4 py-3"><Link href={`/admin/customers/${c.id}`} className="hover:underline">{c.contact_name}</Link></td><td className="px-4 py-3 text-silver"><div>{c.phone??"-"}</div>{c.email&&<div className="mt-0.5 text-[11px]">{c.email}</div>}</td><td className="px-4 py-3"><span className="border border-silver/30 bg-fog px-2 py-0.5 text-xs text-navy">{CUSTOMER_STATUS_LABEL[c.status]??c.status}</span></td><td className="px-4 py-3 text-right"><Link href={`/admin/customers/${c.id}`} className="text-navy hover:underline">상담 상세 →</Link></td></tr>)}{rows.length===0&&<tr><td colSpan={6} className="px-4 py-12 text-center text-silver">조건에 맞는 상담이 없습니다.</td></tr>}</tbody></table></div>
  </div>;
}
