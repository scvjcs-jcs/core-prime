"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteProposal } from "@/app/admin/(protected)/proposals/actions";

export default function DeleteProposalButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    const ok = window.confirm(`"${label}" 제안서를 정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`);
    if (!ok) return;

    startTransition(async () => {
      const result = await deleteProposal(id);
      if (result.error) {
        window.alert(`삭제에 실패했습니다: ${result.error}`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className="text-red-600 hover:underline text-sm disabled:opacity-50"
    >
      {isPending ? "삭제 중..." : "삭제"}
    </button>
  );
}
