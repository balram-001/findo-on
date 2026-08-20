"use client";

import React, { useState } from "react";
import {
  Radio,
  Trash2,
  ShieldCheck,
  Search,
  Loader2,
} from "lucide-react";

// Top 5 B2B Manufacturing Industries
const INDUSTRY_LIST = [
  "Automobile & Auto Components",
  "Pharmaceuticals & Healthcare Manufacturing",
  "Chemical Manufacturing & Allied Industries",
  "Packaging, Plastics & Paper Manufacturing",
  "Food Processing & Agro Manufacturing",
];

interface SidebarProps {
  selectedIndustries: string[];
  setSelectedIndustries: React.Dispatch<React.SetStateAction<string[]>>;
  city: string;
  setCity: (val: string) => void;
  numLeads: number | string;
  setNumLeads: React.Dispatch<React.SetStateAction<number | string>>;
  hideLandlines: boolean;
  setHideLandlines: (val: boolean) => void;
  totalLeads?: number;
  onFetchLeads?: () => void;
  onRemoveDuplicates?: () => void;
  onVerifyWhatsApp?: () => void;
  onFiltersChanged?: () => void;
  loading?: boolean;
}

export default function SidebarFilters({
  selectedIndustries,
  setSelectedIndustries,
  city,
  setCity,
  numLeads,
  setNumLeads,
  hideLandlines,
  setHideLandlines,
  totalLeads = 0,
  onFetchLeads,
  onRemoveDuplicates,
  onVerifyWhatsApp,
  onFiltersChanged,
  loading = false,
}: SidebarProps) {
  const [customIndustry, setCustomIndustry] = useState("");
  const [industryMenuOpen, setIndustryMenuOpen] = useState(false);

  const updateIndustries = (nextIndustries: string[]) => {
    setSelectedIndustries(nextIndustries);
    onFiltersChanged?.();
  };

  const addCustomIndustry = () => {
    const cleaned = customIndustry.trim();
    if (!cleaned) return;
    if (!selectedIndustries.includes(cleaned)) updateIndustries([...selectedIndustries, cleaned]);
    setCustomIndustry("");
    setIndustryMenuOpen(false);
  };

  const addSelectedIndustry = (industry: string) => {
    if (!selectedIndustries.includes(industry)) updateIndustries([...selectedIndustries, industry]);
    setCustomIndustry("");
    setIndustryMenuOpen(false);
  };

  return (
    <aside className="w-80 bg-white border-r border-slate-200 p-5 flex flex-col space-y-6 overflow-y-auto min-h-screen">
      <div>
        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
          Search Filters
        </label>

        <div className="space-y-4">

          {/* Target Industry Filter */}
          <div>
            <span className="text-xs font-semibold text-slate-700">
              Target Industry
            </span>

            <div className="relative mt-1">
              <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white p-1.5 focus-within:ring-2 focus-within:ring-slate-900">
                {selectedIndustries.map((industry) => (
                  <button key={industry} type="button" onClick={() => updateIndustries(selectedIndustries.filter((selected) => selected !== industry))} disabled={loading} className="max-w-full truncate rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-60" title={`Remove ${industry}`}>
                    {industry} ×
                  </button>
                ))}
                <input value={customIndustry} onChange={(e) => setCustomIndustry(e.target.value)} onFocus={() => setIndustryMenuOpen(false)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomIndustry(); } }} placeholder={selectedIndustries.length ? "Add another..." : "Type an industry or choose..."} disabled={loading} className="min-w-32 flex-1 border-0 bg-transparent px-1 py-1 text-xs text-slate-800 outline-none" />
                <button type="button" onClick={() => setIndustryMenuOpen((open) => !open)} disabled={loading} aria-label="Choose industry" className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-60">
                  <svg viewBox="0 0 20 20" className={`h-4 w-4 transition-transform ${industryMenuOpen ? "rotate-180" : ""}`} fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.09 1.03l-4.25 4.5a.75.75 0 0 1-1.09 0l-4.25-4.5a.75.75 0 0 1 .02-1.05Z" clipRule="evenodd" /></svg>
                </button>
              </div>
              {industryMenuOpen && (
                <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                  {INDUSTRY_LIST.map((industry) => (
                    <button key={industry} type="button" onClick={() => addSelectedIndustry(industry)} className="w-full rounded px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50">{industry}</button>
                  ))}
                </div>
              )}
            </div>
            <p className="mt-1 text-[10px] text-slate-500">Type karke Enter dabayein, ya arrow se select karein. 2 industries par leads equal split hongi.</p>
          </div>

          {/* City Input */}
          <div>
            <span className="text-xs font-semibold text-slate-700">
              Location / City
            </span>

            <div className="mt-1">
              <input
                type="text"
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  onFiltersChanged?.();
                }}
                placeholder="e.g. Indore, Pithampur, Dewas"
                className="w-full border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 font-medium"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {["Surat", "Mumbai", "Indore"].map((suggestedCity) => (
                  <button key={suggestedCity} type="button" onClick={() => { setCity(suggestedCity); onFiltersChanged?.(); }} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-100">{suggestedCity}</button>
                ))}
              </div>
            </div>
          </div>

          {/* No. of Leads */}
          <div>
            <span className="text-xs font-semibold text-slate-700">
              Maximum Leads to Fetch
            </span>

            <div className="mt-1">
              <input
                type="number"
                min={1}
                max={500}
                value={numLeads}
                onWheel={(event) => {
                  event.preventDefault();
                  event.currentTarget.blur();
                }}
                onChange={(e) =>
                  setNumLeads(
                    e.target.value
                      ? Number(e.target.value)
                      : ""
                  )
                }
                placeholder="e.g. 200"
                className="w-full border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 font-medium"
              />
              <p className="mt-1 text-[10px] leading-4 text-slate-500">
                Selected city ki available, verified leads dikhengi. Itni leads available hui to exact entered count milega.
              </p>
            </div>
          </div>

          {/* Fetch Leads Button */}
          <button
            onClick={onFetchLeads}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-3 rounded-lg transition shadow-sm disabled:opacity-50 cursor-pointer active:scale-95"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Fetching Live Leads...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Fetch Live Leads</span>
              </>
            )}
          </button>

          {/* Live Lead Count Status */}
          {!loading && totalLeads > 0 && (
            <div className="flex items-center gap-2 text-emerald-600 text-xs font-semibold pt-1">
              <Radio className="w-3.5 h-3.5 animate-pulse" />

              <span>
                {totalLeads} leads live sheet mein updated
              </span>
            </div>
          )}
        </div>
      </div>

      <hr className="border-slate-200" />

      {/* Actions & Clean-up Section */}
      <div className="space-y-3">
        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          Actions & Clean-up
        </label>

        {/* Remove Duplicates */}
        <button
          onClick={onRemoveDuplicates}
          className="w-full flex items-center justify-center gap-2 border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-xs py-2.5 rounded-lg transition shadow-sm active:scale-95 cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5 text-slate-500" />
          Remove Duplicates
        </button>

        {/* Hide Landlines Toggle */}
        <div className="flex items-center justify-between border border-slate-200 p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100/80 transition cursor-pointer">
          <span className="text-xs font-medium text-slate-700">
            Hide Landlines
          </span>

          <input
            type="checkbox"
            checked={hideLandlines}
            onChange={(e) =>
              setHideLandlines(e.target.checked)
            }
            className="w-4 h-4 accent-slate-900 rounded cursor-pointer"
          />
        </div>

        {/* Verify WhatsApp Numbers */}
        <button
          onClick={onVerifyWhatsApp}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-3 rounded-lg transition shadow-sm active:scale-95 cursor-pointer"
        >
          <ShieldCheck className="w-4 h-4" />

          Select Valid Mobile Numbers
        </button>
      </div>
    </aside>
  );
}
