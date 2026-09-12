"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createProposal,
  updateProposal,
  type ProposalFormPayload,
} from "@/app/admin/(protected)/proposals/actions";
import type { Proposal, ProposalBuilding, ProposalStatus } from "@/lib/types";

type CustomerOption = { id: string; contact_name: string; company_name: string | null };
type BuildingOption = { id: string; name: string };
type ListingOption = { id: string; building_id: string; floor: string | null };

const inputCls =
  "w-full border border-silver/40 px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy";
const labelCls = "block text-xs text-silver mb-1.5";

const STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: "초안(비공개)",
  sent: "발송됨(공개)",
  accepted: "수락됨",
  rejected: "거절됨",
};

function emptyBuildingRow(rank: number): ProposalBuilding {
  return {
    building_id: "",
    listing_id: null,
    recommendation_rank: rank,
    recommendation_reason: "",
    pros: "",
    cons: "",
  };
}

export default function ProposalForm({
  mode,
  proposalId,
  proposal,
  initialBuildings,
  customers,
  buildings,
  listings,
  defaultCustomerId,
  publicUrl,
}: {
  mode: "create" | "edit";
  proposalId?: string;
  proposal?: Proposal | null;
  initialBuildings?: ProposalBuilding[];
  customers: CustomerOption[];
  buildings: BuildingOption[];
  listings: ListingOption[];
  defaultCustomerId?: string;
  publicUrl?: string;
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(
    proposal?.customer_id ?? defaultCustomerId ?? ""
  );
  const [title, setTitle] = useState(proposal?.title ?? "");
  const [status, setStatus] = useState<ProposalStatus>(proposal?.status ?? "draft");
  const [expiresAt, setExpiresAt] = useState(
    proposal?.expires_at ? proposal.expires_at.slice(0, 10) : ""
  );
  const [rows, setRows] = useState<ProposalBuilding[]>(
    initialBuildings && initialBuildings.length > 0
      ? initialBuildings
      : [emptyBuildingRow(1)]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function updateRow(index: number, patch: Partial<ProposalBuilding>) {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function addRow() {
    setRows((prev) => [...prev, emptyBuildingRow(prev.length + 1)]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload: ProposalFormPayload = {
      customer_id: customerId,
      title,
      status,
      expires_at: expiresAt,
      buildings: rows,
    };

    const result =
      mode === "create" ? await createProposal(payload) : await updateProposal(proposalId!, payload);

    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    router.push("/admin/proposals");
    router.refresh();
  }

  async function handleCopyLink() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("아래 링크를 복사하세요:", publicUrl);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {publicUrl && (
        <div className="bg-fog border border-silver/30 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <p className="text-xs text-silver mb-1">고객에게 보낼 공개 링크</p>
            <p className="font-mono text-xs break-all">{publicUrl}</p>
          </div>
          <button
            type="button"
            onClick={handleCopyLink}
            className="text-xs bg-navy text-white px-3 py-2 hover:bg-charcoal transition-colors shrink-0"
          >
            {copied ? "복사됨!" : "링크 복사"}
          </button>
        </div>
      )}

      <section className="bg-white border border-silver/30 p-6">
        <h2 className="text-sm tracking-wide text-silver mb-4 border-b border-silver/20 pb-2">
          기본 정보
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>고객 *</label>
            <select
              className={inputCls}
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              required
            >
              <option value="">고객 선택</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.contact_name}
                  {c.company_name ? ` (${c.company_name})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>제안서 제목</label>
            <input
              className={inputCls}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: OO기업 사무실 이전 제안서"
            />
          </div>
          <div>
            <label className={labelCls}>상태</label>
            <select
              className={inputCls}
              value={status}
              onChange={(e) => setStatus(e.target.value as ProposalStatus)}
            >
              {(Object.keys(STATUS_LABEL) as ProposalStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <p className="text-xs text-silver mt-1">
              &apos;초안(비공개)&apos; 상태에서는 공개 링크로 접속해도 보이지 않습니다. 고객에게
              보내려면 &apos;발송됨(공개)&apos;으로 바꿔주세요.
            </p>
          </div>
          <div>
            <label className={labelCls}>만료일 (선택)</label>
            <input
              className={inputCls}
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="bg-white border border-silver/30 p-6">
        <div className="flex items-center justify-between mb-4 border-b border-silver/20 pb-2">
          <h2 className="text-sm tracking-wide text-silver">추천 건물</h2>
          <button
            type="button"
            onClick={addRow}
            className="text-xs text-navy hover:underline"
          >
            + 건물 추가
          </button>
        </div>

        <div className="space-y-6">
          {rows.map((row, i) => {
            const buildingListings = listings.filter((l) => l.building_id === row.building_id);
            return (
              <div key={i} className="border border-silver/30 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-silver">건물 {i + 1}</span>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      삭제
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>건물 *</label>
                    <select
                      className={inputCls}
                      value={row.building_id}
                      onChange={(e) =>
                        updateRow(i, { building_id: e.target.value, listing_id: null })
                      }
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
                    <label className={labelCls}>연결할 매물 (선택)</label>
                    <select
                      className={inputCls}
                      value={row.listing_id ?? ""}
                      onChange={(e) => updateRow(i, { listing_id: e.target.value || null })}
                      disabled={!row.building_id}
                    >
                      <option value="">선택 안 함</option>
                      {buildingListings.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.floor ?? "층 미정"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>추천 순위</label>
                    <input
                      className={inputCls}
                      type="number"
                      value={row.recommendation_rank ?? ""}
                      onChange={(e) =>
                        updateRow(i, {
                          recommendation_rank: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className={labelCls}>추천 사유</label>
                    <input
                      className={inputCls}
                      value={row.recommendation_reason ?? ""}
                      onChange={(e) => updateRow(i, { recommendation_reason: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>장점</label>
                    <textarea
                      className={inputCls}
                      rows={2}
                      value={row.pros ?? ""}
                      onChange={(e) => updateRow(i, { pros: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>단점 / 유의사항</label>
                    <textarea
                      className={inputCls}
                      rows={2}
                      value={row.cons ?? ""}
                      onChange={(e) => updateRow(i, { cons: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-3">
        <button
          type="submit"
          disabled={saving}
          className="bg-navy text-white px-6 py-3 text-sm hover:bg-charcoal transition-colors disabled:opacity-50"
        >
          {saving ? "저장 중..." : mode === "create" ? "제안서 생성" : "저장"}
        </button>
      </div>
    </form>
  );
}
