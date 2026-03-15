import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient, OrderStatus, PaymentStatus, PaymentMethod } from '@prisma/client';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

// Schema de validação
const createOrderSchema = z.object({
  customerId: z.string(),
  items: z.array(
    z.object({
      productId: z.string(),
      quantity: z.number().int().positive(),
    })
  ).min(1),
  paymentMethod: z.enum(['CREDIT_CARD', 'BANK_TRANSFER', 'COD', 'INVOICE']),
  shippingCost: z.number().int().default(0),
  notes: z.string().optional(),
});

// GET /api/orders/my — Pedidos do cliente logado
router.get('/my', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    let customerId: string;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;
      customerId = decoded.id;
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    const orders = await prisma.order.findMany({
      where: { customerId },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: orders });
  } catch (error) {
    console.error('Error fetching customer orders:', error);
    res.status(500).json({ success: false, message: 'Error fetching orders' });
  }
});
router.get('/', async (req, res) => {
  try {
    const { type, status, customerId } = req.query;

    const where: any = {};
    
    if (customerId) { where.customerId = customerId as string; }
    if (type) {
      where.customer = {
        type: type === 'PJ' ? 'BUSINESS' : 'INDIVIDUAL'
      };
    }

    if (status) {
      where.status = status;
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        customer: true,
        items: {
          include: {
            product: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: orders
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      message: { pt: 'Erro ao buscar pedidos', ja: '注文の取得に失敗しました' }
    });
  }
});

// POST /api/orders
router.post('/', async (req, res) => {
  try {
    const data = createOrderSchema.parse(req.body);

    // Buscar cliente
    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId }
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: { pt: 'Cliente não encontrado', ja: '顧客が見つかりません' }
      });
    }

    // Validar endereço do cliente
    console.log("📍 Cliente:", customer.email, "Endereço:", { postalCode: customer.postalCode, prefecture: customer.prefecture, city: customer.city, streetAddress: customer.streetAddress });
    if (!customer.postalCode || !customer.prefecture || !customer.city || !customer.streetAddress) {
      return res.status(400).json({
        success: false,
        message: { pt: 'Cliente sem endereço completo cadastrado', ja: '顧客の住所が登録されていません' }
      });
    }

    // Buscar produtos
    const products = await prisma.product.findMany({
      where: {
        id: { in: data.items.map(item => item.productId) }
      }
    });

    if (products.length !== data.items.length) {
      return res.status(404).json({
        success: false,
        message: { pt: 'Alguns produtos não foram encontrados', ja: '一部の製品が見つかりません' }
      });
    }

    // Calcular valores
    let subtotal = 0;
    let totalDiscount = 0;

    const orderItems = data.items.map(item => {
      const product = products.find(p => p.id === item.productId)!;
      
      // Usar preço base (originalPrice)
      const unitPrice = product.originalPrice;
      const itemSubtotal = unitPrice * item.quantity;
      
      // Aplicar desconto do cliente se for PJ
      let itemDiscount = 0;
      if (customer.type === 'BUSINESS' && customer.discountRate) {
        itemDiscount = Math.round(itemSubtotal * customer.discountRate);
      }

      subtotal += itemSubtotal;
      totalDiscount += itemDiscount;

      return {
        productId: product.id,
        namePt: product.namePt,
        nameJa: product.nameJa,
        hinban: product.hinban || product.id.slice(0, 8).toUpperCase(),
        image: product.primaryImage,
        quantity: item.quantity,
        unitPrice,
        subtotal: itemSubtotal,
        discountPercent: customer.discountRate ? customer.discountRate * 100 : 0,
        discountAmount: itemDiscount,
      };
    });

    // Calcular imposto (8% sobre subtotal - desconto)
    const subtotalAfterDiscount = subtotal - totalDiscount;
    const taxAmount = Math.round(subtotalAfterDiscount * 0.08);
    const shippingCostInCents = data.shippingCost || 0;
    const total = subtotalAfterDiscount + taxAmount + shippingCostInCents;

    // Gerar número do pedido
    const year = new Date().getFullYear();
    const lastOrder = await prisma.order.findFirst({
      where: {
        orderNumber: {
          startsWith: `RP-${year}-`
        }
      },
      orderBy: { orderNumber: 'desc' }
    });

    let nextNumber = 1;
    if (lastOrder) {
      const lastNumber = parseInt(lastOrder.orderNumber.split('-')[2]);
      nextNumber = lastNumber + 1;
    }

    const orderNumber = `RP-${year}-${nextNumber.toString().padStart(5, '0')}`;

    // Preparar nome para envio
    const shippingName = customer.type === 'INDIVIDUAL'
      ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim()
      : customer.companyName || '';

    // Criar pedido
    const order = await prisma.order.create({
      data: {
        orderNumber,
        customerId: data.customerId,
        subtotal,
        discountAmount: totalDiscount,
        taxAmount,
        shippingCost: shippingCostInCents,
        total,
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: data.paymentMethod as PaymentMethod,
        notes: data.notes || null,
        
        // Endereço de entrega (snapshot do cliente)
        shippingName,
        shippingPhone: customer.phone,
        shippingPostalCode: customer.postalCode,
        shippingPrefecture: customer.prefecture,
        shippingCity: customer.city,
        shippingWard: customer.ward || null,
        shippingStreet: customer.streetAddress,
        shippingBuilding: customer.building || null,
        
        items: {
          create: orderItems
        }
      },
      include: {
        customer: true,
        items: {
          include: {
            product: true
          }
        }
      }
    });

    res.status(201).json({
      success: true,
      data: order,
      message: { pt: 'Pedido criado com sucesso', ja: '注文が作成されました' }
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(400).json({
      success: false,
      message: { pt: 'Erro ao criar pedido', ja: '注文の作成に失敗しました' }
    });
  }
});

