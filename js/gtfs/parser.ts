export interface GTFSRecord {
  [key: string]: string;
}

export type Record = GTFSRecord;

export function parseCSV(text: string): Record[] {
  const lines = text.trim().split("\n");
  if (lines.length === 0) return [];

  const headers = lines[0].split(",").map((h) => h.replace(/"/g, ""));

  return lines
    .slice(1)
    .map((line) => {
      if (!line.trim()) return null;

      const values: string[] = [];
      let current = "";
      let inQuotes = false;

      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
          values.push(current.replace(/"/g, ""));
          current = "";
        } else {
          current += char;
        }
      }
      values.push(current.replace(/"/g, ""));

      const obj: Record = {};
      headers.forEach((h, i) => (obj[h] = values[i] || ""));
      return obj;
    })
    .filter((v): v is Record => v !== null);
}

export function parseCSVWithProgress(
  text: string,
  onProgress: (percent: number) => void,
): Promise<Record[]> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const lines = text.trim().split("\n");
      const headers = lines[0].split(",").map((h) => h.replace(/"/g, ""));
      const total = lines.length - 1;
      const result: Record[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values: string[] = [];
        let current = "";
        let inQuotes = false;

        for (const char of lines[i]) {
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === "," && !inQuotes) {
            values.push(current.replace(/"/g, ""));
            current = "";
          } else {
            current += char;
          }
        }
        values.push(current.replace(/"/g, ""));

        const obj: Record = {};
        headers.forEach((h, idx) => (obj[h] = values[idx] || ""));
        result.push(obj);

        if (i % 10000 === 0) {
          onProgress(Math.round((i / total) * 100));
        }
      }

      onProgress(100);
      resolve(result);
    }, 0);
  });
}
