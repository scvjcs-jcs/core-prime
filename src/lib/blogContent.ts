export type BlogTemplateKey = "building_intro" | "vacancy_update" | "comparison";

export type BlogBuildingFacts = {
  id: string;
  name: string;
  districtName?: string | null;
  roadAddress?: string | null;
  address?: string | null;
  buildingGrade?: string | null;
  completionYear?: number | null;
  completionMonth?: number | null;
  basementFloors?: number | null;
  aboveGroundFloors?: number | null;
  grossFloorArea?: number | null;
  efficiencyRatio?: number | null;
  elevatorCount?: number | null;
  typicalFloorLeasablePy?: number | null;
  typicalFloorExclusivePy?: number | null;
  dataLastVerifiedAt?: string | null;
  parkingTotal?: number | null;
  freeParkingText?: string | null;
  paidParkingText?: string | null;
  transportation?: Array<{
    lineName?: string | null;
    stationName?: string | null;
    walkMinutes?: number | null;
    description?: string | null;
  }>;
  primeScore?: number | null;
  listings?: Array<{
    floor?: string | null;
    grossAreaPy?: number | null;
    exclusiveAreaPy?: number | null;
    rentPerPy?: number | null;
    maintenancePerPy?: number | null;
    depositTotalWon?: number | null;
    monthlyRentTotalWon?: number | null;
    managementFeeTotalWon?: number | null;
    moveInText?: string | null;
    status?: string | null;
  }>;
};

export type NaverBlogPackage = {
  templateKey: BlogTemplateKey;
  titles: string[];
  body: string;
  tags: string[];
  factLines: string[];
  warnings: string[];
  sourceSnapshot: Record<string, unknown>;
};

function num(value: number | null | undefined, digits = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value.toLocaleString("ko-KR", { maximumFractionDigits: digits });
}

function won(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value >= 100_000_000) {
    const eok = value / 100_000_000;
    return `${eok.toLocaleString("ko-KR", { maximumFractionDigits: eok >= 10 ? 1 : 2 })}억원`;
  }
  if (value >= 10_000) return `${Math.round(value / 10_000).toLocaleString("ko-KR")}만원`;
  return `${value.toLocaleString("ko-KR")}원`;
}

function pyRange(values: Array<number | null | undefined>) {
  const valid = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (!valid.length) return null;
  const min = valid[0];
  const max = valid[valid.length - 1];
  return min === max ? `${num(min, 1)}평` : `${num(min, 1)}~${num(max, 1)}평`;
}

function moneyRangeWonPerPy(values: Array<number | null | undefined>) {
  const valid = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (!valid.length) return null;
  const fmt = (v: number) => `${num(v / 10_000, 1)}만원/평`;
  return valid[0] === valid[valid.length - 1] ? fmt(valid[0]) : `${fmt(valid[0])}~${fmt(valid[valid.length - 1])}`;
}

function wonRange(values: Array<number | null | undefined>) {
  const valid = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (!valid.length) return null;
  const min = won(valid[0]);
  const max = won(valid[valid.length - 1]);
  return min === max ? min : `${min}~${max}`;
}

function freshness(date?: string | null) {
  if (!date) return { label: null, stale: true };
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return { label: null, stale: true };
  const days = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86400000));
  return {
    label: `${parsed.getFullYear()}.${String(parsed.getMonth() + 1).padStart(2, "0")}.${String(parsed.getDate()).padStart(2, "0")} 기준 확인`,
    stale: days > 90,
  };
}

