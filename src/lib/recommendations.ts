export type RecommendationRequirement={preferred_district:string|null;min_exclusive_area:number|null;max_exclusive_area:number|null;min_budget:number|null;max_budget:number|null;preferred_grade:string|null;required_parking:number|null;move_in_date:string|null};
export type RecommendationCandidate={id:string;floor:string|null;exclusive_area:number|null;exclusive_area_py:number|null;monthly_rent:number|null;management_fee:number|null;rent_per_py:number|null;maintenance_per_py:number|null;move_in_text:string|null;available_date:string|null;building:{id:string;name:string;slug:string;district_id:string|null;building_grade:string|null}|null};
export type ScoredRecommendation=RecommendationCandidate&{score:number;reasons:string[]};
export function scoreRecommendations(req:RecommendationRequirement|null,rows:RecommendationCandidate[]):ScoredRecommendation[]{
 return rows.map(row=>{let score=50;const reasons:string[]=[];const b=row.building;
  if(req?.preferred_district&&b?.district_id===req.preferred_district){score+=18;reasons.push('희망 권역 일치')}
  if(req?.preferred_grade&&b?.building_grade&&b.building_grade.toLowerCase().includes(req.preferred_grade.toLowerCase())){score+=10;reasons.push('희망 등급 일치')}
  if(req?.min_exclusive_area!=null||req?.max_exclusive_area!=null){const a=row.exclusive_area;if(a!=null){const min=req.min_exclusive_area??0,max=req.max_exclusive_area??Infinity;if(a>=min&&a<=max){score+=15;reasons.push('희망 면적 범위')}else if(a>=min*.85&&a<=max*1.15){score+=6;reasons.push('면적 근접')}}}
  if(req?.max_budget!=null&&row.monthly_rent!=null){const total=(row.monthly_rent??0)+(row.management_fee??0);if(total<=req.max_budget){score+=10;reasons.push('예산 범위')}else if(total<=req.max_budget*1.15){score+=3;reasons.push('예산 근접')}}
  if(row.available_date&&req?.move_in_date){if(row.available_date<=req.move_in_date){score+=5;reasons.push('입주시기 충족')}}else if(row.move_in_text){score+=2}
  return {...row,score:Math.min(100,score),reasons};
 }).sort((a,b)=>b.score-a.score).slice(0,12);
}
