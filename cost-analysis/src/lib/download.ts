import { toCsv } from './csv';

/** Excel で文字化けしないよう UTF-8 BOM 付きで CSV をダウンロードさせる */
export function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const blob = new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
