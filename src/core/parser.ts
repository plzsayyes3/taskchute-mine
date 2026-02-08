export type ParsedLog = {
  raw: string;
};

export function parseLog(markdownText: string): ParsedLog {
  return { raw: markdownText };
}
