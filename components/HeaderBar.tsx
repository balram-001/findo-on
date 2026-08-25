"use client";

import React from "react";
import { Download, Database, CheckCircle2 } from "lucide-react";

export interface Lead {
  id: number | string;
  companyName?: string;
  company_name?: string;
  category?: string;
  industry?: string;
  location?: string;
  city?: string;
  phone?: string;
  phoneType?: string;
  phone_type?: string;
  isWhatsapp?: boolean;
  is_whatsapp?: boolean;
  website?: string;
  websiteKind?: string;
  gstin?: string;
  gstStatus?: string | boolean;
  gstCheck?: string;
  leadScore?: number;
  leadTier?: "A" | "B" | "C" | string;
  whatsappLink?: string;
  whatsapp_link?: string;
  selected?: boolean;
}

export interface HeaderBarProps {
  selectedCount?: number;
  totalCount?: number;
  leadsData?: Lead[];
  onExportCheck?: (callbackToDownload: () => void) => void;
}

export default function HeaderBar({
  selectedCount = 0,
  totalCount = 0,
  leadsData = [],
  onExportCheck,
}: HeaderBarProps) {

  const executeDownload = () => {
    if (!leadsData || leadsData.length === 0) {
      alert("Export karne ke liye koi leads available nahi hain!");
      return;
    }

    const selectedLeads = leadsData.filter((l) => l.selected);
    const dataToExport = selectedLeads.length > 0 ? selectedLeads : leadsData;

    // Exact Table Headers matching the UI
    const headers = [
      "S.NO",
      "COMPANY NAME",
      "INDUSTRY",
      "CATEGORY",
      "PHONE NUMBER",
      "NUMBER TYPE",
      "WEB / SOURCE",
      "LOCATION",
      "QUALITY",
      "GSTIN",
      "GST CHECK"
    ];

    const rows = dataToExport.map((item, index) => {
      // 1. Phone number & Type parsing
      const rawPhone = String(item.phone || "").trim();
      const digits = rawPhone.replace(/\D/g, "").replace(/^91/, "").replace(/^0+/, "");
      const isMobile = digits.length === 10 && /^[6-9]/.test(digits);

      const phoneFormatted = isMobile
        ? `+91 ${digits}`
        : rawPhone && rawPhone !== "N/A"
        ? rawPhone
        : "N/A";

      const numberType = isMobile
        ? "WhatsApp"
        : rawPhone && rawPhone !== "N/A"
        ? "Landline"
        : "N/A";

      // 2. Exact UI field values
      const company = `"${(item.companyName || item.company_name || "N/A").replace(/"/g, '""')}"`;
      const industry = `"${(item.industry || "N/A").replace(/"/g, '""')}"`;
      const category = `"${(item.category || "N/A").replace(/"/g, '""')}"`;
      const phone = `"${phoneFormatted}"`;
      const type = `"${numberType}"`;
      const webSource = `"${(item.website && item.website !== "N/A" ? item.website : "N/A").replace(/"/g, '""')}"`;
      const location = `"${(item.location || item.city || "N/A").replace(/"/g, '""')}"`;
      
      const tier = item.leadTier || (item.leadScore && item.leadScore >= 70 ? "A" : item.leadScore && item.leadScore >= 45 ? "B" : "C");
      const score = item.leadScore ? item.leadScore : "-";
      const quality = `"${tier} ${score}"`;

      const gstin = `"${(item.gstin && item.gstin !== "N/A" ? item.gstin : "N/A").replace(/"/g, '""')}"`;
      const gstStatus = item.gstin && item.gstin !== "N/A"
        ? (item.gstStatus === "ACTIVE" ? "ACTIVE" : "UNVERIFIED")
        : "UNVERIFIED";
      const gstCheck = `"${gstStatus}"`;

      return [
        index + 1,
        company,
        industry,
        category,
        phone,
        type,
        webSource,
        location,
        quality,
        gstin,
        gstCheck
      ].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    const fileName = `Findo_Leads_${new Date().toISOString().split("T")[0]}.csv`;

    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => {
    if (onExportCheck) {
      onExportCheck(executeDownload);
    } else {
      executeDownload();
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-slate-900 text-white rounded-lg">
          <Database className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-base font-bold text-slate-900">Findo-On B2B Lead Extractor</h1>
          <p className="text-xs text-slate-500">Live Active Leads from Verified Database</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 justify-end">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>{selectedCount} Selected</span>
            <span className="text-slate-300">|</span>
            <span>{totalCount} Total Loaded</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleExportExcel}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white px-4 py-2 rounded-lg text-xs font-bold transition shadow-sm cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Export Excel (.csv)</span>
        </button>
      </div>
    </header>
  );
}