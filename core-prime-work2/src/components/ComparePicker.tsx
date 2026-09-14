"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
export default function ComparePicker({items}:{items:{id:string;name:string}[]}){
 const router=useRouter(); const [ids,setIds]=useState<string[]>([]); const names=useMemo(()=>items.filter(i=>ids.includes(i.id)),[items,ids]);
 function toggle(id:string){setIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):prev.length>=4?prev:[...prev,id])}
 return <div className="bg-white border border-silver/30 p-4 mb-8 sticky top-2 z-10 shadow-sm">
  <div className="flex flex-wrap items-center gap-3"><span className="text-sm font-medium">건물 비교 (최대 4개)</span>
   {items.slice(0,24).map(i=><label key={i.id} className="text-xs flex items-center gap-1"><input type="checkbox" checked={ids.includes(i.id)} onChange={()=>toggle(i.id)}/>{i.name}</label>)}
   <button disabled={ids.length<2} onClick={()=>router.push(`/compare?ids=${ids.join(',')}`)} className="ml-auto bg-navy text-white px-4 py-2 text-xs disabled:opacity-40">{ids.length}개 비교</button>
  </div>{ids.length>=4&&<p className="text-xs text-silver mt-2">최대 4개까지 선택할 수 있습니다.</p>}
 </div>
}
