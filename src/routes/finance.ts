import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { stripe } from '../config/stripe';

const router = Router();
const prisma = new PrismaClient();

// ═══ GET /api/finance/dashboard — Resumo financeiro ═══
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    // 1. Saldo Stripe
    const balance = await stripe.balance.retrieve();
    const available = balance.available.reduce((sum: number, b: any) => sum + b.amount, 0);
    const pending = balance.pending.reduce((sum: number, b: any) => sum + b.amount, 0);

    // 2. Receitas do mês atual (orders no banco)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [thisMonthOrders, lastMonthOrders, todayOrders] = await Promise.all([
      (prisma as any).order.findMany({
        where: { createdAt: { gte: startOfMonth }, status: { not: 'CANCELED' } },
        select: { total: true, paymentMethod: true },
      }),
      (prisma as any).order.findMany({
        where: { createdAt: { gte: startOfLastMonth, lte: endOfLastMonth }, status: { not: 'CANCELED' } },
        select: { total: true },
      }),
      (prisma as any).order.findMany({
        where: { createdAt: { gte: new Date(now.toISOString().split('T')[0]) }, status: { not: 'CANCELED' } },
        select: { total: true },
      }),
    ]);

    const thisMonthRevenue = thisMonthOrders.reduce((sum: number, o: any) => sum + (o.total || 0), 0);
    const lastMonthRevenue = lastMonthOrders.reduce((sum: number, o: any) => sum + (o.total || 0), 0);
    const todayRevenue = todayOrders.reduce((sum: number, o: any) => sum + (o.total || 0), 0);

    // Receita por método de pagamento
    const byMethod: Record<string, number> = {};
    thisMonthOrders.forEach((o: any) => {
      const m = o.paymentMethod || 'OTHER';
      byMethod[m] = (byMethod[m] || 0) + (o.total || 0);
    });

    // 3. Pedidos pendentes (PENDING ou PAID não processados)
    const pendingOrders = await (prisma as any).order.count({
      where: { status: { in: ['PENDING', 'PAID'] } },
    });

    // 4. Receita dos últimos 7 dias (para gráfico)
    const last7Days: { date: string; revenue: number; orders: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayStart = new Date(d.toISOString().split('T')[0]);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const dayOrders = await (prisma as any).order.findMany({
        where: { createdAt: { gte: dayStart, lt: dayEnd }, status: { not: 'CANCELED' } },
        select: { total: true },
      });

      last7Days.push({
        date: dayStart.toISOString().split('T')[0],
        revenue: dayOrders.reduce((sum: number, o: any) => sum + (o.total || 0), 0),
        orders: dayOrders.length,
      });
    }

    // 5. Receita dos últimos 12 meses (para gráfico mensal)
    const last12Months: { month: string; revenue: number; orders: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);

      const mOrders = await (prisma as any).order.findMany({
        where: { createdAt: { gte: mStart, lte: mEnd }, status: { not: 'CANCELED' } },
        select: { total: true },
      });

      last12Months.push({
        month: `${mStart.getFullYear()}-${String(mStart.getMonth() + 1).padStart(2, '0')}`,
        revenue: mOrders.reduce((sum: number, o: any) => sum + (o.total || 0), 0),
        orders: mOrders.length,
      });
    }

    res.json({
      success: true,
      data: {
        balance: { available, pending, currency: 'jpy' },
        revenue: {
          today: todayRevenue,
          thisMonth: thisMonthRevenue,
          lastMonth: lastMonthRevenue,
          growthPercent: lastMonthRevenue > 0
            ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
            : 0,
          byMethod,
        },
        pendingOrders,
        charts: { last7Days, last12Months },
      },
    });
  } catch (error) {
    console.error('Finance dashboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to load dashboard' });
  }
});

