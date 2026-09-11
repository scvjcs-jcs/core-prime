"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { BuildingImage, BuildingImageType } from "@/lib/types";

const TYPE_LABEL: Record<BuildingImageType, string> = {
  exterior: "외관",
  lobby: "로비",
  office: "오피스",
  parking: "주차장",
  amenity: "편의시설",
  night: "야경",
  aerial: "항공뷰",
  floor_plan: "평면도",
  map: "위치도",
  other: "기타",
};

export default function ImageUploader({
  buildingId,
  initialImages,
}: {
  buildingId: string;
  initialImages: BuildingImage[];
}) {
  const [images, setImages] = useState<BuildingImage[]>(
    [...initialImages].sort((a, b) => a.sort_order - b.sort_order)
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    const supabase = createClient();

    try {
      let nextOrder = images.length;
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${buildingId}/${crypto.randomUUID()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("building-images")
          .upload(path, file, { cacheControl: "3600", upsert: false });

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        const { data: publicUrlData } = supabase.storage
          .from("building-images")
          .getPublicUrl(path);

        const { data: inserted, error: insertError } = await supabase
          .from("building_images")
          .insert({
            building_id: buildingId,
            type: "other",
            url: publicUrlData.publicUrl,
            is_primary: images.length === 0 && nextOrder === images.length,
            sort_order: nextOrder,
            is_published: true,
          })
          .select("*")
          .single();

        if (insertError || !inserted) {
          throw new Error(insertError?.message || "이미지 정보 저장 실패");
        }

        setImages((prev) => [...prev, inserted as BuildingImage]);
        nextOrder += 1;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 중 오류가 발생했습니다.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(image: BuildingImage) {
    const ok = window.confirm("이 사진을 삭제하시겠습니까?");
    if (!ok) return;

    const supabase = createClient();
    const { error: delErr } = await supabase
      .from("building_images")
      .delete()
      .eq("id", image.id);

    if (delErr) {
      setError(delErr.message);
      return;
    }

    setImages((prev) => prev.filter((i) => i.id !== image.id));
  }

  async function handleSetPrimary(image: BuildingImage) {
    const supabase = createClient();
    await supabase
      .from("building_images")
      .update({ is_primary: false })
      .eq("building_id", buildingId);
    const { error: updErr } = await supabase
      .from("building_images")
      .update({ is_primary: true })
      .eq("id", image.id);

    if (updErr) {
      setError(updErr.message);
      return;
    }

    setImages((prev) =>
      prev.map((i) => ({ ...i, is_primary: i.id === image.id }))
    );
  }

  async function handleTypeChange(image: BuildingImage, type: BuildingImageType) {
    const supabase = createClient();
    const { error: updErr } = await supabase
      .from("building_images")
      .update({ type })
      .eq("id", image.id);

    if (updErr) {
      setError(updErr.message);
      return;
    }

    setImages((prev) => prev.map((i) => (i.id === image.id ? { ...i, type } : i)));
  }

  return (
    <div>
      <p className="text-sm text-silver mb-4">
        건물 사진을 업로드하세요. 대표사진으로 지정한 1장이 목록/상세 페이지의 메인 이미지로 사용됩니다.
      </p>

      {error && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2">
          {error}
        </p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        disabled={uploading}
        onChange={(e) => handleFiles(e.target.files)}
        className="mb-6 text-sm"
      />
      {uploading && <span className="ml-3 text-sm text-silver">업로드 중...</span>}

      {images.length === 0 ? (
        <p className="text-sm text-silver py-8 text-center border border-dashed border-silver/40">
          아직 업로드된 사진이 없습니다.
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {images.map((image) => (
            <div key={image.id} className="border border-silver/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt={image.alt_text ?? ""}
                className="w-full h-32 object-cover bg-fog"
              />
              <div className="p-2 space-y-2">
                <select
                  value={image.type}
                  onChange={(e) =>
                    handleTypeChange(image, e.target.value as BuildingImageType)
                  }
                  className="w-full text-xs border border-silver/40 px-1 py-1"
                >
                  {Object.entries(TYPE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => handleSetPrimary(image)}
                    disabled={image.is_primary}
                    className={
                      image.is_primary
                        ? "text-xs text-white bg-navy px-2 py-1"
                        : "text-xs text-navy border border-navy px-2 py-1 hover:bg-navy hover:text-white"
                    }
                  >
                    {image.is_primary ? "대표사진" : "대표로 지정"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(image)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
