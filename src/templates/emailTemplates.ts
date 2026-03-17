// ═══════════════════════════════════════════════════════════
// Real Pan - Email Templates (Bilíngue PT/JA)
// ═══════════════════════════════════════════════════════════

interface OrderItem {
  namePt: string;
  nameJa: string;
  hinban: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  image?: string | null;
}

interface OrderData {
  orderNumber: string;
  items: OrderItem[];
  subtotal: number;
  taxAmount: number;
  shippingCost: number;
  daibikiFee: number;
  discountAmount: number;
  total: number;
  paymentMethod: string;
  customerName: string;
  customerEmail: string;
  customerType: 'INDIVIDUAL' | 'BUSINESS';
  shippingName: string;
  shippingPostalCode: string;
  shippingPrefecture: string;
  shippingCity: string;
  shippingWard?: string;
  shippingStreet: string;
  shippingBuilding?: string;
  deliveryDate?: string | null;
  deliveryTime?: string | null;
  trackingCode?: string | null;
  carrierName?: string | null;
}

interface CustomerData {
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  email: string;
  type: 'INDIVIDUAL' | 'BUSINESS';
  businessStatus?: string | null;
}

interface TemplateConfig {
  logoUrl: string | null;
  companyName: string;
  companyNameJa: string | null;
  phone: string;
  website: string;
}

const COLORS = {
  navy: '#1A2740',
  navyLight: '#2C4A6E',
  gold: '#C9A96E',
  goldLight: '#E8D5B0',
  goldBg: '#FDF8ED',
  cream: '#FAF6F0',
  white: '#FFFFFF',
  gray100: '#F8F9FA',
  gray200: '#E9ECEF',
  gray500: '#6C757D',
  gray700: '#495057',
  gray900: '#212529',
  green: '#2E7D32',
  greenBg: '#E8F5E9',
  red: '#C62828',
  redBg: '#FFEBEE',
  blue: '#1565C0',
  blueBg: '#E3F2FD',
};

