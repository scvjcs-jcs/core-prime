import { createClient } from "@/lib/supabase/server";
import ListingForm from "@/components/admin/ListingForm";

export default async function NewListingPage({
  searchParams,
}: {
  searchParams: Promise<{ building?: string }>;
}) {
  const { building } = await searchParams;
  const supabase = await createClient();
  const { data: buildings } = await supabase
    .from("buildings")
    .select("id, name")
    .order("name");

  return (
    <div>
      <h1 className="font-display text-2xl mb-6">매물 등록</h1>
      <ListingForm mode="create" buildings={buildings ?? []} defaultBuildingId={building} />
    </div>
  );
}