// GET /api/orders/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        items: {
          include: {
            product: true
          }
        }
      }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: { pt: 'Pedido não encontrado', ja: '注文が見つかりません' }
      });
    }

    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({
      success: false,
      message: { pt: 'Erro ao buscar pedido', ja: '注文の取得に失敗しました' }
    });
  }
});

// PATCH /api/orders/:id/status
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const order = await prisma.order.update({
      where: { id },
      data: { status },
      include: {
        customer: true,
        items: true
      }
    });

    res.json({
      success: true,
      data: order,
      message: { pt: 'Status atualizado', ja: 'ステータスが更新されました' }
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(400).json({
      success: false,
      message: { pt: 'Erro ao atualizar status', ja: 'ステータス更新に失敗しました' }
    });
  }
});

export default router;

// PATCH /api/orders/:id/status
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const order = await prisma.order.update({
      where: { id },
      data: { status },
      include: {
        customer: true,
        items: {
          include: {
            product: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: order,
      message: { pt: 'Status atualizado', ja: 'ステータスが更新されました' }
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(400).json({
      success: false,
      message: { pt: 'Erro ao atualizar status', ja: 'ステータスの更新に失敗しました' }
    });
  }
});

// GET /api/orders/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        items: {
          include: {
            product: true
          }
        }
      }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: { pt: 'Pedido não encontrado', ja: '注文が見つかりません' }
      });
    }

    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({
      success: false,
      message: { pt: 'Erro ao buscar pedido', ja: '注文の取得に失敗しました' }
    });
  }
});

// PUT /api/orders/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { items, carrierId, trackingCode, deliveryDate, deliveryTime, shippingCost, notes } = req.body;
    console.log("🔍 Items recebidos:", JSON.stringify(items, null, 2));
    console.log("🔍 Items recebidos:", JSON.stringify(items, null, 2));
    console.log('🔍 Items recebidos:', JSON.stringify(items, null, 2));

    // Buscar pedido atual
    const currentOrder = await prisma.order.findUnique({
      where: { id },
      include: { customer: true }
    });

    if (!currentOrder) {
      return res.status(404).json({
        success: false,
        message: { pt: 'Pedido não encontrado', ja: '注文が見つかりません' }
      });
    }

    // Buscar produtos
    const products = await prisma.product.findMany({
      where: { id: { in: items.map((item: any) => item.productId) } }
    });

    // Calcular novos valores
    let subtotal = 0;
    let totalDiscount = 0;

    console.log('📦 Criando orderItems para', items.length, 'items');
    console.log("📦 Criando orderItems para", items.length, "items");
    console.log("📦 Criando orderItems para", items.length, "items");
    const orderItems = items.map((item: any) => {
      const product = products.find(p => p.id === item.productId)!;
      const unitPrice = product.originalPrice;
      const itemSubtotal = unitPrice * item.quantity;
      
      let itemDiscount = 0;
      if (currentOrder.customer?.discountRate) {
        itemDiscount = Math.round(itemSubtotal * currentOrder.customer.discountRate);
      }

      subtotal += itemSubtotal;
      totalDiscount += itemDiscount;

      return {
        productId: product.id,
        namePt: product.namePt,
        nameJa: product.nameJa,
        hinban: product.hinban || product.id.slice(0, 8),
        image: product.primaryImage,
        quantity: item.quantity,
        unitPrice,
        subtotal: itemSubtotal,
        discountPercent: currentOrder.customer?.discountRate ? currentOrder.customer.discountRate * 100 : 0,
        discountAmount: itemDiscount,
      };
    });

    const subtotalAfterDiscount = subtotal - totalDiscount;
    const taxAmount = Math.round(subtotalAfterDiscount * 0.08);
    const shippingCostInCents = typeof shippingCost === "string" ? parseInt(shippingCost) * 100 : (shippingCost || 0);
    const total = subtotalAfterDiscount + taxAmount + shippingCostInCents;

    // Deletar itens antigos
    await prisma.orderItem.deleteMany({
      where: { orderId: id }
    });

    // Atualizar pedido e criar novos itens
    const order = await prisma.order.update({
      where: { id },
      data: {
        carrierId: carrierId || undefined,
        trackingCode: trackingCode || undefined,
        deliveryDate: deliveryDate ? new Date(deliveryDate + 'T00:00:00.000Z') : undefined,
        deliveryTime: deliveryTime || undefined,
        subtotal,
        discountAmount: totalDiscount,
        taxAmount,
        shippingCost: shippingCostInCents,
        total,
        notes,
        items: {
          create: orderItems
        }
      },
      include: {
        customer: true,
        items: {
          include: {
            product: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: order,
      message: { pt: 'Pedido atualizado', ja: '注文が更新されました' }
    });
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(400).json({
      success: false,
      message: { pt: 'Erro ao atualizar pedido', ja: '注文の更新に失敗しました' }
    });
  }
});
