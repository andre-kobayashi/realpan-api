import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════
// GET /api/shipping/regions/:carrierId
// Retorna regiões de uma transportadora
// ═══════════════════════════════════════════════════
router.get('/regions/:carrierId', async (req, res) => {
  try {
    const { carrierId } = req.params;
    const regions = await prisma.shippingRegion.findMany({
      where: { carrierId },
      include: {
        rates: {
          where: { isActive: true },
          orderBy: { minWeight: 'asc' }
        }
      },
      orderBy: { sortOrder: 'asc' }
    });

    res.json({ success: true, data: regions });
  } catch (error) {
    console.error('Error fetching regions:', error);
    res.status(500).json({ success: false, message: 'Error fetching regions' });
  }
});

// ═══════════════════════════════════════════════════
// POST /api/shipping/calculate
// Calcula frete por prefecture + peso + tipo cliente
// Body: { prefecture, weightGrams, customerType? }
// ═══════════════════════════════════════════════════
router.post('/calculate', async (req, res) => {
  try {
    const { prefecture, weightGrams, customerType = 'PF' } = req.body;

    if (!prefecture || !weightGrams) {
      return res.status(400).json({
        success: false,
        message: { pt: 'Prefecture e peso são obrigatórios', ja: '都道府県と重量は必須です' }
      });
    }

    // Buscar todas transportadoras ativas com regiões
    const carriers = await prisma.carrier.findMany({
      where: {
        isActive: true,
        allowedCustomerTypes: { has: customerType },
      },
      include: {
        regions: {
          include: {
            rates: {
              where: { isActive: true },
              orderBy: { minWeight: 'asc' }
            }
          },
          orderBy: { sortOrder: 'asc' }
        },
        // Também incluir rates sem região (legacy)
        rates: {
          where: {
            isActive: true,
            regionId: null,
          },
          orderBy: { minWeight: 'asc' }
        }
      },
      orderBy: { sortOrder: 'asc' }
    });

    const options: any[] = [];

    for (const carrier of carriers) {
      let shippingPrice: number | null = null;
      let regionName = '';
      let extraDays = 0;
      let extraDaysNote = '';

      // 1. Tentar encontrar por região (novo sistema)
      const matchedRegion = carrier.regions.find(r =>
        r.prefectures.some(p => prefecture.includes(p) || p.includes(prefecture))
      );

      if (matchedRegion) {
        regionName = matchedRegion.name;
        extraDays = matchedRegion.extraDays;
        extraDaysNote = matchedRegion.extraDaysNote || '';

        // Encontrar rate por peso na região
        const rate = matchedRegion.rates.find(r =>
          weightGrams >= r.minWeight && weightGrams <= r.maxWeight
        );

        if (rate) {
          shippingPrice = rate.price;
        } else {
          // Peso excede o máximo — usar a última faixa
          const lastRate = matchedRegion.rates[matchedRegion.rates.length - 1];
          if (lastRate && weightGrams > lastRate.maxWeight) {
            shippingPrice = lastRate.price;
          }
        }
      }

      // 2. Fallback: usar rates sem região (sistema antigo)
      if (shippingPrice === null && carrier.rates.length > 0) {
        const rate = carrier.rates.find(r =>
          weightGrams >= r.minWeight && weightGrams <= r.maxWeight
        );
        if (rate) {
          shippingPrice = rate.price;
        }
      }

      if (shippingPrice !== null) {
        // Calcular data estimada
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const currentTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

        let baseDays = carrier.leadTimeDays || 1;

        // Se depois do horário de corte, adicionar offset
        if (currentTime >= (carrier.cutoffTime || '12:00')) {
          baseDays += carrier.cutoffDayOffset || 1;
        }

        // Adicionar dias extras da região
        baseDays += extraDays;

        // Calcular data estimada (pular fins de semana)
        const estimatedDate = addBusinessDays(now, baseDays);

        options.push({
          carrierId: carrier.id,
          carrierName: carrier.name,
          carrierNamePt: carrier.namePt,
          regionName,
          price: shippingPrice,
          estimatedDays: baseDays,
          estimatedDate: estimatedDate.toISOString().split('T')[0],
          extraDays,
          extraDaysNote,
          cutoffTime: carrier.cutoffTime,
          timeSlots: carrier.deliveryTimeSlots || [],
        });
      }
    }

    // Ordenar por preço
    options.sort((a, b) => a.price - b.price);

    res.json({
      success: true,
      data: {
        prefecture,
        weightGrams,
        customerType,
        options,
      }
    });
  } catch (error) {
    console.error('Error calculating shipping:', error);
    res.status(500).json({
      success: false,
      message: { pt: 'Erro ao calcular frete', ja: '送料計算エラー' }
    });
  }
});

// ═══════════════════════════════════════════════════
// CRUD para regiões (admin)
// ═══════════════════════════════════════════════════

// POST /api/shipping/regions
router.post('/regions', async (req, res) => {
  try {
    const { carrierId, name, namePt, prefectures, extraDays, extraDaysNote, sortOrder } = req.body;
    const region = await prisma.shippingRegion.create({
      data: { carrierId, name, namePt, prefectures, extraDays: extraDays || 0, extraDaysNote, sortOrder: sortOrder || 0 }
    });
    res.status(201).json({ success: true, data: region });
  } catch (error) {
    console.error('Error creating region:', error);
    res.status(400).json({ success: false, message: 'Error creating region' });
  }
});

// PUT /api/shipping/regions/:id
router.put('/regions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, namePt, prefectures, extraDays, extraDaysNote, sortOrder } = req.body;
    const region = await prisma.shippingRegion.update({
      where: { id },
      data: { name, namePt, prefectures, extraDays, extraDaysNote, sortOrder }
    });
    res.json({ success: true, data: region });
  } catch (error) {
    console.error('Error updating region:', error);
    res.status(400).json({ success: false, message: 'Error updating region' });
  }
});

// DELETE /api/shipping/regions/:id
router.delete('/regions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Deletar rates da região primeiro
    await prisma.shippingRate.deleteMany({ where: { regionId: id } });
    await prisma.shippingRegion.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting region:', error);
    res.status(400).json({ success: false, message: 'Error deleting region' });
  }
});

// ═══════════════════════════════════════════════════
// Utility: add business days (skip weekends)
// ═══════════════════════════════════════════════════
function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) { // Skip Sunday (0) and Saturday (6)
      added++;
    }
  }
  return result;
}

export default router;