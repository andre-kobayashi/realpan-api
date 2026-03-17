// ═══════════════════════════════════════════════════════════
// Real Pan - Email Routes
// ═══════════════════════════════════════════════════════════

import express from 'express';
import { PrismaClient } from '@prisma/client';
import emailService from '../services/emailService';
import {
  orderConfirmationTemplate,
  welcomeCustomerTemplate,
  pjApprovalTemplate,
  adminNewOrderTemplate,
} from '../templates/emailTemplates';

const router = express.Router();
const prisma = new PrismaClient();

// Admin email(s) for notifications
const ADMIN_EMAILS = (process.env.ADMIN_NOTIFICATION_EMAILS || 'clientrealpan@gmail.com').split(',').map(e => e.trim());

// ─────────────────────────────────────────────────────────
// Helper: Get template config from CompanySettings
// ─────────────────────────────────────────────────────────
async function getTemplateConfig(companyKey: string = 'realpan') {
  const settings = await prisma.companySettings.findUnique({ where: { companyKey } });
  return {
    logoUrl: settings?.logoUrl || null,
    companyName: settings?.companyName || 'Real Pan',
    companyNameJa: settings?.companyNameJa || 'レアルパン',
    phone: settings?.phone || '',
    website: settings?.website || 'https://realpan.jp',
  };
}

// ═══════════════════════════════════════════════════════════
// POST /api/email/test - Send test email
// ═══════════════════════════════════════════════════════════
router.post('/test', async (req, res) => {
  try {
    const { to, companyKey = 'realpan' } = req.body;

    if (!to) {
      return res.status(400).json({
        success: false,
        message: { pt: 'Email de destino é obrigatório', ja: '宛先メールは必須です' },
      });
    }

    const result = await emailService.sendTest(to, companyKey);

    res.json({
      success: result.success,
      messageId: result.messageId,
      error: result.error,
      message: result.success
        ? { pt: 'Email de teste enviado!', ja: 'テストメールを送信しました！' }
        : { pt: `Erro: ${result.error}`, ja: `エラー: ${result.error}` },
    });
  } catch (error: any) {
    console.error('❌ Test email error:', error);
    res.status(500).json({
      success: false,
      message: { pt: `Erro: ${error.message}`, ja: `エラー: ${error.message}` },
    });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/email/order-confirmation - Send order confirmation
// ═══════════════════════════════════════════════════════════
router.post('/order-confirmation', async (req, res) => {
  try {
    const { orderId, companyKey = 'realpan' } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: { pt: 'orderId é obrigatório', ja: 'orderIdは必須です' },
      });
    }

    // Fetch order with items and customer
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { product: true } },
        customer: true,
        carrier: true,
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: { pt: 'Pedido não encontrado', ja: '注文が見つかりません' },
      });
    }

    const config = await getTemplateConfig(companyKey);

    // Build order data for template
    const orderData = {
      orderNumber: order.orderNumber,
      items: order.items.map(item => ({
        namePt: item.namePt,
        nameJa: item.nameJa,
        hinban: item.hinban,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        image: item.image,
      })),
      subtotal: order.subtotal,
      taxAmount: order.taxAmount,
      shippingCost: order.shippingCost,
      daibikiFee: order.daibikiFee,
      discountAmount: order.discountAmount,
      total: order.total,
      paymentMethod: order.paymentMethod,
      customerName: order.customer.type === 'BUSINESS'
        ? order.customer.companyName || ''
        : `${order.customer.lastName || ''} ${order.customer.firstName || ''}`.trim(),
      customerEmail: order.customer.email,
      customerType: order.customer.type,
      shippingName: order.shippingName,
      shippingPostalCode: order.shippingPostalCode,
      shippingPrefecture: order.shippingPrefecture,
      shippingCity: order.shippingCity,
      shippingWard: order.shippingWard || undefined,
      shippingStreet: order.shippingStreet,
      shippingBuilding: order.shippingBuilding || undefined,
      deliveryDate: order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('ja-JP') : null,
      deliveryTime: order.deliveryTime || null,
      trackingCode: order.trackingCode || null,
      carrierName: order.carrier?.name || null,
    };

    // 1. Send confirmation to customer
    const { subject, html } = orderConfirmationTemplate(orderData, config);
    const customerResult = await emailService.send({
      to: order.customer.email,
      subject,
      html,
      tags: [
        { name: 'type', value: 'order-confirmation' },
        { name: 'order', value: order.orderNumber },
      ],
    }, companyKey);

    // 2. Send notification to admin
    const adminTemplate = adminNewOrderTemplate(orderData, config);
    const adminResult = await emailService.send({
      to: ADMIN_EMAILS,
      subject: adminTemplate.subject,
      html: adminTemplate.html,
      tags: [
        { name: 'type', value: 'admin-new-order' },
        { name: 'order', value: order.orderNumber },
      ],
    }, companyKey);

    res.json({
      success: true,
      customer: customerResult,
      admin: adminResult,
      message: { pt: 'Emails enviados!', ja: 'メールを送信しました！' },
    });

  } catch (error: any) {
    console.error('❌ Order confirmation email error:', error);
    res.status(500).json({
      success: false,
      message: { pt: `Erro: ${error.message}`, ja: `エラー: ${error.message}` },
    });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/email/welcome - Send welcome email (PF registration)
// ═══════════════════════════════════════════════════════════
router.post('/welcome', async (req, res) => {
  try {
    const { customerId, companyKey = 'realpan' } = req.body;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: { pt: 'customerId é obrigatório', ja: 'customerIdは必須です' },
      });
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: { pt: 'Cliente não encontrado', ja: 'お客様が見つかりません' },
      });
    }

    const config = await getTemplateConfig(companyKey);
    const { subject, html } = welcomeCustomerTemplate({
      firstName: customer.firstName,
      lastName: customer.lastName,
      companyName: customer.companyName,
      email: customer.email,
      type: customer.type,
    }, config);

    const result = await emailService.send({
      to: customer.email,
      subject,
      html,
      tags: [{ name: 'type', value: 'welcome' }],
    }, companyKey);

    res.json({
      success: result.success,
      messageId: result.messageId,
      error: result.error,
      message: result.success
        ? { pt: 'Email de boas-vindas enviado!', ja: 'ウェルカムメールを送信しました！' }
        : { pt: `Erro: ${result.error}`, ja: `エラー: ${result.error}` },
    });

  } catch (error: any) {
    console.error('❌ Welcome email error:', error);
    res.status(500).json({
      success: false,
      message: { pt: `Erro: ${error.message}`, ja: `エラー: ${error.message}` },
    });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/email/pj-approval - Send PJ approval/rejection
// ═══════════════════════════════════════════════════════════
router.post('/pj-approval', async (req, res) => {
  try {
    const { customerId, approved = true, companyKey = 'realpan' } = req.body;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: { pt: 'customerId é obrigatório', ja: 'customerIdは必須です' },
      });
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: { pt: 'Cliente não encontrado', ja: 'お客様が見つかりません' },
      });
    }

    const config = await getTemplateConfig(companyKey);
    const { subject, html } = pjApprovalTemplate({
      firstName: customer.firstName,
      lastName: customer.lastName,
      companyName: customer.companyName,
      email: customer.email,
      type: customer.type,
      businessStatus: customer.businessStatus,
    }, approved, config);

    const result = await emailService.send({
      to: customer.email,
      subject,
      html,
      tags: [
        { name: 'type', value: approved ? 'pj-approved' : 'pj-rejected' },
      ],
    }, companyKey);

    res.json({
      success: result.success,
      messageId: result.messageId,
      error: result.error,
      message: result.success
        ? { pt: `Email de ${approved ? 'aprovação' : 'rejeição'} enviado!`, ja: `${approved ? '承認' : '却下'}メールを送信しました！` }
        : { pt: `Erro: ${result.error}`, ja: `エラー: ${result.error}` },
    });

  } catch (error: any) {
    console.error('❌ PJ approval email error:', error);
    res.status(500).json({
      success: false,
      message: { pt: `Erro: ${error.message}`, ja: `エラー: ${error.message}` },
    });
  }
});

