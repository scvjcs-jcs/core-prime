"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createBuilding,
  updateBuilding,
  type BuildingFormPayload,
} from "@/app/admin/(protected)/buildings/actions";
import ImageUploader from "./ImageUploader";
import AIContentPanel from "./AIContentPanel";
import type { BuildingContent, BuildingImage } from "@/lib/types";

const TABS = [
  "기본정보",
  "건물정보",
  "입지/교통",
  "주차",
  "사진",
  "AI 콘텐츠",
  "Prime Score",
  "공개설정",
] as const;

type DistrictOption = { id: string; name: string };

function emptyPayload(): BuildingFormPayload {
  return {
    basic: { name: "", name_en: "", alias: "", building_code: "", district_id: "", slug: "" },
    info: {
      completion_year: null,
      basement_floors: null,
      above_ground_floors: null,
      gross_floor_area: null,
      land_area: null,
      building_area: null,
      efficiency_ratio: null,
      elevator_count: null,
      freight_elevator_count: null,
      building_use: "",
      hvac_type: "",
      hvac_hours: "",
      building_grade: "",
    },
    location: {
      address: "",
      road_address: "",
      jibun_address: "",
      postal_code: "",
      latitude: null,
      longitude: null,
    },
    transportation: [{ transport_type: "지하철", line_name: "", station_name: "", walk_minutes: null, description: "" }],
    parking: {
      total_spaces: null,
      tenant_default_spaces: null,
      visitor_spaces: null,
      monthly_fee: null,
      additional_fee: null,
      self_parking: false,
      mechanical_parking: false,
      ev_charging: false,
      operating_hours: "",
      description: "",
    },
    scores: {
      location_score: 0,
      transportation_score: 0,
      building_quality_score: 0,
      parking_score: 0,
      amenities_score: 0,
      corporate_image_score: 0,
      employee_access_score: 0,
    },
    publish: {
      status: "active",
      is_published: false,
      is_featured: false,
      meta_title: "",
      meta_description: "",
    },
  };
}

