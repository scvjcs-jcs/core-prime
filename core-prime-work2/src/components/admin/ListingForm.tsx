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
const groupTitleCls = "text-sm tracking-wide text-silver mb-4 border-b border-silver/20 pb-2";

const PY_IN_SQM = 3.305785;

function toPayload(listing?: Listing | null, buildingId?: string): ListingFormPayload {
  return {
    building_id: listing?.building_id ?? buildingId ?? "",
    listing_code: listing?.listing_code ?? "",
    floor: listing?.floor ?? "",
    unit: listing?.unit ?? "",
    status: listing?.status ?? "available",

    gross_area: listing?.gross_area ?? null,
    gross_area_py: listing?.gross_area_py ?? null,
    exclusive_area: listing?.exclusive_area ?? null,
    exclusive_area_py: listing?.exclusive_area_py ?? null,
    efficiency_ratio: listing?.efficiency_ratio ?? null,

    deposit: listing?.deposit ?? null,
    deposit_per_py: listing?.deposit_per_py ?? null,
    monthly_rent: listing?.monthly_rent ?? null,
    rent_per_py: listing?.rent_per_py ?? null,
    management_fee: listing?.management_fee ?? null,
    maintenance_per_py: listing?.maintenance_per_py ?? null,
    noc_per_py: listing?.noc_per_py ?? null,

    available_date: listing?.available_date ?? "",
    move_in_text: listing?.move_in_text ?? "",
    rent_free: listing?.rent_free ?? "",
    fit_out_period: listing?.fit_out_period ?? "",
    lease_term_months: listing?.lease_term_months ?? null,

    parking_spaces: listing?.parking_spaces ?? null,
    additional_parking_fee: listing?.additional_parking_fee ?? null,

    interior_status: listing?.interior_status ?? "",
    restoration_required: listing?.restoration_required ?? false,
    description: listing?.description ?? "",
    is_featured: listing?.is_featured ?? false,
    is_published: listing?.is_published ?? true,

    source_id: listing?.source_id ?? null,
    source_document_id: listing?.source_document_id ?? null,
    source_page: listing?.source_page ?? null,
    report_date: listing?.report_date ?? "",
    verified_at: listing?.verified_at ?? "",
  };
}

// 숫자 입력칸 — 천 단위 콤마로 보여주고, 빈 값은 "0"이 아니라 정말 빈 칸으로 둡니다.
function MoneyInput({
  label,
  unitHint,
  value,
  onChange,
  autoCalc,
}: {
  label: string;
  unitHint: string;
  value: number | null;
  onChange: (v: number | null) => void;
  autoCalc?: boolean;
}) {
  const [raw, setRaw] = useState(value === null ? "" : value.toLocaleString("ko-KR"));

  return (
    <div>
      <label className={labelCls}>
        {label}
        {autoCalc && <span className="ml-1.5 text-[10px] text-navy">(자동계산)</span>}
      </label>
      <div className="relative">
        <input
          data-money-input={label}
          className={inputCls}
          inputMode="numeric"
          value={raw}
          onChange={(e) => {
            const cleaned = e.target.value.replace(/[^0-9-]/g, "");
            setRaw(cleaned === "" ? "" : Number(cleaned).toLocaleString("ko-KR"));
            onChange(cleaned === "" ? null : Number(cleaned));
          }}
          placeholder="-"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-silver pointer-events-none">
          {unitHint}
        </span>
      </div>
    </div>
  );
}

