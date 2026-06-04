import * as XLSX from "xlsx";
import { PerfProfile, PerfRow } from "@/types/perf";
import { profileLabel } from "@/lib/profileLabels";

function parseFileName(name: string): { model: string; profile: string; profileNum: string } {
  const cleaned = name.replace(/\.xlsx$/i, "");
  const m = cleaned.match(/model[_ ]([A-Za-z0-9]+)[_ ]profile[_ ](\d+)/i);
  if (m) {
    const num = m[2];
    return { model: `Model ${m[1]}`, profile: profileLabel(num), profileNum: num };
  }
  return { model: cleaned, profile: "", profileNum: "" };
}

export async function parseXlsxFile(file: File): Promise<PerfProfile> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: (string | number | null)[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
  });

  // Find header row (row with "Input Length" or "Batch Size")
  let headerIdx = -1;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].some((c) => typeof c === "string" && c.includes("Batch Size"))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) throw new Error(`No header row found in ${file.name}`);

  const headers = raw[headerIdx] as string[];
  const col = (name: string) => headers.findIndex((h) => h && h.includes(name));

  const iInputLength = col("Input Length");
  const iOutputLength = col("Output Length");
  const iCache = col("Cache %");
  const iBatchSize = col("Batch Size");
  const iMaxMs = col("Max number of milliseconds");
  const iTargetMs = col("Target Max");
  const iPromptOnly = col("Prompt only Throughput");
  const iGenOnly = col("Gen only Throughput");
  const iThroughput = col("Throughput (t/s)");
  const iThroughputBox = col("Throughput / box");
  const iUncached = col("Uncached Throughput (t/s)");
  const iUncachedBox = col("Uncached Throughput / box");
  const iCached = col("Cached Throughput (t/s)");
  const iCachedBox = col("Cached Throughput / box");
  const iTtft = col("TTFT");
  const iRealPrompt = col("Real Prompt Speed");
  const iPromptQueue = col("Prompt Speed with Queueing");
  const iGenSpeed = col("Gen Speed");
  const iRpm = col("RPM");

  let inputLength = 0;
  let outputLength = 0;
  let cachePercent = 0;
  const rows: PerfRow[] = [];

  for (let i = headerIdx + 1; i < raw.length; i++) {
    const row = raw[i];
    const batchSize = row[iBatchSize] as number;
    if (batchSize == null || isNaN(Number(batchSize))) continue;

    if (row[iInputLength] != null) inputLength = Number(row[iInputLength]);
    if (row[iOutputLength] != null) outputLength = Number(row[iOutputLength]);
    if (row[iCache] != null) cachePercent = Number(row[iCache]);

    rows.push({
      batchSize: Number(batchSize),
      maxMs: Number(row[iMaxMs]) || 0,
      targetMaxMs: Number(row[iTargetMs]) || 0,
      promptOnlyThroughput: Number(row[iPromptOnly]) || 0,
      genOnlyThroughput: Number(row[iGenOnly]) || 0,
      throughput: Number(row[iThroughput]) || 0,
      throughputPerBox: Number(row[iThroughputBox]) || 0,
      uncachedThroughput: Number(row[iUncached]) || 0,
      uncachedThroughputPerBox: Number(row[iUncachedBox]) || 0,
      cachedThroughput: Number(row[iCached]) || 0,
      cachedThroughputPerBox: Number(row[iCachedBox]) || 0,
      ttftMs: Number(row[iTtft]) || 0,
      realPromptSpeed: Number(row[iRealPrompt]) || 0,
      promptSpeedWithQueueing: Number(row[iPromptQueue]) || 0,
      genSpeed: Number(row[iGenSpeed]) || 0,
      rpm: Number(row[iRpm]) || 0,
    });
  }

  const { model, profile, profileNum } = parseFileName(file.name);
  return {
    model,
    profile,
    profileNum,
    inputLength,
    outputLength,
    cachePercent,
    fileName: file.name,
    rows,
  };
}
