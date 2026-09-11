import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BuildingForm from "@/components/admin/BuildingForm";
import type { BuildingFormPayload } from "@/app/admin/(protected)/buildings/actions";

export default async function EditBuildingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: districts }, { data: building }, { data: parking }, { data: scores }, { data: transportation }] =
    await Promise.all([
      supabase.from("districts").select("id, name").order("name"),
      supabase.from("buildings").select("*").eq("id", id).maybeSingle(),
      supabase.from("building_parking").select("*").eq("building_id", id).maybeSingle(),
      supabase.from("building_scores").select("*").eq("building_id", id).maybeSingle(),
      supabase.from("building_transportation").select("*").eq("building_id", id),
    ]);

  if (!building) {
    notFound();
  }

  const initial: BuildingFormPayload = {
    basic: {
      name: building.name ?? "",
      name_en: building.name_en ?? "",
      alias: building.alias ?? "",
      building_code: building.building_code ?? "",
      district_id: building.district_id ?? "",
      slug: building.slug ?? "",
    },
    info: {
      completion_year: building.completion_year,
      basement_floors: building.basement_floors,
      above_ground_floors: building.above_ground_floors,
      gross_floor_area: building.gross_floor_area,
      land_area: building.land_area,
      building_area: building.building_area,
      efficiency_ratio: building.efficiency_ratio,
      elevator_count: building.elevator_count,
      freight_elevator_count: building.freight_elevator_count,
      building_use: building.building_use ?? "",
      hvac_type: building.hvac_type ?? "",
      hvac_hours: building.hvac_hours ?? "",
      building_grade: building.building_grade ?? "",
    },
    location: {
      address: building.address ?? "",
      road_address: building.road_address ?? "",
      jibun_address: building.jibun_address ?? "",
      postal_code: building.postal_code ?? "",
      latitude: building.latitude,
      longitude: building.longitude,
    },
    transportation:
      transportation && transportation.length > 0
        ? transportation.map((t) => ({
            transport_type: t.transport_type,
            line_name: t.line_name,
            station_name: t.station_name,
            walk_minutes: t.walk_minutes,
            description: t.description,
          }))
        : [{ transport_type: "지하철", line_name: "", station_name: "", walk_minutes: null, description: "" }],
    parking: {
      total_spaces: parking?.total_spaces ?? null,
      tenant_default_spaces: parking?.tenant_default_spaces ?? null,
      visitor_spaces: parking?.visitor_spaces ?? null,
      monthly_fee: parking?.monthly_fee ?? null,
      additional_fee: parking?.additional_fee ?? null,
      self_parking: parking?.self_parking ?? false,
      mechanical_parking: parking?.mechanical_parking ?? false,
      ev_charging: parking?.ev_charging ?? false,
      operating_hours: parking?.operating_hours ?? "",
      description: parking?.description ?? "",
    },
    scores: {
      location_score: scores?.location_score ?? 0,
      transportation_score: scores?.transportation_score ?? 0,
      building_quality_score: scores?.building_quality_score ?? 0,
      parking_score: scores?.parking_score ?? 0,
      amenities_score: scores?.amenities_score ?? 0,
      corporate_image_score: scores?.corporate_image_score ?? 0,
      employee_access_score: scores?.employee_access_score ?? 0,
    },
    publish: {
      status: building.status ?? "active",
      is_published: building.is_published ?? false,
      is_featured: building.is_featured ?? false,
      meta_title: building.meta_title ?? "",
      meta_description: building.meta_description ?? "",
    },
  };

  return (
    <div>
      <h1 className="font-display text-2xl mb-6">건물 수정 — {building.name}</h1>
      <BuildingForm mode="edit" buildingId={id} districts={districts ?? []} initial={initial} />
    </div>
  );
}
