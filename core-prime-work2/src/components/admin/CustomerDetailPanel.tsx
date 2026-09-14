"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateCustomerStatus, updateCustomerMemo } from "@/app/admin/(protected)/customers/actions";
import { CUSTOMER_STATUS_LABEL, CUSTOMER_STATUS_ORDER } from "@/lib/labels";
import type { CustomerStatus } from "@/lib/types";

export default function CustomerDetailPanel({
  customerId,
  initialStatus,
  initialMemo,
}: {
  customerId: string;
  initialStatus: CustomerStatus;
  initialMemo: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<CustomerStatus>(initialStatus);
  const [memo, setMemo] = useState(initialMemo ?? "");
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingMemo, setSavingMemo] = useState(false);
  const [memoSaved, setMemoSaved] = useState(false);

  async function handleStatusChange(newStatus: CustomerStatus) {
    setStatus(newStatus);
    setSavingStatus(true);
    await updateCustomerStatus(customerId, newStatus);
    setSavingStatus(false);
    router.refresh();
  }

  async function handleMemoSave() {
    setSavingMemo(true);
    setMemoSaved(false);
    await updateCustomerMemo(customerId, memo);
    setSavingMemo(false);
    setMemoSaved(true);
  }

  return (
    <div className="bg-white border border-silver/30 p-6 space-y-6">
      <div>
        <label className="block text-xs text-silver mb-1.5">진행 상태</label>
        <select
          className="w-full border border-silver/40 px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy"
          value={status}
          onChange={(e) => handleStatusChange(e.target.value as CustomerStatus)}
          disabled={savingStatus}
        >
          {CUSTOMER_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {CUSTOMER_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        {savingStatus && <p className="text-xs text-silver mt-1">저장 중...</p>}
      </div>

      <div>
        <label className="block text-xs text-silver mb-1.5">내부 메모</label>
        <textarea
          className="w-full border border-silver/40 px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy"
          rows={6}
          value={memo}
          onChange={(e) => {
            setMemo(e.target.value);
            setMemoSaved(false);
          }}
          placeholder="상담 내용, 통화 이력 등을 자유롭게 기록하세요."
        />
        <div className="flex items-center gap-3 mt-2">
          <button
            type="button"
            onClick={handleMemoSave}
            disabled={savingMemo}
            className="text-sm bg-navy text-white px-4 py-2 hover:bg-charcoal transition-colors disabled:opacity-50"
          >
            {savingMemo ? "저장 중..." : "메모 저장"}
          </button>
          {memoSaved && <span className="text-xs text-green-700">저장됨</span>}
        </div>
      </div>
    </div>
  );
}
