export type CsvRecord = {
  line: number;
  cells: string[];
};

/** Parse a CSV file, including quoted commas and line breaks. */
export function parseCsv(text: string): CsvRecord[] {
  const source = text.replace(/^\uFEFF/, "");
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let recordLine = 1;

  function finishRecord() {
    cells.push(cell.trim());
    cell = "";
    if (cells.some((value) => value !== "")) {
      records.push({ line: recordLine, cells });
    }
    cells = [];
    recordLine = line;
  }

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        if (char === "\n") {
          line += 1;
        }
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") {
        index += 1;
      }
      line += 1;
      finishRecord();
      continue;
    }
    cell += char;
  }

  if (cell.length > 0 || cells.length > 0) {
    finishRecord();
  }
  return records;
}

export function columnIndex(headers: string[], names: string[]): number {
  const normalized = headers.map((header) => header.toLowerCase().replace(/[\s_-]/g, ""));
  for (const name of names) {
    const index = normalized.indexOf(name);
    if (index !== -1) {
      return index;
    }
  }
  return -1;
}

export function parseActive(value: string | undefined): boolean | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  const normalized = value.toLowerCase();
  if (["true", "yes", "y", "1", "active"].includes(normalized)) {
    return true;
  }
  if (["false", "no", "n", "0", "inactive"].includes(normalized)) {
    return false;
  }
  return undefined;
}
