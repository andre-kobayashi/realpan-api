import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/carriers
router.get('/', async (req, res) => {
  try {
    const carriers = await prisma.carrier.findMany({
      include: {
        rates: {
          where: { isActive: true },
          orderBy: { minWeight: 'asc' }
        }
      },
      orderBy: { sortOrder: 'asc' }
    });

    res.json({ success: true, data: carriers });
  } catch (error) {
    console.error('Error fetching carriers:', error);
    res.status(500).json({
      success: false,
      message: { pt: 'Erro ao buscar transportadoras', ja: '運送会社の取得に失敗しました' }
    });
  }
});

// GET /api/carriers/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const carrier = await prisma.carrier.findUnique({
      where: { id },
      include: {
        rates: { orderBy: { minWeight: 'asc' } }
      }
    });

    if (!carrier) {
      return res.status(404).json({
        success: false,
        message: { pt: 'Transportadora não encontrada', ja: '運送会社が見つかりません' }
      });
    }

    res.json({ success: true, data: carrier });
  } catch (error) {
    console.error('Error fetching carrier:', error);
    res.status(500).json({
      success: false,
      message: { pt: 'Erro ao buscar transportadora', ja: '運送会社の取得に失敗しました' }
    });
  }
});

// POST /api/carriers
router.post('/', async (req, res) => {
  try {
    const {
      name, namePt, trackingUrlTemplate, rates,
      allowedCustomerTypes, cutoffTime, cutoffDayOffset, leadTimeDays,
      deliveryTimeSlots, minOrderAmount, maxWeightGrams, sortOrder
    } = req.body;

    const carrier = await prisma.carrier.create({
      data: {
        name,
        namePt,
        trackingUrlTemplate,
        allowedCustomerTypes: allowedCustomerTypes || ['PF', 'PJ'],
        cutoffTime: cutoffTime || '12:00',
        cutoffDayOffset: cutoffDayOffset ?? 1,
        leadTimeDays: leadTimeDays ?? 1,
        deliveryTimeSlots: deliveryTimeSlots || [],
        minOrderAmount: minOrderAmount || null,
        maxWeightGrams: maxWeightGrams || null,
        sortOrder: sortOrder || 0,
        rates: rates ? {
          create: rates.map((rate: any) => ({
            minWeight: rate.minWeight,
            maxWeight: rate.maxWeight,
            price: rate.price,
            prefecture: rate.prefecture || null,
          }))
        } : undefined
      },
      include: { rates: true }
    });

    res.status(201).json({
      success: true,
      data: carrier,
      message: { pt: 'Transportadora criada', ja: '運送会社が作成されました' }
    });
  } catch (error) {
    console.error('Error creating carrier:', error);
    res.status(400).json({
      success: false,
      message: { pt: 'Erro ao criar transportadora', ja: '運送会社の作成に失敗しました' }
    });
  }
});

// POST /api/carriers/:id/rates
router.post('/:id/rates', async (req, res) => {
  try {
    const { id } = req.params;
    const { minWeight, maxWeight, price, prefecture } = req.body;

    const rate = await prisma.shippingRate.create({
      data: {
        carrierId: id,
        minWeight,
        maxWeight,
        price,
        prefecture: prefecture || null,
      }
    });

    res.status(201).json({
      success: true,
      data: rate,
      message: { pt: 'Faixa de preço criada', ja: '料金帯が作成されました' }
    });
  } catch (error) {
    console.error('Error creating rate:', error);
    res.status(400).json({
      success: false,
      message: { pt: 'Erro ao criar faixa de preço', ja: '料金帯の作成に失敗しました' }
    });
  }
});

// PUT /api/carriers/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, namePt, trackingUrlTemplate, isActive,
      allowedCustomerTypes, cutoffTime, cutoffDayOffset, leadTimeDays,
      deliveryTimeSlots, minOrderAmount, maxWeightGrams, sortOrder
    } = req.body;

    const carrier = await prisma.carrier.update({
      where: { id },
      data: {
        name,
        namePt,
        trackingUrlTemplate,
        isActive,
        allowedCustomerTypes,
        cutoffTime,
        cutoffDayOffset,
        leadTimeDays,
        deliveryTimeSlots,
        minOrderAmount,
        maxWeightGrams,
        sortOrder,
      },
      include: { rates: true }
    });

    res.json({
      success: true,
      data: carrier,
      message: { pt: 'Transportadora atualizada', ja: '運送会社が更新されました' }
    });
  } catch (error) {
    console.error('Error updating carrier:', error);
    res.status(400).json({
      success: false,
      message: { pt: 'Erro ao atualizar transportadora', ja: '運送会社の更新に失敗しました' }
    });
  }
});

// PUT /api/carriers/rates/:rateId
router.put('/rates/:rateId', async (req, res) => {
  try {
    const { rateId } = req.params;
    const { minWeight, maxWeight, price, prefecture } = req.body;
    const rate = await prisma.shippingRate.update({
      where: { id: rateId },
      data: { minWeight, maxWeight, price, prefecture: prefecture || null }
    });
    res.json({ success: true, data: rate });
  } catch (error) {
    console.error('Error updating rate:', error);
    res.status(400).json({ success: false, message: { pt: 'Erro', ja: 'エラー' } });
  }
});

// DELETE /api/carriers/rates/:rateId
router.delete('/rates/:rateId', async (req, res) => {
  try {
    const { rateId } = req.params;
    await prisma.shippingRate.delete({ where: { id: rateId } });

    res.json({
      success: true,
      message: { pt: 'Faixa de preço removida', ja: '料金帯が削除されました' }
    });
  } catch (error) {
    console.error('Error deleting rate:', error);
    res.status(400).json({
      success: false,
      message: { pt: 'Erro ao remover faixa de preço', ja: '料金帯の削除に失敗しました' }
    });
  }
});

// DELETE /api/carriers/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.carrier.delete({ where: { id } });

    res.json({
      success: true,
      message: { pt: 'Transportadora removida', ja: '運送会社が削除されました' }
    });
  } catch (error) {
    console.error('Error deleting carrier:', error);
    res.status(400).json({
      success: false,
      message: { pt: 'Erro ao remover transportadora', ja: '運送会社の削除に失敗しました' }
    });
  }
});

export default router;
