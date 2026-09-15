import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { rangeLabel } from "@/lib/publicData";
import ComparePicker from "@/components/ComparePicker";

export const metadata:Metadata={title:"오피스 비교 | CORE PRIME",description:"최대 4개의 프라임 오피스를 한눈에 비교합니다."};
const money=(n:number|null|undefined)=>n==null?"-":`${Number(n).toLocaleString("ko-KR")}원/평`;

export default async function ComparePage({searchParams}:{searchParams:Promise<{ids?:string}>}){
  const {ids:raw}=await searchParams;
  const ids=[...new Set((raw??"").split(',').filter(Boolean))].slice(0,4);
  const supabase=await createClient();
  if(ids.length<2) {
    const {data: choices}=await supabase.from("buildings").select("id,name").eq("is_published",true).is("deleted_at",null).order("name").limit(400);
    return <main id="main-content" className="min-h-screen bg-fog"><section className="bg-navy px-6 py-14 text-white"><div className="mx-auto max-w-6xl"><p className="text-xs uppercase tracking-[.2em] text-silver">Office Compare</p><h1 className="mt-2 font-display text-3xl">비교할 오피스를 선택해 주세요.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-silver">2~4개 후보를 선택하면 면적·임대료·교통·주차·Prime Score를 같은 기준으로 비교할 수 있습니다.</p></div></section><div className="mx-auto max-w-6xl px-6 py-10"><div className="border border-silver/25 bg-white p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-medium">공개 빌딩에서 비교 후보 선택</h2><p className="mt-1 text-xs text-silver">건물명으로 검색해 최대 4개까지 선택하세요.</p></div>{(choices??[]).length>=2&&<ComparePicker items={(choices??[]).map((b:any)=>({id:b.id,name:b.name}))}/>}</div></div><Link className="mt-5 inline-block text-sm font-medium text-navy hover:underline" href="/buildings">검색 조건으로 후보를 먼저 좁히기 →</Link></div></main>;
  }

  const {data}=await supabase.from("buildings").select("id,name,slug,road_address,completion_year,building_grade,gross_floor_area,above_ground_floors,basement_floors,building_parking(total_spaces),building_transportation(station_name,walk_minutes),building_scores(total_score,status),listings(id,floor,exclusive_area_py,rent_per_py,maintenance_per_py,noc_per_py,move_in_text,status,is_published)").in("id",ids).eq("is_published",true).is("deleted_at",null);
  const buildings=(data??[]).sort((a:any,b:any)=>ids.indexOf(a.id)-ids.indexOf(b.id));
  if(buildings.length<2) return <main className="mx-auto max-w-6xl px-6 py-20"><h1 className="font-display text-3xl">비교할 수 있는 공개 건물이 부족합니다.</h1><p className="mt-3 text-sm text-silver">선택한 건물 중 일부가 비공개되었거나 삭제되었을 수 있습니다.</p><Link href="/buildings" className="mt-6 inline-block bg-navy px-5 py-2.5 text-sm text-white">다시 선택하기</Link></main>;

  const active=(b:any)=>(b.listings??[]).filter((l:any)=>l.is_published&&['available','negotiating','contracting'].includes(l.status));
  const representative=(b:any)=>active(b).find((x:any)=>x.status==='available')??active(b)[0]??null;
  const range=(b:any,key:string,suffix:string)=>rangeLabel(active(b).map((x:any)=>x[key]),suffix)??"-";
  const row=(label:string,fn:(b:any)=>ReactNode)=><tr><th className="whitespace-nowrap bg-fog p-3 text-left font-normal text-silver">{label}</th>{buildings.map((b:any)=><td className="border-l border-silver/20 p-3 align-top" key={b.id}>{fn(b)}</td>)}</tr>;

  return <main id="main-content" className="min-h-screen bg-fog">
    <section className="bg-navy px-6 py-14 text-white"><div className="mx-auto max-w-6xl"><p className="mb-2 text-xs tracking-[.3em] text-silver">PRIME OFFICE ADVISORY</p><h1 className="font-display text-3xl">오피스 후보 비교</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-silver kr-text">정량 정보는 후보를 좁히는 기준입니다. 실제 계약 전에는 임대조건, 인테리어 인수, 주차, 입주시기 등 최신 조건을 다시 확인해 주세요.</p></div></section>
    <div className="mx-auto max-w-6xl px-6 py-10"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm"><b>{buildings.length}개</b> 건물을 비교 중입니다.</p><div className="flex gap-2"><Link href="/buildings" className="border border-silver/40 bg-white px-4 py-2 text-xs">후보 다시 선택</Link><Link href="/advisory" className="bg-navy px-4 py-2 text-xs text-white">이 조건으로 상담</Link></div></div>
      <div className="overflow-x-auto border border-silver/30 bg-white"><table className="w-full min-w-[850px] text-sm"><thead><tr><th className="bg-fog p-3"></th>{buildings.map((b:any)=><th key={b.id} className="border-l border-silver/20 p-4 text-left"><Link className="font-display text-lg hover:underline" href={`/buildings/${b.slug}`}>{b.name}</Link><p className="mt-1 text-[11px] font-normal text-silver">상세보기 →</p></th>)}</tr></thead><tbody>
        {row("등급",b=>b.building_grade??"-")}{row("준공",b=>b.completion_year?`${b.completion_year}년`:"-")}{row("주소",b=>b.road_address??"-")}{row("규모",b=>`지상 ${b.above_ground_floors??"-"}층 / 지하 ${b.basement_floors??"-"}층`)}{row("주차",b=>{const p=Array.isArray(b.building_parking)?b.building_parking[0]:b.building_parking;return p?.total_spaces?`${p.total_spaces}대`:"-"})}{row("교통",b=>{const ts=Array.isArray(b.building_transportation)?b.building_transportation:[];const t=ts[0];return t?`${t.station_name??""}${t.walk_minutes?` · 도보 ${t.walk_minutes}분`:""}`:"-"})}{row("Prime Score",b=>{const s=Array.isArray(b.building_scores)?b.building_scores[0]:b.building_scores;return s?.status==='PUBLISHED'?s.total_score:"평가 준비중"})}{row("현재 공개 공실",b=>`${active(b).length}건`)}{row("전용면적 범위",b=>range(b,"exclusive_area_py","평"))}{row("평당 임대료 범위",b=>range(b,"rent_per_py","원/평"))}{row("평당 관리비 범위",b=>range(b,"maintenance_per_py","원/평"))}{row("NOC 범위",b=>range(b,"noc_per_py","원/평"))}{row("대표 입주 가능",b=>representative(b)?.move_in_text??"협의")}
      </tbody></table></div>
      <div className="mt-6 border border-silver/25 bg-white p-5 text-sm"><p className="font-medium">비교표만으로 결정하기 어려우신가요?</p><p className="mt-1 text-xs leading-5 text-silver">기업 규모, 예산, 입주 시기, 주차 조건을 남겨주시면 현재 공개되지 않은 후보까지 포함해 우선순위를 정리해 드립니다.</p><Link href="/advisory" className="mt-4 inline-block bg-charcoal px-4 py-2 text-xs text-white">맞춤 제안 요청</Link></div>
    </div>
  </main>;
}
