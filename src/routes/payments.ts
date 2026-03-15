import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { stripe } from '../config/stripe';

const router = Router();
const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════════
// POST /api/payments/create-intent
// Cria Payment Intent para pagamento via Stripe
// ou cria pedido offline (DAIBIKI / INVOICE)
// ═══════════════════════════════════════════════════════════
router.post('/create-intent', async (req: Request, res: Response) => {
  try {
    const {
      customerId,
      items,
      shippingAddress,
      carrierId,
      shippingCost = 0,
      deliveryTimeSlot,
      deliveryDate,
      paymentMethod, // 'STRIPE' | 'DAIBIKI' | 'INVOICE' | 'KONBINI' | 'BANK_TRANSFER' | 'PAYPAY'
      notes,
      subtotal,
      taxAmount,
      total,
    } = req.body;

    if (!customerId || !items?.length || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: { pt: 'Dados incompletos', ja: 'データが不足しています' },
      });
    }

    // Buscar cliente
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: { pt: 'Cliente não encontrado', ja: '顧客が見つかりません' },
      });
    }

    // INVOICE só permitido para PJ aprovado
    if (paymentMethod === 'INVOICE') {
      if (customer.type !== 'BUSINESS' || customer.businessStatus !== 'APPROVED') {
        return res.status(403).json({
          success: false,
          message: {
            pt: 'Faturamento mensal disponível apenas para empresas aprovadas',
            ja: '請求書払いは承認済みの法人のみご利用いただけます',
          },
        });
      }
    }

    // Buscar produtos para snapshot
    const products = await prisma.product.findMany({
      where: { id: { in: items.map((i: any) => i.productId) } },
    });

    // Calcular totais
    let calcSubtotal = 0;
    const orderItems = items.map((item: any) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product) throw new Error(`Produto ${item.productId} não encontrado`);
      const itemSubtotal = item.unitPrice * item.quantity;
      calcSubtotal += itemSubtotal;
      return {
        productId: product.id,
        namePt: product.namePt,
        nameJa: product.nameJa,
        hinban: product.hinban || product.id.slice(0, 8),
        image: product.primaryImage,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: itemSubtotal,
        discountPercent: 0,
        discountAmount: 0,
      };
    });

    const calcTax = taxAmount || Math.ceil(calcSubtotal * 0.08);
    const calcTotal = total || calcSubtotal + calcTax + shippingCost;

    // Gerar número do pedido
    const year = new Date().getFullYear();
    const orderCount = await prisma.order.count({
      where: {
        createdAt: {
          gte: new Date(`${year}-01-01`),
        },
      },
    });
    const orderNumber = `RP-${year}-${String(orderCount + 1).padStart(5, '0')}`;

    // Dados comuns de endereço
    const shippingData = {
      shippingName: shippingAddress?.name || '',
      shippingPhone: shippingAddress?.phone || '',
      shippingPostalCode: shippingAddress?.postalCode || '',
      shippingPrefecture: shippingAddress?.prefecture || '',
      shippingCity: shippingAddress?.city || '',
      shippingWard: shippingAddress?.ward || null,
      shippingStreet: shippingAddress?.address || '',
      shippingBuilding: shippingAddress?.building || null,
    };

    // ── DAIBIKI (代引き) — não usa Stripe ──
    if (paymentMethod === 'DAIBIKI') {
      // Buscar configuração de daibiki da transportadora
      let daibikiFee = 330; // fallback
      if (carrierId) {
        const carrier = await prisma.carrier.findUnique({
          where: { id: carrierId },
          select: { daibikiEnabled: true, daibikiRates: true, daibikiTaxRate: true },
        });
        if (carrier?.daibikiEnabled && carrier.daibikiRates) {
          const rates = carrier.daibikiRates as { maxAmount: number; fee: number }[];
          const taxRate = carrier.daibikiTaxRate || 0.10;
          const sorted = [...rates].sort((a, b) => a.maxAmount - b.maxAmount);

          // Valor base para cálculo = subtotal + imposto + frete
          const amountForDaibiki = calcTotal;

          // Encontrar faixa
          let found = false;
          for (const rate of sorted) {
            if (amountForDaibiki <= rate.maxAmount) {
              daibikiFee = rate.fee + Math.ceil(rate.fee * taxRate);
              found = true;
              break;
            }
          }

          // Acima de todas as faixas: escalonado
          if (!found && sorted.length > 0) {
            const lastRate = sorted[sorted.length - 1];
            const excess = amountForDaibiki - lastRate.maxAmount;
            const extraSteps = Math.ceil(excess / 100000);
            const baseFee = lastRate.fee + (extraSteps * 1000);
            daibikiFee = baseFee + Math.ceil(baseFee * taxRate);
          }

          // Limite: acima de ¥5M não aceita daibiki
          if (amountForDaibiki > 5000000) {
            return res.status(400).json({
              success: false,
              message: {
                pt: 'Daibiki não disponível para pedidos acima de ¥5.000.000',
                ja: '代金引換は500万円を超えるご注文にはご利用いただけません',
              },
            });
          }
        }
      }

      const totalWithDaibiki = calcTotal + daibikiFee;

      const order = await prisma.order.create({
        data: {
          orderNumber,
          customerId,
          subtotal: calcSubtotal,
          taxAmount: calcTax,
          shippingCost,
          daibikiFee,
          total: totalWithDaibiki,
          status: 'PENDING',
          paymentStatus: 'PENDING',
          paymentMethod: 'DAIBIKI',
          carrierId: carrierId || null,
          deliveryTime: deliveryTimeSlot || null,
          deliveryDate: deliveryDate ? new Date(deliveryDate + 'T00:00:00.000Z') : null,
          notes,
          ...shippingData,
          items: { create: orderItems },
        },
        include: { items: true },
      });

      return res.json({
        success: true,
        data: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          paymentMethod: 'DAIBIKI',
          total: totalWithDaibiki,
          daibikiFee,
          requiresPayment: false,
        },
      });
    }

    // ── INVOICE (請求書払い) — faturamento mensal, só PJ ──
    if (paymentMethod === 'INVOICE') {
      const order = await prisma.order.create({
        data: {
          orderNumber,
          customerId,
          subtotal: calcSubtotal,
          taxAmount: calcTax,
          shippingCost,
          daibikiFee: 0,
          total: calcTotal,
          status: 'PENDING',
          paymentStatus: 'INVOICED',
          paymentMethod: 'INVOICE',
          carrierId: carrierId || null,
          deliveryTime: deliveryTimeSlot || null,
          deliveryDate: deliveryDate ? new Date(deliveryDate + 'T00:00:00.000Z') : null,
          notes,
          ...shippingData,
          items: { create: orderItems },
        },
        include: { items: true },
      });

      return res.json({
        success: true,
        data: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          paymentMethod: 'INVOICE',
          total: calcTotal,
          requiresPayment: false,
        },
      });
    }

    // ── STRIPE PAYMENT (CC / Konbini / Bank Transfer / PayPay) ──

    // Criar ou buscar Stripe Customer
    let stripeCustomerId = customer.stripeCustomerId;
    if (!stripeCustomerId) {
      const stripeCustomer = await stripe.customers.create({
        email: customer.email,
        name:
          customer.type === 'INDIVIDUAL'
            ? `${customer.lastName || ''} ${customer.firstName || ''}`.trim()
            : customer.companyName || undefined,
        phone: customer.phone || undefined,
        metadata: { realpanCustomerId: customer.id },
      });
      stripeCustomerId = stripeCustomer.id;
      await prisma.customer.update({
        where: { id: customerId },
        data: { stripeCustomerId },
      });
    }

    // Mapear payment method types
    const paymentMethodTypes: string[] = [];
    switch (paymentMethod) {
      case 'STRIPE':
        paymentMethodTypes.push('card');
        break;
      case 'KONBINI':
        paymentMethodTypes.push('konbini');
        break;
      case 'BANK_TRANSFER':
        paymentMethodTypes.push('customer_balance');
        break;
      case 'PAYPAY':
        paymentMethodTypes.push('paypay');
        break;
      default:
        paymentMethodTypes.push('card');
    }

    // Criar Payment Intent
    const paymentIntentParams: any = {
      amount: calcTotal,
      currency: 'jpy',
      customer: stripeCustomerId,
      payment_method_types: paymentMethodTypes,
      metadata: {
        customerId,
        orderNumber,
        paymentMethod,
      },
    };

    if (paymentMethod === 'KONBINI') {
      paymentIntentParams.payment_method_options = {
        konbini: {
          expires_after_days: 3,
          product_description: `Real Pan - Pedido ${orderNumber}`,
        },
      };
    }

    if (paymentMethod === 'BANK_TRANSFER') {
      paymentIntentParams.payment_method_types = ['customer_balance'];
      paymentIntentParams.payment_method_data = {
        type: 'customer_balance',
      };
      paymentIntentParams.payment_method_options = {
        customer_balance: {
          funding_type: 'bank_transfer',
          bank_transfer: {
            type: 'jp_bank_transfer',
          },
        },
      };
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    // Criar pedido no banco
    const order = await prisma.order.create({
      data: {
        orderNumber,
        customerId,
        subtotal: calcSubtotal,
        taxAmount: calcTax,
        shippingCost,
        daibikiFee: 0,
        total: calcTotal,
        status: 'PENDING',
        paymentStatus: 'PENDING',
        paymentMethod: paymentMethod === 'STRIPE' ? 'STRIPE' : paymentMethod,
        stripePaymentIntentId: paymentIntent.id,
        carrierId: carrierId || null,
        deliveryTime: deliveryTimeSlot || null,
        deliveryDate: deliveryDate ? new Date(deliveryDate + 'T00:00:00.000Z') : null,
        notes,
        ...shippingData,
        items: { create: orderItems },
      },
      include: { items: true },
    });

    return res.json({
      success: true,
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        paymentMethod,
        total: calcTotal,
        requiresPayment: true,
      },
    });
  } catch (error: any) {
    console.error('Error creating payment:', error);
    return res.status(500).json({
      success: false,
      message: {
        pt: error.message || 'Erro ao criar pagamento',
        ja: 'お支払いの作成に失敗しました',
      },
    });
  }
});

