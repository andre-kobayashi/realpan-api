import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════════
// 会社情報 / Company data (hardcoded for now)
// ═══════════════════════════════════════════════════════════
const COMPANY = {
  name: 'リアルパン株式会社',
  nameEn: 'REAL PAN',
  subtitle: 'PRODUTOS ALIMENTICIOS CONGELADOS\nGARANTIA DE QUALIDADE',
  postalCode: '〒432-8065',
  address: '静岡県浜松市中央区高塚町1620',
  tel: 'TEL(053)570-2555',
  fax: 'FAX(053)570-2560',
  invoiceNumber: 'T5080401023513', // インボイス登録番号
  bank1: {
    name: '浜松磐田信用金庫 可美支店',
    type: '普',
    number: '2106589',
    holder: 'リアルパン㈱ 代表取締役 増子利光',
  },
  bank2: {
    name: 'ゆうちょ銀行',
    number: '12320 - 61244031',
    holder: 'リアルパン株式会社',
  },
};

// Tax rates
const FOOD_TAX_RATE = 0.08;   // 軽減税率 8% (食品)
const SERVICE_TAX_RATE = 0.10; // 標準税率 10% (送料等)

// ═══════════════════════════════════════════════════════════
// Helper: Calculate document data from order
// ═══════════════════════════════════════════════════════════
async function getDocumentData(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      items: { include: { product: true } },
      carrier: true,
    },
  });

  if (!order) throw new Error('Order not found');

  // Calculate tax breakdown
  // Items = food (8%), Shipping/Daibiki = service (10%)
  const foodItems = order.items.map(item => ({
    code: item.hinban,
    name: `${item.nameJa}  ${item.namePt}`,
    nameJa: item.nameJa,
    namePt: item.namePt,
    quantity: item.quantity,
    unit: '袋', // default unit
    unitPrice: item.unitPrice,
    amount: item.subtotal,
    taxRate: FOOD_TAX_RATE,
    discountPercent: item.discountPercent || 0,
  }));

  // Shipping as a line item (10% tax)
  const shippingItem = order.shippingCost > 0 ? {
    code: '410',
    name: 'ドライ送料 FRETE',
    nameJa: 'ドライ送料 FRETE',
    namePt: 'Frete',
    quantity: 1,
    unit: '件',
    unitPrice: order.shippingCost,
    amount: order.shippingCost,
    taxRate: SERVICE_TAX_RATE,
    discountPercent: 0,
  } : null;

  // Tax calculations
  const foodSubtotal = foodItems.reduce((sum, item) => sum + item.amount, 0);
  const foodTax = Math.floor(foodSubtotal * FOOD_TAX_RATE);

  const serviceSubtotal = order.shippingCost + order.daibikiFee;
  const serviceTax = Math.floor(serviceSubtotal * SERVICE_TAX_RATE);

  const totalTax = foodTax + serviceTax;
  const totalBeforeTax = foodSubtotal + serviceSubtotal;
  const grandTotal = totalBeforeTax + totalTax;

  // Customer info
  const customer = order.customer;
  const customerName = customer.companyName
    || `${customer.lastName || ''} ${customer.firstName || ''}`.trim()
    || customer.email;
  const customerCode = customer.id.slice(-4).toUpperCase();

  return {
    company: COMPANY,
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      date: order.createdAt,
      status: order.status,
      paymentMethod: order.paymentMethod,
    },
    customer: {
      id: customer.id,
      code: customerCode,
      name: customerName,
      postalCode: order.shippingPostalCode || customer.postalCode || '',
      address: [
        order.shippingPrefecture || customer.prefecture || '',
        order.shippingCity || customer.city || '',
        order.shippingWard || '',
        order.shippingStreet || customer.streetAddress || '',
        order.shippingBuilding || customer.building || '',
      ].filter(Boolean).join(''),
      phone: order.shippingPhone || customer.phone || '',
    },
    items: [...foodItems, ...(shippingItem ? [shippingItem] : [])],
    tax: {
      food: { rate: FOOD_TAX_RATE, subtotal: foodSubtotal, tax: foodTax, label: '軽減税率 8.0%' },
      service: { rate: SERVICE_TAX_RATE, subtotal: serviceSubtotal, tax: serviceTax, label: '標準税率 10.0%' },
      total: totalTax,
    },
    totals: {
      subtotal: totalBeforeTax,
      tax: totalTax,
      shipping: order.shippingCost,
      daibiki: order.daibikiFee,
      discount: order.discountAmount,
      grandTotal,
    },
    carrier: order.carrier ? { name: order.carrier.name } : null,
    trackingCode: order.trackingCode,
  };
}

