"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export default function ComparePicker({items}:{items:{id:string;name:string}[]}){
  const router=useRouter();
  const [ids,setIds]=useState<string[]>([]);
  const [open,setOpen]=useState(false);
  const [q,setQ]=useState("");
  const selected=useMemo(()=>items.filter(i=>ids.includes(i.id)),[items,ids]);
  const visible=useMemo(()=>{
    const term=q.trim().toLowerCase();
    return (term?items.filter(i=>i.name.toLowerCase().includes(term)):items).slice(0,80);
  },[items,q]);
  function toggle(id:string){setIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):prev.length>=4?prev:[...prev,id])}
  return <div className="relative">
    <button type="button" onClick={()=>setOpen(v=>!v)} className="inline-flex items-center gap-2 border border-silver/40 bg-white px-4 py-2 text-xs font-medium text-navy hover:border-navy">
      비교할 건물 선택 <span className="rounded-full bg-fog px-2 py-0.5 tabular-nums">{ids.length}/4</span>
    </button>
    {open&&<div className="absolute right-0 top-[calc(100%+8px)] z-30 w-[min(92vw,420px)] border border-silver/30 bg-white p-4 shadow-2xl">
      <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium">오피스 비교</p><p className="mt-1 text-[11px] text-silver">2~4개를 선택하면 한 화면에서 비교할 수 있습니다.</p></div><button type="button" onClick={()=>setOpen(false)} aria-label="비교 선택 닫기" className="text-lg text-silver">×</button></div>
      {selected.length>0&&<div className="mt-3 flex flex-wrap gap-1.5">{selected.map(i=><button key={i.id} type="button" onClick={()=>toggle(i.id)} className="border border-navy/20 bg-fog px-2 py-1 text-[11px] text-navy">{i.name} ×</button>)}</div>}
      <input value={q} onChange={e=>setQ(e.target.value)} className="mt-3 w-full border border-silver/40 px-3 py-2 text-sm" placeholder="건물명 검색" />
      <div className="mt-2 max-h-72 overflow-auto border-y border-silver/20 py-1">{visible.map(i=><label key={i.id} className="flex cursor-pointer items-center gap-2 px-2 py-2 text-sm hover:bg-fog"><input type="checkbox" checked={ids.includes(i.id)} onChange={()=>toggle(i.id)}/><span>{i.name}</span></label>)}{visible.length===0&&<p className="px-2 py-6 text-center text-xs text-silver">검색 결과가 없습니다.</p>}</div>
      <div className="mt-3 flex items-center justify-between"><button type="button" onClick={()=>setIds([])} className="text-xs text-silver hover:text-charcoal">선택 초기화</button><button disabled={ids.length<2} onClick={()=>router.push(`/compare?ids=${ids.join(',')}`)} className="bg-navy px-4 py-2 text-xs text-white disabled:opacity-40">{ids.length}개 비교하기</button></div>
    </div>}
  </div>
}
