"use client";

import { useState } from "react";
import { submitInquiry } from "@/app/advisory/actions";

type DistrictOption = { id: string; name: string };

const inputCls =
  "w-full border border-silver/40 px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy";
const labelCls = "block text-xs text-silver mb-1.5";

export default function AdvisoryForm({
  districts,
  defaultNotes,
}: {
  districts: DistrictOption[];
  defaultNotes?: string;
}) {
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [headcount, setHeadcount] = useState("");
  const [preferredDistrict, setPreferredDistrict] = useState("");
  const [minArea, setMinArea] = useState("");
  const [maxArea, setMaxArea] = useState("");
  const [minBudget, setMinBudget] = useState("");
  const [maxBudget, setMaxBudget] = useState("");
  const [moveInDate, setMoveInDate] = useState("");
  const [preferredGrade, setPreferredGrade] = useState("");
  const [requiredParking, setRequiredParking] = useState("");
  const [notes, setNotes] = useState(defaultNotes ?? "");
  const [consent, setConsent] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!phone.trim() && !email.trim()) { setError("전화번호 또는 이메일 중 하나를 입력해 주세요."); return; }
    if (minArea && maxArea && Number(minArea) > Number(maxArea)) { setError("희망 전용면적의 최소값이 최대값보다 큽니다."); return; }
    if (minBudget && maxBudget && Number(minBudget) > Number(maxBudget)) { setError("희망 예산의 최소값이 최대값보다 큽니다."); return; }
    if (!consent) { setError("상담을 위해 개인정보 수집·이용에 동의해 주세요."); return; }
    setSubmitting(true);

    const result = await submitInquiry({
      company_name: companyName,
      contact_name: contactName,
      phone,
      email,
      headcount: headcount ? Number(headcount) : null,
      preferred_district: preferredDistrict,
      min_exclusive_area: minArea ? Math.round(Number(minArea) * 3.305785 * 100) / 100 : null,
      max_exclusive_area: maxArea ? Math.round(Number(maxArea) * 3.305785 * 100) / 100 : null,
      min_budget: minBudget ? Number(minBudget) : null,
      max_budget: maxBudget ? Number(maxBudget) : null,
      move_in_date: moveInDate,
      required_parking: requiredParking ? Number(requiredParking) : null,
      preferred_grade: preferredGrade,
      etc_notes: notes,
    });

    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="bg-white border border-silver/30 p-10 text-center">
        <p className="uppercase tracking-[0.2em] text-silver text-xs mb-3">
          Thank You
        </p>
        <h2 className="font-display text-2xl mb-4 kr-text">
          상담 신청이 접수되었습니다.
        </h2>
        <p className="text-silver text-sm kr-text">
          입력하신 조건을 확인한 뒤 담당자가 연락드리고, 적합한 오피스 후보를 정리해 안내드리겠습니다.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-silver/30 p-6 md:p-10 space-y-8">
      <section>
        <h3 className="text-sm tracking-wide text-silver mb-4 border-b border-silver/20 pb-2">
          담당자 정보
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>회사명</label>
            <input className={inputCls} value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>담당자 성함 *</label>
            <input className={inputCls} value={contactName} onChange={(e) => setContactName(e.target.value)} required />
          </div>
          <div>
            <label className={labelCls}>연락처(전화번호)</label>
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-0000-0000" />
          </div>
          <div>
            <label className={labelCls}>이메일</label>
            <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>임직원 수(예정 인원)</label>
            <input className={inputCls} type="number" value={headcount} onChange={(e) => setHeadcount(e.target.value)} />
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm tracking-wide text-silver mb-4 border-b border-silver/20 pb-2">
          희망 조건 (선택 입력)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>희망 업무권역</label>
            <select className={inputCls} value={preferredDistrict} onChange={(e) => setPreferredDistrict(e.target.value)}>
              <option value="">선택 안 함</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>희망 건물 등급 (예: A+, A, B+)</label>
            <input className={inputCls} value={preferredGrade} onChange={(e) => setPreferredGrade(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>희망 전용면적(평) 최소</label>
              <input className={inputCls} type="number" value={minArea} onChange={(e) => setMinArea(e.target.value)} />
              {minArea && <p className="text-[11px] text-silver mt-1">약 {(Number(minArea)*3.305785).toFixed(1)}㎡</p>}
            </div>
            <div>
              <label className={labelCls}>최대</label>
              <input className={inputCls} type="number" value={maxArea} onChange={(e) => setMaxArea(e.target.value)} />
              {maxArea && <p className="text-[11px] text-silver mt-1">약 {(Number(maxArea)*3.305785).toFixed(1)}㎡</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>희망 예산(만원/월) 최소</label>
              <input className={inputCls} type="number" value={minBudget} onChange={(e) => setMinBudget(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>최대</label>
              <input className={inputCls} type="number" value={maxBudget} onChange={(e) => setMaxBudget(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelCls}>희망 입주 시기</label>
            <input className={inputCls} type="date" value={moveInDate} onChange={(e) => setMoveInDate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>필요 주차대수</label>
            <input className={inputCls} type="number" min="0" value={requiredParking} onChange={(e) => setRequiredParking(e.target.value)} placeholder="예: 10" />
          </div>
        </div>
      </section>

      <section>
        <label className={labelCls}>추가로 전달하고 싶은 내용</label>
        <textarea
          className={inputCls}
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="관심 있는 건물, 현재 사무실 상황, 기타 요청사항 등을 자유롭게 남겨주세요."
        />
      </section>

      <label className="flex items-start gap-3 border border-silver/30 bg-fog p-4 text-xs leading-5 text-charcoal kr-text">
        <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span><b>개인정보 수집·이용에 동의합니다.</b><br/><span className="text-silver">상담 연락과 오피스 제안 목적으로 회사명, 담당자명, 연락처, 이메일 및 희망조건을 수집합니다. 상담 목적 달성 후 내부 정책에 따라 보관·삭제합니다.</span></span>
      </label>

      {error && <p role="alert" className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-navy text-white px-6 py-3 text-sm hover:bg-charcoal transition-colors disabled:opacity-50"
      >
        {submitting ? "접수 중..." : "맞춤 오피스 제안 요청하기"}
      </button>
    </form>
  );
}