// ═══════════════════════════════════════════════════════════
// GET /api/documents/nouhinsho/:orderId
// Returns JSON data for 納品書 preview
// ═══════════════════════════════════════════════════════════
router.get('/nouhinsho/:orderId', async (req, res) => {
  try {
    const data = await getDocumentData(req.params.orderId);
    res.json({ success: true, type: 'nouhinsho', data });
  } catch (error: any) {
    console.error('Error generating nouhinsho:', error);
    res.status(error.message === 'Order not found' ? 404 : 500).json({
      success: false,
      message: error.message || 'Error generating document',
    });
  }
});

// ═══════════════════════════════════════════════════════════
// GET /api/documents/seikyusho/:orderId
// Returns JSON data for 請求書 preview
// ═══════════════════════════════════════════════════════════
router.get('/seikyusho/:orderId', async (req, res) => {
  try {
    const data = await getDocumentData(req.params.orderId);
    res.json({ success: true, type: 'seikyusho', data });
  } catch (error: any) {
    console.error('Error generating seikyusho:', error);
    res.status(error.message === 'Order not found' ? 404 : 500).json({
      success: false,
      message: error.message || 'Error generating document',
    });
  }
});

// ═══════════════════════════════════════════════════════════
// GET /api/documents/nouhinsho/:orderId/html
// Returns printable HTML for 納品書
// ═══════════════════════════════════════════════════════════
router.get('/nouhinsho/:orderId/html', async (req, res) => {
  try {
    const data = await getDocumentData(req.params.orderId);
    const html = generateNouhinshoHTML(data, false);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error: any) {
    res.status(500).send('Error generating document');
  }
});

// ═══════════════════════════════════════════════════════════
// GET /api/documents/seikyusho/:orderId/html
// Returns printable HTML for 請求書
// ═══════════════════════════════════════════════════════════
router.get('/seikyusho/:orderId/html', async (req, res) => {
  try {
    const data = await getDocumentData(req.params.orderId);
    const html = generateNouhinshoHTML(data, true);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error: any) {
    res.status(500).send('Error generating document');
  }
});