function buildingFactLines(b: BlogBuildingFacts) {
  const scale = [b.basementFloors ? `지하 ${b.basementFloors}층` : null, b.aboveGroundFloors ? `지상 ${b.aboveGroundFloors}층` : null]
    .filter(Boolean)
    .join(" / ");
  const transit = (b.transportation ?? [])
    .map((t) => {
      const base = [t.lineName, t.stationName].filter(Boolean).join(" ").trim();
      if (!base) return t.description ?? null;
      return t.walkMinutes ? `${base} 도보 ${t.walkMinutes}분` : base;
    })
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
  return [
    `건물명: ${b.name}`,
    b.roadAddress || b.address ? `주소: ${b.roadAddress || b.address}` : null,
    b.buildingGrade ? `등급: ${b.buildingGrade}` : null,
    b.completionYear ? `준공: ${b.completionYear}년${b.completionMonth ? ` ${b.completionMonth}월` : ""}` : null,
    scale ? `규모: ${scale}` : null,
    b.grossFloorArea ? `연면적: ${num(b.grossFloorArea, 2)}㎡` : null,
    b.efficiencyRatio ? `전용률: ${num(b.efficiencyRatio, 2)}%` : null,
    b.elevatorCount ? `엘리베이터: ${b.elevatorCount}대` : null,
    b.parkingTotal ? `주차: ${b.parkingTotal}대` : null,
    transit ? `교통: ${transit}` : null,
    b.typicalFloorLeasablePy ? `기준층 임대면적: ${num(b.typicalFloorLeasablePy, 2)}평` : null,
    b.typicalFloorExclusivePy ? `기준층 전용면적: ${num(b.typicalFloorExclusivePy, 2)}평` : null,
    b.primeScore ? `Prime Score: ${num(b.primeScore, 1)}점` : null,
  ].filter((x): x is string => Boolean(x));
}

function vacancySummary(b: BlogBuildingFacts) {
  const listings = b.listings ?? [];
  if (!listings.length) return null;
  const exclusive = pyRange(listings.map((x) => x.exclusiveAreaPy));
  const gross = pyRange(listings.map((x) => x.grossAreaPy));
  const rent = moneyRangeWonPerPy(listings.map((x) => x.rentPerPy));
  const maintenance = moneyRangeWonPerPy(listings.map((x) => x.maintenancePerPy));
  const monthlyTotal = wonRange(listings.map((x) => x.monthlyRentTotalWon));
  const managementTotal = wonRange(listings.map((x) => x.managementFeeTotalWon));
  const floors = Array.from(new Set(listings.map((x) => x.floor).filter(Boolean))).slice(0, 8).join(", ");
  return {
    count: listings.length,
    exclusive,
    gross,
    rent,
    maintenance,
    monthlyTotal,
    managementTotal,
    floors,
  };
}

function baseTags(b: BlogBuildingFacts) {
  const district = b.districtName?.replace(/\s+/g, "") ?? "";
  const station = (b.transportation ?? []).find((t) => t.stationName)?.stationName?.replace(/\s+/g, "") ?? "";
  const values = [
    b.name.replace(/\s+/g, ""),
    district ? `${district}사무실임대` : null,
    district ? `${district}오피스` : null,
    station ? `${station}사무실` : null,
    "서울사무실임대",
    "프라임오피스",
    "오피스임대",
    "COREPRIME",
  ].filter((x): x is string => Boolean(x));
  return Array.from(new Set(values)).slice(0, 10);
}

function introParagraph(b: BlogBuildingFacts) {
  const location = b.districtName ? `${b.districtName} 권역의 ` : "";
  const grade = b.buildingGrade ? `${b.buildingGrade}급 ` : "";
  return `${b.name}은(는) ${location}${grade}오피스 빌딩입니다. CORE PRIME은 건물 기본정보와 공개 가능한 공실 데이터를 원문 및 등록 자료 기준으로 확인한 뒤 안내합니다.`;
}

function commonFooter(b: BlogBuildingFacts) {
  const f = freshness(b.dataLastVerifiedAt);
  const verified = f.label ? `\n\n※ 데이터 기준: ${f.label}` : "\n\n※ 데이터 기준일이 확인되지 않은 항목은 상담 시 재확인합니다.";
  return `\n\n[CORE PRIME 안내]\n오피스 임대조건은 협의 과정에서 변경될 수 있습니다. 실제 계약 검토 전 최신 공실, 임대조건, 입주시기를 다시 확인해 드립니다.${verified}\n\n기업의 희망 면적, 예산, 입주 시기를 알려주시면 같은 기준으로 비교 가능한 후보를 정리해 드립니다.`;
}

