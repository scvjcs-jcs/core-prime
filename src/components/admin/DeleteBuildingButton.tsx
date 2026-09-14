"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteBuilding, restoreBuilding } from "@/app/admin/(protected)/buildings/actions";

export default function DeleteBuildingButton({
  id,
  name,
  deletedAt,
}: {
  id: string;
  name: string;
  deletedAt?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isDeleted = !!deletedAt;

  function handleClick() {
    const ok = window.confirm(
      isDeleted
        ? `"${name}" 건물을 복구하시겠습니까?\n복구하면 관리자 목록에 다시 정상 건물로 표시됩니다. (홈페이지 공개 여부는 별도로 다시 켜주셔야 합니다.)`
        : `"${name}" 건물을 삭제(보관)하시겠습니까?\n홈페이지에서 즉시 비공개로 전환되며, 연결된 매물/사진/Prime Score/제안서 기록은 그대로 보관됩니다.\n필요하면 나중에 '삭제됨' 목록에서 다시 복구할 수 있습니다.`
    );
    if (!ok) return;

    startTransition(async () => {
      const result = isDeleted ? await restoreBuilding(id) : await deleteBuilding(id);
      if (result.error) {
        window.alert(`처리에 실패했습니다: ${result.error}`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className={
        isDeleted
          ? "text-navy hover:underline text-sm disabled:opacity-50"
          : "text-red-600 hover:underline text-sm disabled:opacity-50"
      }
    >
      {isPending ? "처리 중..." : isDeleted ? "복구" : "삭제"}
    </button>
  );
}
