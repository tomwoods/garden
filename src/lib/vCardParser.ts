export interface ParsedContact {
  name: string;
  phone?: string;
  email?: string;
  note?: string;
  photoDataUrl?: string;
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
  const upperLine = line.toUpperCase();
  let value = line.includes(':') ? line.substring(line.indexOf(':') + 1) : '';

  if (upperLine.includes('ENCODING=QUOTED-PRINTABLE') || upperLine.includes('ENCODING=QP')) {
    value = decodeQuotedPrintable(value);
  }

  if (upperLine.includes('ENCODING=BASE64') || upperLine.includes('ENCODING=B')) {
    return '';
  }

  return unescapeVCardValue(value.trim());
}

function mimeTypeForPhoto(paramString: string): string {
  const upper = paramString.toUpperCase();
  if (upper.includes('PNG')) return 'image/png';
  if (upper.includes('GIF')) return 'image/gif';
  if (upper.includes('WEBP')) return 'image/webp';
  return 'image/jpeg';
}

function extractPhotoDataUrl(lines: string[], startIndex: number): string | undefined {
  const line = lines[startIndex];
  const upperLine = line.toUpperCase();

  // Skip URI-type entries — fetching remote URLs would leak the user's IP
  if (upperLine.includes('VALUE=URI') || upperLine.includes('VALUE=URL')) return undefined;

  const colonPos = line.indexOf(':');
  if (colonPos === -1) return undefined;

  const paramsPart = line.substring(0, colonPos);
  const mime = mimeTypeForPhoto(paramsPart);

  const isBase64 =
    upperLine.includes('ENCODING=BASE64') ||
    upperLine.includes('ENCODING=B') ||
    upperLine.includes(';B;') ||
    upperLine.includes(';B:') ||
    upperLine.startsWith('PHOTO;B:') ||
    upperLine.startsWith('PHOTO:DATA:');

  if (!isBase64) {
    // vCard 4.0 inline data URI: PHOTO:data:image/jpeg;base64,...
    const val = line.substring(colonPos + 1).trim();
    if (val.startsWith('data:')) return val;
    return undefined;
  }

  // Gather base64 payload — may span multiple folded continuation lines
  let payload = line.substring(colonPos + 1).trim();
  let i = startIndex + 1;
  while (i < lines.length) {
    const next = lines[i];
    if (/^[ \t]/.test(next)) {
      payload += next.trim();
      i++;
    } else {
      break;
    }
  }

  payload = payload.replace(/\s/g, '');
  if (!payload) return undefined;

  return `data:${mime};base64,${payload}`;
}

function parseVCardBlock(block: string): ParsedContact | null {
  const lines: string[] = [];

  // Unfold: lines starting with whitespace are continuations of the previous line
  // Exception: PHOTO base64 continuations — we handle those manually in extractPhotoDataUrl
  for (const raw of block.split(/\r?\n/)) {
    if (/^[ \t]/.test(raw) && lines.length > 0) {
      const prev = lines[lines.length - 1].toUpperCase();
      // Don't auto-unfold PHOTO lines — extractPhotoDataUrl reads them raw
      if (!prev.startsWith('PHOTO')) {
        lines[lines.length - 1] += raw.slice(1);
        continue;
      }
    }
    lines.push(raw);
  }

  let name = '';
  let phone: string | undefined;
  let email: string | undefined;
  let note: string | undefined;
  let photoDataUrl: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const upper = line.toUpperCase();

    if (upper.startsWith('FN:') || upper.startsWith('FN;')) {
      const candidate = extractFieldValue(line);
      if (candidate) name = candidate;
      continue;
    }

    if ((upper.startsWith('N:') || upper.startsWith('N;')) && !name) {
      const raw = extractFieldValue(line);
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

    if (upper.startsWith('PHOTO') && !photoDataUrl) {
      photoDataUrl = extractPhotoDataUrl(lines, i);
      continue;
    }
  }

  if (!name) return null;

  return {
    name,
    phone: phone || undefined,
    email: email || undefined,
    note: note || undefined,
    photoDataUrl: photoDataUrl || undefined,
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