function titlesFor(b: BlogBuildingFacts, template: BlogTemplateKey, other?: BlogBuildingFacts | null) {
  const district = b.districtName || "서울";
  if (template === "vacancy_update") {
    return [
      `${b.name} 임대 | 현재 공실·면적·임대조건 확인`,
      `${district} 사무실 임대 ${b.name} 공실 현황 정리`,
      `${b.name} 오피스 공실 정보 | 임대면적과 조건`,
      `${district} 프라임 오피스 ${b.name} 임대 정보`,
      `${b.name} 사무실 임대 전 확인할 건물·공실 정보`,
    ];
  }
  if (template === "comparison" && other) {
    return [
      `${b.name} vs ${other.name} | ${district} 오피스 비교`,
      `${district} 사무실 임대 비교 | ${b.name}·${other.name}`,
      `${b.name}과 ${other.name}, 어떤 오피스가 맞을까?`,
      `${district} 프라임 오피스 비교 | 건물·공실 기준 정리`,
      `기업 이전 후보 비교 | ${b.name} vs ${other.name}`,
    ];
  }
  return [
    `${b.name} 빌딩 정보 | 위치·규모·주차·공실 확인`,
    `${district} 오피스 ${b.name} 건물정보 정리`,
    `${b.name} 사무실 임대 전 확인할 핵심 정보`,
    `${district} 프라임 오피스 ${b.name} 소개`,
    `${b.name} 오피스 | 건물 기본정보와 임대 체크포인트`,
  ];
}

function comparisonBody(a: BlogBuildingFacts, b: BlogBuildingFacts) {
  const aVac = vacancySummary(a);
  const bVac = vacancySummary(b);
  const lines = (x: BlogBuildingFacts, vac: ReturnType<typeof vacancySummary>) => [
    `- 위치: ${x.roadAddress || x.address || "확인 필요"}`,
    `- 준공: ${x.completionYear ? `${x.completionYear}년` : "확인 필요"}`,
    `- 규모: ${[x.basementFloors ? `B${x.basementFloors}` : null, x.aboveGroundFloors ? `${x.aboveGroundFloors}F` : null].filter(Boolean).join(" / ") || "확인 필요"}`,
    `- 연면적: ${x.grossFloorArea ? `${num(x.grossFloorArea, 2)}㎡` : "확인 필요"}`,
    `- 주차: ${x.parkingTotal ? `${x.parkingTotal}대` : "확인 필요"}`,
    `- 공개 공실: ${vac ? `${vac.count}건${vac.exclusive ? ` · 전용 ${vac.exclusive}` : ""}` : "현재 공개 데이터 없음"}`,
  ];
  return `${introParagraph(a)}\n\n이번 글에서는 ${a.name}과(와) ${b.name}을 같은 항목으로 비교합니다. 특정 건물을 일방적으로 추천하기보다 기업의 면적, 예산, 교통, 주차, 입주 시기에 따라 판단할 수 있도록 확인된 정보만 정리합니다.\n\n1. ${a.name}\n${lines(a, aVac).join("\n")}\n\n2. ${b.name}\n${lines(b, bVac).join("\n")}\n\n3. 비교할 때 볼 기준\n두 건물의 차이는 단순 임대료만으로 판단하기 어렵습니다. 실제 의사결정에서는 전용면적, 기준층 규모, 주차조건, 교통 접근성, 현재 공실의 입주시기와 총 비용을 함께 확인하는 것이 좋습니다.\n\n현재 공개 데이터가 없는 항목은 임의로 추정하지 않았습니다.${commonFooter(a)}`;
}

