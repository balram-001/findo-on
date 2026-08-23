"use client";

import React, { useState } from "react";
import { Loader2, Filter, X } from "lucide-react";
import SidebarFilters from "@/components/SidebarFilters";
import ExcelSheet, { Lead } from "@/components/ExcelSheet";
import HeaderBar from "@/components/HeaderBar";

export default function DashboardPage() {
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [city, setCity] = useState<string>("");
  const [numLeads, setNumLeads] = useState<number | string>(50);
  const [hideLandlines, setHideLandlines] = useState<boolean>(false);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState<boolean>(false);

  const handleToggleSelect = (id: number | string) => {
    setLeads((prev) =>
      prev.map((lead) => (lead.id === id ? { ...lead, selected: !lead.selected } : lead))
    );
  };

  const handleToggleAll = (ids: Array<number | string>) => {
    const allSelected = ids.every((id) => leads.find((l) => l.id === id)?.selected);
    setLeads((prev) =>
      prev.map((lead) => (ids.includes(lead.id) ? { ...lead, selected: !allSelected } : lead))
    );
  };

  const handleRemoveDuplicates = () => {
    if (leads.length === 0) return;
    const seenNames = new Set<string>();
    const uniqueLeads = leads.filter((lead) => {
      const name = (lead.companyName || lead.company_name || "").toLowerCase().trim();
      if (!name || name === "n/a" || seenNames.has(name)) return false;
      seenNames.add(name);
      return true;
    });
    setLeads(uniqueLeads);
  };

  const handleVerifyWhatsApp = () => {
    if (leads.length === 0) return;
    setLeads((prev) =>
      prev.map((lead) => {
        const rawPhone = String(lead.phone || "").replace(/\D/g, "").replace(/^91/, "").replace(/^0+/, "");
        const isMobile = rawPhone.length === 10 && /^[6-9]/.test(rawPhone);
        return { ...lead, selected: isMobile };
      })
    );
  };

  const handleFetchLeads = async () => {
    if (!city.trim() && selectedIndustries.length === 0) {
      setLeads([]);
      alert("Kripya lead fetch karne se pehle City aur Industry dono select karein.");
      return;
    }

    if (!city.trim()) {
      setLeads([]);
      alert("Kripya lead fetch karne se pehle City select ya type karein.");
      return;
    }

    if (selectedIndustries.length === 0) {
      setLeads([]);
      alert("Kripya lead fetch karne se pehle kam se kam ek Industry select ya type karein.");
      return;
    }

    setLeads([]);
    setLoading(true);
    setMobileFilterOpen(false);

    try {
      const parsedLimit = parseInt(String(numLeads), 10) || 50;

      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          industries: selectedIndustries,
          city: city.trim(),
          limit: parsedLimit,
          maxResults: parsedLimit,
        }),
      });

      const data = await res.json();
      const fetchedData = data.success && Array.isArray(data.data) ? data.data : [];

      if (fetchedData.length > 0) {
        const seenNames = new Set<string>();
        const uniqueFetched = fetchedData.filter((item: Lead) => {
          const name = (item.companyName || item.company_name || "").toLowerCase().trim();
          if (!name || name === "n/a" || seenNames.has(name)) return false;
          seenNames.add(name);
          return true;
        });

        setLeads(uniqueFetched.slice(0, parsedLimit));
      } else {
        setLeads([]);
        alert("Is search ke liye koi leads nahi mile.");
      }
    } catch (err) {
      console.error("Fetch error:", err);
      alert("Leads fetch karne me dikkat aayi.");
    } finally {
      setLoading(false);
    }
  };

  const selectedCount = leads.filter((l) => l.selected).length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <HeaderBar
        selectedCount={selectedCount}
        totalCount={leads.length}
        leadsData={leads}
      />

      {/* Mobile Sticky Filter Trigger Button */}
      <div className="md:hidden flex items-center justify-between bg-white border-b border-slate-200 px-4 py-2.5 shadow-xs">
        <span className="text-xs font-bold text-slate-700">
          {leads.length} leads loaded
        </span>
        <button
          onClick={() => setMobileFilterOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold shadow-xs hover:bg-emerald-700 active:scale-95 transition-all"
        >
          <Filter className="w-3.5 h-3.5" />
          Filter & Search
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Desktop Sidebar */}
        <aside className="hidden md:block w-80 bg-white border-r border-slate-200 p-4 overflow-y-auto">
          <SidebarFilters
            selectedIndustries={selectedIndustries}
            setSelectedIndustries={setSelectedIndustries}
            city={city}
            setCity={setCity}
            numLeads={numLeads}
            setNumLeads={setNumLeads}
            hideLandlines={hideLandlines}
            setHideLandlines={setHideLandlines}
            totalLeads={leads.length}
            onFetchLeads={handleFetchLeads}
            onRemoveDuplicates={handleRemoveDuplicates}
            onVerifyWhatsApp={handleVerifyWhatsApp}
            onFiltersChanged={() => setLeads([])}
            loading={loading}
          />
        </aside>

        {/* Mobile Filter Modal / Drawer */}
        {mobileFilterOpen && (
          <div className="fixed inset-0 z-50 md:hidden bg-slate-900/60 backdrop-blur-xs flex justify-end">
            <div className="w-full max-w-xs bg-white h-full p-4 overflow-y-auto flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
              <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-100">
                <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Filter className="w-4 h-4 text-emerald-600" /> Filters & Limits
                </span>
                <button
                  onClick={() => setMobileFilterOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <SidebarFilters
                selectedIndustries={selectedIndustries}
                setSelectedIndustries={setSelectedIndustries}
                city={city}
                setCity={setCity}
                numLeads={numLeads}
                setNumLeads={setNumLeads}
                hideLandlines={hideLandlines}
                setHideLandlines={setHideLandlines}
                totalLeads={leads.length}
                onFetchLeads={handleFetchLeads}
                onRemoveDuplicates={handleRemoveDuplicates}
                onVerifyWhatsApp={handleVerifyWhatsApp}
                onFiltersChanged={() => setLeads([])}
                loading={loading}
              />
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 p-3 md:p-6 overflow-y-auto bg-slate-50">
          <div className="hidden md:flex mb-4 items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">
              {loading ? "Fetching live leads from Supabase..." : `${leads.length} leads loaded`}
            </span>
          </div>

          <ExcelSheet
            leads={leads}
            requestedLimit={parseInt(String(numLeads), 10) || 200}
            hideLandlines={hideLandlines}
            onToggleSelect={handleToggleSelect}
            onToggleAll={handleToggleAll}
            setLeads={setLeads}
          />
        </main>
      </div>

      {loading && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-900/40 backdrop-blur-xs p-4"
          role="status"
          aria-live="polite"
          aria-label="Fetching leads"
        >
          <section className="relative flex w-full max-w-sm flex-col items-center rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center shadow-xl">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
            </div>
            <h2 className="text-base font-bold text-slate-900">Preparing your lead sheet</h2>
            <p className="mt-1 text-xs text-slate-600 truncate max-w-xs">
              {selectedIndustries.length > 0 ? selectedIndustries.join(" + ") : "All industries"}
            </p>
            <p className="mt-2 text-[11px] text-slate-500">
              Verified leads live fetch ho rahe hain. Sheet auto update ho jayegi.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}