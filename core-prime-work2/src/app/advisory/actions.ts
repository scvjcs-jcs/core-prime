"use server";

import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";

export type InquiryPayload = {
  company_name: string;
  contact_name: string;
  phone: string;
  email: string;
  headcount: number | null;
  preferred_district: string; // districts.id 또는 ""
  min_exclusive_area: number | null;
  max_exclusive_area: number | null;
  min_budget: number | null;
  max_budget: number | null;
  move_in_date: string; // yyyy-mm-dd 또는 ""
  required_parking: number | null;
  preferred_grade: string;
  etc_notes: string;
};

export async function submitInquiry(
  payload: InquiryPayload
): Promise<{ error?: string }> {
  if (!payload.contact_name?.trim()) {
    return { error: "담당자 성함을 입력해 주세요." };
  }
  if (!payload.phone?.trim() && !payload.email?.trim()) {
    return { error: "전화번호 또는 이메일 중 하나는 반드시 입력해 주세요." };
  }

  const supabase = await createClient();

  // 비로그인 방문자는 방금 넣은 행을 다시 읽어올 권한(SELECT)이 없으므로,
  // RETURNING 없이 저장할 수 있도록 id를 미리 만들어서 넣습니다.
  const customerId = randomUUID();

  const { error: customerError } = await supabase.from("customers").insert({
    id: customerId,
    company_name: payload.company_name.trim() || null,
    contact_name: payload.contact_name.trim(),
    phone: payload.phone.trim() || null,
    email: payload.email.trim() || null,
    headcount: payload.headcount,
    inquiry_channel: "website",
    status: "NEW",
  });

  if (customerError) {
    return { error: "상담 신청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." };
  }

  const { error: reqError } = await supabase.from("customer_requirements").insert({
    customer_id: customerId,
    preferred_district: payload.preferred_district || null,
    min_exclusive_area: payload.min_exclusive_area,
    max_exclusive_area: payload.max_exclusive_area,
    min_budget: payload.min_budget,
    max_budget: payload.max_budget,
    move_in_date: payload.move_in_date || null,
    required_parking: payload.required_parking,
    preferred_grade: payload.preferred_grade.trim() || null,
    etc_notes: payload.etc_notes.trim() || null,
  });

  if (reqError) {
    // 고객 정보 자체는 이미 저장됐으므로 신청은 성공으로 처리하되, 조용히 넘어갑니다.
    // (요구사항 상세는 없더라도 관리자가 연락처로 직접 연락 가능)
  }

  return {};
}
