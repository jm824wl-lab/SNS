import { toCsv } from './csv';

interface DownloadsApi {
  save(req: { filename: string; data: Blob }): Promise<unknown>;
}
interface ClaudeHost {
  use(name: 'downloads'): Promise<DownloadsApi | null>;
}

/** Excel で文字化けしないよう UTF-8 BOM 付きで CSV をダウンロードさせる */
async function downloadCsv(filename: string, rows: (string | number)[][]): Promise<void> {
  const blob = new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  // claude.ai の Artifact 内では直接のダウンロードが禁止されているため、downloads 機能で保存を依頼する
  const host = (window as unknown as { claude?: ClaudeHost }).claude;
  if (host?.use) {
    const downloads = await host.use('downloads');
    if (downloads) {
      await downloads.save({ filename, data: blob });
      return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toTsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((v) => String(v).replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');
}

/**
 * 表を出力する。Excel に貼り付けられるタブ区切りでクリップボードへコピーし、
 * 併せて CSV の保存を依頼する(保存できない環境・閲覧者が断った場合もコピーは使える)。
 * クリック操作の中で呼ぶこと。コピーできたら true を返す。
 */
export async function exportTable(filename: string, rows: (string | number)[][]): Promise<boolean> {
  let copied = false;
  try {
    await navigator.clipboard.writeText(toTsv(rows));
    copied = true;
  } catch {
    // クリップボードが使えない環境では保存のみ
  }
  try {
    await downloadCsv(filename, rows);
  } catch {
    // 閲覧者が保存を断った、またはダウンロードできない環境
  }
  return copied;
}
