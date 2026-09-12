import { createClient } from "@/lib/supabase/server";
import ProposalForm from "@/components/admin/ProposalForm";

export default async function NewProposalPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const { customer } = await searchParams;
  const supabase = await createClient();

  const [{ data: customers }, { data: buildings }, { data: listings }] = await Promise.all([
    supabase.from("customers").select("id, contact_name, company_name").order("created_at", { ascending: false }),
    supabase.from("buildings").select("id, name").order("name"),
    supabase.from("listings").select("id, building_id, floor"),
  ]);

  return (
    <div>
      <h1 className="font-display text-2xl mb-6">제안서 만들기</h1>
      <ProposalForm
        mode="create"
        customers={customers ?? []}
        buildings={buildings ?? []}
        listings={listings ?? []}
        defaultCustomerId={customer}
      />
    </div>
  );
}
