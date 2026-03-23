/**
 * Shared HTML templates for window.print() exports (Harvest log, Operations log, Active Workers, …).
 */

export function escapeHtmlForPrint(value) {
  if (value == null) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const SARMS_PRINT_STYLES = `
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Tajawal', system-ui, -apple-system, sans-serif;
      padding: 8px;
      color: #1a1a1a;
      font-size: 11px;
    }
    .print-header {
      direction: ltr;
      display: grid;
      grid-template-columns: minmax(96px, 1fr) auto minmax(96px, 1fr);
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
      min-height: 52px;
    }
    .print-header-logo {
      justify-self: start;
      align-self: start;
    }
    .print-header-logo img {
      display: block;
      max-height: 48px;
      width: auto;
      max-width: 120px;
      height: auto;
      object-fit: contain;
    }
    .print-header-title-wrap {
      text-align: center;
      justify-self: center;
      min-width: 0;
    }
    .print-header-title-wrap h1 {
      font-size: 18px;
      margin: 0 0 4px;
      font-weight: 700;
      line-height: 1.25;
    }
    .print-header-title-wrap .meta {
      margin: 0;
    }
    .print-header-spacer { min-height: 1px; }
    .meta { font-size: 10px; color: #444; }
    .filters { font-size: 10px; line-height: 1.5; margin-bottom: 14px; padding: 10px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; }
    .filters strong { color: #334155; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 6px; text-align: center; vertical-align: middle; word-break: break-word; }
    th {
      background: #5c7b5c;
      color: #fff;
      font-weight: 700;
    }
    tbody tr:nth-child(even) { background: #f8fafc; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
`

export function buildSarmsPrintHtml({ title, metaLine, filtersInnerHtml, theadRowHtml, tbodyHtml, dir, lang }) {
  const logoSrc = `${window.location.origin}/logo-sarms.png`
  return `<!DOCTYPE html>
<html dir="${dir}" lang="${lang === 'ar' ? 'ar' : 'en'}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtmlForPrint(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap" rel="stylesheet" />
  <style>${SARMS_PRINT_STYLES}
  </style>
</head>
<body>
  <header class="print-header">
    <div class="print-header-logo">
      <img src="${escapeHtmlForPrint(logoSrc)}" alt="SARMS" width="120" height="48" />
    </div>
    <div class="print-header-title-wrap">
      <h1>${escapeHtmlForPrint(title)}</h1>
      <div class="meta">${escapeHtmlForPrint(metaLine)}</div>
    </div>
    <div class="print-header-spacer" aria-hidden="true"></div>
  </header>
  <div class="filters">${filtersInnerHtml}</div>
  <table>
    <thead>
      <tr>${theadRowHtml}</tr>
    </thead>
    <tbody>${tbodyHtml}</tbody>
  </table>
</body>
</html>`
}

export function openSarmsPrintWindow(html) {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  setTimeout(() => {
    win.focus()
    win.print()
  }, 450)
}
