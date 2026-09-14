"use client";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden bg-navy text-white px-6 py-3 text-sm hover:bg-charcoal transition-colors"
    >
      PDF로 저장 / 인쇄
    </button>
  );
}
