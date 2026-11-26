import type { SandboxOptions } from "./sandbox";

const intFromEnv = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`[WARN] Ignoring invalid ${name}="${raw}", using ${fallback}`);
    return fallback;
  }
  return Math.floor(n);
};

export function getSandboxOptions(): Required<SandboxOptions> {
  return {
    timeoutMs: intFromEnv("CODEMODE_TIMEOUT_MS", 60_000),
    cpuMs: intFromEnv("CODEMODE_CPU_MS", 5_000),
    memoryBytes: intFromEnv("CODEMODE_MEMORY_MB", 64) * 1024 * 1024,
    maxToolCalls: intFromEnv("CODEMODE_MAX_TOOL_CALLS", 50),
    maxOutputChars: intFromEnv("CODEMODE_MAX_OUTPUT_CHARS", 100_000),
  };
}