function baseLayout(content: string, config: TemplateConfig): string {
  const logoHtml = config.logoUrl
    ? `<img src="https://api.realpan.jp${config.logoUrl}" alt="${config.companyName}" style="height: 48px; display: block; margin: 0 auto;" />`
    : `<div style="font-family: Georgia, 'Times New Roman', serif; font-size: 26px; font-weight: 700; color: ${COLORS.navy}; text-align: center; letter-spacing: 1px;">&#x1F35E; Real Pan</div>`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${config.companyName}</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${COLORS.cream}; font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic Pro', 'Yu Gothic', sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${COLORS.cream};">
    <tr>
      <td align="center" style="padding: 30px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">
          <tr>
            <td style="padding: 24px 0; text-align: center;">
              ${logoHtml}
            </td>
          </tr>
          <tr>
            <td style="background-color: ${COLORS.white}; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 12px rgba(26,39,64,0.08);">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 20px; text-align: center;">
              <p style="margin: 0 0 8px; font-size: 13px; color: ${COLORS.gray500};">
                ${config.companyName}${config.companyNameJa ? ` / ${config.companyNameJa}` : ''}
              </p>
              <p style="margin: 0 0 8px; font-size: 12px; color: ${COLORS.gray500};">
                &#x1F4DE; ${config.phone} &nbsp;|&nbsp; &#x1F310; <a href="${config.website}" style="color: ${COLORS.gold}; text-decoration: none;">${config.website.replace('https://', '')}</a>
              </p>
              <p style="margin: 0; font-size: 11px; color: #adb5bd;">
                &#x3053;&#x306E;&#x30E1;&#x30FC;&#x30EB;&#x306F;&#x81EA;&#x52D5;&#x9001;&#x4FE1;&#x3067;&#x3059;&#x3002;&#x8FD4;&#x4FE1;&#x306F; clientrealpan@gmail.com &#x307E;&#x3067;&#x3002;<br/>
                Este email &#xE9; autom&#xE1;tico. Responda para clientrealpan@gmail.com
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function formatPrice(yen: number): string {
  return `&#xA5;${yen.toLocaleString('ja-JP')}`;
}

function paymentLabel(method: string): { ja: string; pt: string } {
  const labels: Record<string, { ja: string; pt: string }> = {
    STRIPE: { ja: 'クレジットカード', pt: 'Cart\u00e3o de cr\u00e9dito' },
    DAIBIKI: { ja: '代引き', pt: 'Pagamento na entrega' },
    BANK_TRANSFER: { ja: '銀行振込', pt: 'Transfer\u00eancia banc\u00e1ria' },
    KONBINI: { ja: 'コンビニ払い', pt: 'Pagamento em konbini' },
    PAYPAY: { ja: 'PayPay', pt: 'PayPay' },
    INVOICE: { ja: '請求書払い', pt: 'Faturamento mensal' },
  };
  return labels[method] || { ja: method, pt: method };
}

// ═══════════════════════════════════════════════════════════
// TEMPLATE 1: ORDER CONFIRMATION
// ═══════════════════════════════════════════════════════════
export function orderConfirmationTemplate(order: OrderData, config: TemplateConfig): { subject: string; html: string } {
  const payment = paymentLabel(order.paymentMethod);

  const itemRows = order.items.map((item) => `
    <tr style="border-bottom: 1px solid ${COLORS.gray200};">
      <td style="padding: 12px 16px; vertical-align: middle;">
        ${item.image
          ? `<img src="https://api.realpan.jp/${item.image.replace(/^\//, '')}" alt="" style="width: 44px; height: 44px; border-radius: 8px; object-fit: cover;" />`
          : `<div style="width: 44px; height: 44px; border-radius: 8px; background: ${COLORS.cream}; text-align: center; line-height: 44px; font-size: 20px;">&#x1F35E;</div>`
        }
      </td>
      <td style="padding: 12px 8px; vertical-align: middle;">
        <div style="font-size: 14px; font-weight: 600; color: ${COLORS.navy};">${item.nameJa}</div>
        <div style="font-size: 12px; color: ${COLORS.gray500};">${item.namePt} &#x2022; ${item.hinban}</div>
      </td>
      <td style="padding: 12px 8px; text-align: center; vertical-align: middle; font-size: 14px; color: ${COLORS.gray700};">
        &#xD7;${item.quantity}
      </td>
      <td style="padding: 12px 16px; text-align: right; vertical-align: middle; font-size: 14px; font-weight: 600; color: ${COLORS.navy};">
        ${formatPrice(item.subtotal)}
      </td>
    </tr>
  `).join('');

  const deliveryHtml = order.deliveryDate ? `
    <tr>
      <td style="padding: 8px 16px; font-size: 13px; color: ${COLORS.gray500};">&#x914D;&#x9054;&#x5E0C;&#x671B;&#x65E5; / Data de entrega</td>
      <td style="padding: 8px 16px; font-size: 13px; color: ${COLORS.navy}; text-align: right; font-weight: 600;">
        ${order.deliveryDate}${order.deliveryTime ? ` ${order.deliveryTime}` : ''}
      </td>
    </tr>
  ` : '';

  const trackingHtml = order.trackingCode ? `
    <div style="background: ${COLORS.blueBg}; border-radius: 10px; padding: 16px; margin: 16px 24px 0; text-align: center;">
      <div style="font-size: 12px; color: ${COLORS.blue}; margin-bottom: 4px;">&#x8FFD;&#x8DE1;&#x756A;&#x53F7; / C&#xF3;digo de rastreio</div>
      <div style="font-size: 18px; font-weight: 700; color: ${COLORS.navy}; font-family: 'Courier New', monospace; letter-spacing: 2px;">${order.trackingCode}</div>
      ${order.carrierName ? `<div style="font-size: 12px; color: ${COLORS.gray500}; margin-top: 4px;">${order.carrierName}</div>` : ''}
    </div>
  ` : '';

  const content = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="background: linear-gradient(135deg, ${COLORS.navy} 0%, ${COLORS.navyLight} 100%); padding: 32px 24px; text-align: center;">
      <div style="font-size: 40px; margin-bottom: 12px;">&#x2705;</div>
      <h1 style="margin: 0 0 6px; font-size: 22px; font-weight: 700; color: ${COLORS.white};">
        &#x3054;&#x6CE8;&#x6587;&#x3042;&#x308A;&#x304C;&#x3068;&#x3046;&#x3054;&#x3056;&#x3044;&#x307E;&#x3059;
      </h1>
      <p style="margin: 0; font-size: 14px; color: ${COLORS.goldLight};">
        Pedido confirmado com sucesso!
      </p>
    </td>
    </tr></table>

    <div style="text-align: center; padding: 20px 24px 0;">
      <div style="display: inline-block; background: ${COLORS.goldBg}; border: 2px solid ${COLORS.gold}; border-radius: 10px; padding: 10px 24px;">
        <div style="font-size: 11px; color: ${COLORS.gray500}; text-transform: uppercase; letter-spacing: 1px;">&#x6CE8;&#x6587;&#x756A;&#x53F7; / N&#xBA; Pedido</div>
        <div style="font-size: 22px; font-weight: 800; color: ${COLORS.navy}; font-family: 'Courier New', monospace; letter-spacing: 2px;">${order.orderNumber}</div>
      </div>
    </div>

    <div style="padding: 20px 24px 0;">
      <h3 style="margin: 0 0 12px; font-size: 15px; font-weight: 700; color: ${COLORS.navy}; border-bottom: 2px solid ${COLORS.gold}; padding-bottom: 8px;">
        &#x1F4E6; &#x5546;&#x54C1;&#x660E;&#x7D30; / Itens do Pedido
      </h3>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${itemRows}
      </table>
    </div>

    <div style="padding: 16px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: ${COLORS.gray100}; border-radius: 10px;">
        <tr>
          <td style="padding: 8px 16px; font-size: 13px; color: ${COLORS.gray500};">&#x5C0F;&#x8A08; / Subtotal</td>
          <td style="padding: 8px 16px; font-size: 13px; color: ${COLORS.gray700}; text-align: right;">${formatPrice(order.subtotal)}</td>
        </tr>
        ${order.discountAmount > 0 ? `
        <tr>
          <td style="padding: 8px 16px; font-size: 13px; color: ${COLORS.green};">&#x5272;&#x5F15; / Desconto</td>
          <td style="padding: 8px 16px; font-size: 13px; color: ${COLORS.green}; text-align: right;">-${formatPrice(order.discountAmount)}</td>
        </tr>` : ''}
        <tr>
          <td style="padding: 8px 16px; font-size: 13px; color: ${COLORS.gray500};">&#x6D88;&#x8CBB;&#x7A0E; / Imposto</td>
          <td style="padding: 8px 16px; font-size: 13px; color: ${COLORS.gray700}; text-align: right;">${formatPrice(order.taxAmount)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 16px; font-size: 13px; color: ${COLORS.gray500};">&#x9001;&#x6599; / Frete</td>
          <td style="padding: 8px 16px; font-size: 13px; color: ${COLORS.gray700}; text-align: right;">${order.shippingCost > 0 ? formatPrice(order.shippingCost) : '&#x7121;&#x6599; / Gr&#xE1;tis'}</td>
        </tr>
        ${order.daibikiFee > 0 ? `
        <tr>
          <td style="padding: 8px 16px; font-size: 13px; color: ${COLORS.gray500};">&#x4EE3;&#x5F15;&#x624B;&#x6570;&#x6599; / Taxa Daibiki</td>
          <td style="padding: 8px 16px; font-size: 13px; color: ${COLORS.gray700}; text-align: right;">${formatPrice(order.daibikiFee)}</td>
        </tr>` : ''}
        ${deliveryHtml}
        <tr>
          <td style="padding: 12px 16px; font-size: 16px; font-weight: 800; color: ${COLORS.navy}; border-top: 2px solid ${COLORS.gold};">&#x5408;&#x8A08; / Total</td>
          <td style="padding: 12px 16px; font-size: 20px; font-weight: 800; color: ${COLORS.navy}; text-align: right; border-top: 2px solid ${COLORS.gold};">${formatPrice(order.total)}</td>
        </tr>
      </table>
    </div>

    <div style="padding: 0 24px 16px;">
      <div style="background: ${COLORS.goldBg}; border-radius: 10px; padding: 12px 16px;">
        <span style="font-size: 12px; color: ${COLORS.gray500};">&#x1F4B3; &#x304A;&#x652F;&#x6255;&#x3044;&#x65B9;&#x6CD5; / Pagamento:</span>
        <span style="font-size: 13px; font-weight: 600; color: ${COLORS.navy}; margin-left: 8px;">${payment.ja} / ${payment.pt}</span>
      </div>
    </div>

    ${trackingHtml}

    <div style="padding: 16px 24px 24px;">
      <h3 style="margin: 0 0 10px; font-size: 15px; font-weight: 700; color: ${COLORS.navy};">&#x1F4CD; &#x914D;&#x9001;&#x5148; / Endere&#xE7;o de Entrega</h3>
      <div style="background: ${COLORS.gray100}; border-radius: 10px; padding: 14px 16px; font-size: 13px; color: ${COLORS.gray700}; line-height: 1.7;">
        <strong>${order.shippingName}</strong><br/>
        &#x3012;${order.shippingPostalCode}<br/>
        ${order.shippingPrefecture}${order.shippingCity}${order.shippingWard || ''}${order.shippingStreet}
        ${order.shippingBuilding ? `<br/>${order.shippingBuilding}` : ''}
      </div>
    </div>

    <div style="padding: 0 24px 32px; text-align: center;">
      <a href="https://realpan.jp/account/orders"
         style="display: inline-block; background: ${COLORS.navy}; color: ${COLORS.white}; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-size: 14px; font-weight: 700; letter-spacing: 0.5px;">
        &#x6CE8;&#x6587;&#x3092;&#x78BA;&#x8A8D;&#x3059;&#x308B; / Ver Pedido &#x2192;
      </a>
    </div>
  `;

  return {
    subject: `&#x2705; &#x3054;&#x6CE8;&#x6587;&#x78BA;&#x8A8D; ${order.orderNumber} / Confirma&#xE7;&#xE3;o do Pedido - ${config.companyName}`,
    html: baseLayout(content, config),
  };
}


// ═══════════════════════════════════════════════════════════
// TEMPLATE 2: WELCOME NEW CUSTOMER (PF)
// ═══════════════════════════════════════════════════════════
export function welcomeCustomerTemplate(customer: CustomerData, config: TemplateConfig): { subject: string; html: string } {
  const name = customer.firstName
    ? `${customer.lastName || ''} ${customer.firstName}`.trim()
    : customer.email;

  const content = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="background: linear-gradient(135deg, ${COLORS.navy} 0%, ${COLORS.navyLight} 100%); padding: 36px 24px; text-align: center;">
      <div style="font-size: 44px; margin-bottom: 14px;">&#x1F389;</div>
      <h1 style="margin: 0 0 6px; font-size: 22px; font-weight: 700; color: ${COLORS.white};">
        &#x3088;&#x3046;&#x3053;&#x305D;&#x3001;${name} &#x69D8;
      </h1>
      <p style="margin: 0; font-size: 14px; color: ${COLORS.goldLight};">
        Bem-vindo(a) &#xE0; Real Pan!
      </p>
    </td>
    </tr></table>

    <div style="padding: 28px 24px;">
      <p style="font-size: 15px; color: ${COLORS.gray700}; line-height: 1.8; margin: 0 0 20px;">
        &#x4F1A;&#x54E1;&#x767B;&#x9332;&#x304C;&#x5B8C;&#x4E86;&#x3057;&#x307E;&#x3057;&#x305F;&#x3002;<br/>
        Sua conta foi criada com sucesso!
      </p>

      <div style="background: ${COLORS.greenBg}; border-radius: 10px; padding: 16px; margin-bottom: 20px;">
        <div style="font-size: 14px; color: ${COLORS.green}; font-weight: 600; margin-bottom: 6px;">&#x2705; &#x30A2;&#x30AB;&#x30A6;&#x30F3;&#x30C8;&#x60C5;&#x5831; / Dados da Conta</div>
        <div style="font-size: 13px; color: ${COLORS.gray700};">
          <strong>&#x30E1;&#x30FC;&#x30EB; / Email:</strong> ${customer.email}
        </div>
      </div>

      <h3 style="font-size: 15px; color: ${COLORS.navy}; margin: 24px 0 12px; font-weight: 700;">&#x1F6D2; &#x304A;&#x8CB7;&#x3044;&#x7269;&#x30AC;&#x30A4;&#x30C9; / Guia de Compras</h3>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding: 10px; width: 33%; text-align: center; vertical-align: top;">
            <div style="background: ${COLORS.goldBg}; border-radius: 12px; padding: 16px 8px;">
              <div style="font-size: 28px; margin-bottom: 8px;">&#x1F50D;</div>
              <div style="font-size: 12px; font-weight: 600; color: ${COLORS.navy};">&#x5546;&#x54C1;&#x3092;&#x63A2;&#x3059;</div>
              <div style="font-size: 11px; color: ${COLORS.gray500}; margin-top: 4px;">Explore os produtos</div>
            </div>
          </td>
          <td style="padding: 10px; width: 33%; text-align: center; vertical-align: top;">
            <div style="background: ${COLORS.goldBg}; border-radius: 12px; padding: 16px 8px;">
              <div style="font-size: 28px; margin-bottom: 8px;">&#x1F6D2;</div>
              <div style="font-size: 12px; font-weight: 600; color: ${COLORS.navy};">&#x30AB;&#x30FC;&#x30C8;&#x306B;&#x8FFD;&#x52A0;</div>
              <div style="font-size: 11px; color: ${COLORS.gray500}; margin-top: 4px;">Adicione ao carrinho</div>
            </div>
          </td>
          <td style="padding: 10px; width: 33%; text-align: center; vertical-align: top;">
            <div style="background: ${COLORS.goldBg}; border-radius: 12px; padding: 16px 8px;">
              <div style="font-size: 28px; margin-bottom: 8px;">&#x1F69A;</div>
              <div style="font-size: 12px; font-weight: 600; color: ${COLORS.navy};">&#x304A;&#x5C4A;&#x3051;</div>
              <div style="font-size: 11px; color: ${COLORS.gray500}; margin-top: 4px;">Receba em casa</div>
            </div>
          </td>
        </tr>
      </table>
    </div>

    <div style="padding: 0 24px 32px; text-align: center;">
      <a href="https://realpan.jp/products"
         style="display: inline-block; background: ${COLORS.gold}; color: ${COLORS.navy}; text-decoration: none; padding: 14px 36px; border-radius: 10px; font-size: 14px; font-weight: 700; letter-spacing: 0.5px;">
        &#x1F35E; &#x5546;&#x54C1;&#x3092;&#x898B;&#x308B; / Ver Produtos &#x2192;
      </a>
    </div>
  `;

  return {
    subject: `&#x1F389; &#x3088;&#x3046;&#x3053;&#x305D; Real Pan &#x3078; / Bem-vindo(a) &#xE0; Real Pan!`,
    html: baseLayout(content, config),
  };
}