// ═══════════════════════════════════════════════════════════
// GET /api/email/preview/:template - Preview template (dev only)
// ═══════════════════════════════════════════════════════════
router.get('/preview/:template', async (req, res) => {
  try {
    const { template } = req.params;
    const config = await getTemplateConfig('realpan');

    // Mock data for preview
    const mockOrder = {
      orderNumber: 'RP-2026-00042',
      items: [
        { namePt: 'Pão de Queijo', nameJa: 'ポンデケージョ', hinban: '001', quantity: 3, unitPrice: 350, subtotal: 1050, image: null },
        { namePt: 'Coxinha de Frango', nameJa: 'コシーニャ', hinban: '015', quantity: 5, unitPrice: 280, subtotal: 1400, image: null },
        { namePt: 'Brigadeiro', nameJa: 'ブリガデイロ', hinban: '030', quantity: 10, unitPrice: 150, subtotal: 1500, image: null },
      ],
      subtotal: 3950,
      taxAmount: 316,
      shippingCost: 800,
      daibikiFee: 0,
      discountAmount: 0,
      total: 5066,
      paymentMethod: 'STRIPE',
      customerName: '田中 太郎',
      customerEmail: 'tanaka@example.com',
      customerType: 'INDIVIDUAL' as const,
      shippingName: '田中 太郎',
      shippingPostalCode: '437-0000',
      shippingPrefecture: '静岡県',
      shippingCity: '袋井市',
      shippingWard: '愛野',
      shippingStreet: '1-2-3',
      shippingBuilding: 'サンプルマンション101',
      deliveryDate: '2026/03/20',
      deliveryTime: '14:00〜16:00',
      trackingCode: null,
      carrierName: null,
    };

    const mockCustomer = {
      firstName: '太郎',
      lastName: '田中',
      companyName: '株式会社テスト',
      email: 'test@example.com',
      type: 'INDIVIDUAL' as const,
      businessStatus: 'APPROVED',
    };

    let html = '';
    switch (template) {
      case 'order-confirmation':
        html = orderConfirmationTemplate(mockOrder, config).html;
        break;
      case 'welcome':
        html = welcomeCustomerTemplate(mockCustomer, config).html;
        break;
      case 'pj-approved':
        html = pjApprovalTemplate({ ...mockCustomer, type: 'BUSINESS' }, true, config).html;
        break;
      case 'pj-rejected':
        html = pjApprovalTemplate({ ...mockCustomer, type: 'BUSINESS' }, false, config).html;
        break;
      case 'admin-new-order':
        html = adminNewOrderTemplate(mockOrder, config).html;
        break;
      default:
        return res.status(404).json({
          success: false,
          message: 'Template not found. Available: order-confirmation, welcome, pj-approved, pj-rejected, admin-new-order',
        });
    }

    // Return raw HTML for browser preview
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);

  } catch (error: any) {
    console.error('❌ Preview error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;