"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ListingStatus } from "@/lib/types";

export type ListingFormPayload = {
  building_id: string;
  listing_code: string;
  floor: string;
  gross_area: number | null;
  exclusive_area: number | null;
  efficiency_ratio: number | null;
  deposit: number | null;
  monthly_rent: number | null;
  management_fee: number | null;
  parking_spaces: number | null;
  additional_parking_fee: number | null;
  available_date: string;
  lease_term_months: number | null;
  interior_status: string;
  restoration_required: boolean;
  status: ListingStatus;
  description: string;
  is_featured: boolean;
  is_published: boolean;
};

function toRow(payload: ListingFormPayload) {
  return {
    building_id: payload.building_id,
    listing_code: payload.listing_code || null,
    floor: payload.floor || null,
    gross_area: payload.gross_area,
    exclusive_area: payload.exclusive_area,
    efficiency_ratio: payload.efficiency_ratio,
    deposit: payload.deposit,
    monthly_rent: payload.monthly_rent,
    management_fee: payload.management_fee,
    parking_spaces: payload.parking_spaces,
    additional_parking_fee: payload.additional_parking_fee,
    available_date: payload.available_date || null,
    lease_term_months: payload.lease_term_months,
    interior_status: payload.interior_status || null,
    restoration_required: payload.restoration_required,
    status: payload.status,
    description: payload.description || null,
    is_featured: payload.is_featured,
    is_published: payload.is_published,
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
