"use client";

import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
} from "react";

import {
  Phone,
  MessageCircle,
  Globe,
  Filter,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
} from "lucide-react";

/* =========================================================
   LEAD TYPE
========================================================= */

export interface Lead {
  id: string | number;
  companyName?: string;
  company_name?: string;
  phone?: string;
  phoneType?: string;
  phone_type?: string;
  isWhatsapp?: boolean;
  is_whatsapp?: boolean;
  whatsappLink?: string;
  whatsapp_link?: string;
  website?: string;
  location?: string;
  industry?: string;
  category?: string;
  primaryCategory?: string;
  primary_category?: string;
  city?: string;
  gstin?: string;
  gstStatus?: string | boolean;
  gstCheck?: string;
  leadScore?: number;
  leadTier?: "A" | "B" | "C" | string;
  selected?: boolean;
}

interface ExcelSheetProps {
  leads?: Lead[];
  rawLeads?: Lead[];
  data?: Lead[];
  requestedLimit?: number;
  hideLandlines?: boolean;
  onToggleSelect?: (id: number | string) => void;
  onToggleAll?: (ids: Array<number | string>) => void;
  setLeads?: React.Dispatch<React.SetStateAction<Lead[]>>;
}

const INDIAN_STD_CODES = new Set([
  "11", "22", "33", "44", "20", "40", "80", "79",
  "120", "124", "129", "135", "141", "145", "161", "172", "181",
  "231", "233", "240", "253", "261", "265", "281", "291", "294",
  "413", "422", "431", "452", "471", "484",
  "512", "522", "542", "562",
  "651", "657", "671", "674",
  "712", "724", "729", "731", "733", "755", "761", "770",
  "821", "824", "831", "836", "866", "870", "891",
]);

function matchStdCode(nationalNumber: string): string | null {
  for (const length of [4, 3, 2]) {
    const prefix = nationalNumber.slice(0, length);
    if (INDIAN_STD_CODES.has(prefix)) return prefix;
  }
  return null;
}

interface ClassifiedPhone {
  displayPhone: string;
  phoneType: "Mobile" | "Landline" | "Missing";
  isWhatsapp: boolean;
  cleanMobileDigits: string;
  badgeText: string;
}

function classifyPhone(rawPhoneInput: string | undefined): ClassifiedPhone {
  const rawPhone = (rawPhoneInput || "").trim();
  if (!rawPhone || rawPhone === "N/A" || rawPhone === "Missing") {
    return { displayPhone: "N/A", phoneType: "Missing", isWhatsapp: false, cleanMobileDigits: "", badgeText: "Missing" };
  }
  const digits = rawPhone.replace(/\D/g, "");
  if (!digits) {
    return { displayPhone: "N/A", phoneType: "Missing", isWhatsapp: false, cleanMobileDigits: "", badgeText: "Missing" };
  }
  let core = digits;
  if (core.startsWith("91") && core.length > 10) core = core.slice(2);
  core = core.replace(/^0+/, "");
  
  if (core.length === 10) {
    const stdCode = matchStdCode(core);
    if (stdCode) {
      return { displayPhone: `0${core}`, phoneType: "Landline", isWhatsapp: false, cleanMobileDigits: "", badgeText: "Landline" };
    }
    if (/^[6-9]/.test(core)) {
      return { displayPhone: `+91 ${core}`, phoneType: "Mobile", isWhatsapp: true, cleanMobileDigits: core, badgeText: "WhatsApp" };
    }
  }
  return { displayPhone: rawPhone.startsWith("0") ? rawPhone : `0${core || digits}`, phoneType: "Landline", isWhatsapp: false, cleanMobileDigits: "", badgeText: "Landline" };
}

function normalizeCategoryKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export const ExcelSheet: React.FC<ExcelSheetProps> = ({
  leads = [],
  rawLeads = [],
  data = [],
  requestedLimit = 50,
  hideLandlines = false,
  onToggleSelect,
  onToggleAll,
}) => {
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string>("ALL");

  const inputLeads = useMemo(() => {
    if (Array.isArray(leads) && leads.length > 0) return leads;
    if (Array.isArray(rawLeads) && rawLeads.length > 0) return rawLeads;
    if (Array.isArray(data) && data.length > 0) return data;
    return [];
  }, [leads, rawLeads, data]);

  const normalizedLeads = useMemo(() => {
    if (!Array.isArray(inputLeads)) return [];

    const seenIds = new Set<string>();

    return inputLeads
      .map((item, idx) => {
        const rawPhone = item.phone || "";
        const classified = classifyPhone(rawPhone);

        // Direct reading from Supabase fields
        const rawIndustry = (item.industry || "N/A").trim();
        const rawCategory = (
          item.category ||
          item.primaryCategory ||
          item.primary_category ||
          "N/A"
        ).trim();

        const hasGstin = !!item.gstin && item.gstin !== "N/A";
        const uniqueId = String(item.id || `lead-${idx}`);
        const gstStatus = hasGstin ? String(item.gstStatus || item.gstCheck || "UNVERIFIED") : "UNVERIFIED";
        const providedScore = Number(item.leadScore);
        const calculatedScore = Math.min(100,
          10 + // named company record
          (classified.phoneType === "Mobile" ? 30 : 0) +
          (item.isWhatsapp || item.is_whatsapp ? 15 : 0) +
          (item.website ? 15 : 0) +
          (hasGstin ? 20 : 0) +
          (gstStatus === "ACTIVE" ? 10 : 0) +
          (item.location || item.city ? 10 : 0)
        );
        const leadScore = Number.isFinite(providedScore) && providedScore > 0 ? providedScore : calculatedScore;

        return {
          id: uniqueId,
          companyName: item.companyName || item.company_name || "N/A",
          industry: rawIndustry,
          category: rawCategory,
          categoryKey: normalizeCategoryKey(rawCategory),
          location: item.location || item.city || "N/A",
          phone: classified.displayPhone,
          phoneType: classified.phoneType,
          isWhatsapp: classified.isWhatsapp,
          cleanMobileDigits: classified.cleanMobileDigits,
          badgeText: classified.badgeText,
          website: item.website || "",
          gstin: item.gstin || "N/A",
          gstStatus,
          leadScore,
          leadTier:
            item.leadTier ||
            (leadScore >= 70
              ? "A"
              : leadScore >= 45
              ? "B"
              : "C"),
          selected: !!item.selected,
        };
      })
      .filter((lead) => {
        if (seenIds.has(lead.id)) return false;
        seenIds.add(lead.id);
        return true;
      });
  }, [inputLeads]);

  const previousLeadCount = useRef<number>(inputLeads.length);

  useEffect(() => {
    if (inputLeads.length !== previousLeadCount.current) {
      setSelectedCategoryKey("ALL");
      previousLeadCount.current = inputLeads.length;
    }
  }, [inputLeads.length]);

  const masterCategories = useMemo(() => {
    const seen = new Map<string, string>();
    normalizedLeads.forEach((lead) => {
      if (lead.categoryKey && lead.categoryKey !== "n/a" && !seen.has(lead.categoryKey)) {
        seen.set(lead.categoryKey, lead.category);
      }
    });
    return Array.from(seen.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [normalizedLeads]);

  const filteredAndBalancedLeads = useMemo(() => {
    const pool = hideLandlines
      ? normalizedLeads.filter((lead) => lead.isWhatsapp)
      : normalizedLeads;

    if (selectedCategoryKey === "ALL") {
      return pool.slice(0, requestedLimit);
    }
    return pool
      .filter((lead) => lead.categoryKey === selectedCategoryKey)
      .slice(0, requestedLimit);
  }, [normalizedLeads, selectedCategoryKey, requestedLimit, hideLandlines]);

  const handleWhatsAppClick = (cleanDigits: string, companyName: string) => {
    if (!cleanDigits) return;
    const url = `https://wa.me/91${cleanDigits}?text=${encodeURIComponent(`Hello ${companyName}, we found your listing. We would like to connect with you.`)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const isAllSelected = filteredAndBalancedLeads.length > 0 && filteredAndBalancedLeads.every((lead) => lead.selected);

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between bg-white p-2 rounded border border-slate-300 shadow-2xs">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-xs font-semibold text-slate-600">Filter Category:</span>
          <select
            value={selectedCategoryKey}
            onChange={(e) => setSelectedCategoryKey(e.target.value)}
            className="text-xs border border-slate-300 rounded px-2 py-1 bg-slate-50 text-slate-800 font-medium focus:outline-none focus:border-emerald-500 cursor-pointer max-w-xs"
          >
            <option value="ALL">All Categories ({normalizedLeads.length})</option>
            {masterCategories.map(({ key, label }) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-500 font-medium">
          <div>Showing <span className="font-bold text-slate-700">{filteredAndBalancedLeads.length}</span> of {normalizedLeads.length} leads</div>
        </div>
      </div>

      <div className="w-full overflow-x-auto bg-white rounded border border-slate-300 shadow-2xs">
        <table className="w-full text-left border-collapse text-[11px] font-sans border-spacing-0 table-fixed">
          <thead>
            <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] tracking-tight h-7 border-b border-slate-300">
              <th className="w-8 text-center border-r border-slate-300 bg-slate-100">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={() => onToggleAll?.(filteredAndBalancedLeads.map((lead) => lead.id))}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600 cursor-pointer align-middle"
                />
              </th>
              <th className="w-48 px-2 border-r border-slate-300 font-bold truncate">COMPANY NAME</th>
              <th className="w-44 px-2 border-r border-slate-300 font-bold truncate text-indigo-700">INDUSTRY</th>
              <th className="w-36 px-2 border-r border-slate-300 font-bold truncate">CATEGORY</th>
              <th className="w-32 px-2 border-r border-slate-300 font-bold truncate">PHONE NUMBER</th>
              <th className="w-24 px-2 border-r border-slate-300 font-bold truncate">NUMBER TYPE</th>
              <th className="w-14 px-1.5 border-r border-slate-300 font-bold truncate">WEBSITE</th>
              <th className="w-36 px-2 border-r border-slate-300 font-bold truncate">LOCATION</th>
              <th className="w-16 px-1 text-center border-r border-slate-300 font-bold truncate">QUALITY</th>
              <th className="w-28 px-2 border-r border-slate-300 font-bold truncate">GSTIN</th>
              <th className="w-20 px-2 text-center font-bold truncate">GST CHECK</th>
            </tr>
          </thead>
          <tbody className="text-slate-800 font-normal">
            {filteredAndBalancedLeads.length > 0 ? (
              filteredAndBalancedLeads.map((lead, index) => (
                <tr key={`${lead.id}-${index}`} className={`h-7 border-b border-slate-200 hover:bg-slate-50 transition-colors ${lead.selected ? "bg-emerald-50/50" : index % 2 === 0 ? "bg-white" : "bg-slate-50/30"}`}>
                  <td className="text-center border-r border-slate-200 px-1">
                    <input type="checkbox" checked={!!lead.selected} onChange={() => onToggleSelect?.(lead.id)} className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600 cursor-pointer align-middle" />
                  </td>
                  <td className="px-2 font-semibold text-slate-900 truncate border-r border-slate-200" title={lead.companyName}>{lead.companyName}</td>
                  <td className="px-2 text-indigo-700 font-semibold truncate text-[10px] border-r border-slate-200 bg-indigo-50/30" title={lead.industry}>{lead.industry}</td>
                  <td className="px-2 text-slate-600 truncate text-[10px] border-r border-slate-200" title={lead.category}>{lead.category}</td>
                  <td className="px-2 font-mono text-slate-700 truncate border-r border-slate-200 font-medium">{lead.phone}</td>
                  <td className="px-1.5 whitespace-nowrap border-r border-slate-200">
                    {lead.isWhatsapp ? (
                      <button onClick={() => handleWhatsAppClick(lead.cleanMobileDigits, lead.companyName)} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 cursor-pointer transition-colors" title="Open WhatsApp Chat">
                        <MessageCircle className="w-2.5 h-2.5 fill-emerald-600 text-emerald-600" /> WhatsApp
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-[9px] text-slate-500 font-medium px-1.5 py-0.5 bg-slate-100 rounded">
                        <Phone className="w-2.5 h-2.5 text-slate-400" /> {lead.badgeText}
                      </span>
                    )}
                  </td>
                  <td className="px-1.5 truncate border-r border-slate-200" title={lead.website}>
                    {lead.website ? <a href={lead.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-blue-600 hover:underline text-[9px] font-medium"><Globe className="w-2.5 h-2.5 text-blue-500" /> Link</a> : <span className="text-slate-400 text-[9px]">N/A</span>}
                  </td>
                  <td className="px-2 text-slate-600 truncate text-[10px] border-r border-slate-200" title={lead.location}>{lead.location}</td>
                  <td className="px-1 text-center border-r border-slate-200">
                    <span className={`inline-flex min-w-7 justify-center rounded px-1 py-0.5 text-[9px] font-bold ${lead.leadTier === "A" ? "bg-emerald-100 text-emerald-700" : lead.leadTier === "B" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{lead.leadTier} {lead.leadScore || "-"}</span>
                  </td>
                  <td className="px-2 font-mono text-slate-600 text-[10px] border-r border-slate-200">
                    {lead.gstin !== "N/A" ? <span className="font-mono bg-slate-50 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200 font-semibold">{lead.gstin}</span> : <span className="text-slate-400 text-[9px]">N/A</span>}
                  </td>
                  <td className="px-2 text-center">
                    {lead.gstStatus === "ACTIVE" ? <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-2.5 h-2.5" /> ACTIVE</span> : <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-500" title="No verified GST data available"><HelpCircle className="w-2.5 h-2.5" /> UNVERIFIED</span>}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={11} className="p-8 text-center text-slate-500 bg-amber-50/40">
                  <div className="flex flex-col items-center justify-center gap-1.5">
                    <AlertTriangle className="w-6 h-6 text-amber-500" />
                    <span className="font-semibold text-slate-700 text-xs">No active records found matching criteria!</span>
                    <span className="text-[11px] text-slate-500">Kripya <b>&quot;Fetch Live Leads&quot;</b> par click karein.</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ExcelSheet;
