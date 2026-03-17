import { Router } from 'express';
import prisma from '../config/database';

const router = Router();

// ═══ GET /api/stats — Dashboard stats completo ═══
router.get('/', async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalProducts,
      totalOrders,
      totalCustomers,
      revenue,
      // This month
      ordersThisMonth,
      revenueThisMonth,
      // Last month
      ordersLastMonth,
      revenueLastMonth,
      // Today
      ordersToday,
      revenueToday,
      // Pending
      pendingOrders,
      pendingPayments,
      // PJ stats
      pjCustomers,
      pfCustomers,
      // Recent orders
      recentOrders,
      // Top products (by quantity sold)
      topProductsSales,
      // Revenue by method
      ordersByMethod,
    ] = await Promise.all([
      prisma.product.count({ where: { isActive: true } }),
      prisma.order.count(),
      prisma.customer.count(),
      prisma.order.aggregate({ where: { paymentStatus: 'PAID' }, _sum: { total: true } }),

      // This month orders
      prisma.order.count({ where: { createdAt: { gte: startOfMonth }, status: { not: 'CANCELED' } } }),
      prisma.order.aggregate({ where: { createdAt: { gte: startOfMonth }, status: { not: 'CANCELED' } }, _sum: { total: true } }),

      // Last month orders
      prisma.order.count({ where: { createdAt: { gte: startOfLastMonth, lte: endOfLastMonth }, status: { not: 'CANCELED' } } }),
      prisma.order.aggregate({ where: { createdAt: { gte: startOfLastMonth, lte: endOfLastMonth }, status: { not: 'CANCELED' } }, _sum: { total: true } }),

      // Today
      prisma.order.count({ where: { createdAt: { gte: startOfToday }, status: { not: 'CANCELED' } } }),
      prisma.order.aggregate({ where: { createdAt: { gte: startOfToday }, status: { not: 'CANCELED' } }, _sum: { total: true } }),

      // Pending orders
      prisma.order.count({ where: { status: 'PENDING' } }),
      prisma.order.count({ where: { paymentStatus: { in: ['PENDING', 'INVOICED'] }, status: { not: 'CANCELED' } } }),

      // Customer types
      prisma.customer.count({ where: { type: 'BUSINESS' } }),
      prisma.customer.count({ where: { type: 'INDIVIDUAL' } }),

      // Recent 8 orders
      prisma.order.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, orderNumber: true, total: true, status: true,
          paymentStatus: true, paymentMethod: true, createdAt: true,
          customer: { select: { firstName: true, lastName: true, companyName: true, email: true, type: true } },
        },
      }),

      // Top 5 products by total quantity sold
      prisma.orderItem.groupBy({
        by: ['productId'],
        _sum: { quantity: true, subtotal: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
      }),

      // Orders grouped by payment method
      prisma.order.groupBy({
        by: ['paymentMethod'],
        where: { status: { not: 'CANCELED' } },
        _count: true,
        _sum: { total: true },
      }),
    ]);

    // Fetch product names for top products
    const topProductIds = topProductsSales.map((p: any) => p.productId);
    const topProductsInfo = await prisma.product.findMany({
      where: { id: { in: topProductIds } },
      select: { id: true, namePt: true, nameJa: true, primaryImage: true, hinban: true },
    });

    const topProducts = topProductsSales.map((p: any) => {
      const info = topProductsInfo.find((pi: any) => pi.id === p.productId);
      return {
        id: p.productId,
        namePt: info?.namePt || '—',
        nameJa: info?.nameJa || '',
        hinban: info?.hinban || '',
        image: info?.primaryImage || null,
        quantitySold: p._sum.quantity || 0,
        revenue: p._sum.subtotal || 0,
      };
    });

    // Monthly revenue (last 6 months)
    const monthlyRevenue = [];
    for (let i = 5; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const mRev = await prisma.order.aggregate({
        where: { createdAt: { gte: mStart, lte: mEnd }, status: { not: 'CANCELED' } },
        _sum: { total: true },
        _count: true,
      });
      monthlyRevenue.push({
        month: mStart.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short' }),
        monthKey: `${mStart.getFullYear()}-${String(mStart.getMonth() + 1).padStart(2, '0')}`,
        revenue: mRev._sum.total || 0,
        orders: mRev._count || 0,
      });
    }

    // Growth calculations
    const thisMonthRev = revenueThisMonth._sum.total || 0;
    const lastMonthRev = revenueLastMonth._sum.total || 0;
    const revenueGrowth = lastMonthRev > 0 ? Math.round(((thisMonthRev - lastMonthRev) / lastMonthRev) * 100) : 0;
    const orderGrowth = ordersLastMonth > 0 ? Math.round(((ordersThisMonth - ordersLastMonth) / ordersLastMonth) * 100) : 0;

    // Payment methods breakdown
    const paymentMethods = ordersByMethod.map((m: any) => ({
      method: m.paymentMethod,
      count: m._count,
      total: m._sum.total || 0,
    }));

    res.json({
      success: true,
      data: {
        // Basic counts
        totalProducts,
        totalOrders,
        totalCustomers,
        totalRevenue: revenue._sum.total || 0,

        // This month
        ordersThisMonth,
        revenueThisMonth: thisMonthRev,

        // Last month
        ordersLastMonth,
        revenueLastMonth: lastMonthRev,

        // Today
        ordersToday,
        revenueToday: revenueToday._sum.total || 0,

        // Growth
        revenueGrowth,
        orderGrowth,

        // Pending
        pendingOrders,
        pendingPayments,

        // Customer breakdown
        pjCustomers,
        pfCustomers,

        // Lists
        recentOrders,
        topProducts,
        monthlyRevenue,
        paymentMethods,
      },
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar estatísticas' });
  }
});

export default router;