// ═══════════════════════════════════════════════════════════
// GET /api/payments/status/:orderId
// ═══════════════════════════════════════════════════════════
router.get('/status/:orderId', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.orderId as string;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        paymentStatus: true,
        paymentMethod: true,
        stripePaymentIntentId: true,
        total: true,
      },
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    let stripeStatus = null;
    if (order.stripePaymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
      stripeStatus = pi.status;
    }

    return res.json({
      success: true,
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        stripeStatus,
        total: order.total,
      },
    });
  } catch (error) {
    console.error('Error checking payment status:', error);
    return res.status(500).json({ success: false, message: 'Error checking status' });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/payments/daibiki-fee
// Calcula a taxa de daibiki para um valor + transportadora
// Body: { carrierId, orderAmount }
// ═══════════════════════════════════════════════════════════
router.post('/daibiki-fee', async (req: Request, res: Response) => {
  try {
    const { carrierId, orderAmount } = req.body;

    if (!carrierId || !orderAmount) {
      return res.status(400).json({ success: false, message: 'carrierId and orderAmount required' });
    }

    if (orderAmount > 5000000) {
      return res.json({
        success: true,
        data: { available: false, reason: 'exceeds_limit', fee: 0, tax: 0, total: 0 },
      });
    }

    const carrier = await prisma.carrier.findUnique({
      where: { id: carrierId },
      select: { daibikiEnabled: true, daibikiRates: true, daibikiTaxRate: true, name: true },
    });

    if (!carrier || !carrier.daibikiEnabled) {
      return res.json({
        success: true,
        data: { available: false, reason: 'not_supported', fee: 0, tax: 0, total: 0 },
      });
    }

    const rates = (carrier.daibikiRates as { maxAmount: number; fee: number }[]) || [];
    const taxRate = carrier.daibikiTaxRate || 0.10;
    const sorted = [...rates].sort((a, b) => a.maxAmount - b.maxAmount);

    let fee = 0;
    let found = false;
    for (const rate of sorted) {
      if (orderAmount <= rate.maxAmount) {
        fee = rate.fee;
        found = true;
        break;
      }
    }

    if (!found && sorted.length > 0) {
      const lastRate = sorted[sorted.length - 1];
      const excess = orderAmount - lastRate.maxAmount;
      const extraSteps = Math.ceil(excess / 100000);
      fee = lastRate.fee + (extraSteps * 1000);
    }

    const tax = Math.ceil(fee * taxRate);

    return res.json({
      success: true,
      data: {
        available: true,
        fee,
        tax,
        total: fee + tax,
        rates: sorted.map(r => ({
          maxAmount: r.maxAmount,
          fee: r.fee,
          feeWithTax: r.fee + Math.ceil(r.fee * taxRate),
        })),
      },
    });
  } catch (error) {
    console.error('Error calculating daibiki fee:', error);
    return res.status(500).json({ success: false, message: 'Error calculating daibiki fee' });
  }
});

// ═══════════════════════════════════════════════════════════
// GET /api/payments/config
// ═══════════════════════════════════════════════════════════
router.get('/config', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    },
  });
});

export default router;