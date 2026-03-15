import { Router } from 'express';
import { z } from 'zod';
import { calculatePrice, calculateCartTotal } from '../utils/pricing';

const router = Router();

// Schema de validação
const priceCalculationSchema = z.object({
  basePrice: z.number().positive(),
  customerType: z.enum(['INDIVIDUAL', 'BUSINESS']),
  retailMarkup: z.number().positive().optional(),
  customerDiscount: z.number().min(0).max(1).optional(),
  taxRate: z.number().min(0).max(1).optional(),
});

const cartCalculationSchema = z.object({
  items: z.array(
    z.object({
      basePrice: z.number().positive(),
      quantity: z.number().int().positive(),
    })
  ),
  customerType: z.enum(['INDIVIDUAL', 'BUSINESS']),
  customerDiscount: z.number().min(0).max(1).optional(),
  taxRate: z.number().min(0).max(1).optional(),
});

// POST /api/pricing/calculate - Calcular preço de um produto
router.post('/calculate', async (req, res) => {
  try {
    const data = priceCalculationSchema.parse(req.body);
    const result = calculatePrice(data);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error calculating price:', error);
    res.status(400).json({
      success: false,
      message: { pt: 'Erro ao calcular preço', ja: '価格計算エラー' },
    });
  }
});

// POST /api/pricing/cart - Calcular total do carrinho
router.post('/cart', async (req, res) => {
  try {
    const data = cartCalculationSchema.parse(req.body);
    const result = calculateCartTotal(
      data.items,
      data.customerType,
      data.customerDiscount,
      data.taxRate
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error calculating cart total:', error);
    res.status(400).json({
      success: false,
      message: { pt: 'Erro ao calcular total', ja: '合計計算エラー' },
    });
  }
});

export default router;
