import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProposalForm from "@/components/admin/ProposalForm";

const SITE_URL = "https://core-prime-jade.vercel.app";

export default async function EditProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: customers }, { data: buildings }, { data: listings }, { data: proposal }, { data: proposalBuildings }] =
    await Promise.all([
      supabase.from("customers").select("id, contact_name, company_name").order("created_at", { ascending: false }),
      supabase.from("buildings").select("id, name").order("name"),
      supabase.from("listings").select("id, building_id, floor"),
      supabase.from("proposals").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("proposal_buildings")
        .select("*")
        .eq("proposal_id", id)
        .order("recommendation_rank", { ascending: true }),
    ]);

  if (!proposal) notFound();

  return (
    <div>
      <h1 className="font-display text-2xl mb-6">제안서 수정</h1>
      <ProposalForm
        mode="edit"
        proposalId={id}
        proposal={proposal}
        initialBuildings={proposalBuildings ?? []}
        customers={customers ?? []}
        buildings={buildings ?? []}
        listings={listings ?? []}
        publicUrl={`${SITE_URL}/proposal/${proposal.public_token}`}
      />
    </div>
  );
}