function num(v: string): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export default function BuildingForm({
  mode,
  buildingId,
  districts,
  initial,
  initialImages,
  initialContents,
}: {
  mode: "create" | "edit";
  buildingId?: string;
  districts: DistrictOption[];
  initial?: BuildingFormPayload;
  initialImages?: BuildingImage[];
  initialContents?: BuildingContent[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState(0);
  const [form, setForm] = useState<BuildingFormPayload>(initial ?? emptyPayload());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof BuildingFormPayload>(
    section: K,
    patch: Partial<BuildingFormPayload[K]>
  ) {
    setForm((prev) => ({ ...prev, [section]: { ...prev[section], ...patch } }));
  }

  function updateTransport(index: number, patch: Partial<BuildingFormPayload["transportation"][number]>) {
    setForm((prev) => {
      const next = [...prev.transportation];
      next[index] = { ...next[index], ...patch };
      return { ...prev, transportation: next };
    });
  }

  function addTransport() {
    setForm((prev) => ({
      ...prev,
      transportation: [
        ...prev.transportation,
        { transport_type: "지하철", line_name: "", station_name: "", walk_minutes: null, description: "" },
      ],
    }));
  }

  function removeTransport(index: number) {
    setForm((prev) => ({
      ...prev,
      transportation: prev.transportation.filter((_, i) => i !== index),
    }));
  }

  async function handleSubmit() {
    if (!form.basic.name.trim()) {
      setError("건물명은 필수입니다. [기본정보] 탭을 확인해 주세요.");
      setTab(0);
      return;
    }
    setError(null);
    setSaving(true);

    const result =
      mode === "create"
        ? await createBuilding(form)
        : await updateBuilding(buildingId!, form);

    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (mode === "create" && "id" in result && result.id) {
      router.push(`/admin/buildings/${result.id}`);
    } else {
      router.push("/admin/buildings");
    }
    router.refresh();
  }

  const inputCls =
    "w-full border border-silver/50 px-3 py-2 text-sm focus:outline-none focus:border-navy bg-white";
  const labelCls = "block text-xs text-silver mb-1";

  return (
    <div className="bg-white border border-silver/30">
      <div className="flex overflow-x-auto border-b border-silver/30">
        {TABS.map((t, i) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(i)}
            className={`px-5 py-3 text-sm whitespace-nowrap border-b-2 transition-colors ${
              tab === i
                ? "border-navy text-navy"
                : "border-transparent text-silver hover:text-charcoal"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="p-6">
        {error && (
          <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2">
            {error}
          </p>
        )}

        {tab === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>건물명 *</label>
              <input
                className={inputCls}
                value={form.basic.name}
                onChange={(e) => update("basic", { name: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>영문명</label>
              <input
                className={inputCls}
                value={form.basic.name_en}
                onChange={(e) => update("basic", { name_en: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>약칭/별칭</label>
              <input
                className={inputCls}
                value={form.basic.alias}
                onChange={(e) => update("basic", { alias: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>건물 코드</label>
              <input
                className={inputCls}
                value={form.basic.building_code}
                onChange={(e) => update("basic", { building_code: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>지역(권역)</label>
              <select
                className={inputCls}
                value={form.basic.district_id}
                onChange={(e) => update("basic", { district_id: e.target.value })}
              >
                <option value="">선택 안 함</option>
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>
                URL 슬러그 (비워두면 자동 생성, 영문/숫자/하이픈만 입력 — 한글은 자동으로 빠집니다)
              </label>
              <input
                className={inputCls}
                value={form.basic.slug}
                onChange={(e) => update("basic", { slug: e.target.value })}
                placeholder="예: gfc-tower"
              />
            </div>
          </div>
        )}

        {tab === 1 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>준공연도</label>
              <input
                type="number"
                className={inputCls}
                value={form.info.completion_year ?? ""}
                onChange={(e) => update("info", { completion_year: num(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelCls}>지하 층수</label>
              <input
                type="number"
                className={inputCls}
                value={form.info.basement_floors ?? ""}
                onChange={(e) => update("info", { basement_floors: num(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelCls}>지상 층수</label>
              <input
                type="number"
                className={inputCls}
                value={form.info.above_ground_floors ?? ""}
                onChange={(e) => update("info", { above_ground_floors: num(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelCls}>연면적 (㎡)</label>
              <input
                type="number"
                className={inputCls}
                value={form.info.gross_floor_area ?? ""}
                onChange={(e) => update("info", { gross_floor_area: num(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelCls}>대지면적 (㎡)</label>
              <input
                type="number"
                className={inputCls}
                value={form.info.land_area ?? ""}
                onChange={(e) => update("info", { land_area: num(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelCls}>건축면적 (㎡)</label>
              <input
                type="number"
                className={inputCls}
                value={form.info.building_area ?? ""}
                onChange={(e) => update("info", { building_area: num(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelCls}>전용률 (%)</label>
              <input
                type="number"
                className={inputCls}
                value={form.info.efficiency_ratio ?? ""}
                onChange={(e) => update("info", { efficiency_ratio: num(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelCls}>승객용 엘리베이터 수</label>
              <input
                type="number"
                className={inputCls}
                value={form.info.elevator_count ?? ""}
                onChange={(e) => update("info", { elevator_count: num(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelCls}>화물용 엘리베이터 수</label>
              <input
                type="number"
                className={inputCls}
                value={form.info.freight_elevator_count ?? ""}
                onChange={(e) => update("info", { freight_elevator_count: num(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelCls}>건물 용도</label>
              <input
                className={inputCls}
                value={form.info.building_use}
                onChange={(e) => update("info", { building_use: e.target.value })}
                placeholder="예: 업무시설"
              />
            </div>
            <div>
              <label className={labelCls}>냉난방 방식</label>
              <input
                className={inputCls}
                value={form.info.hvac_type}
                onChange={(e) => update("info", { hvac_type: e.target.value })}
                placeholder="예: 중앙집중식"
              />
            </div>
            <div>
              <label className={labelCls}>냉난방 가동시간</label>
              <input
                className={inputCls}
                value={form.info.hvac_hours}
                onChange={(e) => update("info", { hvac_hours: e.target.value })}
                placeholder="예: 평일 09:00-18:00"
              />
            </div>
            <div>
              <label className={labelCls}>건물 등급</label>
              <input
                className={inputCls}
                value={form.info.building_grade}
                onChange={(e) => update("info", { building_grade: e.target.value })}
                placeholder="예: Prime, A"
              />
            </div>
          </div>
        )}

        {tab === 2 && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div>
                <label className={labelCls}>도로명 주소</label>
                <input
                  className={inputCls}
                  value={form.location.road_address}
                  onChange={(e) => update("location", { road_address: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>지번 주소</label>
                <input
                  className={inputCls}
                  value={form.location.jibun_address}
                  onChange={(e) => update("location", { jibun_address: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>주소 (표시용)</label>
                <input
                  className={inputCls}
                  value={form.location.address}
                  onChange={(e) => update("location", { address: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>우편번호</label>
                <input
                  className={inputCls}
                  value={form.location.postal_code}
                  onChange={(e) => update("location", { postal_code: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>위도</label>
                <input
                  type="number"
                  step="any"
                  className={inputCls}
                  value={form.location.latitude ?? ""}
                  onChange={(e) => update("location", { latitude: num(e.target.value) })}
                />
              </div>
              <div>
                <label className={labelCls}>경도</label>
                <input
                  type="number"
                  step="any"
                  className={inputCls}
                  value={form.location.longitude ?? ""}
                  onChange={(e) => update("location", { longitude: num(e.target.value) })}
                />
              </div>
            </div>

            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-charcoal">대중교통 정보</p>
              <button
                type="button"
                onClick={addTransport}
                className="text-xs text-navy border border-navy px-3 py-1.5 hover:bg-navy hover:text-white transition-colors"
              >
                + 교통정보 추가
              </button>
            </div>
            <div className="space-y-3">
              {form.transportation.map((t, i) => (
                <div
                  key={i}
                  className="grid grid-cols-1 md:grid-cols-6 gap-2 items-center border border-silver/30 p-3"
                >
                  <select
                    className={inputCls + " md:col-span-1"}
                    value={t.transport_type ?? ""}
                    onChange={(e) => updateTransport(i, { transport_type: e.target.value })}
                  >
                    <option value="지하철">지하철</option>
                    <option value="버스">버스</option>
                  </select>
                  <input
                    className={inputCls + " md:col-span-1"}
                    placeholder="노선명 (예: 2호선)"
                    value={t.line_name ?? ""}
                    onChange={(e) => updateTransport(i, { line_name: e.target.value })}
                  />
                  <input
                    className={inputCls + " md:col-span-1"}
                    placeholder="역/정류장명"
                    value={t.station_name ?? ""}
                    onChange={(e) => updateTransport(i, { station_name: e.target.value })}
                  />
                  <input
                    type="number"
                    className={inputCls + " md:col-span-1"}
                    placeholder="도보(분)"
                    value={t.walk_minutes ?? ""}
                    onChange={(e) => updateTransport(i, { walk_minutes: num(e.target.value) })}
                  />
                  <input
                    className={inputCls + " md:col-span-1"}
                    placeholder="설명"
                    value={t.description ?? ""}
                    onChange={(e) => updateTransport(i, { description: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => removeTransport(i)}
                    className="text-red-600 text-xs hover:underline md:col-span-1"
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 3 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>총 주차 대수</label>
              <input
                type="number"
                className={inputCls}
                value={form.parking.total_spaces ?? ""}
                onChange={(e) => update("parking", { total_spaces: num(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelCls}>기본 배정 대수(입주사)</label>
              <input
                type="number"
                className={inputCls}
                value={form.parking.tenant_default_spaces ?? ""}
                onChange={(e) => update("parking", { tenant_default_spaces: num(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelCls}>방문객 주차 대수</label>
              <input
                type="number"
                className={inputCls}
                value={form.parking.visitor_spaces ?? ""}
                onChange={(e) => update("parking", { visitor_spaces: num(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelCls}>월 주차비 (원)</label>
              <input
                type="number"
                className={inputCls}
                value={form.parking.monthly_fee ?? ""}
                onChange={(e) => update("parking", { monthly_fee: num(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelCls}>추가 주차비 (원)</label>
              <input
                type="number"
                className={inputCls}
                value={form.parking.additional_fee ?? ""}
                onChange={(e) => update("parking", { additional_fee: num(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelCls}>운영시간</label>
              <input
                className={inputCls}
                value={form.parking.operating_hours ?? ""}
                onChange={(e) => update("parking", { operating_hours: e.target.value })}
              />
            </div>
            <div className="md:col-span-3 flex flex-wrap gap-6 pt-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.parking.self_parking}
                  onChange={(e) => update("parking", { self_parking: e.target.checked })}
                />
                자주식 주차
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.parking.mechanical_parking}
                  onChange={(e) => update("parking", { mechanical_parking: e.target.checked })}
                />
                기계식 주차
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.parking.ev_charging}
                  onChange={(e) => update("parking", { ev_charging: e.target.checked })}
                />
                전기차 충전
              </label>
            </div>
            <div className="md:col-span-3">
              <label className={labelCls}>비고</label>
              <textarea
                className={inputCls}
                rows={3}
                value={form.parking.description ?? ""}
                onChange={(e) => update("parking", { description: e.target.value })}
              />
            </div>
          </div>
        )}

        {tab === 4 && (
          <div>
            {mode === "create" || !buildingId ? (
              <p className="text-sm text-silver py-8 text-center border border-dashed border-silver/40">
                먼저 건물을 등록한 뒤 사진을 추가할 수 있습니다. [기본정보] 탭에서 건물명을 입력하고
                하단의 &apos;건물 등록&apos; 버튼을 눌러 저장해 주세요.
              </p>
            ) : (
              <ImageUploader buildingId={buildingId} initialImages={initialImages ?? []} />
            )}
          </div>
        )}

        {tab === 5 && (
          <div>
            {mode === "create" || !buildingId ? (
              <p className="text-sm text-silver py-8 text-center border border-dashed border-silver/40">
                먼저 건물을 등록한 뒤 AI 콘텐츠를 생성할 수 있습니다. [기본정보] 탭에서 건물명을 입력하고
                하단의 &apos;건물 등록&apos; 버튼을 눌러 저장해 주세요.
              </p>
            ) : (
              <AIContentPanel buildingId={buildingId} initialContents={initialContents ?? []} />
            )}
          </div>
        )}

        {tab === 6 && (
          <div>
            <p className="text-sm text-silver mb-4">
              각 항목을 0~100점으로 입력하면 총점(Total Score)은 자동으로 계산됩니다.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {(
                [
                  ["location_score", "입지(Location)"],
                  ["transportation_score", "교통(Transportation)"],
                  ["building_quality_score", "건물 품질(Building Quality)"],
                  ["parking_score", "주차(Parking)"],
                  ["amenities_score", "편의시설(Amenities)"],
                  ["corporate_image_score", "기업 이미지(Corporate Image)"],
                  ["employee_access_score", "직원 접근성(Employee Accessibility)"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-silver">{label}</label>
                    <span className="text-sm font-display">{form.scores[key]}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={form.scores[key]}
                    onChange={(e) =>
                      update("scores", { [key]: Number(e.target.value) } as Partial<
                        BuildingFormPayload["scores"]
                      >)
                    }
                    className="w-full"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 7 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>운영 상태</label>
              <select
                className={inputCls}
                value={form.publish.status}
                onChange={(e) => update("publish", { status: e.target.value })}
              >
                <option value="active">운영중</option>
                <option value="preparing">준비중</option>
                <option value="inactive">비활성</option>
              </select>
            </div>
            <div className="flex items-end gap-6 pb-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.publish.is_published}
                  onChange={(e) => update("publish", { is_published: e.target.checked })}
                />
                홈페이지에 공개
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.publish.is_featured}
                  onChange={(e) => update("publish", { is_featured: e.target.checked })}
                />
                추천(Featured) 건물로 노출
              </label>
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Meta Title (SEO)</label>
              <input
                className={inputCls}
                value={form.publish.meta_title}
                onChange={(e) => update("publish", { meta_title: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Meta Description (SEO)</label>
              <textarea
                className={inputCls}
                rows={3}
                value={form.publish.meta_description}
                onChange={(e) => update("publish", { meta_description: e.target.value })}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-6 py-4 border-t border-silver/30">
        <button
          type="button"
          onClick={() => router.push("/admin/buildings")}
          className="text-sm text-silver hover:text-charcoal"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="bg-navy text-white px-6 py-2.5 text-sm hover:bg-charcoal transition-colors disabled:opacity-50"
        >
          {saving ? "저장 중..." : mode === "create" ? "건물 등록" : "변경사항 저장"}
        </button>
      </div>
    </div>
  );
}
