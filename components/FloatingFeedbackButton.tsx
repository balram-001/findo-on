"use client";

import React from "react";
import { MessageSquarePlus } from "lucide-react";

interface FloatingFeedbackButtonProps {
  onClick: () => void;
}

export default function FloatingFeedbackButton({ onClick }: FloatingFeedbackButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed right-0 top-1/2 -translate-y-1/2 z-40 flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2.5 px-3 rounded-l-xl shadow-lg transition-all duration-200 hover:pr-4 cursor-pointer"
      title="Give Feedback"
    >
      <MessageSquarePlus className="w-4 h-4" />
      <span className="hidden sm:inline">Feedback</span>
    </button>
  );
}
