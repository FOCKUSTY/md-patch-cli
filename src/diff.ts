export class DiffError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "DiffError";
  }
}

/**
 * Сколько строк искать вокруг подсказки из @@-заголовка.
 * LLM часто врут с номерами на 1–5 — это спасает.
 */
export const DEFAULT_FUZZ = 50;

export interface ApplyDiffOptions {
  /** Окно поиска вокруг подсказки. 0 — строгое совпадение. */
  fuzz?: number;
}

interface Hunk {
  startHint: number;
  header: string | null;
  lines: string[];
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/;

export function applyDiff(
  original: string,
  diff: string,
  options: ApplyDiffOptions = {},
): string {
  const fuzz = options.fuzz ?? DEFAULT_FUZZ;
  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  const origLines = original.split(/\r?\n/);
  const diffLines = diff.replace(/\r?\n$/, "").split(/\r?\n/);

  const { hunks, hasAnchors } = parseHunks(diffLines);
  if (hunks.length === 0) return original;

  // Для full-file diff (без @@) — только строгое совпадение от начала.
  const effectiveFuzz = hasAnchors ? fuzz : 0;

  const result: string[] = [];
  let cursor = 0;

  for (const hunk of hunks) {
    const hint = hunk.startHint >= 0 ? hunk.startHint : cursor;
    const position = findHunkPosition(
      origLines,
      hunk,
      hint,
      effectiveFuzz,
      cursor,
    );

    if (position === -1) {
      throw new DiffError(describeMissingHunk(hunk, hint, origLines));
    }

    while (cursor < position) result.push(origLines[cursor++]);

    for (const line of hunk.lines) {
      if (line === "\\ No newline at end of file") continue;
      const prefix = line.length === 0 ? " " : line[0];
      const content = line.length === 0 ? "" : line.slice(1);

      switch (prefix) {
        case " ":
          result.push(origLines[cursor++]);
          break;
        case "-":
          cursor++;
          break;
        case "+":
          result.push(content);
          break;
        default:
          result.push(origLines[cursor++] ?? line);
      }
    }
  }

  while (cursor < origLines.length) result.push(origLines[cursor++]);

  return result.join(eol);
}

function parseHunks(diffLines: string[]): {
  hunks: Hunk[];
  hasAnchors: boolean;
} {
  const hunks: Hunk[] = [];
  let current: Hunk | null = null;
  let hasAnchors = false;

  for (const line of diffLines) {
    const match = line.match(HUNK_HEADER);
    if (match) {
      if (current) hunks.push(current);
      current = {
        startHint: Number(match[1]) - 1,
        header: line,
        lines: [],
      };
      hasAnchors = true;
      continue;
    }

    if (!current) {
      current = { startHint: -1, header: null, lines: [] };
    }
    current.lines.push(line);
  }

  if (current) hunks.push(current);
  return { hunks, hasAnchors };
}

function hunkMatchesAt(
  origLines: string[],
  hunk: Hunk,
  position: number,
): boolean {
  let oi = position;
  for (const line of hunk.lines) {
    if (line === "\\ No newline at end of file") continue;
    const prefix = line.length === 0 ? " " : line[0];
    if (prefix === "+") continue;
    const content = line.length === 0 ? "" : line.slice(1);
    if (origLines[oi] !== content) return false;
    oi++;
  }
  return true;
}

function findHunkPosition(
  origLines: string[],
  hunk: Hunk,
  hint: number,
  fuzz: number,
  minPosition: number,
): number {
  if (hint >= minPosition && hunkMatchesAt(origLines, hunk, hint)) {
    return hint;
  }

  if (fuzz === 0) return -1;

  for (let delta = 1; delta <= fuzz; delta++) {
    const lower = hint - delta;
    const upper = hint + delta;
    if (lower >= minPosition && hunkMatchesAt(origLines, hunk, lower)) {
      return lower;
    }
    if (hunkMatchesAt(origLines, hunk, upper)) return upper;
  }

  // Последний шанс: полный скан вперёд от курсора.
  for (let position = minPosition; position < origLines.length; position++) {
    if (hunkMatchesAt(origLines, hunk, position)) return position;
  }

  return -1;
}

function describeMissingHunk(
  hunk: Hunk,
  hint: number,
  origLines: string[],
): string {
  const where = hunk.header
    ? ` ${hunk.header}`
    : ` (без @@-заголовка, ожидалась позиция ~${hint + 1})`;

  const expected = hunk.lines
    .filter((line) => line !== "" && (line[0] === " " || line[0] === "-"))
    .slice(0, 4)
    .map((line) => `    ${JSON.stringify(line.slice(1))}`)
    .join("\n");

  const start = Math.max(0, hint - 2);
  const around = origLines
    .slice(start, hint + 3)
    .map((line, i) => `    ${start + i + 1}: ${JSON.stringify(line)}`)
    .join("\n");

  return [
    `Хунк${where} не найден.`,
    `Ожидалось:`,
    expected || "    (нет контекстных строк)",
    `А в файле рядом:`,
    around || "    (файл пуст)",
  ].join("\n");
}

export function extractNewFileContent(diff: string): string {
  const lines = diff.replace(/\r?\n$/, "").split(/\r?\n/);
  const hasMarkers = lines.some(
    (line) => line.startsWith("+") || line.startsWith("-"),
  );

  if (!hasMarkers) return lines.join("\n");

  const out: string[] = [];
  for (const line of lines) {
    if (line.startsWith("@@") || line === "\\ No newline at end of file") {
      continue;
    }
    if (line.startsWith("-")) continue;
    if (line.startsWith("+") || line.startsWith(" ")) {
      out.push(line.slice(1));
    } else {
      out.push(line);
    }
  }
  return out.join("\n");
}