// ═══ GET /api/finance/payments — Lista de pagamentos Stripe ═══
router.get('/payments', async (req: Request, res: Response) => {
  try {
    const { limit = '20', starting_after, status } = req.query;

    const params: any = {
      limit: parseInt(limit as string),
      expand: ['data.customer', 'data.charges.data.balance_transaction'],
    };
    if (starting_after) params.starting_after = starting_after;

    const paymentIntents = await stripe.paymentIntents.list(params);

    const payments = paymentIntents.data
      .filter((pi: any) => !status || pi.status === status)
      .map((pi: any) => ({
        id: pi.id,
        amount: pi.amount,
        currency: pi.currency,
        status: pi.status,
        paymentMethod: pi.payment_method_types?.[0] || 'unknown',
        customerEmail: pi.receipt_email || (pi.customer as any)?.email || null,
        description: pi.description || null,
        metadata: pi.metadata || {},
        created: new Date(pi.created * 1000).toISOString(),
        fee: pi.charges?.data?.[0]?.balance_transaction?.fee || 0,
        net: pi.charges?.data?.[0]?.balance_transaction?.net || pi.amount,
      }));

    res.json({
      success: true,
      data: payments,
      hasMore: paymentIntents.has_more,
      nextCursor: paymentIntents.data.length > 0
        ? paymentIntents.data[paymentIntents.data.length - 1].id
        : null,
    });
  } catch (error) {
    console.error('Payments list error:', error);
    res.status(500).json({ success: false, message: 'Failed to load payments' });
  }
});

// ═══ GET /api/finance/payouts — Transferências para conta bancária ═══
router.get('/payouts', async (req: Request, res: Response) => {
  try {
    const { limit = '10' } = req.query;
    const payouts = await stripe.payouts.list({ limit: parseInt(limit as string) });

    const data = payouts.data.map((p: any) => ({
      id: p.id,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      arrivalDate: new Date(p.arrival_date * 1000).toISOString(),
      created: new Date(p.created * 1000).toISOString(),
      method: p.method,
      description: p.description,
    }));

    res.json({ success: true, data });
  } catch (error) {
    console.error('Payouts error:', error);
    res.status(500).json({ success: false, message: 'Failed to load payouts' });
  }
});

// ═══ GET /api/finance/refunds — Reembolsos ═══
router.get('/refunds', async (req: Request, res: Response) => {
  try {
    const { limit = '10' } = req.query;
    const refunds = await stripe.refunds.list({ limit: parseInt(limit as string) });

    const data = refunds.data.map((r: any) => ({
      id: r.id,
      amount: r.amount,
      currency: r.currency,
      status: r.status,
      reason: r.reason,
      paymentIntentId: r.payment_intent,
      created: new Date(r.created * 1000).toISOString(),
    }));

    res.json({ success: true, data });
  } catch (error) {
    console.error('Refunds error:', error);
    res.status(500).json({ success: false, message: 'Failed to load refunds' });
  }
});



// ═══ GET /api/finance/pending — Pagamentos pendentes de confirmação ═══
router.get('/pending', async (req: Request, res: Response) => {
  try {
    const { method, page = '1', limit = '20' } = req.query;
    const where: any = {
      paymentStatus: { in: ['PENDING', 'INVOICED'] },
      status: { not: 'CANCELED' },
    };
    if (method) where.paymentMethod = method;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const [orders, total] = await Promise.all([
      (prisma as any).order.findMany({
        where,
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, email: true, companyName: true, type: true } },
          items: { include: { product: { select: { namePt: true, nameJa: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit as string),
      }),
      (prisma as any).order.count({ where }),
    ]);

    res.json({ success: true, data: orders, pagination: { total, page: parseInt(page as string), limit: parseInt(limit as string), pages: Math.ceil(total / parseInt(limit as string)) } });
  } catch (error) {
    console.error('Pending payments error:', error);
    res.status(500).json({ success: false, message: 'Failed' });
  }
});

// ═══ POST /api/finance/confirm-payment — Confirmar recebimento ═══
router.post('/confirm-payment', async (req: Request, res: Response) => {
  try {
    const { orderId, transferReference, transferDate, transferBank, confirmedBy, internalNotes } = req.body;
    if (!orderId) return res.status(400).json({ success: false, message: 'orderId required' });

    const order = await (prisma as any).order.update({
      where: { id: orderId },
      data: {
        paymentStatus: 'PAID',
        status: 'PAID',
        paidAt: new Date(),
        confirmedAt: new Date(),
        confirmedBy: confirmedBy || 'admin',
        transferReference: transferReference || null,
        transferDate: transferDate ? new Date(transferDate) : null,
        transferBank: transferBank || null,
        ...(internalNotes ? { internalNotes } : {}),
      },
    });

    res.json({ success: true, data: order });
  } catch (error) {
    console.error('Confirm payment error:', error);
    res.status(500).json({ success: false, message: 'Failed to confirm payment' });
  }
});

// ═══ GET /api/finance/invoices — Faturas PJ (contas a receber) ═══
router.get('/invoices', async (req: Request, res: Response) => {
  try {
    const { status, customerId, page = '1', limit = '20' } = req.query;
    const where: any = { paymentMethod: 'INVOICE' };
    if (status === 'overdue') {
      where.paymentStatus = { in: ['PENDING', 'INVOICED'] };
      where.invoiceDueDate = { lt: new Date() };
    } else if (status === 'pending') {
      where.paymentStatus = { in: ['PENDING', 'INVOICED'] };
    } else if (status === 'paid') {
      where.paymentStatus = 'PAID';
    }
    if (customerId) where.customerId = customerId;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const [orders, total, stats] = await Promise.all([
      (prisma as any).order.findMany({
        where,
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, companyName: true, companyNameKana: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit as string),
      }),
      (prisma as any).order.count({ where }),
      // Stats
      Promise.all([
        (prisma as any).order.aggregate({ where: { paymentMethod: 'INVOICE', paymentStatus: { in: ['PENDING', 'INVOICED'] } }, _sum: { total: true }, _count: true }),
        (prisma as any).order.aggregate({ where: { paymentMethod: 'INVOICE', paymentStatus: { in: ['PENDING', 'INVOICED'] }, invoiceDueDate: { lt: new Date() } }, _sum: { total: true }, _count: true }),
        (prisma as any).order.aggregate({ where: { paymentMethod: 'INVOICE', paymentStatus: 'PAID' }, _sum: { total: true }, _count: true }),
      ]),
    ]);

    res.json({
      success: true,
      data: orders,
      stats: {
        pendingAmount: stats[0]._sum.total || 0,
        pendingCount: stats[0]._count || 0,
        overdueAmount: stats[1]._sum.total || 0,
        overdueCount: stats[1]._count || 0,
        paidAmount: stats[2]._sum.total || 0,
        paidCount: stats[2]._count || 0,
      },
      pagination: { total, page: parseInt(page as string), limit: parseInt(limit as string) },
    });
  } catch (error) {
    console.error('Invoices error:', error);
    res.status(500).json({ success: false, message: 'Failed' });
  }
});

