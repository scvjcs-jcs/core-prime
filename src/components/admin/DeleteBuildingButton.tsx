"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteBuilding } from "@/app/admin/(protected)/buildings/actions";

export default function DeleteBuildingButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    const ok = window.confirm(
      `"${name}" 건물을 정말 삭제하시겠습니까?\n임대 매물 정보 등 연결된 데이터도 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`
    );
    if (!ok) return;

    startTransition(async () => {
      const result = await deleteBuilding(id);
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