// ═══════════════════════════════════════════════════════════
// TEMPLATE 3: PJ ACCOUNT APPROVAL
// ═══════════════════════════════════════════════════════════
export function pjApprovalTemplate(customer: CustomerData, approved: boolean, config: TemplateConfig): { subject: string; html: string } {
  const name = customer.companyName || `${customer.lastName || ''} ${customer.firstName || ''}`.trim();

  if (approved) {
    const content = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="background: linear-gradient(135deg, ${COLORS.navy} 0%, ${COLORS.navyLight} 100%); padding: 36px 24px; text-align: center;">
        <div style="font-size: 44px; margin-bottom: 14px;">&#x1F3E2;</div>
        <h1 style="margin: 0 0 6px; font-size: 22px; font-weight: 700; color: ${COLORS.white};">
          &#x6CD5;&#x4EBA;&#x30A2;&#x30AB;&#x30A6;&#x30F3;&#x30C8;&#x627F;&#x8A8D;&#x5B8C;&#x4E86;
        </h1>
        <p style="margin: 0; font-size: 14px; color: ${COLORS.goldLight};">
          Conta empresarial aprovada!
        </p>
      </td>
      </tr>
      <tr><td>

      <div style="padding: 28px 24px;">
        <p style="font-size: 15px; color: ${COLORS.gray700}; line-height: 1.8; margin: 0 0 20px;">
          <strong>${name}</strong> &#x69D8;<br/><br/>
          &#x6CD5;&#x4EBA;&#x30A2;&#x30AB;&#x30A6;&#x30F3;&#x30C8;&#x306E;&#x5BE9;&#x67FB;&#x304C;&#x5B8C;&#x4E86;&#x3057;&#x3001;<strong style="color: ${COLORS.green};">&#x627F;&#x8A8D;</strong>&#x3055;&#x308C;&#x307E;&#x3057;&#x305F;&#x3002;<br/>
          Sua conta empresarial foi <strong style="color: ${COLORS.green};">aprovada</strong>.
        </p>

        <div style="background: ${COLORS.greenBg}; border-radius: 10px; padding: 16px; margin-bottom: 20px;">
          <div style="font-size: 14px; color: ${COLORS.green}; font-weight: 600;">&#x2705; &#x6CD5;&#x4EBA;&#x5378;&#x58F2;&#x4FA1;&#x683C;&#x3067;&#x3054;&#x8CFC;&#x5165;&#x3044;&#x305F;&#x3060;&#x3051;&#x307E;&#x3059;</div>
          <div style="font-size: 13px; color: ${COLORS.gray700}; margin-top: 6px;">
            Agora voc&#xEA; tem acesso aos pre&#xE7;os de atacado exclusivos para empresas.
          </div>
        </div>

        <h3 style="font-size: 15px; color: ${COLORS.navy}; margin: 20px 0 12px; font-weight: 700;">&#x3054;&#x5229;&#x7528;&#x53EF;&#x80FD;&#x306A;&#x6A5F;&#x80FD; / Recursos Dispon&#xED;veis</h3>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding: 6px 0;">
              <div style="background: ${COLORS.goldBg}; border-radius: 8px; padding: 12px 16px;">
                <span style="font-size: 16px; margin-right: 8px;">&#x1F4B0;</span>
                <span style="font-size: 13px; color: ${COLORS.navy}; font-weight: 600;">&#x5378;&#x58F2;&#x4FA1;&#x683C; / Pre&#xE7;os de Atacado</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 6px 0;">
              <div style="background: ${COLORS.goldBg}; border-radius: 8px; padding: 12px 16px;">
                <span style="font-size: 16px; margin-right: 8px;">&#x1F4C4;</span>
                <span style="font-size: 13px; color: ${COLORS.navy}; font-weight: 600;">&#x8ACB;&#x6C42;&#x66F8;&#x6255;&#x3044; / Faturamento Mensal</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 6px 0;">
              <div style="background: ${COLORS.goldBg}; border-radius: 8px; padding: 12px 16px;">
                <span style="font-size: 16px; margin-right: 8px;">&#x1F4E6;</span>
                <span style="font-size: 13px; color: ${COLORS.navy}; font-weight: 600;">&#x5927;&#x91CF;&#x6CE8;&#x6587; / Pedidos em Grande Quantidade</span>
              </div>
            </td>
          </tr>
        </table>
      </div>

      <div style="padding: 0 24px 32px; text-align: center;">
        <a href="https://realpan.jp/products"
           style="display: inline-block; background: ${COLORS.navy}; color: ${COLORS.white}; text-decoration: none; padding: 14px 36px; border-radius: 10px; font-size: 14px; font-weight: 700;">
          &#x1F6D2; &#x6CE8;&#x6587;&#x3092;&#x59CB;&#x3081;&#x308B; / Come&#xE7;ar a Comprar &#x2192;
        </a>
      </div>
    `;

    return {
      subject: `&#x2705; &#x6CD5;&#x4EBA;&#x30A2;&#x30AB;&#x30A6;&#x30F3;&#x30C8;&#x627F;&#x8A8D; / Conta Empresarial Aprovada - ${config.companyName}`,
      html: baseLayout(content, config),
    };
  } else {
    const content = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="background: linear-gradient(135deg, ${COLORS.gray700} 0%, ${COLORS.gray900} 100%); padding: 36px 24px; text-align: center;">
        <div style="font-size: 44px; margin-bottom: 14px;">&#x1F4CB;</div>
        <h1 style="margin: 0 0 6px; font-size: 22px; font-weight: 700; color: ${COLORS.white};">
          &#x6CD5;&#x4EBA;&#x30A2;&#x30AB;&#x30A6;&#x30F3;&#x30C8;&#x5BE9;&#x67FB;&#x7D50;&#x679C;
        </h1>
        <p style="margin: 0; font-size: 14px; color: ${COLORS.gray200};">
          Resultado da an&#xE1;lise da conta empresarial
        </p>
      </td>
      </tr>
      <tr><td>

      <div style="padding: 28px 24px;">
        <p style="font-size: 15px; color: ${COLORS.gray700}; line-height: 1.8; margin: 0 0 20px;">
          <strong>${name}</strong> &#x69D8;<br/><br/>
          &#x6CD5;&#x4EBA;&#x30A2;&#x30AB;&#x30A6;&#x30F3;&#x30C8;&#x306E;&#x5BE9;&#x67FB;&#x306E;&#x7D50;&#x679C;&#x3001;&#x4ECA;&#x56DE;&#x306F;&#x627F;&#x8A8D;&#x3092;&#x898B;&#x9001;&#x3089;&#x305B;&#x3066;&#x3044;&#x305F;&#x3060;&#x304D;&#x307E;&#x3057;&#x305F;&#x3002;<br/>
          Ap&#xF3;s an&#xE1;lise, sua conta empresarial n&#xE3;o foi aprovada neste momento.
        </p>

        <div style="background: ${COLORS.gray100}; border-radius: 10px; padding: 16px; margin-bottom: 20px;">
          <div style="font-size: 13px; color: ${COLORS.gray700}; line-height: 1.7;">
            &#x3054;&#x4E0D;&#x660E;&#x306A;&#x70B9;&#x304C;&#x3054;&#x3056;&#x3044;&#x307E;&#x3057;&#x305F;&#x3089;&#x3001;&#x304A;&#x6C17;&#x8EFD;&#x306B;&#x304A;&#x554F;&#x3044;&#x5408;&#x308F;&#x305B;&#x304F;&#x3060;&#x3055;&#x3044;&#x3002;<br/>
            Em caso de d&#xFA;vidas, entre em contato conosco.
          </div>
        </div>
      </div>

      <div style="padding: 0 24px 32px; text-align: center;">
        <a href="mailto:clientrealpan@gmail.com"
           style="display: inline-block; background: ${COLORS.gray700}; color: ${COLORS.white}; text-decoration: none; padding: 14px 36px; border-radius: 10px; font-size: 14px; font-weight: 700;">
          &#x2709;&#xFE0F; &#x304A;&#x554F;&#x3044;&#x5408;&#x308F;&#x305B; / Entrar em Contato
        </a>
      </div>
    `;

    return {
      subject: `&#x1F4CB; &#x6CD5;&#x4EBA;&#x30A2;&#x30AB;&#x30A6;&#x30F3;&#x30C8;&#x5BE9;&#x67FB;&#x7D50;&#x679C; / Resultado da An&#xE1;lise - ${config.companyName}`,
      html: baseLayout(content, config),
    };
  }
}


