"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ProposalBuilding, ProposalStatus } from "@/lib/types";

export type ProposalFormPayload = {
  customer_id: string;
  title: string;
  status: ProposalStatus;
  expires_at: string; // yyyy-mm-dd 또는 ""
  buildings: ProposalBuilding[];
};

export async function createProposal(
  payload: ProposalFormPayload
): Promise<{ error?: string; id?: string }> {
  if (!payload.customer_id) {
    return { error: "고객을 선택해 주세요." };
  }
  if (payload.buildings.filter((b) => b.building_id).length === 0) {
    return { error: "건물을 최소 1개 이상 선택해 주세요." };
  }

  const supabase = await createClient();

  const { data: proposal, error } = await supabase
    .from("proposals")
    .insert({
      customer_id: payload.customer_id,
      title: payload.title || null,
      status: payload.status,
      expires_at: payload.expires_at || null,
    })
    .select("id")
    .single();

  if (error || !proposal) {
    return { error: error?.message || "제안서 생성 중 오류가 발생했습니다." };
  }

  await saveBuildings(proposal.id, payload.buildings);

  revalidatePath("/admin/proposals");
  return { id: proposal.id };
}

export async function updateProposal(
  id: string,
  payload: ProposalFormPayload
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("proposals")
    .update({
      customer_id: payload.customer_id,
      title: payload.title || null,
      status: payload.status,
      expires_at: payload.expires_at || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  await saveBuildings(id, payload.buildings);

  revalidatePath("/admin/proposals");
  revalidatePath(`/admin/proposals/${id}`);
  return {};
}

async function saveBuildings(proposalId: string, buildings: ProposalBuilding[]) {
  const supabase = await createClient();

  // 가장 단순하고 안전한 방식: 기존 것 삭제 후 다시 저장
  await supabase.from("proposal_buildings").delete().eq("proposal_id", proposalId);

  const rows = buildings
    .filter((b) => b.building_id)
    .map((b) => ({
      proposal_id: proposalId,
      building_id: b.building_id,
      listing_id: b.listing_id || null,
      recommendation_rank: b.recommendation_rank,
      recommendation_reason: b.recommendation_reason || null,
      pros: b.pros || null,
      cons: b.cons || null,
    }));

  if (rows.length > 0) {
    await supabase.from("proposal_buildings").insert(rows);
  }
}

export async function deleteProposal(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("proposals").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/proposals");
  return {};
}
