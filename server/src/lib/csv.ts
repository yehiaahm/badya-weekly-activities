/** Marks a value Excel must keep as text (phone numbers and IDs keep their leading zeros). */
export interface TextCell {
  text: string;
}

type Cell = string | number | null | undefined | TextCell;

export function textCell(value: string): TextCell {
  return { text: value };
}

function quote(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function escapeCell(value: Cell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    // ="0101…" is shown as text by Excel, LibreOffice and Google Sheets. Only plain characters are allowed through.
    return /^[\w +\-.]*$/.test(value.text) ? quote(`="${value.text}"`) : escapeCell(value.text);
  }
  let text = String(value);
  // Neutralise spreadsheet formula injection (=, +, -, @ at the start of a cell).
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return quote(text);
}

/** RFC 4180 CSV with a UTF-8 BOM so Excel shows Arabic names correctly. */
export function toCsv(headers: string[], rows: Cell[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function csvFilename(...parts: string[]): string {
  return `${parts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')}.csv`;
}
