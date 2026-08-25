"use client";

import { useState } from "react";

interface GoogleFeedbackModalProps {
  isOpen: boolean;
  onSuccess: () => void;
  formUrl: string;
}

export default function GoogleFeedbackModal({
  isOpen,
  onSuccess,
  formUrl,
}: GoogleFeedbackModalProps) {
  const [hasClickedForm, setHasClickedForm] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleOpenGoogleForm = () => {
    window.open(formUrl, "_blank");
    setHasClickedForm(true);
    setError("");
  };

  const handleUnlockData = () => {
    if (!hasClickedForm) {
      setError("Pehle upar diye gaye button se Feedback Form open karein!");
      return;
    }

    // Mark as submitted permanently in localStorage
    localStorage.setItem("leadflow_feedback_given", "true");
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl transition-all dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
        {/* Top Icon */}
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-900/30">
          <svg
            className="w-7 h-7"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>

        <h3 className="text-xl font-bold text-slate-900 dark:text-white">
          Quick Feedback Required
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
          Leads explore karne ke liye 10 seconds ka feedback Google Form par dein. Yeh popup sirf pehli baar fetch karte waqt aayega.
        </p>

        {error && (
          <div className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs font-semibold text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="mt-6 space-y-3">
          {/* Button 1: Open Google Form */}
          <button
            onClick={handleOpenGoogleForm}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:bg-blue-700 active:scale-[0.98]"
          >
            <span>📝</span> Open Google Feedback Form
          </button>

          {/* Button 2: Unlock Leads */}
          <button
            onClick={handleUnlockData}
            className={`w-full rounded-xl py-3 text-sm font-semibold transition border ${
              hasClickedForm
                ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 active:scale-[0.98]"
                : "bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:border-slate-700 cursor-not-allowed"
            }`}
          >
            ✓ I Have Submitted → Unlock Leads
          </button>
        </div>

        <p className="mt-4 text-[11px] text-slate-400">
          Ek baar submit karne ke baad yeh popup dobara nahi dikhega.
        </p>
      </div>
    </div>
  );
}