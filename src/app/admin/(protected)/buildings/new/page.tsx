import { createClient } from "@/lib/supabase/server";
import BuildingForm from "@/components/admin/BuildingForm";

export default async function NewBuildingPage() {
  const supabase = await createClient();
  const { data: districts } = await supabase
    .from("districts")
    .select("id, name")
    .order("name");

  return (
    <div>
      <h1 className="font-display text-2xl mb-6">건물 등록</h1>
      <BuildingForm mode="create" districts={districts ?? []} />
    </div>
  );
}
