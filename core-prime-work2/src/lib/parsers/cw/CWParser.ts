import type { ExtractedField, ParsedBuilding, ParsedListing, ParserPage, ParserResult } from "../types";
export const CW_PARSER_VERSION="CW-v1.1.0";
const f=<T>(value:T|null,raw:string|null,page:number,confidence:number):ExtractedField<T>=>({value,raw_text:raw,source_page:page,confidence});
const num=(v?:string|null)=>{if(!v)return null;const x=Number(v.replace(/,/g,""));return Number.isFinite(x)?x:null};
const norm=(v:string)=>v.toLowerCase().replace(/[\s·._\-()\[\]{}]/g,"");
function one(text:string,re:RegExp){return text.match(re)?.[1]?.trim()??null}

function detectName(text:string){
  if(!/^\s*FOR LEASE/im.test(text)) return null;
  const lines=text.split(/\n/).map((x)=>x.trim()).filter(Boolean);
  const start=Math.max(0,lines.findIndex((x)=>/^FOR LEASE/i.test(x)));
  for(const line of lines.slice(start+1,start+8)){
    if(/^(I\s+PROPERTY|I\s+LOCATION|PROPERTY FEATURES|LOCATION)$/i.test(line)) continue;
    let name=line.split(/\[전속\]/)[0].trim();
    name=name.split(/\s+(?=서울(?:시|특별시)|경기도|부산(?:시|광역시)|인천(?:시|광역시))/)[0].trim();
    name=name.replace(/^[ㅣ|]+/,"").trim();
    if(name.length>=2 && name.length<=60 && !/^(CBD|GBD|YBD|SBD)$/i.test(name)) return name;
  }
  return null;
}

function parseRows(text:string,page:number):ParsedListing[]{
  if(/공실\s*없음/.test(text)) return [];
  const out:ParsedListing[]=[];
  for(const line of text.split(/\n+/).map((s)=>s.trim()).filter(Boolean)){
    if(/^(합계|층수\b|※|\*)/.test(line)) continue;
    const m=line.match(/^((?:(?:서관|동관|본관|별관)\s*)?(?:B?\d+F|B?\d+층)(?:\s*[~–-]\s*(?:B?\d+F|B?\d+층))?(?:\s*(?:일부|전체))?)\s+([\d,.]+)\s+([\d,.]+)(.*)$/i);
    if(!m) continue;
    const raw=m[1].replace(/\s+/g," ").trim();
    const gross=num(m[2]),exclusive=num(m[3]);
    if(gross===null||exclusive===null||exclusive>gross*1.05) continue;
    const tail=m[4].trim();
    const move=tail.match(/(즉시(?:가능)?|협의(?:\s*필요)?|\d{4}년\s*\d{1,2}월(?:\s*\([^)]*\))?)/)?.[1]??null;
    const numeric=[...tail.matchAll(/[\d,.]+/g)].map((x)=>num(x[0])).filter((x):x is number=>x!==null);
    // C&W tables often omit deposit and show only rent/maintenance. Do not infer absent values.
    let rent:number|null=null, maintenance:number|null=null;
    const plausible=numeric.filter((x)=>x>=10000 && x<5000000);
    if(plausible.length>=2){ rent=plausible[plausible.length-2]; maintenance=plausible[plausible.length-1]; }
    out.push({floor:/[~–-]/.test(raw)?null:raw,unit:null,source_page:page,warnings:[],extracted_data:{
      floor_raw:f(raw,raw,page,1),gross_area_py:f(gross,m[2],page,.98),exclusive_area_py:f(exclusive,m[3],page,.98),
      rent_per_py:f(rent,rent!==null?String(rent):null,page,rent!==null?.75:0),maintenance_per_py:f(maintenance,maintenance!==null?String(maintenance):null,page,maintenance!==null?.75:0),
      move_in_text:f(move,move,page,move?.9:0)
    }});
  }
  return out;
}

function merge(current:ParsedBuilding,text:string,page:number){
  current.listings.push(...parseRows(text,page));
  if(/공실\s*없음/.test(text)) current.extracted_data.vacancy_status=f("NO_VACANCY","공실 없음",page,1);
}

export function parseCWPages(pages:ParserPage[]):ParserResult{
  const buildings:ParsedBuilding[]=[];let current:ParsedBuilding|null=null;
  for(const p of [...pages].sort((a,b)=>a.page_number-b.page_number)){
    const text=p.extracted_text??"";if(!text.trim()||!/^\s*FOR LEASE/im.test(text))continue;
    const name=detectName(text);if(!name)continue;
    if(current&&norm(name)===current.normalized_building_name){merge(current,text,p.page_number);continue;}
    const addr=one(text,new RegExp(`${name.replace(/[.*+?^${}()|[\\]\\]/g,"\\$&")}[^\\n]*?(서울(?:시|특별시)[^\\n]+|경기도[^\\n]+|부산(?:시|광역시)[^\\n]+)`,`i`));
    const gfa=text.match(/연면적\s+([\d,.]+)\s*평\s*\(([\d,.]+)\s*㎡\)/i);
    const completion=one(text,/준공년도\s+(\d{4})년/i);
    current={raw_building_name:name,normalized_building_name:norm(name),primary_source_page:p.page_number,warnings:[],listings:[],extracted_data:{
      _parser:f(CW_PARSER_VERSION,null,p.page_number,1),building_name_kr:f(name,name,p.page_number,.97),road_address:f(addr,addr,p.page_number,addr?.85:0),
      gross_floor_area_py:f(num(gfa?.[1]),gfa?.[1]??null,p.page_number,gfa?.[1]?.9:0),gross_floor_area_sqm:f(num(gfa?.[2]),gfa?.[2]??null,p.page_number,gfa?.[2]?.9:0),
      completion_year:f(num(completion),completion,p.page_number,completion?.9:0)
    }};merge(current,text,p.page_number);buildings.push(current);
  }
  return{parser_version:CW_PARSER_VERSION,buildings,warning_count:buildings.reduce((s,b)=>s+b.warnings.length+b.listings.reduce((x,l)=>x+l.warnings.length,0),0)};
}
