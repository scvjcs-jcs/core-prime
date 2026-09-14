"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ListingStatus } from "@/lib/types";

export type ListingFormPayload = {
  building_id: string;
  listing_code: string;
  floor: string;
  unit: string;
  status: ListingStatus;

  // 면적 (㎡ / 평)
  gross_area: number | null;
  gross_area_py: number | null;
  exclusive_area: number | null;
  exclusive_area_py: number | null;
  efficiency_ratio: number | null;

  // 임대조건 — 총액(만원)과 평당(원)은 단위가 다릅니다. ListingForm에서 명확히 구분해 표시합니다.
  deposit: number | null;
  deposit_per_py: number | null;
  monthly_rent: number | null;
  rent_per_py: number | null;
  management_fee: number | null;
  maintenance_per_py: number | null;
  noc_per_py: number | null;

  // 입주조건
  available_date: string;
  move_in_text: string;
  rent_free: string;
  fit_out_period: string;
  lease_term_months: number | null;

  // 주차
  parking_spaces: number | null;
  additional_parking_fee: number | null;

  // 기타
  interior_status: string;
  restoration_required: boolean;
  description: string;
  is_featured: boolean;
  is_published: boolean;

  // 출처/검증 — Import(PDF 자동 입력)가 채우는 값입니다. 이번 STEP의 관리자 화면에서는
  // 읽기 전용으로만 표시하고, 수정 시에는 기존 값을 그대로 보존합니다.
  source_id: string | null;
  source_document_id: string | null;
  source_page: number | null;
  report_date: string;
  verified_at: string;
};

function toRow(payload: ListingFormPayload) {
  return {
    building_id: payload.building_id,
    listing_code: payload.listing_code || null,
    floor: payload.floor || null,
    unit: payload.unit || null,
    status: payload.status,

    gross_area: payload.gross_area,
    gross_area_py: payload.gross_area_py,
    exclusive_area: payload.exclusive_area,
    exclusive_area_py: payload.exclusive_area_py,
    efficiency_ratio: payload.efficiency_ratio,

    deposit: payload.deposit,
    deposit_per_py: payload.deposit_per_py,
    monthly_rent: payload.monthly_rent,
    rent_per_py: payload.rent_per_py,
    management_fee: payload.management_fee,
    maintenance_per_py: payload.maintenance_per_py,
    noc_per_py: payload.noc_per_py,

    available_date: payload.available_date || null,
    move_in_text: payload.move_in_text || null,
    rent_free: payload.rent_free || null,
    fit_out_period: payload.fit_out_period || null,
    lease_term_months: payload.lease_term_months,

    parking_spaces: payload.parking_spaces,
    additional_parking_fee: payload.additional_parking_fee,

    interior_status: payload.interior_status || null,
    restoration_required: payload.restoration_required,
    description: payload.description || null,
    is_featured: payload.is_featured,
    is_published: payload.is_published,

    // 출처/검증 필드는 관리자 화면에서 직접 입력하지 않으므로, 불러온 값을 그대로 되돌려 보존합니다.
    source_id: payload.source_id,
    source_document_id: payload.source_document_id,
    source_page: payload.source_page,
    report_date: payload.report_date || null,
    verified_at: payload.verified_at || null,
  };
}

export async function createListing(
  payload: ListingFormPayload
): Promise<{ error?: string; id?: string }> {
  if (!payload.building_id) {
    return { error: "건물을 선택해 주세요." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .insert(toRow(payload))
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message || "매물 등록 중 오류가 발생했습니다." };
  }

  revalidatePath("/admin/listings");
  return { id: data.id };
}

export async function updateListing(
  id: string,
  payload: ListingFormPayload
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("listings").update(toRow(payload)).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/listings");
  revalidatePath(`/admin/listings/${id}`);
  return {};
}

export async function deleteListing(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("listings").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/listings");
  return {};
}
