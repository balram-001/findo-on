"use client";

import React, { useState, useRef } from "react";
import {
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Filter,
} from "lucide-react";
import SidebarFilters from "@/components/SidebarFilters";
import ExcelSheet, { Lead } from "@/components/ExcelSheet";
import HeaderBar from "@/components/HeaderBar";
import GoogleFeedbackModal from "@/components/GoogleFeedbackModal";
import FloatingFeedbackButton from "@/components/FloatingFeedbackButton";

const GOOGLE_FORM_URL = "https://forms.gle/H9jrRe7GNAKrDimv8";

export default function DashboardPage() {
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [city, setCity] = useState<string>("");
  const [numLeads, setNumLeads] = useState<number | string>(50);
  const [hideLandlines, setHideLandlines] = useState<boolean>(false);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);

  // Feedback Modal State & Ref for Callback Execution
  const [showFeedbackModal, setShowFeedbackModal] = useState<boolean>(false);
  const pendingDownloadRef = useRef<(() => void) | null>(null);

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

    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }

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

      if (!data.success) {
        setLeads([]);
        alert(`API Error: ${data.error || "Failed to fetch data"}`);
        return;
      }

      const fetchedData = Array.isArray(data.data) ? data.data : [];

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
        alert("Is search ke liye database mein koi leads match nahi hue.");
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("Fetch error:", errorMsg);
      alert(`Network / Fetch error: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  // Jab user HeaderBar se Export click karega
  const handleExportRequested = (callbackToDownload: () => void) => {
    const isFeedbackGiven =
      typeof window !== "undefined" &&
      localStorage.getItem("leadflow_feedback_given");

    if (!isFeedbackGiven) {
      pendingDownloadRef.current = callbackToDownload;
      setShowFeedbackModal(true);
      return;
    }

    callbackToDownload();
  };

  // Feedback form submit hote hi auto-download trigger
  const handleFeedbackSuccess = () => {
    setShowFeedbackModal(false);
    if (pendingDownloadRef.current) {
      pendingDownloadRef.current();
      pendingDownloadRef.current = null;
    }
  };

  const selectedCount = leads.filter((l) => l.selected).length;

  return (
    <div className="h-screen w-screen bg-slate-50 flex flex-col font-sans overflow-hidden">
      <HeaderBar
        selectedCount={selectedCount}
        totalCount={leads.length}
        leadsData={leads}
        onExportCheck={handleExportRequested}
      />

      <FloatingFeedbackButton formUrl={GOOGLE_FORM_URL} />

      {/* Top Controls Bar */}
      <div className="bg-white border-b border-slate-200 px-3 py-2 flex items-center justify-between shrink-0 shadow-2xs z-20">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold shadow-2xs border border-slate-200 cursor-pointer transition-all active:scale-95"
            title={isSidebarOpen ? "Collapse Filter Panel" : "Open Filter Panel"}
          >
            {isSidebarOpen ? (
              <>
                <PanelLeftClose className="w-4 h-4 text-slate-600" />
                <span className="text-[11px]">Hide Filters</span>
              </>
            ) : (
              <>
                <PanelLeftOpen className="w-4 h-4 text-emerald-600" />
                <span className="text-[11px] font-bold text-slate-800">Show Filters</span>
              </>
            )}
          </button>

          <span className="text-xs font-semibold text-slate-600 truncate">
            {loading ? "Fetching live leads..." : `${leads.length} leads loaded`}
          </span>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        <aside
          className={`fixed md:relative z-30 top-0 bottom-0 left-0 bg-white border-r border-slate-200 transition-all duration-300 ease-in-out flex flex-col shadow-xl md:shadow-none ${
            isSidebarOpen
              ? "w-80 translate-x-0"
              : "w-0 -translate-x-full md:translate-x-0 md:w-0 overflow-hidden border-none opacity-0"
          }`}
        >
          <div className="w-80 h-full p-4 overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-emerald-600" /> Search Filters
              </span>
              <button
                type="button"
                onClick={() => setIsSidebarOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                title="Close"
              >
                <PanelLeftClose className="w-4 h-4" />
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
        </aside>

        {isSidebarOpen && (
          <div
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs z-20 md:hidden"
          />
        )}

        <main className="flex-1 p-2 sm:p-4 overflow-y-auto bg-slate-50 w-full">
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

      <GoogleFeedbackModal
        isOpen={showFeedbackModal}
        formUrl={GOOGLE_FORM_URL}
        onSuccess={handleFeedbackSuccess}
      />

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
