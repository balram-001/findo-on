"use client";

import React from "react";
import { Download, Database, CheckCircle2 } from "lucide-react";

// Interface definition for Lead items
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
  gstin?: string;
  whatsappLink?: string;
  whatsapp_link?: string;
  selected?: boolean;
}

// Props Interface with leadsData added!
interface HeaderBarProps {
  selectedCount?: number;
  totalCount?: number;
  leadsData?: Lead[];
}

export default function HeaderBar({
  selectedCount = 0,
  totalCount = 0,
  leadsData = [],
}: HeaderBarProps) {

  // Real Excel/CSV Export Handler
  const handleExportExcel = () => {
    if (!leadsData || leadsData.length === 0) {
      alert("Export karne ke liye koi leads available nahi hain!");
      return;
    }

    // Filter selected leads if any are checked, otherwise export all loaded leads
    const selectedLeads = leadsData.filter((l) => l.selected);
    const dataToExport = selectedLeads.length > 0 ? selectedLeads : leadsData;

    // 1. Define CSV Headers
    const headers = [
      "S.No",
      "Company Name",
      "Category",
      "Phone Number",
      "Phone Type",
      "Is WhatsApp",
      "City / Location",
      "Website",
      "GSTIN",
      "WhatsApp Link"
    ];

    // 2. Format Rows for Excel
    const rows = dataToExport.map((item, index) => {
      const company = `"${(item.companyName || item.company_name || "N/A").replace(/"/g, '""')}"`;
      const category = `"${(item.category || item.industry || "Textile").replace(/"/g, '""')}"`;
      const phone = `"'${item.phone || "N/A"}"`; // Leading single quote keeps phone formatting clean in Excel
      const phoneType = `"${item.phoneType || item.phone_type || "Mobile"}"`;
      const isWhatsapp = item.isWhatsapp || item.is_whatsapp ? "Yes" : "No";
      const location = `"${(item.location || item.city || "Indore").replace(/"/g, '""')}"`;
      const website = `"${item.website || ""}"`;
      const gstin = `"${item.gstin || ""}"`;
      const waLink = `"${item.whatsappLink || item.whatsapp_link || ""}"`;

      return [
        index + 1,
        company,
        category,
        phone,
        phoneType,
        isWhatsapp,
        location,
        website,
        gstin,
        waLink
      ].join(",");
    });

    // 3. Create CSV Content with UTF-8 BOM for Excel formatting
    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");

    // 4. Trigger Direct File Download (.csv opens directly in Excel)
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    const fileName = `Textile_Leads_Indore_${new Date().toISOString().split("T")[0]}.csv`;
    
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-slate-900 text-white rounded-lg">
          <Database className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-base font-bold text-slate-900">B2B Lead Extractor Dashboard</h1>
          <p className="text-xs text-slate-500">Live Active Leads from Supabase Database</p>
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

        {/* Updated Clean Export Button */}
        <button
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