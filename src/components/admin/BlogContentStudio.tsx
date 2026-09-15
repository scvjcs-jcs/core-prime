"use client";

import { useMemo, useState } from "react";
import { generateVerifiedBlogDraft, refineVerifiedBlogDraft, saveNaverBlogDraft, updateBlogPublishState } from "@/app/admin/(protected)/content/actions";
import type { BlogTemplateKey, NaverBlogPackage } from "@/lib/blogContent";

type Saved = { id:string; title:string; body:string; status:string; tags:string[]; templateKey:string; publishedUrl:string|null; publishedAt:string|null; createdAt:string };

const TEMPLATE_LABEL: Record<BlogTemplateKey,string> = { building_intro:"건물 소개형", vacancy_update:"공실 현황형", comparison:"건물 비교형" };

export default function BlogContentStudio({ buildingId, buildingName, compareBuildings, initialContents }: { buildingId:string; buildingName:string; compareBuildings:Array<{id:string;name:string;districtName:string}>; initialContents:Saved[] }) {
  const [templateKey,setTemplateKey]=useState<BlogTemplateKey>("building_intro");
  const [compareId,setCompareId]=useState("");
  const [draft,setDraft]=useState<NaverBlogPackage|null>(null);
  const [title,setTitle]=useState("");
  const [body,setBody]=useState("");
  const [tags,setTags]=useState<string[]>([]);
  const [contents,setContents]=useState(initialContents);
  const [busy,setBusy]=useState("");
  const [message,setMessage]=useState<string|null>(null);
  const [publishUrls,setPublishUrls]=useState<Record<string,string>>({});
  const [compareSearch,setCompareSearch]=useState("");
  const filteredCompare=useMemo(()=>compareBuildings.filter(b=>`${b.name} ${b.districtName}`.toLowerCase().includes(compareSearch.toLowerCase())).slice(0,80),[compareBuildings,compareSearch]);

  async function generate(){ setBusy("generate");setMessage(null);const r=await generateVerifiedBlogDraft(buildingId,templateKey,templateKey==="comparison"?compareId:null);setBusy("");if(r.error){setMessage(r.error);return;}if(r.draft){setDraft(r.draft);setTitle(r.draft.titles[0]??"");setBody(r.draft.body);setTags(r.draft.tags);} }
  async function refine(){ if(!body.trim())return;setBusy("refine");setMessage(null);const r=await refineVerifiedBlogDraft({buildingId,title,body,tags});setBusy("");if(r.error){setMessage(r.error);return;}setTitle(r.title??title);setBody(r.body??body);setTags(r.tags??tags);setMessage("검증된 사실 범위 안에서 문장을 다듬었습니다. 발행 전 원문을 한 번 더 확인하세요."); }
  async function save(){ if(!draft||!title.trim()||!body.trim())return;setBusy("save");setMessage(null);const r=await saveNaverBlogDraft({buildingId,title:title.trim(),body:body.trim(),tags,templateKey,sourceSnapshot:draft.sourceSnapshot});setBusy("");if(r.error){setMessage(r.error);return;}setContents(prev=>[{id:r.id??crypto.randomUUID(),title:title.trim(),body:body.trim(),status:"draft",tags,templateKey,publishedUrl:null,publishedAt:null,createdAt:new Date().toISOString()},...prev]);setMessage("초안을 저장했습니다."); }
  async function copyText(text:string,label:string){try{await navigator.clipboard.writeText(text);setMessage(`${label}을(를) 복사했습니다.`);}catch{window.prompt(`${label} 복사`,text)}}
  async function markPublished(c:Saved){const url=(publishUrls[c.id]??c.publishedUrl??"").trim();setBusy(`pub-${c.id}`);const r=await updateBlogPublishState({id:c.id,buildingId,status:"published",publishedUrl:url});setBusy("");if(r.error){setMessage(r.error);return;}setContents(prev=>prev.map(x=>x.id===c.id?{...x,status:"published",publishedUrl:url,publishedAt:new Date().toISOString()}:x));setMessage("발행 완료로 기록했습니다.");}

  const tagText=tags.map(t=>`#${t.replace(/^#/,"")}`).join(" ");
  return <div className="grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
    <section className="space-y-5">
      <div className="border border-silver/25 bg-fog p-5">
        <div className="mb-4"><div className="text-xs font-medium text-navy">STEP 1 · 원고 유형 선택</div><p className="mt-1 text-xs text-silver">현재 DB에 저장된 확인 정보만으로 1차 초안을 만듭니다. 없는 사실은 쓰지 않습니다.</p></div>
        <div className="grid gap-2 md:grid-cols-3">{(Object.keys(TEMPLATE_LABEL) as BlogTemplateKey[]).map(k=><button key={k} type="button" onClick={()=>setTemplateKey(k)} className={`border px-4 py-3 text-left text-sm ${templateKey===k?"border-navy bg-navy text-white":"border-silver/40 bg-white"}`}><b>{TEMPLATE_LABEL[k]}</b><div className={`mt-1 text-xs ${templateKey===k?"text-white/70":"text-silver"}`}>{k==="building_intro"?"건물정보 중심":k==="vacancy_update"?"현재 공개 공실 중심":"두 건물 동일 기준 비교"}</div></button>)}</div>
        {templateKey==="comparison"&&<div className="mt-4 rounded border border-silver/30 bg-white p-3"><input value={compareSearch} onChange={e=>setCompareSearch(e.target.value)} placeholder="비교 건물 검색" className="mb-2 w-full border px-3 py-2 text-sm"/><select value={compareId} onChange={e=>setCompareId(e.target.value)} className="w-full border px-3 py-2 text-sm"><option value="">비교 건물 선택</option>{filteredCompare.map(b=><option key={b.id} value={b.id}>{b.name}{b.districtName?` · ${b.districtName}`:""}</option>)}</select></div>}
        <button onClick={generate} disabled={busy!==""||(templateKey==="comparison"&&!compareId)} className="mt-4 bg-navy px-5 py-2.5 text-sm text-white disabled:opacity-40">{busy==="generate"?"검증 데이터 읽는 중...":"검증 데이터로 초안 만들기"}</button>
      </div>

      {draft&&<div className="space-y-4 border border-silver/25 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-xs font-medium text-navy">STEP 2 · 편집 및 사실 확인</div><p className="mt-1 text-xs text-silver">제목과 본문은 자유롭게 수정할 수 있습니다.</p></div><button onClick={refine} disabled={busy!==""} className="border border-navy px-3 py-2 text-xs text-navy disabled:opacity-40">{busy==="refine"?"AI 다듬는 중...":"AI로 문장만 다듬기"}</button></div>
        {draft.warnings.length>0&&<div className="border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><b>발행 전 확인</b>{draft.warnings.map((w,i)=><div key={i} className="mt-1">· {w}</div>)}</div>}
        <div><label className="mb-1 block text-xs text-silver">추천 제목 5개</label><div className="space-y-1">{draft.titles.map((t,i)=><button key={i} type="button" onClick={()=>setTitle(t)} className={`block w-full border px-3 py-2 text-left text-sm ${title===t?"border-navy bg-fog":"border-silver/20"}`}>{t}</button>)}</div></div>
        <div><label className="mb-1 block text-xs text-silver">제목</label><input value={title} onChange={e=>setTitle(e.target.value)} className="w-full border border-silver/40 px-3 py-2 text-sm"/></div>
        <div><label className="mb-1 block text-xs text-silver">본문</label><textarea value={body} onChange={e=>setBody(e.target.value)} rows={24} className="w-full border border-silver/40 px-3 py-3 text-sm leading-7"/></div>
        <div><label className="mb-1 block text-xs text-silver">태그</label><input value={tags.join(", ")} onChange={e=>setTags(e.target.value.split(",").map(x=>x.trim().replace(/^#/,"")).filter(Boolean).slice(0,12))} className="w-full border border-silver/40 px-3 py-2 text-sm"/><div className="mt-2 text-xs text-silver">{tagText}</div></div>
        <details className="border border-silver/20 bg-fog/60 p-3"><summary className="cursor-pointer text-xs font-medium">원고에 사용 가능한 검증 사실 보기</summary><div className="mt-2 space-y-1 text-xs text-silver">{draft.factLines.map((x,i)=><div key={i}>· {x}</div>)}</div></details>
        <div className="flex flex-wrap gap-2"><button onClick={()=>copyText(`${title}\n\n${body}\n\n${tagText}`,"전체 원고")} className="border border-navy px-4 py-2 text-sm text-navy">전체 원고 복사</button><button onClick={save} disabled={busy!==""||!title.trim()||!body.trim()} className="bg-navy px-4 py-2 text-sm text-white disabled:opacity-40">{busy==="save"?"저장 중...":"초안 저장"}</button><a href="https://blog.naver.com/" target="_blank" rel="noreferrer" className="border border-green-700 px-4 py-2 text-sm text-green-700">네이버 블로그 열기 ↗</a></div>
      </div>}
      {message&&<div className="border border-silver/25 bg-white p-3 text-sm">{message}</div>}
    </section>

    <aside className="space-y-4">
      <div className="border border-silver/25 bg-white p-4"><div className="text-xs font-medium text-navy">발행 워크플로</div><ol className="mt-3 space-y-2 text-sm"><li>1. 검증 데이터로 초안 생성</li><li>2. 사실·표현 직접 확인</li><li>3. 원고 복사</li><li>4. 네이버 스마트에디터에서 사진·지도 추가</li><li>5. 직접 발행</li><li>6. 게시글 URL 기록</li></ol></div>
      <div className="border border-silver/25 bg-white p-4"><div className="mb-3 flex items-center justify-between"><div className="text-xs font-medium text-navy">저장·발행 이력</div><span className="text-xs text-silver">{contents.length}건</span></div>{contents.length===0?<p className="py-4 text-center text-xs text-silver">아직 저장된 원고가 없습니다.</p>:<div className="space-y-3">{contents.map(c=><div key={c.id} className="border border-silver/20 p-3"><div className="flex items-start justify-between gap-2"><div><div className="text-xs text-silver">{TEMPLATE_LABEL[c.templateKey as BlogTemplateKey]??"블로그"} · {new Date(c.createdAt).toLocaleDateString("ko-KR")}</div><div className="mt-1 text-sm font-medium">{c.title}</div></div><span className={`shrink-0 text-[10px] ${c.status==="published"?"text-green-700":"text-silver"}`}>{c.status==="published"?"발행완료":"초안"}</span></div><div className="mt-3 flex flex-wrap gap-2"><button onClick={()=>copyText(`${c.title}\n\n${c.body}\n\n${c.tags.map(t=>`#${t}`).join(" ")}`,"저장 원고")} className="border px-2.5 py-1.5 text-xs">복사</button>{c.status==="published"&&c.publishedUrl?<a href={c.publishedUrl} target="_blank" rel="noreferrer" className="border px-2.5 py-1.5 text-xs text-green-700">게시글 보기 ↗</a>:<><input value={publishUrls[c.id]??""} onChange={e=>setPublishUrls(prev=>({...prev,[c.id]:e.target.value}))} placeholder="발행 URL 붙여넣기" className="min-w-0 flex-1 border px-2 py-1 text-xs"/><button onClick={()=>markPublished(c)} disabled={busy===`pub-${c.id}`} className="bg-charcoal px-2.5 py-1.5 text-xs text-white">발행완료 기록</button></>}</div></div>)}</div>}</div>
      <div className="border border-silver/25 bg-fog p-4 text-xs leading-5 text-silver"><b className="text-charcoal">중요</b><br/>CORE PRIME은 네이버 블로그에 자동 발행하지 않습니다. 공식 글쓰기 API가 제공되지 않으므로 원고 생성·복사·발행이력 관리까지만 자동화하고, 최종 발행은 네이버에서 직접 진행합니다.</div>
    </aside>
  </div>;
}