export function buildNaverBlogPackage(
  building: BlogBuildingFacts,
  templateKey: BlogTemplateKey,
  compareBuilding?: BlogBuildingFacts | null
): NaverBlogPackage {
  const factLines = buildingFactLines(building);
  const vacancy = vacancySummary(building);
  const warnings: string[] = [];
  const f = freshness(building.dataLastVerifiedAt);
  if (!building.dataLastVerifiedAt) warnings.push("데이터 최종 확인일이 없습니다. 발행 전에 최신성을 확인하세요.");
  else if (f.stale) warnings.push("데이터 확인일이 90일을 넘었습니다. 공실과 임대조건을 재확인한 뒤 발행하세요.");
  if (!(building.listings ?? []).length && templateKey === "vacancy_update") warnings.push("공개 가능한 현재 공실이 없습니다. '공실 현황형'보다 '건물 소개형'을 권장합니다.");
  if (templateKey === "comparison" && !compareBuilding) warnings.push("비교 대상 건물을 선택해야 비교형 원고를 만들 수 있습니다.");

  let body = "";
  if (templateKey === "comparison" && compareBuilding) {
    body = comparisonBody(building, compareBuilding);
  } else if (templateKey === "vacancy_update") {
    const current = vacancy
      ? [
          `현재 공개 가능한 공실은 ${vacancy.count}건입니다.`,
          vacancy.floors ? `확인된 층: ${vacancy.floors}` : null,
          vacancy.gross ? `임대면적 범위: ${vacancy.gross}` : null,
          vacancy.exclusive ? `전용면적 범위: ${vacancy.exclusive}` : null,
          vacancy.rent ? `평당 임대료: ${vacancy.rent}` : null,
          vacancy.maintenance ? `평당 관리비: ${vacancy.maintenance}` : null,
          !vacancy.rent && vacancy.monthlyTotal ? `월 임대료 총액: ${vacancy.monthlyTotal}` : null,
          !vacancy.maintenance && vacancy.managementTotal ? `월 관리비 총액: ${vacancy.managementTotal}` : null,
        ].filter(Boolean).join("\n")
      : "현재 공개 가능한 공실 데이터는 없습니다. 실제 공실 여부는 상담 시 최신 자료로 다시 확인합니다.";
    body = `${introParagraph(building)}\n\n1. ${building.name} 기본정보\n${factLines.map((x) => `- ${x}`).join("\n")}\n\n2. 현재 공실 현황\n${current}\n\n3. 임대 검토 시 체크할 부분\n표시된 임대조건은 자료 기준 정보이며 협의 과정에서 달라질 수 있습니다. 층별 전용면적, 총 임대비용, 주차조건, 입주시기를 함께 확인해야 실제 이전비용과 업무환경을 비교할 수 있습니다.${commonFooter(building)}`;
  } else {
    body = `${introParagraph(building)}\n\n1. 건물 기본정보\n${factLines.map((x) => `- ${x}`).join("\n")}\n\n2. 입지와 업무환경\n${(building.transportation ?? []).length ? `확인된 교통정보는 ${(building.transportation ?? []).map((t) => [t.lineName, t.stationName, t.walkMinutes ? `도보 ${t.walkMinutes}분` : null].filter(Boolean).join(" ")).filter(Boolean).slice(0, 3).join(", ")}입니다.` : "교통정보는 상담 시 원문과 현장 기준으로 추가 확인합니다."}\n${building.parkingTotal ? `주차는 등록 자료 기준 총 ${building.parkingTotal}대입니다.` : "주차 세부조건은 상담 시 확인합니다."}\n\n3. 현재 임대 검토\n${vacancy ? `현재 공개 가능한 공실 ${vacancy.count}건이 있으며${vacancy.exclusive ? ` 전용면적은 ${vacancy.exclusive}` : ""}${vacancy.rent ? `, 평당 임대료는 ${vacancy.rent}` : vacancy.monthlyTotal ? `, 월 임대료 총액은 ${vacancy.monthlyTotal}` : ""}로 확인됩니다.` : "현재 공개 가능한 공실 데이터가 없으므로 실제 임대 가능 여부는 최신 자료로 재확인해야 합니다."}${commonFooter(building)}`;
  }

  const tags = Array.from(new Set([...baseTags(building), ...(compareBuilding ? baseTags(compareBuilding).slice(0, 4) : [])])).slice(0, 12);
  return {
    templateKey,
    titles: titlesFor(building, templateKey, compareBuilding),
    body,
    tags,
    factLines,
    warnings,
    sourceSnapshot: {
      generated_at: new Date().toISOString(),
      template_key: templateKey,
      primary_building_id: building.id,
      compare_building_id: compareBuilding?.id ?? null,
      primary_verified_at: building.dataLastVerifiedAt ?? null,
      compare_verified_at: compareBuilding?.dataLastVerifiedAt ?? null,
      primary_listing_count: building.listings?.length ?? 0,
      compare_listing_count: compareBuilding?.listings?.length ?? 0,
    },
  };
}
