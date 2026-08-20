"use client";

import React, { useState } from "react";
import { Send, MessageSquare, Loader2 } from "lucide-react";
import type { Lead } from "./ExcelSheet";

interface WhatsAppSectionProps {
  leads: Lead[];
  city: string;
}

type CampaignResult = {
  phone: string;
  success: boolean;
  error?: string;
};

export default function WhatsAppSection({ leads, city }: WhatsAppSectionProps) {
  const [messageTemplate, setMessageTemplate] = useState(
    "Namaste {Name} Ji, humne dekha aapka business {City} me registered hai. Hum B2B machinery parts supply karte hain. Kya hum connect kar sakte hain?"
  );
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const selectedLeads = leads.filter(
    (lead) => lead.selected && (lead.phoneType === "Mobile" || lead.phoneType === "WhatsApp" || lead.isWhatsapp)
  );

  const handleStartCampaign = async () => {
    if (selectedLeads.length === 0) {
      alert("Koyi mobile lead select nahi hai! Kripya kam se kam ek company tick karein.");
      return;
    }

    setSending(true);
    setProgress({ current: 0, total: selectedLeads.length });

    try {
      const recipients = selectedLeads.map((lead) => ({
        phone: lead.phone,
        message: messageTemplate
          .replace(/{Name}/g, lead.companyName || "Sir/Ma'am")
          .replace(/{City}/g, city || "Aapke City"),
      }));

      const res = await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients }),
      });
      const data = await res.json().catch(() => null);
      const results: CampaignResult[] = data?.results ?? [];
      const sentCount = results.filter((result) => result.success).length;
      const failedCount = recipients.length - sentCount;

      if (!res.ok && results.length === 0) {
        throw new Error(data?.error || `HTTP Status ${res.status}`);
      }

      setProgress({ current: selectedLeads.length, total: selectedLeads.length });
      alert(`Campaign complete!\n✅ Sent: ${sentCount}\n❌ Failed: ${failedCount} (out of ${selectedLeads.length})`);
    } catch (error) {
      console.error("WhatsApp campaign failed:", error);
      alert(`Campaign start nahi ho saka: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setSending(false);
      setProgress(null);
    }
  };

  if (leads.length === 0) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-emerald-600" />
          <h3 className="text-sm font-bold text-slate-800">
            WhatsApp Web Campaign ({selectedLeads.length} Selected)
          </h3>
        </div>
        <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">
          Local Python automation
        </span>
      </div>

      <div className="mb-3">
        <label className="block text-xs font-medium text-slate-600 mb-1">
          Message Template (Variables: <code className="text-emerald-600 font-bold">{"{Name}"}</code>, <code className="text-emerald-600 font-bold">{"{City}"}</code>)
        </label>
        <textarea
          rows={3}
          value={messageTemplate}
          onChange={(e) => setMessageTemplate(e.target.value)}
          className="w-full border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
        />
      </div>

      <div className="flex items-center justify-between">
        {progress && (
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Sending {progress.current} / {progress.total} messages...</span>
          </div>
        )}

        <div className="ml-auto">
          <button
            onClick={handleStartCampaign}
            disabled={sending || selectedLeads.length === 0}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2.5 px-5 rounded-lg transition shadow-sm disabled:opacity-50"
          >
            {sending ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Sending with WhatsApp Web...</span></> : <><Send className="w-4 h-4" /><span>Send WhatsApp Campaign ({selectedLeads.length})</span></>}
          </button>
        </div>
      </div>
    </div>
  );
}
