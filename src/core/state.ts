import type { ParsedLog } from "./parser";

export type NowState = {
  status: "idle" | "running";
};

export function detectNow(parsed: ParsedLog): NowState {
  if (parsed.raw.trim().length === 0) {
    return { status: "idle" };
  }

  return { status: "idle" };
}
