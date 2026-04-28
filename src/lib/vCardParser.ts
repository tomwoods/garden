export interface ParsedContact {
  name: string;
  phone?: string;
  email?: string;
  note?: string;
}

function decodeQuotedPrintable(value: string): string {
  return value
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function unescapeVCardValue(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function extractFieldValue(line: string): string {
  // Handle quoted-printable encoding
  const upperLine = line.toUpperCase();
  let value = line.includes(':') ? line.substring(line.indexOf(':') + 1) : '';

  if (upperLine.includes('ENCODING=QUOTED-PRINTABLE') || upperLine.includes('ENCODING=QP')) {
    value = decodeQuotedPrintable(value);
  }

  // Handle base64 (just skip it — not useful for text fields)
  if (upperLine.includes('ENCODING=BASE64') || upperLine.includes('ENCODING=B')) {
    return '';
  }

  return unescapeVCardValue(value.trim());
}

function parseVCardBlock(block: string): ParsedContact | null {
  const lines: string[] = [];

  // Unfold: lines that start with whitespace are continuations
  for (const raw of block.split(/\r?\n/)) {
    if (/^[ \t]/.test(raw) && lines.length > 0) {
      lines[lines.length - 1] += raw.slice(1);
    } else {
      lines.push(raw);
    }
  }

  let name = '';
  let phone: string | undefined;
  let email: string | undefined;
  let note: string | undefined;

  for (const line of lines) {
    const upper = line.toUpperCase();

    if (upper.startsWith('FN:') || upper.startsWith('FN;')) {
      const candidate = extractFieldValue(line);
      if (candidate) name = candidate;
      continue;
    }

    // Structured name fallback when FN is absent
    if ((upper.startsWith('N:') || upper.startsWith('N;')) && !name) {
      const raw = extractFieldValue(line);
      // N format: Last;First;Middle;Prefix;Suffix
      const parts = raw.split(';').map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        name = `${parts[1]} ${parts[0]}`.trim();
      } else if (parts.length === 1) {
        name = parts[0];
      }
      continue;
    }

    if (upper.startsWith('TEL') && !phone) {
      const candidate = extractFieldValue(line);
      if (candidate) phone = candidate;
      continue;
    }

    if (upper.startsWith('EMAIL') && !email) {
      const candidate = extractFieldValue(line);
      if (candidate) email = candidate;
      continue;
    }

    if (upper.startsWith('NOTE') && !note) {
      const candidate = extractFieldValue(line);
      if (candidate) note = candidate;
      continue;
    }
  }

  if (!name) return null;

  return {
    name,
    phone: phone || undefined,
    email: email || undefined,
    note: note || undefined,
  };
}

export function parseVCardFile(text: string): ParsedContact[] {
  const contacts: ParsedContact[] = [];
  const blocks = text.split(/BEGIN:VCARD/i).slice(1);

  for (const raw of blocks) {
    const end = raw.toUpperCase().indexOf('END:VCARD');
    const block = end !== -1 ? raw.slice(0, end) : raw;
    const parsed = parseVCardBlock(block);
    if (parsed) contacts.push(parsed);
  }

  return contacts;
}

export function parseSingleContact(text: string): ParsedContact | null {
  const all = parseVCardFile(text);
  return all[0] ?? null;
}
