// solve.js — a fast, original drop-in for csv-reader 1.0.0.
//
// Approach: parse record by record. A record whose line holds no quote at a
// field start takes the fast path (one slice + split(','), with stray CRs
// stripped afterwards); anything else goes through an indexOf-driven state
// machine that reproduces the reference's exact answers, including its error
// reporting. Delimiter positions are tracked with forward-only cursors so no
// scan ever re-reads text, keeping the whole parse linear.

const FEFF = 0xfeff;
const QUOTE = 34; // "
const COMMA = 44; // ,
const LF = 10; // \n
const CR = 13; // \r

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const N = text.length;

  let pos = 0;
  if (N > 0 && text.charCodeAt(0) === FEFF) pos = 1;

  const records = [];
  const errors = [];
  let line = 1;
  let width = -1;

  // Forward-only cursors: the next comma / quote / CR at or after pos. Each
  // is recomputed only once pos has passed it, so delimiter scans are O(N).
  let nextComma = text.indexOf(',', pos);
  let nextQuote = text.indexOf('"', pos);
  let nextCR = text.indexOf('\r', pos);

  // Shared result slots, so the hot field functions allocate nothing.
  let fVal = '';
  let fNext = 0;
  let nVal = '';
  let nInc = 0;

  // Normalize a chunk that lies inside quotes: CRLF and lone CR become LF.
  // Sets nVal (normalized chunk) and nInc (line increments).
  function normQuoted(s) {
    if (s.indexOf('\r') === -1) {
      let c = 0;
      let i = s.indexOf('\n');
      while (i !== -1) {
        c++;
        i = s.indexOf('\n', i + 1);
      }
      nVal = s;
      nInc = c;
      return;
    }
    let out = '';
    let c = 0;
    let start = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      if (ch === CR) {
        out += s.slice(start, i);
        out += '\n';
        c++;
        if (s.charCodeAt(i + 1) === LF) i++; // CRLF counts as one line
        start = i + 1;
      } else if (ch === LF) {
        c++;
      }
    }
    out += s.slice(start);
    nVal = out;
    nInc = c;
  }

  // Scan an unquoted stretch starting at k, appending chars up to the next
  // comma / line break / EOF onto `v`. A lone CR is dropped with a stray_cr
  // error and scanning continues; CRLF and LF end the record (line++).
  // Sets fVal/fNext and returns the kind: 0 = EOF, 1 = comma, 2 = record end.
  function scanPlain(k, v, recLine, row) {
    for (;;) {
      if (nextComma !== -1 && nextComma < k) nextComma = text.indexOf(',', k);
      if (nextCR !== -1 && nextCR < k) nextCR = text.indexOf('\r', k);
      const nn = text.indexOf('\n', k);
      let j = N;
      let kind = 0;
      if (nextComma !== -1 && nextComma < j) {
        j = nextComma;
        kind = 1;
      }
      if (nn !== -1 && nn < j) {
        j = nn;
        kind = 2;
      }
      if (nextCR !== -1 && nextCR < j) {
        j = nextCR;
        kind = 3;
      }
      if (j > k) v += text.slice(k, j);
      if (kind === 0) {
        fVal = v;
        fNext = N;
        return 0;
      }
      if (kind === 1) {
        fVal = v;
        fNext = j + 1;
        return 1;
      }
      if (kind === 2) {
        line++;
        fVal = v;
        fNext = j + 1;
        return 2;
      }
      // CR: CRLF ends the record, a lone CR is dropped with an error.
      if (text.charCodeAt(j + 1) === LF) {
        line++;
        fVal = v;
        fNext = j + 2;
        return 2;
      }
      errors.push({ code: 'stray_cr', line: recLine, row });
      k = j + 1;
    }
  }

  // Parse one field starting at p (p < N). Sets fVal/fNext, returns the kind
  // (0 = EOF, 1 = comma, 2 = record ended).
  function parseField(p, recLine, row) {
    if (text.charCodeAt(p) !== QUOTE) return scanPlain(p, '', recLine, row);
    // Quoted field: run to the next quote that is not doubled.
    const openLine = line;
    let j = p + 1;
    let chunkStart = j;
    let parts = null;
    for (;;) {
      const q = text.indexOf('"', j);
      if (q === -1) {
        // Unterminated quote: a literal character, the rest re-read unquoted.
        // The line rewinds to the opening quote and the error is met before
        // the re-read, exactly as the reference reports it.
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recLine, row });
        return scanPlain(p + 1, '"', recLine, row);
      }
      if (text.charCodeAt(q + 1) === QUOTE) {
        // Doubled quote inside: one literal quote.
        if (parts === null) parts = [];
        normQuoted(text.slice(chunkStart, q));
        line += nInc;
        parts.push(nVal, '"');
        j = q + 2;
        chunkStart = j;
        continue;
      }
      normQuoted(text.slice(chunkStart, q));
      line += nInc;
      const content =
        parts === null ? nVal : (parts.push(nVal), parts.join(''));
      // Junk after the closing quote, up to the next comma or line break,
      // is appended as it stands.
      const kind = scanPlain(q + 1, content, recLine, row);
      if (fVal.length > content.length) {
        errors.push({ code: 'quote_junk', line: recLine, row });
      }
      return kind;
    }
  }

  // Parse one record starting at p0 (slow path: a quote opens a field).
  // Returns [fields, nextPos]; fields is null when the line is left with no
  // characters (no record), though errors met on it still stand.
  function slowRecord(p0, recLine, row) {
    const fields = [];
    let p = p0;
    let seen = false;
    for (;;) {
      if (p >= N) {
        // EOF right after a comma: trailing empty field.
        fields.push('');
        return [seen ? fields : null, N];
      }
      const quoted = text.charCodeAt(p) === QUOTE;
      const kind = parseField(p, recLine, row);
      if (fVal.length > 0 || quoted) seen = true;
      fields.push(fVal);
      if (kind === 0) return [seen ? fields : null, N];
      if (kind === 1) {
        seen = true; // a comma was consumed: this line is a record
        p = fNext;
        continue;
      }
      return [seen ? fields : null, fNext];
    }
  }

  while (pos < N) {
    const recLine = line;
    const recIdx = records.length;
    const row = header ? (recIdx === 0 ? null : recIdx - 1) : recIdx;

    if (nextQuote !== -1 && nextQuote < pos) nextQuote = text.indexOf('"', pos);
    if (nextCR !== -1 && nextCR < pos) nextCR = text.indexOf('\r', pos);

    const nl = text.indexOf('\n', pos);
    const end = nl === -1 ? N : nl;
    // Strip a trailing CR that belongs to a CRLF line ending.
    let segEnd = end;
    if (nl !== -1 && end > pos && text.charCodeAt(end - 1) === CR) segEnd = end - 1;
    if (segEnd === pos) {
      // Empty line: no record.
      line++;
      pos = end + 1;
      continue;
    }

    // Fast path unless a quote opens a field in this line (at the line start
    // or right after a comma). A quote anywhere else is a literal character
    // and split(',') reads the line exactly as the reference does.
    let hasFSQ = false;
    let q = nextQuote;
    while (q !== -1 && q < segEnd) {
      if (q === pos || text.charCodeAt(q - 1) === COMMA) {
        hasFSQ = true;
        break;
      }
      q = text.indexOf('"', q + 1);
    }

    let fields;
    if (!hasFSQ) {
      fields = text.slice(pos, segEnd).split(',');
      if (nextCR !== -1 && nextCR < segEnd) {
        // Stray CRs: drop each with an error, in field order.
        for (let i = 0; i < fields.length; i++) {
          const f = fields[i];
          if (f.indexOf('\r') !== -1) {
            const parts = f.split('\r');
            for (let k = 1; k < parts.length; k++) {
              errors.push({ code: 'stray_cr', line: recLine, row });
            }
            fields[i] = parts.join('');
          }
        }
        if (fields.length === 1 && fields[0] === '') {
          // The line held only stray CRs: no record (its errors stay).
          line++;
          pos = nl === -1 ? N : nl + 1;
          continue;
        }
      }
      line++;
      pos = nl === -1 ? N : nl + 1;
    } else {
      const out = slowRecord(pos, recLine, row);
      pos = out[1];
      if (out[0] === null) continue;
      fields = out[0];
    }

    if (width === -1) {
      width = fields.length;
      records.push(fields);
    } else if (fields.length < width) {
      errors.push({
        code: 'short_row',
        line: recLine,
        row,
        fields: fields.length,
      });
      const padded = fields.slice();
      while (padded.length < width) padded.push('');
      records.push(padded);
    } else if (fields.length > width) {
      errors.push({
        code: 'long_row',
        line: recLine,
        row,
        extra: fields.slice(width),
      });
      records.push(fields.slice(0, width));
    } else {
      records.push(fields);
    }
  }

  let columns = null;
  let rows;
  if (records.length === 0) {
    rows = [];
    if (header) columns = [];
  } else if (header) {
    columns = records[0];
    rows = records.slice(1);
  } else {
    rows = records;
  }
  return { columns, rows, errors };
}
