"use client";

import React, { useState } from "react";
import { CheckCircle2, MessageSquarePlus, Star, X } from "lucide-react";

interface GoogleFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type StoredFeedback = {
  id: number;
  rating: number;
  comment: string;
  name: string;
  email: string;
};

const FEEDBACK_STORAGE_KEY = "leadflow_feedback_submission";

function getStoredFeedback(): StoredFeedback | null {
  if (typeof window === "undefined") return null;
  try {
    const savedFeedback = localStorage.getItem(FEEDBACK_STORAGE_KEY);
    if (!savedFeedback) return null;
    const parsed = JSON.parse(savedFeedback) as StoredFeedback;
    return Number.isInteger(parsed.id) && parsed.rating && parsed.comment ? parsed : null;
  } catch {
    localStorage.removeItem(FEEDBACK_STORAGE_KEY);
    return null;
  }
}

export default function GoogleFeedbackModal({
  isOpen,
  onClose,
}: GoogleFeedbackModalProps) {
  const [storedFeedback] = useState<StoredFeedback | null>(getStoredFeedback);
  const [rating, setRating] = useState(() => storedFeedback?.rating || 0);
  const [comment, setComment] = useState(() => storedFeedback?.comment || "");
  const [name, setName] = useState(() => storedFeedback?.name || "");
  const [email, setEmail] = useState(() => storedFeedback?.email || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(() => Boolean(storedFeedback));
  const [feedbackId, setFeedbackId] = useState<number | null>(() => storedFeedback?.id || null);

  if (!isOpen) return null;

  const handleClose = () => {
    if (submitting) return;
    setError("");
    onClose();
  };

  const handleEdit = () => {
    setError("");
    setSubmitted(false);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!rating || !comment.trim()) {
      setError("Please choose a rating and write your feedback.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/feedback", {
        method: feedbackId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: feedbackId, rating, comment, name, email }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Unable to save feedback. Please try again.");
      }
      const savedId = Number(data.id || feedbackId);
      if (!Number.isInteger(savedId) || savedId < 1) throw new Error("Unable to save feedback. Please try again.");
      setFeedbackId(savedId);
      localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify({ id: savedId, rating, comment, name, email }));
      setSubmitted(true);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Unable to save feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
        <button type="button" onClick={handleClose} className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close feedback form">
          <X className="h-4 w-4" />
        </button>
        {submitted ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h3 className="mt-3 text-lg font-bold text-slate-900">Feedback submitted successfully</h3>
            <p className="mt-1 text-xs text-slate-500">Thank you for helping us improve Findo-On.</p>
            <button type="button" onClick={handleEdit} className="mt-5 rounded-xl border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">Edit your feedback</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="mb-5 flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><MessageSquarePlus className="h-5 w-5" /></div>
              <div><h3 className="text-lg font-bold text-slate-900">Share your feedback</h3><p className="mt-1 text-xs text-slate-500">Help us improve Findo-On.</p></div>
            </div>
            <label className="block text-xs font-semibold text-slate-700">Your rating <span className="text-rose-500">*</span></label>
            <div className="mt-2 flex gap-1">
              {[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => setRating(value)} className="rounded p-1" aria-label={`${value} star rating`}><Star className={`h-6 w-6 ${value <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} /></button>)}
            </div>
            <label htmlFor="feedback-comment" className="mt-4 block text-xs font-semibold text-slate-700">Feedback <span className="text-rose-500">*</span></label>
            <textarea id="feedback-comment" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} rows={4} placeholder="Tell us what worked well or what we can improve..." className="mt-1.5 w-full resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Name (optional)" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500" />
              <input value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} type="email" placeholder="Email (optional)" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500" />
            </div>
            {error && <p className="mt-3 text-xs font-medium text-rose-600">{error}</p>}
            <button type="submit" disabled={submitting} className="mt-5 flex w-full items-center justify-center rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? "Submitting..." : "Submit feedback"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