// ═══════════════════════════════════════════════════════════
// TEMPLATE 4: ADMIN NOTIFICATION (New Order)
// ═══════════════════════════════════════════════════════════
export function adminNewOrderTemplate(order: OrderData, config: TemplateConfig): { subject: string; html: string } {
  const isPJ = order.customerType === 'BUSINESS';
  const payment = paymentLabel(order.paymentMethod);
  const typeBadge = isPJ
    ? `<span style="background: ${COLORS.navy}; color: ${COLORS.white}; padding: 3px 10px; border-radius: 6px; font-size: 11px; font-weight: 700;">&#x6CD5;&#x4EBA; PJ</span>`
    : `<span style="background: ${COLORS.gold}; color: ${COLORS.navy}; padding: 3px 10px; border-radius: 6px; font-size: 11px; font-weight: 700;">&#x500B;&#x4EBA; PF</span>`;

  const itemSummary = order.items.map(item =>
    `<tr>
      <td style="padding: 6px 12px; font-size: 13px; color: ${COLORS.gray700}; border-bottom: 1px solid ${COLORS.gray200};">${item.nameJa} (${item.hinban})</td>
      <td style="padding: 6px 12px; font-size: 13px; color: ${COLORS.gray700}; text-align: center; border-bottom: 1px solid ${COLORS.gray200};">&#xD7;${item.quantity}</td>
      <td style="padding: 6px 12px; font-size: 13px; color: ${COLORS.navy}; text-align: right; font-weight: 600; border-bottom: 1px solid ${COLORS.gray200};">${formatPrice(item.subtotal)}</td>
    </tr>`
  ).join('');

  const content = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="background: linear-gradient(135deg, #E65100 0%, #BF360C 100%); padding: 24px; text-align: center;">
      <div style="font-size: 32px; margin-bottom: 8px;">&#x1F514;</div>
      <h1 style="margin: 0 0 4px; font-size: 20px; font-weight: 700; color: ${COLORS.white};">
        &#x65B0;&#x3057;&#x3044;&#x3054;&#x6CE8;&#x6587;&#x304C;&#x5165;&#x308A;&#x307E;&#x3057;&#x305F;&#xFF01;
      </h1>
      <p style="margin: 0; font-size: 13px; color: #FFCC80;">Novo pedido recebido</p>
    </td>
    </tr></table>

    <div style="padding: 20px 24px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="width: 50%; padding-right: 8px;">
            <div style="background: ${COLORS.goldBg}; border-radius: 10px; padding: 14px; text-align: center;">
              <div style="font-size: 11px; color: ${COLORS.gray500}; text-transform: uppercase; letter-spacing: 1px;">&#x6CE8;&#x6587;&#x756A;&#x53F7;</div>
              <div style="font-size: 18px; font-weight: 800; color: ${COLORS.navy}; font-family: monospace; margin-top: 4px;">${order.orderNumber}</div>
            </div>
          </td>
          <td style="width: 50%; padding-left: 8px;">
            <div style="background: ${COLORS.greenBg}; border-radius: 10px; padding: 14px; text-align: center;">
              <div style="font-size: 11px; color: ${COLORS.gray500}; text-transform: uppercase; letter-spacing: 1px;">&#x5408;&#x8A08;&#x91D1;&#x984D;</div>
              <div style="font-size: 18px; font-weight: 800; color: ${COLORS.green}; margin-top: 4px;">${formatPrice(order.total)}</div>
            </div>
          </td>
        </tr>
      </table>
    </div>

    <div style="padding: 16px 24px 0;">
      <div style="background: ${COLORS.gray100}; border-radius: 10px; padding: 14px 16px;">
        <div style="margin-bottom: 8px;">
          <span style="font-size: 14px; font-weight: 700; color: ${COLORS.navy};">${order.customerName}</span>
          &nbsp;${typeBadge}
        </div>
        <div style="font-size: 12px; color: ${COLORS.gray500};">
          &#x1F4E7; ${order.customerEmail} &nbsp;|&nbsp; &#x1F4B3; ${payment.ja}
        </div>
      </div>
    </div>

    <div style="padding: 16px 24px;">
      <h3 style="margin: 0 0 10px; font-size: 14px; font-weight: 700; color: ${COLORS.navy};">&#x5546;&#x54C1;&#x4E00;&#x89A7;</h3>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: ${COLORS.white}; border: 1px solid ${COLORS.gray200}; border-radius: 8px; overflow: hidden;">
        <tr style="background: ${COLORS.gray100};">
          <td style="padding: 8px 12px; font-size: 12px; font-weight: 600; color: ${COLORS.gray500};">&#x5546;&#x54C1;</td>
          <td style="padding: 8px 12px; font-size: 12px; font-weight: 600; color: ${COLORS.gray500}; text-align: center;">&#x6570;&#x91CF;</td>
          <td style="padding: 8px 12px; font-size: 12px; font-weight: 600; color: ${COLORS.gray500}; text-align: right;">&#x91D1;&#x984D;</td>
        </tr>
        ${itemSummary}
      </table>
    </div>

    <div style="padding: 0 24px 16px;">
      <div style="font-size: 13px; color: ${COLORS.gray700}; background: ${COLORS.gray100}; border-radius: 8px; padding: 12px 16px; line-height: 1.6;">
        &#x1F4CD; <strong>${order.shippingName}</strong><br/>
        &#x3012;${order.shippingPostalCode} ${order.shippingPrefecture}${order.shippingCity}${order.shippingWard || ''}${order.shippingStreet}
        ${order.shippingBuilding ? ` ${order.shippingBuilding}` : ''}
        ${order.deliveryDate ? `<br/>&#x1F4C5; &#x914D;&#x9054;&#x5E0C;&#x671B;: ${order.deliveryDate}${order.deliveryTime ? ` ${order.deliveryTime}` : ''}` : ''}
      </div>
    </div>

    <div style="padding: 0 24px 28px; text-align: center;">
      <a href="https://admin.realpan.jp/dashboard/orders-${isPJ ? 'pj' : 'pf'}/${order.orderNumber}"
         style="display: inline-block; background: #E65100; color: ${COLORS.white}; text-decoration: none; padding: 14px 36px; border-radius: 10px; font-size: 14px; font-weight: 700;">
        &#x1F4CB; &#x7BA1;&#x7406;&#x753B;&#x9762;&#x3067;&#x78BA;&#x8A8D;&#x3059;&#x308B; &#x2192;
      </a>
    </div>
  `;

  return {
    subject: `&#x1F514; &#x65B0;&#x898F;&#x6CE8;&#x6587; ${order.orderNumber} &#x2022; ${formatPrice(order.total)} &#x2022; ${order.customerName}`,
    html: baseLayout(content, config),
  };
}
