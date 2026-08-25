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

  const toSafeSpreadsheetValue = (value: unknown): string | number | boolean => {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") {
      // Prevent spreadsheet formula execution when a lead field starts with a formula character.
      return /^[=+\-@]/.test(value) ? `'${value}` : value;
    }
    if (typeof value === "number" || typeof value === "boolean") return value;
    return JSON.stringify(value);
  };

  const executeDownload = () => {
    if (!leadsData || leadsData.length === 0) {
      alert("Export karne ke liye koi leads available nahi hain!");
      return;
    }

    const selectedLeads = leadsData.filter((l) => l.selected);
    const dataToExport = selectedLeads.length > 0 ? selectedLeads : leadsData;

    // Keep every original field as its own column. This avoids CSV parsing issues
    // and makes the downloaded file import cleanly into Google Sheets and Excel.
    const rawColumns = Array.from(
      new Set(dataToExport.flatMap((lead) => Object.keys(lead)))
    );
    const rows = dataToExport.map((lead, index) => ({
      "S.No.": index + 1,
      ...Object.fromEntries(rawColumns.map((column) => [column, toSafeSpreadsheetValue(lead[column as keyof Lead])])),
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };
    worksheet["!autofilter"] = { ref: XLSX.utils.encode_range(XLSX.utils.decode_range(worksheet["!ref"] || "A1")) };
    worksheet["!cols"] = [
      { wch: 8 },
      ...rawColumns.map((column) => ({ wch: Math.min(Math.max(column.length + 2, 14), 32) })),
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
