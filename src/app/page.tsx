"use client";
import { useState } from "react";
import { FileUploader } from "@/components/FileUploader";
import { CustomerView } from "@/components/CustomerView";
import { EngineerView } from "@/components/EngineerView";
import { PerfProfile } from "@/types/perf";
import { parseXlsxFile } from "@/lib/parseXlsx";
import { Trash2, Database } from "lucide-react";

type Tab = "customer" | "engineer";

const SAMPLE_FILES = [
  "Model_A_profile_1__Model A profile 1.xlsx",
  "Model_A_profile_3__Model A profile 3.xlsx",
  "Model_B_profile_1__Model B profile 1.xlsx",
  "Model_C_profile_1__Model C profile 1.xlsx",
  "Model_D_profile_1__Model D profile 1.xlsx",
];

export default function Home() {
  const [profiles, setProfiles] = useState<PerfProfile[]>([]);
  const [tab, setTab] = useState<Tab>("customer");
  const [loadingSample, setLoadingSample] = useState(false);

  function addProfiles(newProfiles: PerfProfile[]) {
    setProfiles((prev) => {
      const existing = new Set(prev.map((p) => p.fileName));
      return [...prev, ...newProfiles.filter((p) => !existing.has(p.fileName))];
    });
  }

  async function loadSampleData() {
    setLoadingSample(true);
    try {
      const loaded = await Promise.all(
        SAMPLE_FILES.map(async (name) => {
          const res = await fetch(`/sample_data/${name}`);
          const blob = await res.blob();
          const file = new File([blob], name.replace(/^[^_]+__/, ""), { type: blob.type });
          return parseXlsxFile(file);
        })
      );
      addProfiles(loaded);
    } finally {
      setLoadingSample(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Cerebras Inference Perf Explorer</h1>
          <p className="text-zinc-500 text-xs mt-0.5">Upload performance sweeps to compare models and profiles</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadSampleData}
            disabled={loadingSample}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-blue-400 transition-colors px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-blue-800 disabled:opacity-50"
          >
            <Database size={13} /> {loadingSample ? "Loading…" : "Load Sample Data"}
          </button>
          {profiles.length > 0 && (
            <button
              onClick={() => setProfiles([])}
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-red-800"
            >
              <Trash2 size={13} /> Clear All
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <FileUploader onProfiles={addProfiles} existingCount={profiles.length} />

        <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 w-fit border border-zinc-800">
          {(["customer", "engineer"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t
                  ? "bg-zinc-700 text-white shadow"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {t === "customer" ? "Customer / PM" : "Engineer"}
            </button>
          ))}
        </div>

        {tab === "customer" ? (
          <CustomerView profiles={profiles} />
        ) : (
          <EngineerView profiles={profiles} />
        )}
      </main>
    </div>
  );
}
