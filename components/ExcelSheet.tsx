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
  ChevronDown,
  ChevronRight,
  Building2,
  Folder,
  MapPin,
  ExternalLink,
} from "lucide-react";

export interface Lead {
  id: string | number;
  companyName?: string;
  company_name?: string;
  phone?: string;
  phoneType?: string;
  phone_type?: string;
  phoneSource?: "official_website" | "maps_fallback" | string;
  phoneVerifiedAt?: string;
  isWhatsapp?: boolean;
  is_whatsapp?: boolean;
  whatsappLink?: string;
  whatsapp_link?: string;
  website?: string;
  websiteKind?: "official" | "marketplace" | "short_link" | "missing" | "invalid";
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

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

type WebsiteKind = "official" | "marketplace" | "short_link" | "missing" | "invalid";

function classifyWebsite(rawWebsite?: string, suppliedKind?: Lead["websiteKind"]): { url: string; kind: WebsiteKind } {
  const value = rawWebsite?.trim();
  if (!value || value.toLowerCase() === "n/a") return { url: "", kind: "missing" };

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { url: "", kind: "invalid" };
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const isMarketplace = ["indiamart.com", "tradeindia.com", "justdial.com", "exportersindia.com", "facebook.com", "instagram.com", "linkedin.com"]
      .some((domain) => host === domain || host.endsWith(`.${domain}`));
    const isShortLink = ["page.link", "bit.ly", "tinyurl.com", "t.co", "goo.gl"]
      .some((domain) => host === domain || host.endsWith(`.${domain}`));
    return { url: parsed.toString(), kind: suppliedKind || (isMarketplace ? "marketplace" : isShortLink ? "short_link" : "official") };
  } catch {
    return { url: "", kind: "invalid" };
  }
}

