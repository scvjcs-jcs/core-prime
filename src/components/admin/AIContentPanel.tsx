"use client";

import { useState } from "react";
import {
  generateBuildingContent,
  saveBuildingContent,
  deleteBuildingContent,
} from "@/app/admin/(protected)/buildings/ai-actions";
import type { BuildingContent, ContentType } from "@/lib/types";

const TYPE_LABEL: Record<ContentType, string> = {
  intro: "건물 소개 문구",
  blog: "블로그 글",
  sns: "SNS 홍보 문구",
};

export default function AIContentPanel({
  buildingId,
  initialContents,
}: {
  buildingId: string;
  initialContents: BuildingContent[];
}) {
  const [contents, setContents] = useState<BuildingContent[]>(initialContents);
  const [contentType, setContentType] = useState<ContentType>("intro");
  const [draft, setDraft] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function handleGenerate() {
    setError(null);
    setGenerating(true);
    setDraft("");
    const result = await generateBuildingContent(buildingId, contentType);
    setGenerating(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDraft(result.text ?? "");
  }

  async function handleSave() {
    if (!draft.trim()) return;
    setSaving(true);
    setError(null);
    const result = await saveBuildingContent(buildingId, contentType, draft);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setContents((prev) => [
      {
        id: crypto.randomUUID(),
        building_id: buildingId,
        content_type: contentType,
        body: draft,
        status: "draft",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      ...prev,
    ]);
    setDraft("");
  }

  async function handleDelete(id: string) {
    const ok = window.confirm("이 콘텐츠를 삭제하시겠습니까?");
    if (!ok) return;
    const result = await deleteBuildingContent(id, buildingId);
    if (result.error) {
      window.alert(`삭제 실패: ${result.error}`);
      return;
    }
    setContents((prev) => prev.filter((c) => c.id !== id));
  }

  async function handleCopy(id: string, body: string) {
    try {
      await navigator.clipboard.writeText(body);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      window.prompt("아래 내용을 복사하세요:", body);
    }
  }

  return (
    <div className="space-y-8">
      <div className="bg-fog border border-silver/30 p-5">
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="block text-xs text-silver mb-1.5">콘텐츠 종류</label>
            <select
              className="border border-silver/40 px-3 py-2 text-sm bg-white"
              value={contentType}
              onChange={(e) => setContentType(e.target.value as ContentType)}
            >
              {(Object.keys(TYPE_LABEL) as ContentType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="bg-navy text-white px-4 py-2 text-sm hover:bg-charcoal transition-colors disabled:opacity-50"
          >
            {generating ? "AI가 작성 중..." : "AI로 생성하기"}
          </button>
        </div>

        {error && <p className="text-sm text-red-600 whitespace-pre-wrap mb-3">{error}</p>}

        {(draft || generating) && (
          <div>
            <textarea
              className="w-full border border-silver/40 px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy"
              rows={8}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={generating ? "AI가 작성하는 중입니다..." : ""}
              disabled={generating}
            />
            <p className="text-xs text-silver mt-1">
              내용을 자유롭게 수정한 뒤 저장하세요. AI가 만든 문구는 저장 전에 꼭 사실관계를 확인해 주세요.
            </p>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || generating || !draft.trim()}
              className="mt-3 text-sm bg-navy text-white px-4 py-2 hover:bg-charcoal transition-colors disabled:opacity-50"
            >
              {saving ? "저장 중..." : "이 내용 저장"}
            </button>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm tracking-wide text-silver mb-3 border-b border-silver/20 pb-2">
          저장된 콘텐츠
        </h3>
        {contents.length === 0 ? (
          <p className="text-sm text-silver py-6 text-center">아직 저장된 콘텐츠가 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {contents.map((c) => {
              const expanded = expandedId === c.id;
              return (
                <div key={c.id} className="border border-silver/30 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs text-silver">
                      <span className="text-navy">{TYPE_LABEL[c.content_type]}</span>
                      {" · "}
                      {new Date(c.created_at).toLocaleString("ko-KR")}
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : c.id)}
                        className="text-navy hover:underline"
                      >
                        {expanded ? "접기" : "전체 보기"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopy(c.id, c.body ?? "")}
                        className="text-navy hover:underline"
                      >
                        {copiedId === c.id ? "복사됨!" : "복사"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        className="text-red-600 hover:underline"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                  <p
                    className={`text-sm kr-text whitespace-pre-wrap ${
                      expanded ? "" : "line-clamp-2"
                    }`}
                  >
                    {c.body}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
