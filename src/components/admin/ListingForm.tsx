"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createListing,
  updateListing,
  type ListingFormPayload,
} from "@/app/admin/(protected)/listings/actions";
import { LISTING_STATUS_LABEL, LISTING_STATUS_ORDER } from "@/lib/labels";
import type { Listing, ListingStatus } from "@/lib/types";

type BuildingOption = { id: string; name: string };

const inputCls =
  "w-full border border-silver/40 px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy";
const labelCls = "block text-xs text-silver mb-1.5";

function toPayload(listing?: Listing | null, buildingId?: string): ListingFormPayload {
  return {
    building_id: listing?.building_id ?? buildingId ?? "",
    listing_code: listing?.listing_code ?? "",
    floor: listing?.floor ?? "",
    gross_area: listing?.gross_area ?? null,
    exclusive_area: listing?.exclusive_area ?? null,
    efficiency_ratio: listing?.efficiency_ratio ?? null,
    deposit: listing?.deposit ?? null,
    monthly_rent: listing?.monthly_rent ?? null,
    management_fee: listing?.management_fee ?? null,
    parking_spaces: listing?.parking_spaces ?? null,
    additional_parking_fee: listing?.additional_parking_fee ?? null,
    available_date: listing?.available_date ?? "",
    lease_term_months: listing?.lease_term_months ?? null,
    interior_status: listing?.interior_status ?? "",
    restoration_required: listing?.restoration_required ?? false,
    status: listing?.status ?? "available",
    description: listing?.description ?? "",
    is_featured: listing?.is_featured ?? false,
    is_published: listing?.is_published ?? true,
  };
}

export default function ListingForm({
  mode,
  listingId,
  listing,
  buildings,
  defaultBuildingId,
}: {
  mode: "create" | "edit";
  listingId?: string;
  listing?: Listing | null;
  buildings: BuildingOption[];
  defaultBuildingId?: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<ListingFormPayload>(toPayload(listing, defaultBuildingId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(patch: Partial<ListingFormPayload>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function numOrNull(v: string): number | null {
    return v === "" ? null : Number(v);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const result =
      mode === "create"
        ? await createListing(form)
        : await updateListing(listingId!, form);

    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    router.push("/admin/listings");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="bg-white border border-silver/30 p-6">
        <h2 className="text-sm tracking-wide text-silver mb-4 border-b border-silver/20 pb-2">
          기본 정보
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>건물 *</label>
            <select
              className={inputCls}
              value={form.building_id}
              onChange={(e) => update({ building_id: e.target.value })}
              required
            >
              <option value="">건물 선택</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>매물 코드</label>
            <input className={inputCls} value={form.listing_code} onChange={(e) => update({ listing_code: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>층</label>
            <input className={inputCls} value={form.floor} onChange={(e) => update({ floor: e.target.value })} placeholder="예: 15층, 지하1층" />
          </div>
          <div>
            <label className={labelCls}>진행 상태</label>
            <select
              className={inputCls}
              value={form.status}
              onChange={(e) => update({ status: e.target.value as ListingStatus })}
            >
              {LISTING_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {LISTING_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="bg-white border border-silver/30 p-6">
        <h2 className="text-sm tracking-wide text-silver mb-4 border-b border-silver/20 pb-2">
          면적 / 임대 조건
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>전용면적(㎡)</label>
            <input className={inputCls} type="number" value={form.exclusive_area ?? ""} onChange={(e) => update({ exclusive_area: numOrNull(e.target.value) })} />
          </div>
          <div>
            <label className={labelCls}>계약면적(㎡)</label>
            <input className={inputCls} type="number" value={form.gross_area ?? ""} onChange={(e) => update({ gross_area: numOrNull(e.target.value) })} />
          </div>
          <div>
            <label className={labelCls}>전용률(%)</label>
            <input className={inputCls} type="number" value={form.efficiency_ratio ?? ""} onChange={(e) => update({ efficiency_ratio: numOrNull(e.target.value) })} />
          </div>
          <div>
            <label className={labelCls}>인테리어 상태</label>
            <input className={inputCls} value={form.interior_status} onChange={(e) => update({ interior_status: e.target.value })} placeholder="예: 신축, 리모델링, 원상복구 필요" />
          </div>
          <div>
            <label className={labelCls}>보증금(만원)</label>
            <input className={inputCls} type="number" value={form.deposit ?? ""} onChange={(e) => update({ deposit: numOrNull(e.target.value) })} />
          </div>
          <div>
            <label className={labelCls}>월 임대료(만원)</label>
            <input className={inputCls} type="number" value={form.monthly_rent ?? ""} onChange={(e) => update({ monthly_rent: numOrNull(e.target.value) })} />
          </div>
          <div>
            <label className={labelCls}>월 관리비(만원)</label>
            <input className={inputCls} type="number" value={form.management_fee ?? ""} onChange={(e) => update({ management_fee: numOrNull(e.target.value) })} />
          </div>
          <div>
            <label className={labelCls}>임대 가능일</label>
            <input className={inputCls} type="date" value={form.available_date} onChange={(e) => update({ available_date: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>주차 대수</label>
            <input className={inputCls} type="number" value={form.parking_spaces ?? ""} onChange={(e) => update({ parking_spaces: numOrNull(e.target.value) })} />
          </div>
          <div>
            <label className={labelCls}>추가 주차비(만원)</label>
            <input className={inputCls} type="number" value={form.additional_parking_fee ?? ""} onChange={(e) => update({ additional_parking_fee: numOrNull(e.target.value) })} />
          </div>
          <div>
            <label className={labelCls}>임대 기간(개월)</label>
            <input className={inputCls} type="number" value={form.lease_term_months ?? ""} onChange={(e) => update({ lease_term_months: numOrNull(e.target.value) })} />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input
              id="restoration_required"
              type="checkbox"
              checked={form.restoration_required}
              onChange={(e) => update({ restoration_required: e.target.checked })}
            />
            <label htmlFor="restoration_required" className="text-sm">원상복구 필요</label>
          </div>
        </div>
      </section>

      <section className="bg-white border border-silver/30 p-6">
        <h2 className="text-sm tracking-wide text-silver mb-4 border-b border-silver/20 pb-2">
          설명 / 공개 설정
        </h2>
        <div className="space-y-4">
          <div>
            <label className={labelCls}>매물 설명</label>
            <textarea className={inputCls} rows={4} value={form.description} onChange={(e) => update({ description: e.target.value })} />
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_published} onChange={(e) => update({ is_published: e.target.checked })} />
              공개
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_featured} onChange={(e) => update({ is_featured: e.target.checked })} />
              추천 매물
            </label>
          </div>
        </div>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-3">
        <button
          type="submit"
          disabled={saving}
          className="bg-navy text-white px-6 py-3 text-sm hover:bg-charcoal transition-colors disabled:opacity-50"
        >
          {saving ? "저장 중..." : mode === "create" ? "매물 등록" : "저장"}
        </button>
      </div>
    </form>
  );
}