function WebsiteLink({ website, websiteKind, compact = false }: { website: string; websiteKind: WebsiteKind; compact?: boolean }) {
  if (websiteKind === "missing") return <span className="text-slate-400 text-[9px] font-mono select-none" title="No website available">N/A</span>;
  if (websiteKind === "invalid") return <span className="text-rose-600 text-[9px] font-semibold" title="Invalid website link">Invalid link</span>;

  const isOfficial = websiteKind === "official";
  const label = isOfficial ? (compact ? "Website" : "Official") : websiteKind === "marketplace" ? "Marketplace" : "Short link";
  const color = isOfficial ? "text-blue-600 hover:underline" : "text-amber-700 hover:underline";
  const title = isOfficial ? "Open official website" : websiteKind === "marketplace" ? "Open marketplace listing — not an official website" : "Open short link — verify before use";

  return (
    <a href={website} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-0.5 text-[9px] font-medium ${color}`} title={title}>
      <Globe className="w-2.5 h-2.5" /> {label}
    </a>
  );
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
  const [selectedFilterKey, setSelectedFilterKey] = useState<string>("ALL");
  const [selectedFilterLabel, setSelectedFilterLabel] = useState<string>("All Loaded Leads");
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [expandedIndustries, setExpandedIndustries] = useState<Record<string, boolean>>({});

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

        const rawIndustry = (item.industry || "N/A").trim();
        const rawCategory = (
          item.category ||
          item.primaryCategory ||
          item.primary_category ||
          "N/A"
        ).trim();

        const websiteInfo = classifyWebsite(item.website, item.websiteKind);

        const hasGstin = !!item.gstin && item.gstin !== "N/A";
        const uniqueId = String(item.id || `lead-${idx}`);
        const gstStatus = hasGstin ? String(item.gstStatus || item.gstCheck || "UNVERIFIED") : "UNVERIFIED";
        const providedScore = Number(item.leadScore);
        const calculatedScore = Math.min(100,
          10 +
          (classified.phoneType === "Mobile" ? 30 : 0) +
          (item.isWhatsapp || item.is_whatsapp ? 15 : 0) +
          (websiteInfo.kind === "official" ? 15 : 0) +
          (hasGstin ? 20 : 0) +
          (gstStatus === "ACTIVE" ? 10 : 0) +
          (item.location || item.city ? 10 : 0)
        );
        const leadScore = Number.isFinite(providedScore) && providedScore > 0 ? providedScore : calculatedScore;

        return {
          id: uniqueId,
          companyName: item.companyName || item.company_name || "N/A",
          industry: rawIndustry,
          industryKey: normalizeKey(rawIndustry),
          category: rawCategory,
          categoryKey: normalizeKey(rawCategory),
          location: item.location || item.city || "N/A",
          phone: classified.displayPhone,
          phoneType: classified.phoneType,
          phoneSource: item.phoneSource || "maps_fallback",
          isWhatsapp: classified.isWhatsapp,
          cleanMobileDigits: classified.cleanMobileDigits,
          badgeText: classified.badgeText,
          website: websiteInfo.url,
          websiteKind: websiteInfo.kind,
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
      setSelectedFilterKey("ALL");
      setSelectedFilterLabel("All Loaded Leads");
      previousLeadCount.current = inputLeads.length;
    }
  }, [inputLeads.length]);

  const nestedStructure = useMemo(() => {
    const map = new Map<string, {
      industryLabel: string;
      count: number;
      subcategories: Map<string, { label: string; count: number }>;
    }>();

    normalizedLeads.forEach((lead) => {
      const indKey = lead.industryKey;
      if (!indKey || indKey === "n/a") return;

      if (!map.has(indKey)) {
        map.set(indKey, {
          industryLabel: lead.industry,
          count: 0,
          subcategories: new Map(),
        });
      }

      const indData = map.get(indKey)!;
      indData.count += 1;

      const catKey = lead.categoryKey;
      if (catKey && catKey !== "n/a") {
        const subMap = indData.subcategories;
        if (!subMap.has(catKey)) {
          subMap.set(catKey, { label: lead.category, count: 0 });
        }
        subMap.get(catKey)!.count += 1;
      }
    });

    return Array.from(map.entries()).map(([indKey, data]) => ({
      indKey,
      industryLabel: data.industryLabel,
      count: data.count,
      subcategories: Array.from(data.subcategories.entries()).map(([catKey, subData]) => ({
        catKey,
        label: subData.label,
        count: subData.count,
      })),
    }));
  }, [normalizedLeads]);

  const filteredAndBalancedLeads = useMemo(() => {
    const pool = hideLandlines
      ? normalizedLeads.filter((lead) => lead.isWhatsapp)
      : normalizedLeads;

    if (selectedFilterKey === "ALL") {
      return pool.slice(0, requestedLimit);
    }

    if (selectedFilterKey.startsWith("IND:")) {
      const targetIndKey = selectedFilterKey.replace("IND:", "");
      return pool
        .filter((lead) => lead.industryKey === targetIndKey)
        .slice(0, requestedLimit);
    }

    if (selectedFilterKey.startsWith("CAT:")) {
      const targetCatKey = selectedFilterKey.replace("CAT:", "");
      return pool
        .filter((lead) => lead.categoryKey === targetCatKey)
        .slice(0, requestedLimit);
    }

    return pool.slice(0, requestedLimit);
  }, [normalizedLeads, selectedFilterKey, requestedLimit, hideLandlines]);

  const toggleAccordion = (indKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedIndustries((prev) => ({
      ...prev,
      [indKey]: !prev[indKey],
    }));
  };

  const handleSelectFilter = (key: string, label: string) => {
    setSelectedFilterKey(key);
    setSelectedFilterLabel(label);
    setIsDropdownOpen(false);
  };

  const handleWhatsAppClick = (cleanDigits: string, companyName: string) => {
    if (!cleanDigits) return;
    const url = `https://wa.me/91${cleanDigits}?text=${encodeURIComponent(`Hello ${companyName}, we found your listing. We would like to connect with you.`)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const isAllSelected = filteredAndBalancedLeads.length > 0 && filteredAndBalancedLeads.every((lead) => lead.selected);

  return (
    <div className="w-full space-y-3">
      {/* FILTER BAR (Dropdown Selector) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white p-2.5 rounded-lg border border-slate-300 shadow-2xs gap-2">
        <div className="flex items-center gap-2 relative w-full sm:w-auto" ref={dropdownRef}>
          <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span className="text-xs font-semibold text-slate-600 shrink-0">Filter View:</span>

          <div className="relative flex-1 sm:flex-initial">
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="text-xs w-full border border-slate-300 rounded px-2.5 py-1.5 bg-slate-50 text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 cursor-pointer flex items-center justify-between gap-3 min-w-[240px] sm:min-w-[280px] shadow-2xs hover:bg-slate-100 transition-colors"
            >
              <span className="truncate">{selectedFilterLabel} ({filteredAndBalancedLeads.length})</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            </button>

            {isDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-full sm:w-80 bg-white border border-slate-200 rounded-lg shadow-xl z-50 py-1.5 max-h-80 overflow-y-auto text-xs">
                <button
                  type="button"
                  onClick={() => handleSelectFilter("ALL", "All Loaded Leads")}
                  className={`w-full text-left px-3 py-2 font-bold hover:bg-slate-100 flex items-center justify-between border-b border-slate-100 ${
                    selectedFilterKey === "ALL" ? "text-emerald-700 bg-emerald-50/60" : "text-slate-800"
                  }`}
                >
                  <span>All Loaded Leads</span>
                  <span className="text-[10px] bg-slate-200 px-1.5 py-0.5 rounded text-slate-600 font-semibold">{normalizedLeads.length}</span>
                </button>

                <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/80">
                  Main Industries & Sub-Categories
                </div>

                {nestedStructure.map(({ indKey, industryLabel, count, subcategories }) => {
                  const isExpanded = !!expandedIndustries[indKey];
                  const indFilterKey = `IND:${indKey}`;
                  const isSelected = selectedFilterKey === indFilterKey;

                  return (
                    <div key={indKey} className="border-b border-slate-50 last:border-0">
                      <div
                        className={`flex items-center justify-between px-3 py-2 hover:bg-slate-50 transition-colors cursor-pointer ${
                          isSelected ? "bg-emerald-50/80 text-emerald-800 font-bold" : "text-slate-700 font-semibold"
                        }`}
                        onClick={() => handleSelectFilter(indFilterKey, `Industry: ${industryLabel}`)}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <Building2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span className="truncate">{industryLabel}</span>
                          <span className="text-[10px] font-normal text-slate-500">({count})</span>
                        </div>

                        {subcategories.length > 0 && (
                          <button
                            type="button"
                            onClick={(e) => toggleAccordion(indKey, e)}
                            className="p-1 hover:bg-slate-200 rounded text-slate-500 shrink-0 ml-1 cursor-pointer"
                            title="Toggle Sub-categories"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5 text-indigo-600" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>

                      {isExpanded && subcategories.length > 0 && (
                        <div className="bg-slate-50/70 border-l-2 border-indigo-400 pl-2 py-0.5 ml-3 my-0.5 space-y-0.5">
                          {subcategories.map(({ catKey, label, count: subCount }) => {
                            const catFilterKey = `CAT:${catKey}`;
                            const isSubSelected = selectedFilterKey === catFilterKey;

                            return (
                              <button
                                key={catKey}
                                type="button"
                                onClick={() => handleSelectFilter(catFilterKey, `Category: ${label}`)}
                                className={`w-full text-left px-2 py-1 text-[11px] hover:bg-indigo-50 rounded flex items-center justify-between transition-colors ${
                                  isSubSelected ? "text-indigo-700 font-bold bg-indigo-100/60" : "text-slate-600 font-normal"
                                }`}
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  <Folder className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span className="truncate">{label}</span>
                                </div>
                                <span className="text-[9px] text-slate-400 font-mono">({subCount})</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="text-[11px] text-slate-500 font-medium">
          Showing <span className="font-bold text-slate-700">{filteredAndBalancedLeads.length}</span> of {normalizedLeads.length} leads
        </div>
      </div>

      {/* 📱 MOBILE VIEW: COMPACT INTERACTIVE LEAD CARDS (< 768px) */}
      <div className="block md:hidden space-y-2.5">
        {filteredAndBalancedLeads.length > 0 ? (
          filteredAndBalancedLeads.map((lead) => (
            <div
              key={lead.id}
              className={`p-3.5 rounded-xl border bg-white shadow-2xs space-y-2 transition-all ${
                lead.selected ? "border-emerald-500 bg-emerald-50/30" : "border-slate-200"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!lead.selected}
                    onChange={() => onToggleSelect?.(lead.id)}
                    className="w-4 h-4 rounded border-slate-300 text-emerald-600 cursor-pointer"
                  />
                  <h3 className="font-bold text-slate-900 text-xs leading-tight">{lead.companyName}</h3>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                  lead.leadTier === "A" ? "bg-emerald-100 text-emerald-700" : lead.leadTier === "B" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
                }`}>
                  Tier {lead.leadTier}
                </span>
              </div>

              <div className="text-[10px] space-y-1 text-slate-600">
                <div className="text-indigo-700 font-semibold">{lead.industry} · <span className="text-slate-500 font-normal">{lead.category}</span></div>
                <div className="flex items-center gap-1 text-slate-500 truncate">
                  <MapPin className="w-3 h-3 shrink-0" />
                  <span className="truncate">{lead.location}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                <div className="font-mono text-xs font-semibold text-slate-800">
                  {lead.phone}
                </div>
                <div className="flex items-center gap-1.5">
                  <WebsiteLink website={lead.website} websiteKind={lead.websiteKind} compact />

                  {lead.isWhatsapp ? (
                    <button
                      onClick={() => handleWhatsAppClick(lead.cleanMobileDigits, lead.companyName)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 text-white shadow-xs hover:bg-emerald-600 active:scale-95 transition-all cursor-pointer"
                    >
                      <MessageCircle className="w-3.5 h-3.5 fill-white text-white" /> WhatsApp
                    </button>
                  ) : (
                    <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
                      Landline
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="p-8 text-center text-slate-500 bg-amber-50/40 rounded-xl border border-amber-200">
            <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto mb-1" />
            <span className="font-semibold text-slate-700 text-xs block">No leads found!</span>
            <span className="text-[11px] text-slate-500">Kripya Search & Filter karein.</span>
          </div>
        )}
      </div>

      {/* 💻 DESKTOP VIEW: SPREADSHEET TABLE (≥ 768px) */}
      <div className="hidden md:block w-full overflow-x-auto bg-white rounded border border-slate-300 shadow-2xs">
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
              <th className="w-20 px-1.5 border-r border-slate-300 font-bold truncate" title="Official website or clearly labelled source link">WEB / SOURCE</th>
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
                  <td className="px-2 font-mono text-slate-700 truncate border-r border-slate-200 font-medium" title={lead.phoneSource === "official_website" ? "Verified from official website" : "Maps/legacy fallback number"}>{lead.phone}</td>
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
                  
                  <td className="px-1.5 truncate border-r border-slate-200" title={lead.website || "Not Available"}>
                    <WebsiteLink website={lead.website} websiteKind={lead.websiteKind} />
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
