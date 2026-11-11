// アプリ全体(JS・CSS)を1つのHTMLに埋め込み、claude.ai の Artifact として公開できる形で出力する。
// 使い方: npm run build:artifact  →  dist-artifact/cost-analysis.html
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'vite';

const outDir = 'dist-artifact';
await build({
  logLevel: 'warn',
  build: {
    outDir,
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rolldownOptions: { output: { codeSplitting: false } },
  },
});

const assets = join(outDir, 'assets');
const files = readdirSync(assets);
const jsFiles = files.filter((f) => f.endsWith('.js'));
if (jsFiles.length !== 1) throw new Error(`JSが1ファイルにまとまっていません: ${jsFiles.join(', ')}`);
const js = readFileSync(join(assets, jsFiles[0]), 'utf8').replace(/<\/script/gi, '<\\/script');
const css = files
  .filter((f) => f.endsWith('.css'))
  .map((f) => readFileSync(join(assets, f), 'utf8'))
  .join('\n')
  .replace(/<\/style/gi, '<\\/style');

// Artifact は <html>/<head>/<body> を自動で付与するため、中身だけを出力する
const html = `<title>総勘定元帳 コスト分析</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${js}
</script>
`;
const out = join(outDir, 'cost-analysis.html');
writeFileSync(out, html);
console.log(`${out} (${(html.length / 1024).toFixed(0)} KB)`);