// ═══════════════════════════════════════════════════════════
// HTML Generator for 納品書 / 請求書
// ═══════════════════════════════════════════════════════════
function generateNouhinshoHTML(data: any, isSeikyusho: boolean): string {
  const docTitle = isSeikyusho ? '請　求　書' : '納品書（控）';
  const dateStr = new Date(data.order.date).toLocaleDateString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).replace(/\//g, '年').replace(/年/, '年').replace(/\//, '月') + '日';
  // Format: 2026年02月20日
  const d = new Date(data.order.date);
  const formattedDate = `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, '0')}月${String(d.getDate()).padStart(2, '0')}日`;

  const docNumber = data.order.orderNumber.replace('RP-', '').replace(/-/g, '');

  // Generate item rows
  const itemRows = data.items.map((item: any) => {
    const taxLabel = item.taxRate === 0.08 ? '軽8.0%' : '課10.0%';
    return `
      <tr>
        <td class="code">${item.code}</td>
        <td class="name">${item.nameJa}${item.namePt ? ` ${item.namePt}` : ''}${item.taxRate === 0.10 ? `<br><span class="tax-note">課10.0%</span>` : ''}</td>
        <td class="qty">${item.quantity}</td>
        <td class="unit">${item.unit}</td>
        <td class="price">¥${item.unitPrice.toLocaleString()}</td>
        <td class="amount">¥${item.amount.toLocaleString()}</td>
        <td class="notes"></td>
      </tr>`;
  }).join('');

  // Empty rows to fill page
  const emptyRowCount = Math.max(0, 18 - data.items.length);
  const emptyRows = Array(emptyRowCount).fill('<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>').join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>${docTitle} - ${data.order.orderNumber}</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'MS Gothic', 'Hiragino Kaku Gothic Pro', monospace; font-size: 10px; color: #000; background: #fff; }
    .page { width: 190mm; margin: 0 auto; padding: 5mm; }
    
    /* Header */
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
    .header-left { display: flex; gap: 8px; align-items: center; }
    .customer-code { border: 1px solid #000; padding: 2px 8px; font-size: 12px; font-weight: bold; }
    .doc-title { border: 2px solid #000; padding: 4px 16px; font-size: 16px; font-weight: bold; letter-spacing: 4px; }
    .doc-number { display: flex; align-items: center; gap: 8px; }
    .doc-number span { border: 1px solid #000; padding: 2px 8px; font-size: 11px; }
    
    /* Date */
    .date-row { margin: 4px 0; font-size: 10px; }
    
    /* Customer + Company info */
    .info-section { display: flex; justify-content: space-between; margin: 8px 0 12px; }
    .customer-info { flex: 1; }
    .customer-info .label { font-size: 9px; color: #666; }
    .customer-info .name { font-size: 13px; font-weight: bold; margin: 2px 0; }
    .customer-info .address { font-size: 10px; line-height: 1.5; }
    
    .company-info { text-align: right; font-size: 9px; line-height: 1.6; }
    .company-name { font-size: 14px; font-weight: bold; }
    .company-name-en { font-size: 12px; font-weight: bold; }
    
    /* Bank info */
    .bank-info { font-size: 8px; line-height: 1.4; }
    
    /* Items table */
    table.items { width: 100%; border-collapse: collapse; margin: 4px 0; }
    table.items th, table.items td { border: 1px solid #000; padding: 3px 4px; font-size: 9px; }
    table.items th { background: #e0e0e0; font-weight: bold; text-align: center; font-size: 8px; }
    table.items td.code { text-align: center; width: 50px; }
    table.items td.name { width: auto; }
    table.items td.qty { text-align: center; width: 40px; }
    table.items td.unit { text-align: center; width: 30px; }
    table.items td.price { text-align: right; width: 60px; }
    table.items td.amount { text-align: right; width: 70px; }
    table.items td.notes { width: 50px; }
    .tax-note { font-size: 8px; color: #666; }
    
    /* Tax summary rows */
    .tax-row td { font-size: 9px; font-weight: bold; }
    .tax-row td.label { text-align: left; padding-left: 12px; border-right: none; }
    .tax-row td.value { text-align: right; }
    
    /* Footer totals */
    .footer { display: flex; justify-content: space-between; margin-top: 4px; border: 2px solid #000; }
    .footer-cell { padding: 4px 8px; text-align: center; font-size: 9px; border-right: 1px solid #000; flex: 1; }
    .footer-cell:last-child { border-right: none; }
    .footer-cell .label { font-size: 8px; font-weight: bold; background: #e0e0e0; padding: 2px; margin: -4px -8px 4px; }
    .footer-cell .value { font-size: 13px; font-weight: bold; }
    
    .greeting { text-align: right; font-size: 9px; margin-top: 2px; }
    
    @media print {
      body { -webkit-print-color-adjust: exact; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- Header -->
    <div class="header">
      <div class="header-left">
        <div>お客様コード <span class="customer-code">${data.customer.code}</span></div>
        <div class="doc-title">${docTitle}</div>
      </div>
      <div class="doc-number">
        <span>伝票No.</span>
        <span style="font-weight:bold; font-size:13px;">${docNumber}</span>
        <span>PAGE</span>
      </div>
    </div>
    
    <!-- Date -->
    <div class="date-row">日付　${formattedDate}</div>
    
    <!-- Customer + Company -->
    <div class="info-section">
      <div class="customer-info">
        <div class="label">宛名</div>
        <div class="name">${data.customer.name} 様</div>
        <div class="address">
          ${data.customer.postalCode ? `〒${data.customer.postalCode}` : ''}<br>
          ${data.customer.address}
        </div>
      </div>
      <div class="company-info">
        <div class="company-name">${data.company.name}</div>
        <div class="company-name-en">${data.company.nameEn}</div>
        <div style="font-size:8px; white-space:pre-line;">${data.company.subtitle}</div>
        <div>${data.company.postalCode} ${data.company.address}</div>
        <div>${data.company.tel}　${data.company.fax}</div>
        <div>登録番号 ${data.company.invoiceNumber}</div>
        ${isSeikyusho ? `
        <div class="bank-info" style="margin-top:4px;">
          （振込先）<br>
          ${data.company.bank1.name} ${data.company.bank1.type} ${data.company.bank1.number}<br>
          ${data.company.bank1.holder}<br>
          ${data.company.bank2.name} ${data.company.bank2.number}<br>
          ${data.company.bank2.holder}
        </div>` : ''}
      </div>
    </div>
    
    <div class="greeting">毎度ありがとうございます。</div>
    
    <!-- Items Table -->
    <table class="items">
      <thead>
        <tr>
          <th>商品コード</th>
          <th>商　品　名</th>
          <th>数　量</th>
          <th>単位</th>
          <th>単　価</th>
          <th>売上金額</th>
          <th>備　考</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
        ${emptyRows}
        
        <!-- Tax summary -->
        <tr class="tax-row">
          <td colspan="4"></td>
          <td colspan="2" class="label">【合計 課税10.0% 税抜額】</td>
          <td class="value">${data.tax.service.subtotal.toLocaleString()}</td>
        </tr>
        <tr class="tax-row">
          <td colspan="4"></td>
          <td colspan="2" class="label">【合計 課税10.0% 消費税額】</td>
          <td class="value">${data.tax.service.tax.toLocaleString()}</td>
        </tr>
        <tr class="tax-row">
          <td colspan="4"></td>
          <td colspan="2" class="label">【合計 課税(軽) 8.0% 税抜額】</td>
          <td class="value">${data.tax.food.subtotal.toLocaleString()}</td>
        </tr>
        <tr class="tax-row">
          <td colspan="4"></td>
          <td colspan="2" class="label">【合計 課税(軽) 8.0% 消費税額】</td>
          <td class="value">${data.tax.food.tax.toLocaleString()}</td>
        </tr>
      </tbody>
    </table>
    
    <!-- Footer -->
    <div class="footer">
      <div class="footer-cell">
        <div class="label">摘要</div>
      </div>
      <div class="footer-cell">
        <div class="label">消　費　税</div>
        <div class="value">${data.tax.total.toLocaleString()}</div>
      </div>
      <div class="footer-cell">
        <div class="label">売　上　合　計</div>
        <div class="value">${data.totals.subtotal.toLocaleString()}</div>
      </div>
      <div class="footer-cell">
        <div class="label">総　合　計</div>
        <div class="value">${data.totals.grandTotal.toLocaleString()}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════
// GET /api/documents/ryoushusho/:orderId/html
// 領収書 (Recibo) — para retirada na fábrica ou pagamento confirmado
// ═══════════════════════════════════════════════════════════
router.get('/ryoushusho/:orderId/html', async (req, res) => {
  try {
    const data = await getDocumentData(req.params.orderId);
    const html = generateRyoushushoHTML(data);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error: any) {
    res.status(500).send('Error generating document');
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/documents/matomete-seikyusho/html
// 請求明細書 (Fatura consolidada mensal)
// Body: { customerId, year, month, orderIds? }
// Se orderIds não fornecido, pega todos do mês
// ═══════════════════════════════════════════════════════════
router.post('/matomete-seikyusho/html', async (req, res) => {
  try {
    const { customerId, year, month, orderIds } = req.body;

    if (!customerId || !year || !month) {
      return res.status(400).json({ success: false, message: 'customerId, year, month required' });
    }

    // Buscar cliente
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    // Buscar pedidos do mês ou selecionados
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    let orders;
    if (orderIds && orderIds.length > 0) {
      // Seleção manual
      orders = await prisma.order.findMany({
        where: { id: { in: orderIds }, customerId },
        include: { items: { include: { product: true } }, carrier: true },
        orderBy: { createdAt: 'asc' },
      });
    } else {
      // Todos do mês
      orders = await prisma.order.findMany({
        where: { customerId, createdAt: { gte: startDate, lte: endDate } },
        include: { items: { include: { product: true } }, carrier: true },
        orderBy: { createdAt: 'asc' },
      });
    }

    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'No orders found for this period' });
    }

    // Buscar último mês para calcular 繰越金額 (carried over)
    const prevMonthEnd = new Date(year, month - 1, 0, 23, 59, 59);
    const prevOrders = await prisma.order.findMany({
      where: { customerId, createdAt: { lte: prevMonthEnd }, paymentStatus: { in: ['PENDING', 'INVOICED'] } },
      select: { total: true },
    });
    const previousBalance = prevOrders.reduce((sum, o) => sum + (o.total || 0), 0);

    // Calcular totais
    const customerName = customer.companyName
      || `${customer.lastName || ''} ${customer.firstName || ''}`.trim()
      || customer.email;
    const customerCode = customer.id.slice(-4).toUpperCase();

    let totalFoodSubtotal = 0;
    let totalServiceSubtotal = 0;

    const orderEntries = orders.map(order => {
      const items = order.items.map(item => ({
        code: item.hinban,
        name: `${item.nameJa}  ${item.namePt}`,
        quantity: item.quantity,
        unit: '袋',
        unitPrice: item.unitPrice,
        amount: item.subtotal,
        taxRate: FOOD_TAX_RATE,
      }));

      const shippingItem = order.shippingCost > 0 ? {
        code: '410',
        name: 'ドライ送料 FRETE',
        quantity: 1,
        unit: '件',
        unitPrice: order.shippingCost,
        amount: order.shippingCost,
        taxRate: SERVICE_TAX_RATE,
      } : null;

      const foodSub = items.reduce((s, i) => s + i.amount, 0);
      const serviceSub = order.shippingCost + order.daibikiFee;
      totalFoodSubtotal += foodSub;
      totalServiceSubtotal += serviceSub;

      return {
        date: order.createdAt,
        orderNumber: order.orderNumber,
        items: [...items, ...(shippingItem ? [shippingItem] : [])],
        subtotal: foodSub + serviceSub,
      };
    });

    const totalFoodTax = Math.floor(totalFoodSubtotal * FOOD_TAX_RATE);
    const totalServiceTax = Math.floor(totalServiceSubtotal * SERVICE_TAX_RATE);
    const totalTax = totalFoodTax + totalServiceTax;
    const totalBeforeTax = totalFoodSubtotal + totalServiceSubtotal;
    const grandTotal = totalBeforeTax + totalTax;

    // Número sequencial do documento
    const docNumber = `${String(year).slice(-2)}${String(month).padStart(2, '0')}-${customerCode}`;

    const html = generateMatometeHTML({
      company: COMPANY,
      customer: {
        code: customerCode,
        name: customerName,
        postalCode: customer.postalCode || '',
        address: [customer.prefecture, customer.city, customer.ward, customer.streetAddress, customer.building].filter(Boolean).join(''),
      },
      period: { year, month, label: `${year}年${month}月${new Date(year, month - 1, new Date(year, month, 0).getDate()).getDate()}日 締切分` },
      docNumber: `00000${docNumber}`.slice(-8),
      previousBalance,
      payment: 0, // TODO: track payments
      carriedOver: previousBalance,
      orders: orderEntries,
      tax: {
        food: { subtotal: totalFoodSubtotal, tax: totalFoodTax },
        service: { subtotal: totalServiceSubtotal, tax: totalServiceTax },
        total: totalTax,
      },
      totals: { subtotal: totalBeforeTax, tax: totalTax, grandTotal },
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error: any) {
    console.error('Error generating matomete seikyusho:', error);
    res.status(500).json({ success: false, message: error.message || 'Error' });
  }
});

// ═══════════════════════════════════════════════════════════
// 領収書 HTML Generator
// ═══════════════════════════════════════════════════════════
function generateRyoushushoHTML(data: any): string {
  const d = new Date(data.order.date);
  const formattedDate = `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, '0')}月${String(d.getDate()).padStart(2, '0')}日`;
  const docNumber = data.order.orderNumber.replace('RP-', '').replace(/-/g, '');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>領収書 - ${data.order.orderNumber}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'MS Gothic', 'Hiragino Kaku Gothic Pro', monospace; font-size: 11px; color: #000; background: #fff; }
    .page { width: 180mm; margin: 0 auto; padding: 10mm; }
    .title { text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 8px; border-bottom: 3px double #000; padding-bottom: 8px; margin-bottom: 20px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 20px; }
    .customer { flex: 1; }
    .customer .name { font-size: 18px; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 4px; margin-bottom: 8px; }
    .amount-box { text-align: center; border: 2px solid #000; padding: 12px 24px; margin: 20px auto; display: inline-block; }
    .amount-box .label { font-size: 12px; margin-bottom: 4px; }
    .amount-box .value { font-size: 28px; font-weight: bold; }
    .details { margin-top: 20px; }
    .details table { width: 100%; border-collapse: collapse; }
    .details th, .details td { border: 1px solid #000; padding: 4px 8px; font-size: 10px; }
    .details th { background: #e0e0e0; }
    .company { text-align: right; margin-top: 20px; font-size: 10px; line-height: 1.6; }
    .company-name { font-size: 14px; font-weight: bold; }
    .stamp { width: 60px; height: 60px; border: 2px solid #c00; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #c00; font-size: 14px; font-weight: bold; margin-left: auto; margin-top: 10px; }
    .note { margin-top: 15px; font-size: 9px; color: #666; border-top: 1px solid #ccc; padding-top: 8px; }
    @media print { .no-print { display: none; } body { -webkit-print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="page">
    <div class="title">領　収　書</div>
    
    <div class="header">
      <div class="customer">
        <div class="name">${data.customer.name} 様</div>
        <div style="font-size:10px; margin-top:4px;">
          ${data.customer.postalCode ? `〒${data.customer.postalCode}` : ''}<br>
          ${data.customer.address}
        </div>
      </div>
      <div style="text-align:right; font-size:10px;">
        <div>日付: ${formattedDate}</div>
        <div>No. ${docNumber}</div>
      </div>
    </div>

    <div style="text-align:center; margin: 20px 0;">
      <div class="amount-box">
        <div class="label">領収金額（税込）</div>
        <div class="value">¥${data.totals.grandTotal.toLocaleString()}</div>
      </div>
      <div style="margin-top:8px; font-size:10px;">但し、上記金額を${data.order.paymentMethod === 'DAIBIKI' ? '代金引換' : data.order.paymentMethod === 'STRIPE' ? 'クレジットカード' : '商品代金'}として正に領収いたしました。</div>
    </div>

    <div class="details">
      <table>
        <tr><th style="width:30%">内訳</th><th style="width:35%">税抜金額</th><th style="width:35%">消費税</th></tr>
        <tr><td>商品代金（軽減税率 8%）</td><td style="text-align:right">¥${data.tax.food.subtotal.toLocaleString()}</td><td style="text-align:right">¥${data.tax.food.tax.toLocaleString()}</td></tr>
        <tr><td>送料等（標準税率 10%）</td><td style="text-align:right">¥${data.tax.service.subtotal.toLocaleString()}</td><td style="text-align:right">¥${data.tax.service.tax.toLocaleString()}</td></tr>
        <tr style="font-weight:bold"><td>合計</td><td style="text-align:right">¥${data.totals.subtotal.toLocaleString()}</td><td style="text-align:right">¥${data.tax.total.toLocaleString()}</td></tr>
      </table>
    </div>

    <div class="company">
      <div class="company-name">${data.company.name}</div>
      <div>${data.company.nameEn}</div>
      <div>${data.company.postalCode} ${data.company.address}</div>
      <div>${data.company.tel}　${data.company.fax}</div>
      <div>登録番号 ${data.company.invoiceNumber}</div>
      <div class="stamp">㊞</div>
    </div>

    <div class="note">
      ※ この領収書は、商品引渡し時に発行されたものです。<br>
      ※ Este recibo é emitido no momento da entrega do produto.
    </div>
  </div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════
// 請求明細書 HTML Generator
// ═══════════════════════════════════════════════════════════
function generateMatometeHTML(data: any): string {
  const { company, customer, period, orders, tax, totals, previousBalance, payment, carriedOver } = data;

  // Build order rows
  let orderRowsHTML = '';
  for (const order of orders) {
    const orderDate = new Date(order.date);
    const dateStr = `${String(orderDate.getMonth() + 1).padStart(2, '0')}.${String(orderDate.getDate()).padStart(2, '0')}`;
    const orderNum = order.orderNumber.replace('RP-', '').replace(/-/g, '').slice(-3);

    for (const item of order.items) {
      const taxLabel = item.taxRate === 0.08 ? '軽8.0%' : '課10.0%';
      orderRowsHTML += `
        <tr>
          <td class="date">${dateStr}</td>
          <td class="code">${item.code}</td>
          <td class="name">${item.name}${item.taxRate === 0.10 ? '<br><span class="tax-note">課10.0%</span>' : ''}</td>
          <td class="qty">${item.quantity}</td>
          <td class="unit">${item.unit}</td>
          <td class="price">${item.unitPrice.toLocaleString()}</td>
          <td class="amount">${item.amount.toLocaleString()}</td>
        </tr>`;
    }

    // Order subtotal row
    orderRowsHTML += `
      <tr class="order-sub">
        <td colspan="5"></td>
        <td class="label">＜＜伝票計＞＞</td>
        <td class="amount">${order.subtotal.toLocaleString()}</td>
      </tr>`;
  }

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>請求明細書 - ${customer.name} - ${period.year}年${period.month}月</title>
  <style>
    @page { size: A4; margin: 8mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'MS Gothic', 'Hiragino Kaku Gothic Pro', monospace; font-size: 9px; color: #000; background: #fff; }
    .page { width: 190mm; margin: 0 auto; padding: 5mm; }
    .doc-title { text-align: center; font-size: 16px; font-weight: bold; letter-spacing: 4px; border: 2px solid #000; display: inline-block; padding: 4px 20px; }
    .header { display: flex; justify-content: space-between; margin: 10px 0; }
    .customer-info { font-size: 10px; }
    .customer-info .name { font-size: 12px; font-weight: bold; }
    .company-info { text-align: right; font-size: 8px; line-height: 1.5; }
    .company-name { font-size: 12px; font-weight: bold; }
    .stamp-circle { width: 40px; height: 40px; border: 2px solid #c00; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: #c00; font-size: 10px; font-weight: bold; float: right; margin-top: 5px; }
    
    /* Summary table */
    .summary { width: 100%; border-collapse: collapse; margin: 10px 0; }
    .summary th, .summary td { border: 1px solid #000; padding: 3px 6px; text-align: center; font-size: 9px; }
    .summary th { background: #e8e8e8; font-size: 8px; }
    .summary .value { font-size: 12px; font-weight: bold; }
    
    /* Items table */
    .items { width: 100%; border-collapse: collapse; margin: 8px 0; }
    .items th, .items td { border: 1px solid #000; padding: 2px 4px; font-size: 8px; }
    .items th { background: #e0e0e0; font-size: 7px; text-align: center; }
    .items td.date { width: 35px; text-align: center; }
    .items td.code { width: 30px; text-align: center; }
    .items td.name { width: auto; }
    .items td.qty { width: 30px; text-align: center; }
    .items td.unit { width: 25px; text-align: center; }
    .items td.price { width: 50px; text-align: right; }
    .items td.amount { width: 60px; text-align: right; }
    .items td.label { text-align: right; font-size: 7px; font-weight: bold; }
    .tax-note { font-size: 7px; color: #666; }
    .order-sub td { border-top: 1px dashed #999; font-weight: bold; font-size: 8px; }
    
    /* Tax summary */
    .tax-summary { margin: 8px 0; }
    .tax-summary td { font-size: 8px; padding: 2px 6px; border: 1px solid #000; }
    .tax-summary .label { text-align: left; font-weight: bold; }
    .tax-summary .value { text-align: right; }
    
    .greeting { font-size: 9px; margin: 5px 0; }
    @media print { .no-print { display: none; } body { -webkit-print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="page">
    <!-- Title -->
    <div style="text-align:center; margin-bottom:10px;">
      <span class="doc-title">請　求　明　細　書</span>
      <div style="float:right; font-size:9px;">PAGE 1<br>請求No. ${data.docNumber}</div>
    </div>
    
    <!-- Period -->
    <div style="text-align:right; font-size:9px; margin-bottom:5px;">
      ${period.year}年 ${period.month}月${new Date(period.year, period.month, 0).getDate()}日 締切分
    </div>
    
    <!-- Header -->
    <div class="header">
      <div class="customer-info">
        <div>${customer.postalCode ? `〒${customer.postalCode}` : ''}</div>
        <div>${customer.address}</div>
        <div class="name" style="margin-top:4px;">${customer.name}</div>
      </div>
      <div class="company-info">
        <div class="company-name">${company.name}</div>
        <div>${company.postalCode} ${company.address}</div>
        <div>${company.tel} ${company.fax}</div>
        <div>登録番号 ${company.invoiceNumber}</div>
        <div style="margin-top:4px;">
          【振込先】<br>
          ${company.bank1.name} ${company.bank1.type} ${company.bank1.number}<br>
          ${company.bank2.name} ${company.bank2.number}
        </div>
        <div class="stamp-circle">㊞</div>
      </div>
    </div>
    
    <div class="greeting">下記の通り御請求申し上げます</div>
    
    <!-- Summary -->
    <table class="summary">
      <tr>
        <th>前回御請求額</th>
        <th>御入金額</th>
        <th>繰越金額</th>
        <th>今回御買上額</th>
        <th>消費税</th>
        <th>今回御請求額</th>
      </tr>
      <tr>
        <td class="value">${previousBalance.toLocaleString()}</td>
        <td class="value">${payment.toLocaleString()}</td>
        <td class="value">${carriedOver.toLocaleString()}</td>
        <td class="value">${totals.subtotal.toLocaleString()}</td>
        <td class="value">${tax.total.toLocaleString()}</td>
        <td class="value" style="font-size:14px; color:#c00;">${(carriedOver + totals.grandTotal).toLocaleString()}</td>
      </tr>
    </table>
    
    <!-- Items -->
    <table class="items">
      <thead>
        <tr>
          <th>日付</th>
          <th>品番</th>
          <th>商品コード/商品名</th>
          <th>数量</th>
          <th>単位</th>
          <th>単価</th>
          <th>金額</th>
        </tr>
      </thead>
      <tbody>
        ${orderRowsHTML}
      </tbody>
    </table>
    
    <!-- Tax breakdown -->
    <table class="tax-summary" style="width:50%; margin-left:auto;">
      <tr><td class="label">【合計 課税10.0% 税抜額】</td><td class="value">${tax.service.subtotal.toLocaleString()}</td></tr>
      <tr><td class="label">【合計 課税10.0% 消費税額】</td><td class="value">${tax.service.tax.toLocaleString()}</td></tr>
      <tr><td class="label">【合計 課税(軽) 8.0% 税抜額】</td><td class="value">${tax.food.subtotal.toLocaleString()}</td></tr>
      <tr><td class="label">【合計 課税(軽) 8.0% 消費税額】</td><td class="value">${tax.food.tax.toLocaleString()}</td></tr>
    </table>
  </div>
</body>
</html>`;
}

export default router;