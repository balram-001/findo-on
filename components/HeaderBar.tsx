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

const INDIAN_STD_CODES = new Set([
  "11", "22", "33", "44", "20", "40", "80", "79",
  "120", "124", "129", "135", "141", "145", "161", "172", "181",
  "231", "233", "240", "253", "261", "265", "281", "291", "294",
  "413", "422", "431", "452", "471", "484",
  "512", "522", "542", "562", "651", "657", "671", "674",
  "712", "724", "729", "731", "733", "755", "761", "770",
  "821", "824", "831", "836", "866", "870", "891",
]);

function hasIndianStdCode(nationalNumber: string) {
  return [4, 3, 2].some((length) => INDIAN_STD_CODES.has(nationalNumber.slice(0, length)));
}

export default function HeaderBar({
  selectedCount = 0,
  totalCount = 0,
  leadsData = [],
  onExportCheck,
}: HeaderBarProps) {

  const getPhoneExportDetails = (lead: Lead) => {
    const original = String(lead.phone || "").trim();
    const isMissing = !original || original.toLowerCase() === "n/a" || original.toLowerCase() === "missing";
    const digits = original.replace(/\D/g, "");
    const nationalNumber = digits.startsWith("91") && digits.length > 10 ? digits.slice(2) : digits.replace(/^0+/, "");
    const isLandline = nationalNumber.length === 10 && hasIndianStdCode(nationalNumber);
    const isWhatsapp = nationalNumber.length === 10 && !isLandline && /^[6-9]/.test(nationalNumber);
    const phoneType = isMissing ? "Missing" : isWhatsapp ? "WhatsApp" : "Landline";
    const phone = isMissing ? "N/A" : isWhatsapp ? `+91 ${nationalNumber}` : isLandline ? `0${nationalNumber}` : original;

    return {
      phone,
      phoneType,
      whatsappLink: isWhatsapp ? (lead.whatsappLink || lead.whatsapp_link || `https://wa.me/91${nationalNumber}`) : "N/A",
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
      "Number Type", "City / Location", "Website", "GSTIN", "GST Check",
      "Quality", "WhatsApp Link",
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
      { wch: 36 }, { wch: 42 }, { wch: 18 }, { wch: 14 }, { wch: 12 },
      { wch: 32 },
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
