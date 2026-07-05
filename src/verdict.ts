/** An explicit verdict marker parsed from a required artifact. */
export interface VerdictMarker {
  verdict: 'done' | 'blocked';
  pass: number;
  summary: string | null;
}

const MARKER_PATTERN = /^pi-herd-verdict:\s*(done|blocked)\s+pass=(\d+)(?:\s+(.*\S))?\s*$/gim;

/** Parse the last pi-herd verdict marker line in artifact text, returning null when no usable marker is present. */
export function parseVerdictMarker(text: string): VerdictMarker | null {
  let last: VerdictMarker | null = null;
  for (const match of text.matchAll(MARKER_PATTERN)) {
    const pass = Number.parseInt(match[2]!, 10);
    if (!Number.isSafeInteger(pass) || pass < 1) continue;
    last = { verdict: match[1]!.toLowerCase() as VerdictMarker['verdict'], pass, summary: match[3]?.trim() || null };
  }
  return last;
}

/** Build the one-line verdict instruction appended to worker prompts for a pass. */
export function verdictInstruction(artifactPath: string, pass: number): string {
  return `[pi-herd] When pass ${pass} is complete, end ${artifactPath} with the line: pi-herd-verdict: done pass=${pass} <one-line summary> (use blocked instead of done if you cannot proceed).`;
}
