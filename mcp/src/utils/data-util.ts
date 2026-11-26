export function parseCSVData(csvData: string): { columns: string[], rows: Record<string, string>[] } {
  const lines = csvData.split('\n');
  if (lines.length <= 1) {
    return { columns: [], rows: [] };
  }
  const columns = lines[0].split(',').map((col: string) => col.trim().replace(/^"|"$/g, ''));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue; // Skip empty lines
    const values = lines[i].split(',').map(val => val.trim().replace(/^"|"$/g, ''));
    if (values.length === columns.length) {
      const row: Record<string, string> = {};
      columns.forEach((col: string, index: number) => {
        row[col] = values[index];
      });
      rows.push(row);
    }
  }
  return { columns, rows };
}

export function inferDataType(value: string): "PLAIN" | "NUMBER" | "DATE" {
  if (!isNaN(parseFloat(value)) && isFinite(Number(value))) {
    return 'NUMBER';
  }
  const dateRegex = /^\d{4}[-/](0?[1-9]|1[012])[-/](0?[1-9]|[12][0-9]|3[01])$/;
  const dateRegex2 = /^(0?[1-9]|1[012])[-/](0?[1-9]|[12][0-9]|3[01])[-/]\d{4}$/;
  if (dateRegex.test(value) || dateRegex2.test(value) || !isNaN(Date.parse(value))) {
    return 'DATE';
  }
  return 'PLAIN';
}


export const QUERY_DATA_POLLING_INTERVAL = 2000; // 2 seconds
export const QUERY_DATA_QUEUE_TIMEOUT = 30 * 1000; // 30 seconds
export const QUERY_DATA_QUERY_EXECUTION_TIMEOUT = 60 * 1000; // 60 seconds

const _rawRowLimit = parseInt(process.env.QUERY_DATA_RESULT_ROW_LIMITS || "20", 10);
export const QUERY_DATA_ROW_LIMIT = (!isNaN(_rawRowLimit) && _rawRowLimit <= 1000) ? _rawRowLimit : 1000;


export async function pollJobCompletion(
    bulk: any,
    jobId: string,
    statusMessages: Record<string, string>,
    pollingInterval: number = QUERY_DATA_POLLING_INTERVAL,
    queueTimeout: number = QUERY_DATA_QUEUE_TIMEOUT,
    executionTimeout: number = QUERY_DATA_QUERY_EXECUTION_TIMEOUT
): Promise<string | null> {
    const startTime = Date.now();
    let processingStartTime: number | null = null;

    while (true) {
        const jobDetails = await bulk.getExportJobDetails(jobId);
        const currentTime = Date.now();

        if (jobDetails.jobCode === '1004') { // JOB COMPLETED
            break;
        } else if (jobDetails.jobCode === '1003') { // ERROR OCCURRED
            return statusMessages.error;
        } else if (jobDetails.jobCode === '1001') { // JOB NOT INITIATED
            if (currentTime - startTime > queueTimeout) {
                return statusMessages.queue_timeout;
            }
        } else if (jobDetails.jobCode === '1002') { // JOB IN PROGRESS
            if (processingStartTime === null) {
                processingStartTime = currentTime;
            } else if (currentTime - processingStartTime > executionTimeout) {
                return statusMessages.execution_timeout;
            }
        }

        await new Promise(resolve => setTimeout(resolve, pollingInterval));
    }

    return null;
}

/** RFC 4180 compatible CSV parser (handles quoted fields containing commas, quotes and newlines). */
export function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const text = csv.replace(/^\uFEFF/, "");

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

/**
 * Zoho names a chart report "Chart View" inside `involvedViews`, but "AnalysisView" everywhere else
 * (searchViews, getViewDetails.viewType). Aligns involvedViews with the vocabulary used by `viewType`.
 */
const INVOLVED_VIEW_TYPE_ALIASES: Record<string, string> = { "Chart View": "AnalysisView" };

export function normalizeInvolvedViews<T extends { involvedViews?: unknown }>(details: T): T {
  if (details && Array.isArray(details.involvedViews)) {
    details.involvedViews = details.involvedViews.map((v: any) =>
      v && typeof v.viewType === "string" && INVOLVED_VIEW_TYPE_ALIASES[v.viewType]
        ? { ...v, viewType: INVOLVED_VIEW_TYPE_ALIASES[v.viewType] }
        : v
    );
  }
  return details;
}
