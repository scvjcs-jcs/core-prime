import type { ExtractedField, ParsedBuilding, ParsedListing, ParserPage, ParserResult } from "../types";

export const CBRE_PARSER_VERSION = "CBRE-v1.1.0";
const f = <T>(value:T|null, raw:string|null, page:number, confidence:number):ExtractedField<T> => ({value, raw_text:raw, source_page:page, confidence});
const n=(v?:string|null)=>{ if(!v) return null; const x=Number(v.replace(/,/g,"")); return Number.isFinite(x)?x:null; };
const norm=(v:string)=>v.toLowerCase().replace(/[\s·._\-()\[\]{}]/g,"");

function nameFrom(text:string){
  const lines=text.split(/\n/).map((x)=>x.trim()).filter(Boolean);
  for(const line of lines.slice(0,12)){
    if (/^Office\s*\|\s*For Lease/i.test(line)) continue;
    if (/^(?:Building Image|General Information|Location Map|Availabilities)$/i.test(line)) continue;
    if (/(?:General Information|Property Information)$/i.test(line)) {
      const c=line.replace(/(?:General Information|Property Information).*$/i,"").trim();
      if(c.length>=2) return c;
    }
    if (/[가-힣]/.test(line) && /[A-Za-z가-힣0-9]/.test(line) && !/^(주소|연면적|규모|전용률)/.test(line) && line.length < 70) return line;
  }
  return null;
}
function one(text:string,re:RegExp){ return text.match(re)?.[1]?.trim() ?? null; }

function floorBlockLines(text:string): string[] {
  const lines=text.split(/\n/).map((x)=>x.trim()).filter(Boolean);
  const out:string[]=[];
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(!/^((?:[AB]동\s*)?(?:B?\d+층|B?\d+F)(?:\s*\([^)]*\))?)/i.test(line)) continue;
    let block=line;
    for(let j=i+1;j<Math.min(lines.length,i+5);j++){
      if(/^((?:[AB]동\s*)?(?:B?\d+층|B?\d+F)|합계)/i.test(lines[j])) break;
      if(/CBRE Contacts|Confidential/i.test(lines[j])) break;
      block += " " + lines[j];
      if(([...block.matchAll(/[\d,.]+/g)].length)>=6) break;
    }
    out.push(block);
  }
  return out;
}

function listings(text:string,page:number):ParsedListing[]{
  const out:ParsedListing[]=[];
  for(const block of floorBlockLines(text)){
    const fm=block.match(/^((?:[AB]동\s*)?(?:B?\d+층|B?\d+F)(?:\s*\([^)]*\))?)/i);
    if(!fm) continue;
    const floorRaw=fm[1].replace(/\s+/g," ").trim();
    const rest=block.slice(fm[0].length).trim();
    const nums=[...rest.matchAll(/[\d,.]+/g)].map((m)=>({raw:m[0],value:n(m[0]),index:m.index??0}));
    if(nums.length<4) continue;
    const grossPy=nums[0].value, grossSqm=nums[1].value, exclusivePy=nums[2].value, exclusiveSqm=nums[3].value;
    if(grossPy===null||grossSqm===null||exclusivePy===null||exclusiveSqm===null) continue;
    // Guard against phone/date/text lines accidentally joining the row.
    if(grossSqm < grossPy*2 || grossSqm > grossPy*4.5 || exclusiveSqm < exclusivePy*2 || exclusiveSqm > exclusivePy*4.5) continue;
    const tail=rest.slice((nums[3].index ?? 0)+nums[3].raw.length).trim();
    const move=tail.match(/(즉시가능|즉시|협의(?:\s*필요)?|\d{4}년\s*\d{1,2}월(?:\s*\d{1,2}일|\s*중)?)/)?.[1] ?? null;
    const rateNums=[...tail.matchAll(/([\d,]{5,})원/g)].map((m)=>n(m[1])).filter((x):x is number=>x!==null);
    const rent=rateNums[0] ?? null;
    const maintenance=rateNums[1] ?? null;
    out.push({floor:floorRaw,unit:null,source_page:page,warnings:[],extracted_data:{
      floor_raw:f(floorRaw,floorRaw,page,1),
      gross_area_py:f(grossPy,nums[0].raw,page,.98),gross_area_sqm:f(grossSqm,nums[1].raw,page,.98),
      exclusive_area_py:f(exclusivePy,nums[2].raw,page,.98),exclusive_area_sqm:f(exclusiveSqm,nums[3].raw,page,.98),
      rent_per_py:f(rent,rent?String(rent):null,page,rent!==null?.8:0),maintenance_per_py:f(maintenance,maintenance?String(maintenance):null,page,maintenance!==null?.8:0),
      move_in_text:f(move,move,page,move?.9:0)
    }});
  }
  return out;
}

function merge(current:ParsedBuilding,text:string,page:number){
  current.listings.push(...listings(text,page));
  if(/공실\s*(?:없음|없습니다)/.test(text)) current.extracted_data.vacancy_status=f("NO_VACANCY","공실 없음",page,1);
}

export function parseCBREPages(pages:ParserPage[]):ParserResult{
  const buildings:ParsedBuilding[]=[]; let current:ParsedBuilding|null=null;
  for(const p of [...pages].sort((a,b)=>a.page_number-b.page_number)){
    const text=p.extracted_text??""; if(!text.trim() || !/Office\s*\|\s*For Lease/i.test(text)) continue;
    const name=nameFrom(text);
    if(name && current && norm(name)===current.normalized_building_name){ merge(current,text,p.page_number); continue; }
    if(name){
      const addr=one(text,/주소\s+([^\n]+?)(?=\s{2,}지하철역|\n)/i);
      const gfa=text.match(/연면적\s+([\d,.]+)㎡\s*\(([\d,.]+)\s*평\)/i);
      const completion=one(text,/준공년도\s+(\d{4})년/i);
      current={raw_building_name:name,normalized_building_name:norm(name),primary_source_page:p.page_number,warnings:[],listings:[],extracted_data:{
        _parser:f(CBRE_PARSER_VERSION,null,p.page_number,1), building_name_kr:f(name,name,p.page_number,.95), road_address:f(addr,addr,p.page_number,addr ? .9:0),
        gross_floor_area_sqm:f(n(gfa?.[1]),gfa?.[1]??null,p.page_number,gfa?.[1]?.8:0),gross_floor_area_py:f(n(gfa?.[2]),gfa?.[2]??null,p.page_number,gfa?.[2]?.8:0),
        completion_year:f(n(completion),completion,p.page_number,completion?.9:0)
      }};
      merge(current,text,p.page_number); buildings.push(current);
    } else if(current && /Availabilit|공실|입주가능시기/i.test(text)) merge(current,text,p.page_number);
  }
  return {parser_version:CBRE_PARSER_VERSION,buildings,warning_count:buildings.reduce((s,b)=>s+b.warnings.length+b.listings.reduce((x,l)=>x+l.warnings.length,0),0)};
}
