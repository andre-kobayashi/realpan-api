#!/usr/bin/env python3
"""
Rewrite generateNouhinshoHTML in documents.ts with client-requested changes:
1. Remove logo - gain space, move customer/company data up  
2. Company (RealPan) data aligned LEFT, hanko stays RIGHT
3. Maximize product lines on A4 page
4. Show tax type per line INSIDE amount cell (like matomete reference)
5. Applies to both nouhinsho and seikyusho
"""

import sys

DOCS_PATH = '/home/api/htdocs/api.realpan.jp/realpan-api/src/routes/documents.ts'

with open(DOCS_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

func_marker = 'function generateNouhinshoHTML'
idx_start = content.find(func_marker)

if idx_start == -1:
    print("ERROR: Could not find generateNouhinshoHTML function!")
    sys.exit(1)

# Go back to find comment header
search_back = content[:idx_start].rfind('// \u2550')
if search_back != -1 and (idx_start - search_back) < 300:
    idx_start = search_back

# Find matching closing brace
depth = 0
i = content.index('{', content.index(func_marker))
idx_end = i
while i < len(content):
    if content[i] == '{':
        depth += 1
    elif content[i] == '}':
        depth -= 1
        if depth == 0:
            idx_end = i + 1
            break
    i += 1

old_size = idx_end - idx_start
print(f"Found function at chars {idx_start}-{idx_end} ({old_size} chars)")

NEW_FUNC = '''// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// \u7d0d\u54c1\u66f8 / \u8acb\u6c42\u66f8 HTML Generator
// No logo, maximized rows, tax type per line in amount cell
// Company data LEFT, hanko RIGHT
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
function generateNouhinshoHTML(data: any, isSeikyusho: boolean = false): string {
  const d = new Date(data.order.date);
  const formattedDate = `${d.getFullYear()}\u5e74${String(d.getMonth() + 1).padStart(2, '0')}\u6708${String(d.getDate()).padStart(2, '0')}\u65e5`;
  const docTitle = isSeikyusho ? '\u8acb\u3000\u6c42\u3000\u66f8' : '\u7d0d\u3000\u54c1\u3000\u66f8';
  const docNumber = data.order.orderNumber.replace('RP-', '').replace(/-/g, '');

  // Build product rows with tax label inside amount cell
  const items = data.items || [];
  const productRows = items.map((item: any) => {
    const taxRate = item.taxRate || 8;
    const taxLabel = taxRate === 10 ? '\u8ab2' + '10.0%' : '\u8efd' + '8.0%';
    const lineTotal = item.quantity * item.unitPrice;
    return `
      <tr>
        <td class="code">${item.productCode || ''}</td>
        <td class="name">${item.nameJp || item.name || ''} ${item.namePt || ''}</td>
        <td class="qty">${item.quantity}</td>
        <td class="unit">${item.unit || '\u888b'}</td>
        <td class="price">\u00a5${item.unitPrice.toLocaleString()}</td>
        <td class="amount"><span class="tax-lbl">${taxLabel}</span>\u00a5${lineTotal.toLocaleString()}</td>
        <td class="remarks"></td>
      </tr>`;
  }).join('');

  // Fill empty rows to maximize A4 usage (target 25 rows)
  const maxRows = 25;
  const emptyRowCount = Math.max(0, maxRows - items.length);
  const emptyRows = Array(emptyRowCount).fill(`
      <tr>
        <td class="code">&nbsp;</td>
        <td class="name">&nbsp;</td>
        <td class="qty">&nbsp;</td>
        <td class="unit">&nbsp;</td>
        <td class="price">&nbsp;</td>
        <td class="amount">&nbsp;</td>
        <td class="remarks">&nbsp;</td>
      </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>${docTitle} - ${data.order.orderNumber}</title>
  <style>
    @page { size: A4; margin: 8mm 10mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'MS Gothic', 'Hiragino Kaku Gothic Pro', monospace;
      font-size: 10px; color: #000; background: #fff;
    }
    .page { width: 190mm; margin: 0 auto; padding: 2mm 0; }

    /* Top bar */
    .top-bar {
      display: flex; justify-content: space-between;
      align-items: center; margin-bottom: 3px;
    }
    .top-bar .ccode { font-size: 10px; }
    .top-bar .ccode span {
      border: 1px solid #000; padding: 1px 6px; font-weight: bold;
    }
    .top-bar .dtitle {
      font-size: 18px; font-weight: bold; letter-spacing: 10px;
    }
    .top-bar .dmeta { display: flex; gap: 8px; font-size: 10px; }
    .top-bar .dmeta span {
      border: 1px solid #000; padding: 1px 6px; font-weight: bold;
    }

    .date-line { font-size: 10px; margin-bottom: 5px; }

    /* Info section */
    .info-section {
      display: flex; justify-content: space-between;
      margin-bottom: 4px; position: relative;
    }
    .cust-info { flex: 0 0 46%; }
    .cust-info .lbl { font-size: 9px; color: #666; }
    .cust-info .cname {
      font-size: 14px; font-weight: bold;
      border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 2px;
    }
    .cust-info .caddr { font-size: 9px; line-height: 1.4; }

    .comp-info {
      flex: 0 0 50%; text-align: left;
      font-size: 9px; line-height: 1.5;
      position: relative; padding-right: 68px;
    }
    .comp-info .cn { font-size: 13px; font-weight: bold; }
    .comp-info .cen { font-size: 8px; color: #444; }
    .comp-info .csub { font-size: 7px; color: #666; }

    .hanko-area {
      position: absolute; right: 0; top: 0;
      width: 60px; height: 60px;
    }
    .hanko-img {
      width: 60px; height: 60px;
      object-fit: contain; opacity: 0.85;
    }
    .hanko-text {
      width: 55px; height: 55px;
      border: 2px solid #c00; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      color: #c00; font-size: 14px; font-weight: bold;
    }

    .greeting { font-size: 9px; text-align: right; margin-bottom: 3px; }

    /* Products table */
    table.products { width: 100%; border-collapse: collapse; font-size: 9px; }
    table.products th {
      background: #e8e8e8; border: 1px solid #000;
      padding: 2px 3px; text-align: center;
      font-size: 8px; font-weight: bold;
    }
    table.products td {
      border: 1px solid #000; padding: 1px 3px;
      height: 16px; vertical-align: middle;
    }
    td.code { text-align: center; width: 40px; }
    td.name { width: auto; font-size: 8.5px; }
    td.qty { text-align: center; width: 32px; }
    td.unit { text-align: center; width: 24px; }
    td.price { text-align: right; width: 52px; }
    td.amount { text-align: right; width: 85px; vertical-align: middle; }
    td.remarks { width: 44px; }

    /* Tax label inside amount cell */
    .tax-lbl {
      font-size: 7px; color: #333;
      margin-right: 4px;
    }

    /* Tax summary */
    .tax-summary { display: flex; justify-content: flex-end; margin-top: 1px; }
    .tax-summary table { border-collapse: collapse; font-size: 9px; }
    .tax-summary td { border: 1px solid #000; padding: 2px 6px; }
    .tax-summary .tl { text-align: left; width: 160px; }
    .tax-summary .tv { text-align: right; width: 65px; }

    /* Grand total */
    .grand-total {
      display: flex; border: 1px solid #000; margin-top: 1px;
    }
    .grand-total > div {
      border-right: 1px solid #000; padding: 3px 6px;
    }
    .grand-total > div:last-child { border-right: none; }
    .gt-l { flex: 1; text-align: center; font-weight: bold; font-size: 10px; display: flex; align-items: center; justify-content: center; }
    .gt-s { text-align: center; }
    .gt-s .gh { font-size: 8px; letter-spacing: 2px; }
    .gt-s .gv { font-weight: bold; font-size: 12px; }
    .gt-s .gvb { font-weight: bold; font-size: 14px; }

    .no-print { text-align: right; margin-bottom: 3px; }
    @media print {
      .no-print { display: none; }
      body { -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="no-print">
      <button onclick="window.print()" style="padding:4px 12px;background:#333;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:9px;">\u5370\u5237 / Imprimir</button>
    </div>

    <div class="top-bar">
      <div class="ccode">\u304a\u5ba2\u69d8\u30b3\u30fc\u30c9 <span>${data.customer.customerCode || ''}</span></div>
      <div class="dtitle">${docTitle}</div>
      <div class="dmeta">
        <div>\u4f1d\u7968No. <span>${docNumber}</span></div>
        <div>PAGE</div>
      </div>
    </div>

    <div class="date-line">\u65e5\u4ed8\u3000${formattedDate}</div>

    <div class="info-section">
      <div class="cust-info">
        <div class="lbl">\u5b9b\u540d</div>
        <div class="cname">${data.customer.name} \u69d8</div>
        <div class="caddr">
          ${data.customer.postalCode ? `\u3012${data.customer.postalCode}` : ''}
          ${data.customer.address || ''}
        </div>
      </div>
      <div class="comp-info">
        <div class="cn">${data.company.name}</div>
        <div class="cen">${data.company.nameEn || 'REAL PAN'}</div>
        <div class="csub">${data.company.subtitle || 'PRODUTOS ALIMENTICIOS CONGELADOS'}</div>
        <div>\u3012${data.company.postalCode} ${data.company.address}</div>
        <div>TEL${data.company.tel}\u3000FAX${data.company.fax}</div>
        <div>\u767b\u9332\u756a\u53f7 ${data.company.invoiceNumber}</div>
        <div class="hanko-area">
          ${data.company.hankoUrl
            ? `<img src="https://api.realpan.jp${data.company.hankoUrl}" alt="\u5370" class="hanko-img" />`
            : '<div class="hanko-text">\u329e</div>'}
        </div>
      </div>
    </div>

    <div class="greeting">\u6bce\u5ea6\u3042\u308a\u304c\u3068\u3046\u3054\u3056\u3044\u307e\u3059\u3002</div>

    <table class="products">
      <thead>
        <tr>
          <th>\u5546\u54c1\u30b3\u30fc\u30c9</th>
          <th>\u5546\u3000\u54c1\u3000\u540d</th>
          <th>\u6570\u3000\u91cf</th>
          <th>\u5358\u4f4d</th>
          <th>\u5358\u3000\u4fa1</th>
          <th>\u58f2\u4e0a\u91d1\u984d</th>
          <th>\u5099\u3000\u8003</th>
        </tr>
      </thead>
      <tbody>
        ${productRows}
        ${emptyRows}
      </tbody>
    </table>

    <div class="tax-summary">
      <table>
        <tr><td class="tl">\u3010\u5408\u8a08 \u8ab2\u7a0e10.0% \u7a0e\u629c\u984d\u3011</td><td class="tv">${data.tax.service.subtotal.toLocaleString()}</td></tr>
        <tr><td class="tl">\u3010\u5408\u8a08 \u8ab2\u7a0e10.0% \u6d88\u8cbb\u7a0e\u984d\u3011</td><td class="tv">${data.tax.service.tax.toLocaleString()}</td></tr>
        <tr><td class="tl">\u3010\u5408\u8a08 \u8ab2\u7a0e(\u8efd) 8.0% \u7a0e\u629c\u984d\u3011</td><td class="tv">${data.tax.food.subtotal.toLocaleString()}</td></tr>
        <tr><td class="tl">\u3010\u5408\u8a08 \u8ab2\u7a0e(\u8efd) 8.0% \u6d88\u8cbb\u7a0e\u984d\u3011</td><td class="tv">${data.tax.food.tax.toLocaleString()}</td></tr>
      </table>
    </div>

    <div class="grand-total">
      <div class="gt-l">\u6458\u8981</div>
      <div class="gt-s" style="flex:0 0 100px;">
        <div class="gh">\u6d88 \u8cbb \u7a0e</div>
        <div class="gv">${data.tax.total.toLocaleString()}</div>
      </div>
      <div class="gt-s" style="flex:0 0 120px;">
        <div class="gh">\u58f2 \u4e0a \u5408 \u8a08</div>
        <div class="gv">${data.totals.subtotal.toLocaleString()}</div>
      </div>
      <div class="gt-s" style="flex:0 0 120px;">
        <div class="gh">\u7dcf \u5408 \u8a08</div>
        <div class="gvb">${data.totals.grandTotal.toLocaleString()}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}'''

content = content[:idx_start] + NEW_FUNC + content[idx_end:]

with open(DOCS_PATH, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"\u2705 generateNouhinshoHTML rewritten successfully!")
print(f"   Old size: {old_size} chars")
print(f"   New size: {len(NEW_FUNC)} chars")
print(f"")
print(f"   Changes applied:")
print(f"   \u2713 Removed logo (saves ~80px vertical)")
print(f"   \u2713 Company data LEFT, hanko RIGHT")
print(f"   \u2713 25 rows target (was ~18)")
print(f"   \u2713 Tax label inside amount cell (\u8efd8.0% / \u8ab210.0%)")
print(f"   \u2713 Compact spacing for A4")
print(f"")
print(f"   Next: cd /home/api/htdocs/api.realpan.jp/realpan-api && npx tsc --noEmit && pm2 restart 0")