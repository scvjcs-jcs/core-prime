import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ListingForm from "@/components/admin/ListingForm";

export default async function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: buildings }, { data: listing }] = await Promise.all([
    supabase.from("buildings").select("id, name").order("name"),
    supabase
      .from("listings")
      .select("*, sources(name), source_documents(title)")
      .eq("id", id)
      .maybeSingle(),
  ]);

  if (!listing) notFound();

  const joined = listing as unknown as {
    sources?: { name: string } | null;
    source_documents?: { title: string } | null;
  };

  return (
    <div>
      <h1 className="font-display text-2xl mb-6">매물 수정</h1>
      <ListingForm
        mode="edit"
        listingId={id}
        listing={listing}
        buildings={buildings ?? []}
        sourceName={joined.sources?.name ?? null}
        documentTitle={joined.source_documents?.title ?? null}
      />
    </div>
  );
}
