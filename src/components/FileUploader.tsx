"use client";
import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { parseXlsxFile } from "@/lib/parseXlsx";
import { PerfProfile } from "@/types/perf";

interface Props {
  onProfiles: (profiles: PerfProfile[]) => void;
  existingCount: number;
}

export function FileUploader({ onProfiles, existingCount }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function processFiles(files: FileList | File[]) {
    setError(null);
    setLoading(true);
    try {
      const xlsxFiles = Array.from(files).filter((f) =>
        f.name.match(/\.xlsx?$/i)
      );
      if (xlsxFiles.length === 0) {
        setError("No .xlsx files found.");
        return;
      }
      const profiles = await Promise.all(xlsxFiles.map(parseXlsxFile));
      onProfiles(profiles);
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer
        ${dragging ? "border-blue-400 bg-blue-950/30" : "border-zinc-600 hover:border-zinc-400"}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        processFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && processFiles(e.target.files)}
      />
      <Upload className="mx-auto mb-3 text-zinc-400" size={32} />
      <p className="text-zinc-300 font-medium">
        Drop performance sweep files here or click to browse
      </p>
      <p className="text-zinc-500 text-sm mt-1">
        Accepts .xlsx files — Model_X_profile_N format
        {existingCount > 0 && ` · ${existingCount} file(s) loaded`}
      </p>
      {loading && <p className="text-blue-400 text-sm mt-2">Parsing...</p>}
      {error && (
        <p className="text-red-400 text-sm mt-2 flex items-center justify-center gap-1">
          <X size={14} /> {error}
        </p>
      )}
    </div>
  );
}