export default function ListingForm({
  mode,
  listingId,
  listing,
  buildings,
  defaultBuildingId,
  sourceName,
  documentTitle,
}: {
  mode: "create" | "edit";
  listingId?: string;
  listing?: Listing | null;
  buildings: BuildingOption[];
  defaultBuildingId?: string;
  // 출처 표시용 — 서버에서 sources/source_documents를 미리 조인해 전달합니다 (읽기 전용).
  sourceName?: string | null;
  documentTitle?: string | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState<ListingFormPayload>(toPayload(listing, defaultBuildingId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 자동계산으로 채워진 필드인지 표시용 플래그 (DB에는 저장되지 않는 화면 표시 전용 상태)
  const [autoCalc, setAutoCalc] = useState({
    grossPy: false,
    grossSqm: false,
    exclusivePy: false,
    exclusiveSqm: false,
  });

  function update(patch: Partial<ListingFormPayload>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function numOrNull(v: string): number | null {
    return v === "" ? null : Number(v);
  }

  // ㎡ ↔ 평 자동계산 — 반대쪽 칸이 "비어 있을 때만" 채워줍니다.
  // 원자료(Import)에서 이미 두 값이 다 들어와 있는 경우, 한쪽을 고쳐도 다른 쪽을 덮어쓰지 않습니다.
  function handleAreaSqmChange(
    sqmKey: "gross_area" | "exclusive_area",
    pyKey: "gross_area_py" | "exclusive_area_py",
    autoFlag: "grossPy" | "exclusivePy",
    v: string
  ) {
    const n = numOrNull(v);
    setForm((prev) => {
      const next = { ...prev, [sqmKey]: n };
      if ((prev[pyKey] === null || prev[pyKey] === undefined) && n !== null) {
        next[pyKey] = Math.round((n / PY_IN_SQM) * 100) / 100;
        setAutoCalc((a) => ({ ...a, [autoFlag]: true }));
      }
      return next;
    });
  }

  function handleAreaPyChange(
    sqmKey: "gross_area" | "exclusive_area",
    pyKey: "gross_area_py" | "exclusive_area_py",
    autoFlag: "grossSqm" | "exclusiveSqm",
    v: string
  ) {
    const n = numOrNull(v);
    setAutoCalc((a) => ({ ...a, [pyKey === "gross_area_py" ? "grossPy" : "exclusivePy"]: false }));
    setForm((prev) => {
      const next = { ...prev, [pyKey]: n };
      if ((prev[sqmKey] === null || prev[sqmKey] === undefined) && n !== null) {
        next[sqmKey] = Math.round(n * PY_IN_SQM * 100) / 100;
        setAutoCalc((a) => ({ ...a, [autoFlag]: true }));
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const result =
      mode === "create" ? await createListing(form) : await updateListing(listingId!, form);

    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    router.push("/admin/listings");
    router.refresh();
  }

  const sourceLabel = form.source_id ? sourceName ?? "출처사 확인 중" : "수동 입력";

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* [기본정보] */}
      <section className="bg-white border border-silver/30 p-6">
        <h2 className={groupTitleCls}>기본정보</h2>
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
            <input
              className={inputCls}
              value={form.listing_code}
              onChange={(e) => update({ listing_code: e.target.value })}
            />
          </div>
          <div>
            <label className={labelCls}>층</label>
            <input
              className={inputCls}
              value={form.floor}
              onChange={(e) => update({ floor: e.target.value })}
              placeholder="예: 15층, 지하1층"
            />
          </div>
          <div>
            <label className={labelCls}>호실/구획</label>
            <input
              className={inputCls}
              value={form.unit}
              onChange={(e) => update({ unit: e.target.value })}
              placeholder="예: A, 1501호"
            />
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

      {/* [면적] */}
      <section className="bg-white border border-silver/30 p-6">
        <h2 className={groupTitleCls}>면적</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>
              임대면적 (㎡){autoCalc.grossSqm && <span className="ml-1.5 text-[10px] text-navy">(자동계산)</span>}
            </label>
            <input
              className={inputCls}
              type="number"
              step="0.01"
              value={form.gross_area ?? ""}
              onChange={(e) => {
                setAutoCalc((a) => ({ ...a, grossSqm: false }));
                handleAreaSqmChange("gross_area", "gross_area_py", "grossPy", e.target.value);
              }}
            />
          </div>
          <div>
            <label className={labelCls}>
              임대면적 (평){autoCalc.grossPy && <span className="ml-1.5 text-[10px] text-navy">(자동계산)</span>}
            </label>
            <input
              className={inputCls}
              type="number"
              step="0.01"
              value={form.gross_area_py ?? ""}
              onChange={(e) =>
                handleAreaPyChange("gross_area", "gross_area_py", "grossSqm", e.target.value)
              }
            />
          </div>
          <div>
            <label className={labelCls}>
              전용면적 (㎡){autoCalc.exclusiveSqm && <span className="ml-1.5 text-[10px] text-navy">(자동계산)</span>}
            </label>
            <input
              className={inputCls}
              type="number"
              step="0.01"
              value={form.exclusive_area ?? ""}
              onChange={(e) => {
                setAutoCalc((a) => ({ ...a, exclusiveSqm: false }));
                handleAreaSqmChange(
                  "exclusive_area",
                  "exclusive_area_py",
                  "exclusivePy",
                  e.target.value
                );
              }}
            />
          </div>
          <div>
            <label className={labelCls}>
              전용면적 (평){autoCalc.exclusivePy && <span className="ml-1.5 text-[10px] text-navy">(자동계산)</span>}
            </label>
            <input
              className={inputCls}
              type="number"
              step="0.01"
              value={form.exclusive_area_py ?? ""}
              onChange={(e) =>
                handleAreaPyChange(
                  "exclusive_area",
                  "exclusive_area_py",
                  "exclusiveSqm",
                  e.target.value
                )
              }
            />
          </div>
          <div>
            <label className={labelCls}>전용률 (%)</label>
            <input
              className={inputCls}
              type="number"
              value={form.efficiency_ratio ?? ""}
              onChange={(e) => update({ efficiency_ratio: numOrNull(e.target.value) })}
            />
          </div>
        </div>
        <p className="text-xs text-silver mt-3">
          1평 = 3.305785㎡ 기준으로 자동 계산합니다. 한쪽 값만 입력하면 비어있는 반대쪽 단위가
          자동으로 채워지고, 이미 두 단위가 모두 들어있으면 서로 덮어쓰지 않습니다.
        </p>
      </section>

      {/* [임대조건] */}
      <section className="bg-white border border-silver/30 p-6">
        <h2 className={groupTitleCls}>임대조건</h2>
        <p className="text-xs text-silver mb-4">
          총액은 <b>만원</b> 단위, 평당 금액은 <b>원</b> 단위입니다 — 헷갈리지 않도록 입력칸에 단위를
          표시해두었습니다.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MoneyInput
            label="보증금 총액"
            unitHint="만원"
            value={form.deposit}
            onChange={(v) => update({ deposit: v })}
          />
          <MoneyInput
            label="평당 보증금"
            unitHint="원/평"
            value={form.deposit_per_py}
            onChange={(v) => update({ deposit_per_py: v })}
          />
          <MoneyInput
            label="월 임대료 총액"
            unitHint="만원"
            value={form.monthly_rent}
            onChange={(v) => update({ monthly_rent: v })}
          />
          <MoneyInput
            label="평당 임대료"
            unitHint="원/평"
            value={form.rent_per_py}
            onChange={(v) => update({ rent_per_py: v })}
          />
          <MoneyInput
            label="월 관리비 총액"
            unitHint="만원"
            value={form.management_fee}
            onChange={(v) => update({ management_fee: v })}
          />
          <MoneyInput
            label="평당 관리비"
            unitHint="원/평"
            value={form.maintenance_per_py}
            onChange={(v) => update({ maintenance_per_py: v })}
          />
          <MoneyInput
            label="NOC (평당 실부담금)"
            unitHint="원/평"
            value={form.noc_per_py}
            onChange={(v) => update({ noc_per_py: v })}
          />
        </div>
      </section>

      {/* [입주조건] */}
      <section className="bg-white border border-silver/30 p-6">
        <h2 className={groupTitleCls}>입주조건</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>입주 가능일</label>
            <input
              className={inputCls}
              type="date"
              value={form.available_date}
              onChange={(e) => update({ available_date: e.target.value })}
            />
          </div>
          <div>
            <label className={labelCls}>입주시기 (원문)</label>
            <input
              className={inputCls}
              value={form.move_in_text}
              onChange={(e) => update({ move_in_text: e.target.value })}
              placeholder="예: 즉시, 협의, 2027년 1월"
            />
          </div>
          <div>
            <label className={labelCls}>Rent Free</label>
            <input
              className={inputCls}
              value={form.rent_free}
              onChange={(e) => update({ rent_free: e.target.value })}
              placeholder="예: 1개월"
            />
          </div>
          <div>
            <label className={labelCls}>Fit-out 기간</label>
            <input
              className={inputCls}
              value={form.fit_out_period}
              onChange={(e) => update({ fit_out_period: e.target.value })}
              placeholder="예: 2주"
            />
          </div>
          <div>
            <label className={labelCls}>계약기간 (개월)</label>
            <input
              className={inputCls}
              type="number"
              value={form.lease_term_months ?? ""}
              onChange={(e) => update({ lease_term_months: numOrNull(e.target.value) })}
            />
          </div>
        </div>
        <p className="text-xs text-silver mt-3">
          입주 가능일을 정확히 모르면 날짜는 비워두고 &apos;입주시기(원문)&apos;에 &quot;즉시&quot;,
          &quot;협의&quot; 같은 표현을 그대로 적어두면 됩니다. 두 값은 서로 충돌하지 않습니다.
        </p>
      </section>

      {/* [주차] */}
      <section className="bg-white border border-silver/30 p-6">
        <h2 className={groupTitleCls}>주차</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>무료 배정 주차 대수</label>
            <input
              className={inputCls}
              type="number"
              value={form.parking_spaces ?? ""}
              onChange={(e) => update({ parking_spaces: numOrNull(e.target.value) })}
            />
          </div>
          <MoneyInput
            label="추가 주차비"
            unitHint="만원"
            value={form.additional_parking_fee}
            onChange={(v) => update({ additional_parking_fee: v })}
          />
        </div>
      </section>

      {/* [출처/검증] */}
      <section className="bg-white border border-silver/30 p-6">
        <h2 className={groupTitleCls}>출처/검증</h2>
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-silver">출처사</dt>
          <dd>{sourceLabel}</dd>
          <dt className="text-silver">자료</dt>
          <dd>{documentTitle ?? "-"}</dd>
          <dt className="text-silver">원본 페이지</dt>
          <dd>{form.source_page ?? "-"}</dd>
          <dt className="text-silver">자료 기준일</dt>
          <dd>{form.report_date || "-"}</dd>
          <dt className="text-silver">검증일</dt>
          <dd>{form.verified_at ? new Date(form.verified_at).toLocaleString("ko-KR") : "-"}</dd>
        </dl>
        <p className="text-xs text-silver mt-3">
          이 정보는 관리자가 직접 입력하는 항목이 아니라, 자료(예: 중개사 리플릿) Import 기능이
          자동으로 채우는 값입니다. 지금은 모든 매물이 &apos;수동 입력&apos;으로 표시됩니다.
        </p>
      </section>

      {/* [기타] */}
      <section className="bg-white border border-silver/30 p-6">
        <h2 className={groupTitleCls}>기타</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className={labelCls}>인테리어 상태</label>
            <input
              className={inputCls}
              value={form.interior_status}
              onChange={(e) => update({ interior_status: e.target.value })}
              placeholder="예: 신축, 리모델링, 원상복구 필요"
            />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input
              id="restoration_required"
              type="checkbox"
              checked={form.restoration_required}
              onChange={(e) => update({ restoration_required: e.target.checked })}
            />
            <label htmlFor="restoration_required" className="text-sm">
              원상복구 필요
            </label>
          </div>
        </div>
        <div className="mb-4">
          <label className={labelCls}>설명/메모</label>
          <textarea
            className={inputCls}
            rows={4}
            value={form.description}
            onChange={(e) => update({ description: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_published}
              onChange={(e) => update({ is_published: e.target.checked })}
            />
            공개
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_featured}
              onChange={(e) => update({ is_featured: e.target.checked })}
            />
            추천 매물
          </label>
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
