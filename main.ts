// CSV Reader - baca file CSV Broken dengan cepat, handle broken CSV
import { readFileSync, writeFileSync } from 'node:fs';

interface Row {
  [key: string]: string;
}

function parseCSV(content: string): Row[] {
  const rows: Row[] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];
    
    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        if (ch === '\r') i++;
        currentRow.push(currentField);
        if (currentRow.length > 0 && currentRow.some(f => f !== '')) {
          rows.push(Object.fromEntries(currentRow.map((f, idx) => [idx, f])));
        }
        currentRow = [];
        currentField = '';
      } else if (ch === '\r') {
        currentRow.push(currentField);
        if (currentRow.length > 0 && currentRow.some(f => f !== '')) {
          rows.push(Object.fromEntries(currentRow.map((f, idx) => [idx, f])));
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += ch;
      }
    }
  }
  
  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.length > 0 && currentRow.some(f => f !== '')) {
      rows.push(Object.fromEntries(currentRow.map((f, idx) => [idx, f])));
    }
  }
  
  return rows;
}

const inputFile = process.argv[2] || '/input/data.csv';
const outputFile = process.argv[3] || '/output/result.json';

try {
  const content = readFileSync(inputFile, 'utf-8');
  const rows = parseCSV(content);
  const stats = {
    row_count: rows.length,
    fields_per_row: rows.map(r => Object.keys(r).length),
    avg_fields: rows.length > 0 ? rows.reduce((s, r) => s + Object.keys(r).length, 0) / rows.length : 0,
    timestamp: new Date().toISOString()
  };
  writeFileSync(outputFile, JSON.stringify(stats, null, 2));
  console.log(`Parsed ${rows.length} rows`);
} catch (err) {
  console.error('Error:', (err as Error).message);
  process.exit(1);
}
