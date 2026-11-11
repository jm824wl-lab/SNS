import { useState } from 'react';

/** 表のコピー/CSV出力ボタン。結果をボタン上に一時表示する */
export function ExportButton({ onExport }: { onExport: () => Promise<boolean> }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <button
      className="btn"
      title="Excelに貼り付けられる形式でコピーし、CSVファイルも出力します"
      onClick={async () => {
        setStatus((await onExport()) ? 'copied' : 'failed');
        setTimeout(() => setStatus('idle'), 2500);
      }}
    >
      {status === 'copied' ? '✓ コピーしました' : status === 'failed' ? 'コピーできませんでした' : 'コピー / CSV出力'}
    </button>
  );
}
