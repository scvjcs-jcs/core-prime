"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ContentType } from "@/lib/types";

const CONTENT_TYPE_INSTRUCTION: Record<ContentType, string> = {
  intro:
    "건물 상세페이지에 들어갈 2~3문장 분량의 간결하고 전문적인 소개 문구를 작성해 주세요.",
  blog:
    "네이버 블로그나 회사 홈페이지에 올릴 수 있는 600~900자 분량의 SEO 친화적인 블로그 글을 작성해 주세요. 소제목을 2~3개 활용해서 읽기 쉽게 구성해 주세요.",
  sns:
    "인스타그램이나 페이스북에 올릴 짧고 매력적인 홍보 문구를 작성해 주세요(3~5문장). 이모지를 적절히 사용하고, 관련 해시태그 3~5개를 마지막 줄에 붙여주세요.",
};

export async function generateBuildingContent(
  buildingId: string,
  contentType: ContentType
): Promise<{ error?: string; text?: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      error:
        "AI 콘텐츠 생성 기능을 쓰려면 Vercel 프로젝트 설정에 ANTHROPIC_API_KEY 환경변수를 먼저 등록해야 합니다.",
    };
  }

  const supabase = await createClient();
  const [{ data: building }, { data: scores }, { data: transportation }] = await Promise.all([
    supabase
      .from("buildings")
      .select("*, districts(name)")
      .eq("id", buildingId)
      .maybeSingle(),
    supabase.from("building_scores").select("*").eq("building_id", buildingId).maybeSingle(),
    supabase.from("building_transportation").select("*").eq("building_id", buildingId),
  ]);

  if (!building) {
    return { error: "건물 정보를 찾을 수 없습니다." };
  }

  const district = (building as unknown as { districts: { name: string } | null }).districts;

  const facts = [
    `건물명: ${building.name}`,
    district?.name ? `지역: ${district.name}` : null,
    building.address ? `주소: ${building.address}` : null,
    building.building_grade ? `건물 등급: ${building.building_grade}` : null,
    building.completion_year ? `준공연도: ${building.completion_year}년` : null,
    building.above_ground_floors ? `지상 ${building.above_ground_floors}층` : null,
    building.gross_floor_area ? `연면적 ${building.gross_floor_area}㎡` : null,
    building.efficiency_ratio ? `전용률 ${building.efficiency_ratio}%` : null,
    scores?.total_score ? `Prime Score ${scores.total_score}점 (100점 만점)` : null,
    transportation && transportation.length > 0
      ? `교통: ${transportation
          .map(
            (t) =>
              `${t.line_name ?? ""} ${t.station_name ?? ""}${
                t.walk_minutes ? ` 도보 ${t.walk_minutes}분` : ""
              }`
          )
          .join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `당신은 서울 프라임 오피스 임대 전문 부동산 회사 "CORE PRIME"의 마케팅 카피라이터입니다. 아래 건물 정보를 바탕으로 ${CONTENT_TYPE_INSTRUCTION[contentType]}

[건물 정보]
${facts}

주어진 정보 안에서만 작성하고, 과장되거나 사실과 다른 내용(정확하지 않은 준공연도, 없는 시설 등)은 절대 쓰지 마세요. 정보가 없는 항목은 그냥 언급하지 마세요. 결과 텍스트만 출력하고, 다른 설명은 붙이지 마세요.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        error: `AI 생성 요청이 실패했습니다 (오류 코드 ${res.status}). API 키가 올바른지, 사용량 한도가 남아있는지 확인해 주세요.\n${errText.slice(0, 300)}`,
      };
    }

    const data = await res.json();
    const text: string = data?.content?.[0]?.text ?? "";
    if (!text.trim()) {
      return { error: "AI가 빈 응답을 반환했습니다. 다시 시도해 주세요." };
    }
    return { text: text.trim() };
  } catch {
    return { error: "AI 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
}

export async function saveBuildingContent(
  buildingId: string,
  contentType: ContentType,
  body: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("building_contents").insert({
    building_id: buildingId,
    content_type: contentType,
    body,
    status: "draft",
  });
  if (error) return { error: error.message };
  revalidatePath(`/admin/buildings/${buildingId}`);
  return {};
}

export async function deleteBuildingContent(
  id: string,
  buildingId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("building_contents").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/buildings/${buildingId}`);
  return {};
}
