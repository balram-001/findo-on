"use client";

import React, { useState } from "react";
import { Loader2 } from "lucide-react";
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

  // Fixed Fetch Leads Logic (Industry + Category Payload)
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

    setLoading(true);

    try {
      const parsedLimit = parseInt(String(numLeads), 10) || 50;
      const industriesToFetch = selectedIndustries.length > 0 ? selectedIndustries : [""];
      const perIndustryLimit = Math.ceil(parsedLimit / industriesToFetch.length);
      // Fetch a duplicate buffer. After browser-side cleanup we can still show
      // the exact number requested whenever enough unique leads exist.
      const perIndustryFetchLimit = Math.min(perIndustryLimit * 2, 500);
      const responses = await Promise.all(
        industriesToFetch.map(async (industry) => {
          const res = await fetch("/api/scrape", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ industry, category: industry, city: city.trim(), limit: perIndustryFetchLimit, maxResults: perIndustryFetchLimit }),
          });
          return res.json();
        })
      );
      const resultGroups = responses
        .map((data) => (data.success && Array.isArray(data.data) ? data.data : []))
        .filter((group) => group.length > 0);
      // When two or more industries are chosen, use the same number from each
      // response so the sheet is balanced instead of one industry dominating.
      const perIndustryReturned = resultGroups.length > 1
        ? Math.min(perIndustryLimit, ...resultGroups.map((group) => group.length))
        : Math.min(perIndustryLimit, resultGroups[0]?.length || 0);
      const fetchedData = perIndustryReturned
        ? resultGroups.flatMap((group) => group.slice(0, perIndustryReturned))
        : resultGroups.flat();

      if (fetchedData.length > 0) {
        const seenNames = new Set<string>();
        const uniqueFetched = fetchedData.filter((item: Lead) => {
          const name = (item.companyName || item.company_name || "").toLowerCase().trim();
          if (!name || name === "n/A" || seenNames.has(name)) return false;
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

      <div className="flex-1 flex overflow-hidden">
        <div className="w-80 bg-white border-r border-slate-200 p-4 overflow-y-auto">
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

        <main className="flex-1 p-6 overflow-y-auto bg-slate-50">
          <div className="mb-4 flex items-center justify-between">
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
          className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-50"
          role="status"
          aria-live="polite"
          aria-label="Fetching leads"
        >
          <div
            className="absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                "linear-gradient(#dbe4ef 1px, transparent 1px), linear-gradient(90deg, #dbe4ef 1px, transparent 1px)",
              backgroundSize: "36px 36px",
            }}
          />
          <section className="relative mx-5 flex w-full max-w-md flex-col items-center rounded-2xl border border-slate-200 bg-white px-8 py-10 text-center shadow-xl">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <Loader2 className="h-9 w-9 animate-spin" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Preparing your Excel lead sheet</h2>
            <p className="mt-2 text-sm text-slate-600">
              {selectedIndustries.length > 0 ? selectedIndustries.join(" + ") : "All industries"} · {city.trim() || "All cities"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Verified leads are being fetched. The sheet will open automatically.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
