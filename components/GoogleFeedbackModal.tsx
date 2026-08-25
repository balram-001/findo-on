"use client";

import React, { useState } from "react";
import { FileText, CheckCircle2, ExternalLink } from "lucide-react";

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
  const [hasOpenedForm, setHasOpenedForm] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  if (!isOpen) return null;

  const handleOpenForm = () => {
    window.open(formUrl, "_blank");
    setHasOpenedForm(true);
    setError("");
  };

  const handleUnlockAndDownload = () => {
    if (!hasOpenedForm) {
      setError("Kripya pehle upar diye gaye button se feedback form open karein.");
      return;
    }

    localStorage.setItem("leadflow_feedback_given", "true");
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <FileText className="w-6 h-6" />
        </div>

        <h3 className="text-lg font-bold text-slate-900">
          Quick Feedback Required
        </h3>
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
          Leads download karne ke liye 10 seconds ka feedback Google Form par dein. Feedback submit karte hi sheet automatically download ho jayegi.
        </p>

        {error && (
          <div className="mt-3 rounded-lg bg-red-50 p-2 text-xs font-semibold text-red-600 border border-red-200">
            {error}
          </div>
        )}

        <div className="mt-5 space-y-2.5">
          <button
            type="button"
            onClick={handleOpenForm}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition active:scale-[0.98] cursor-pointer"
          >
            <ExternalLink className="w-4 h-4" /> 1. Open Google Feedback Form
          </button>

          <button
            type="button"
            onClick={handleUnlockAndDownload}
            className={`w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition border cursor-pointer ${
              hasOpenedForm
                ? "bg-slate-900 text-white border-slate-900 hover:bg-slate-800 shadow-sm active:scale-[0.98]"
                : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
            }`}
          >
            <CheckCircle2 className="w-4 h-4" /> 2. I Have Submitted → Auto Download Excel
          </button>
        </div>

        <p className="mt-3 text-[11px] text-slate-400">
          Ek baar submit karne ke baad yeh popup dobara kabhi nahi aayega.
        </p>
      </div>
    </div>
  );
}