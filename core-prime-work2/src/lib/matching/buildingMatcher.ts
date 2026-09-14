import { normalizeBuildingName } from "@/lib/normalizeBuildingName";

export type ExistingBuildingForMatch = {
  id: string;
  name: string;
  name_en: string | null;
  alias: string | null;
  normalized_name: string | null;
  road_address: string | null;
  jibun_address: string | null;
  deleted_at?: string | null;
};

export type AliasForMatch = {
  building_id: string;
  alias: string;
};

export type BuildingMatchCandidate = {
  building_id: string;
  name: string;
  score: number;
  reason: string;
};

export type BuildingMatchDecision = {
  status: "AUTO_MATCHED" | "REVIEW_REQUIRED" | "NEW_CANDIDATE";
  matched_building_id: string | null;
  score: number | null;
  reason: string;
  candidates: BuildingMatchCandidate[];
};

export function normalizeAddress(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/서울특별시/g, "서울")
    .replace(/경기도/g, "경기")
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function bigrams(value: string): string[] {
  if (value.length < 2) return value ? [value] : [];
  const out: string[] = [];
  for (let i = 0; i < value.length - 1; i += 1) out.push(value.slice(i, i + 2));
  return out;
}

export function diceSimilarity(aRaw: string, bRaw: string): number {
  const a = normalizeBuildingName(aRaw);
  const b = normalizeBuildingName(bRaw);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aa = bigrams(a);
  const bb = bigrams(b);
  const counts = new Map<string, number>();
  for (const x of bb) counts.set(x, (counts.get(x) ?? 0) + 1);
  let overlap = 0;
  for (const x of aa) {
    const c = counts.get(x) ?? 0;
    if (c > 0) {
      overlap += 1;
      counts.set(x, c - 1);
    }
  }
  return (2 * overlap) / (aa.length + bb.length);
}

function aliasesByBuilding(rows: AliasForMatch[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.building_id || !row.alias) continue;
    const list = map.get(row.building_id) ?? [];
    list.push(row.alias);
    map.set(row.building_id, list);
  }
  return map;
}

export function matchBuilding(input: {
  rawName: string;
  normalizedName?: string | null;
  roadAddress?: string | null;
  buildings: ExistingBuildingForMatch[];
  aliases?: AliasForMatch[];
}): BuildingMatchDecision {
  const sourceName = normalizeBuildingName(input.normalizedName || input.rawName);
  const sourceAddress = normalizeAddress(input.roadAddress);
  const aliasMap = aliasesByBuilding(input.aliases ?? []);
  const active = input.buildings.filter((b) => !b.deleted_at);

  // 1) 도로명주소 exact: 주소가 있고 유일하게 일치하는 경우만 자동확정.
  if (sourceAddress) {
    const exactAddress = active.filter((b) => normalizeAddress(b.road_address) === sourceAddress);
    if (exactAddress.length === 1) {
      const b = exactAddress[0];
      return {
        status: "AUTO_MATCHED",
        matched_building_id: b.id,
        score: 1,
        reason: "도로명주소 정확 일치",
        candidates: [{ building_id: b.id, name: b.name, score: 1, reason: "도로명주소 정확 일치" }],
      };
    }
    if (exactAddress.length > 1) {
      return {
        status: "REVIEW_REQUIRED",
        matched_building_id: null,
        score: 1,
        reason: "도로명주소가 여러 기존 건물과 일치하여 관리자 확인 필요",
        candidates: exactAddress.slice(0, 5).map((b) => ({ building_id: b.id, name: b.name, score: 1, reason: "도로명주소 정확 일치" })),
      };
    }
  }

  // 2) 이름 exact: canonical name/name_en/legacy alias/building_aliases 중 유일 exact만 자동확정.
  const exactName: BuildingMatchCandidate[] = [];
  for (const b of active) {
    const names = [b.normalized_name, b.name, b.name_en, b.alias, ...(aliasMap.get(b.id) ?? [])]
      .filter(Boolean)
      .map((v) => normalizeBuildingName(v as string));
    if (sourceName && names.includes(sourceName)) {
      exactName.push({ building_id: b.id, name: b.name, score: 0.98, reason: "건물명/별칭 정확 일치" });
    }
  }
  if (exactName.length === 1) {
    return {
      status: "AUTO_MATCHED",
      matched_building_id: exactName[0].building_id,
      score: 0.98,
      reason: exactName[0].reason,
      candidates: exactName,
    };
  }
  if (exactName.length > 1) {
    return {
      status: "REVIEW_REQUIRED",
      matched_building_id: null,
      score: 0.98,
      reason: "같은 건물명/별칭 후보가 여러 개 있어 관리자 확인 필요",
      candidates: exactName.slice(0, 5),
    };
  }

  // 3) fuzzy: 자동확정하지 않는다. 이름 유사도 후보만 관리자 검수로 보낸다.
  const fuzzy = active
    .map((b) => {
      const values = [b.name, b.name_en, b.alias, ...(aliasMap.get(b.id) ?? [])].filter(Boolean) as string[];
      const score = values.reduce((best, value) => Math.max(best, diceSimilarity(sourceName, value)), 0);
      return { building_id: b.id, name: b.name, score, reason: "건물명 유사도" };
    })
    .filter((c) => c.score >= 0.72)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (fuzzy.length > 0) {
    const best = fuzzy[0];
    return {
      status: "REVIEW_REQUIRED",
      matched_building_id: null,
      score: Number(best.score.toFixed(4)),
      reason: `유사 건물 후보 발견 (${Math.round(best.score * 100)}%)`,
      candidates: fuzzy.map((c) => ({ ...c, score: Number(c.score.toFixed(4)) })),
    };
  }

  return {
    status: "NEW_CANDIDATE",
    matched_building_id: null,
    score: null,
    reason: "일치하는 기존 건물을 찾지 못함",
    candidates: [],
  };
}
