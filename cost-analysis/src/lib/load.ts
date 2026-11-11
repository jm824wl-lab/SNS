import { decodeBytes, parseDelimited } from './csv';
import type { RawTable } from './types';

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  // read-excel-file は日付セルを UTC 0時の Date で返すため UTC で取り出す
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${v.getUTCFullYear()}/${p(v.getUTCMonth() + 1)}/${p(v.getUTCDate())}`;
  }
  return String(v);
}

/** CSV/TSV/Excel(.xlsx)ファイルをシート単位の生データに変換する。すべてブラウザ内で処理する。 */
export async function loadFile(file: File): Promise<RawTable[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm')) {
    const { default: readXlsxFile } = await import('read-excel-file/browser');
    const sheets = await readXlsxFile(file);
    return sheets
      .map((s) => ({
        name: sheets.length > 1 ? s.sheet : file.name,
        rows: s.data.map((r) => r.map(cellToString)),
      }))
      .filter((t) => t.rows.length > 0);
  }
  if (lower.endsWith('.xls')) {
    throw new Error(`「${file.name}」は旧形式(.xls)のため読み込めません。Excelで .xlsx または CSV 形式で保存し直してください。`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  return [{ name: file.name, rows: parseDelimited(decodeBytes(bytes)) }];
}
