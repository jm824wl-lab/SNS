import { useEffect, useState } from 'react';

const VARS = [
  'series-1',
  'series-2',
  'series-3',
  'series-4',
  'series-5',
  'series-6',
  'series-7',
  'series-8',
  'series-other',
  'text-primary',
  'text-secondary',
  'text-muted',
  'grid',
  'surface-1',
  'accent',
] as const;
export type ThemeColors = Record<(typeof VARS)[number], string> & { series: string[] };

function read(): ThemeColors {
  const cs = getComputedStyle(document.documentElement);
  const c = Object.fromEntries(VARS.map((v) => [v, cs.getPropertyValue(`--${v}`).trim()])) as Record<
    (typeof VARS)[number],
    string
  >;
  return {
    ...c,
    series: [c['series-1'], c['series-2'], c['series-3'], c['series-4'], c['series-5'], c['series-6'], c['series-7'], c['series-8']],
  };
}

/** SVG属性では CSS 変数が効かないため、テーマ色を実値に解決し、ダークモード切替にも追従する */
export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState(read);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setColors(read());
    mq.addEventListener('change', update);
    // 表示側のテーマ切替(data-theme 属性)にも追従する
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    return () => {
      mq.removeEventListener('change', update);
      mo.disconnect();
    };
  }, []);
  return colors;
}

export const axisTick = (c: ThemeColors) => ({ fill: c['text-muted'], fontSize: 11 });