// ═══ GET /api/finance/reports — Relatório por método/período ═══
router.get('/reports', async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    const dateFrom = from ? new Date(from as string) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const dateTo = to ? new Date(to as string) : new Date();
    dateTo.setHours(23, 59, 59, 999);

    const orders = await (prisma as any).order.findMany({
      where: { createdAt: { gte: dateFrom, lte: dateTo }, status: { not: 'CANCELED' } },
      select: { total: true, subtotal: true, taxAmount: true, shippingCost: true, daibikiFee: true, paymentMethod: true, paymentStatus: true, createdAt: true },
    });

    // Agrupar por método
    const byMethod: Record<string, { count: number; total: number; paid: number; pending: number }> = {};
    const methods = ['STRIPE', 'DAIBIKI', 'BANK_TRANSFER', 'INVOICE', 'KONBINI', 'PAYPAY'];
    methods.forEach(m => { byMethod[m] = { count: 0, total: 0, paid: 0, pending: 0 }; });

    let grandTotal = 0, grandPaid = 0, grandPending = 0, totalTax = 0, totalShipping = 0;

    orders.forEach((o: any) => {
      const m = o.paymentMethod || 'OTHER';
      if (!byMethod[m]) byMethod[m] = { count: 0, total: 0, paid: 0, pending: 0 };
      byMethod[m].count++;
      byMethod[m].total += o.total || 0;
      if (o.paymentStatus === 'PAID') {
        byMethod[m].paid += o.total || 0;
        grandPaid += o.total || 0;
      } else {
        byMethod[m].pending += o.total || 0;
        grandPending += o.total || 0;
      }
      grandTotal += o.total || 0;
      totalTax += o.taxAmount || 0;
      totalShipping += o.shippingCost || 0;
    });

    // Agrupar por dia
    const byDay: Record<string, { revenue: number; orders: number }> = {};
    orders.forEach((o: any) => {
      const day = o.createdAt.toISOString().split('T')[0];
      if (!byDay[day]) byDay[day] = { revenue: 0, orders: 0 };
      byDay[day].revenue += o.total || 0;
      byDay[day].orders++;
    });

    res.json({
      success: true,
      data: {
        period: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
        summary: { total: grandTotal, paid: grandPaid, pending: grandPending, tax: totalTax, shipping: totalShipping, orderCount: orders.length },
        byMethod,
        byDay: Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, data]) => ({ date, ...data })),
      },
    });
  } catch (error) {
    console.error('Reports error:', error);
    res.status(500).json({ success: false, message: 'Failed' });
  }
});

export default router;
