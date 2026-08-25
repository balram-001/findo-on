"use client";

import React from "react";
import { Download, Database, CheckCircle2 } from "lucide-react";
import * as XLSX from "xlsx";

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

  const getPhoneExportDetails = (lead: Lead) => {
    const original = String(lead.phone || "").trim();
    const digits = original.replace(/\D/g, "");
    const nationalNumber = digits.startsWith("91") && digits.length > 10 ? digits.slice(2) : digits.replace(/^0+/, "");
    const isMobile = nationalNumber.length === 10 && /^[6-9]/.test(nationalNumber);
    const phoneType = lead.phoneType || lead.phone_type || (isMobile ? "Mobile / WhatsApp" : original ? "Landline" : "N/A");
    const phone = isMobile ? `+91 ${nationalNumber}` : original || "N/A";
    const isWhatsapp = Boolean(lead.isWhatsapp || lead.is_whatsapp || isMobile);

    return {
      phone,
      phoneType,
      isWhatsapp: isWhatsapp ? "Yes" : "No",
      whatsappLink: lead.whatsappLink || lead.whatsapp_link || (isMobile ? `https://wa.me/91${nationalNumber}` : "N/A"),
    };
  };

  const executeDownload = () => {
    if (!leadsData || leadsData.length === 0) {
      alert("Export karne ke liye koi leads available nahi hain!");
      return;
    }

    const selectedLeads = leadsData.filter((l) => l.selected);
    const dataToExport = selectedLeads.length > 0 ? selectedLeads : leadsData;

    // Match the lead table exactly, while preserving full source values instead
    // of truncating them as the on-screen table does.
    const headers = [
      "S.No.", "Company Name", "Industry", "Category", "Phone Number",
      "Number Type", "Is WhatsApp", "City / Location", "Website", "GSTIN",
      "GST Check", "Quality", "WhatsApp Link",
    ];
    const rows = dataToExport.map((lead, index) => {
      const phoneDetails = getPhoneExportDetails(lead);
      const leadScore = lead.leadScore || "-";
      const leadTier = lead.leadTier || (typeof lead.leadScore === "number" && lead.leadScore >= 70 ? "A" : typeof lead.leadScore === "number" && lead.leadScore >= 45 ? "B" : "C");
      const gstin = lead.gstin || "N/A";
      const gstCheck = lead.gstCheck || lead.gstStatus || (gstin !== "N/A" ? "UNVERIFIED" : "N/A");

      return [
        index + 1,
        lead.companyName || lead.company_name || "N/A",
        lead.industry || "N/A",
        lead.category || "N/A",
        phoneDetails.phone,
        phoneDetails.phoneType,
        phoneDetails.isWhatsapp,
        lead.location || lead.city || "N/A",
        lead.website || "N/A",
        gstin,
        String(gstCheck),
        `${leadTier} ${leadScore}`,
        phoneDetails.whatsappLink,
      ];
    });

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };
    worksheet["!autofilter"] = { ref: XLSX.utils.encode_range(XLSX.utils.decode_range(worksheet["!ref"] || "A1")) };
    worksheet["!cols"] = [
      { wch: 8 },
      { wch: 32 }, { wch: 28 }, { wch: 28 }, { wch: 17 }, { wch: 19 },
      { wch: 13 }, { wch: 36 }, { wch: 42 }, { wch: 18 }, { wch: 14 },
      { wch: 12 }, { wch: 32 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");
    XLSX.writeFile(workbook, `Findo_Leads_${new Date().toISOString().split("T")[0]}.xlsx`, {
      compression: true,
    });
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
          <span>Export Excel (.xlsx)</span>
        </button>
      </div>
    </header>
  );
}
