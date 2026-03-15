import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient, StorageType, WholesaleUnit } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

const productSchema = z.object({
  namePt: z.string().min(1),
  nameJa: z.string().min(1),
  descriptionPt: z.string().nullable().optional(),
  descriptionJa: z.string().nullable().optional(),
  hinban: z.string().min(1),
  janCode: z.string().nullable().optional(),
  images: z.array(z.string()).optional().default([]),
  primaryImage: z.string().nullable().optional(),
  originalPrice: z.number().positive(),
  promoPrice: z.number().nullable().optional(),
  promoStartDate: z.string().nullable().optional(),
  promoEndDate: z.string().nullable().optional(),
  stock: z.number().int().min(0),
  categoryId: z.string(),
  weightGrams: z.number().nullable().optional(),
  quantityInfo: z.string().nullable().optional(),
  shelfLifeDays: z.number().nullable().optional(),
  storageType: z.nativeEnum(StorageType),
  retailMarkup: z.number().optional().default(0.6),
  wholesaleUnit: z.nativeEnum(WholesaleUnit).optional().default('UNIT'),
  unitsPerBox: z.number().nullable().optional(),
  boxPrice: z.number().nullable().optional(),
  isActive: z.boolean().optional(),
  isNew: z.boolean().optional().default(false),
  isBestseller: z.boolean().optional().default(false),
  isFeatured: z.boolean().optional().default(false),
  isOnSale: z.boolean().optional().default(false),
});

function calculateBoxPrice(unitPrice: number, unitsPerBox: number | null | undefined, wholesaleUnit: string): number | null {
  if (wholesaleUnit !== 'BOX' || !unitsPerBox || unitsPerBox <= 0) return null;
  return Math.ceil(unitPrice * unitsPerBox);
}

// GET /api/products
// ?all=true → retorna todos (para admin)
// sem param → retorna só ativos (para frontend público)
router.get('/', async (req, res) => {
  try {
    const showAll = req.query.all === 'true';

    const products = await prisma.product.findMany({
      where: showAll ? {} : { isActive: true },
      include: {
        category: true,
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: products
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: { pt: 'Erro ao buscar produtos', ja: '製品の取得に失敗しました' }
    });
  }
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    const idOrSlug = req.params.id;

    const product = await prisma.product.findFirst({
      where: {
        OR: [
          { id: idOrSlug },
          { slug: idOrSlug },
        ],
      },
      include: { category: true }
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: { pt: 'Produto não encontrado', ja: '製品が見つかりません' }
      });
    }

    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({
      success: false,
      message: { pt: 'Erro ao buscar produto', ja: '製品の取得に失敗しました' }
    });
  }
});

// POST /api/products
router.post('/', async (req, res) => {
  try {
    const data = productSchema.parse(req.body);

    const slug = data.namePt
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') + '-' + Date.now();

    const { categoryId, boxPrice: _bpIgnore, isActive, ...productData } = data;

    const boxPrice = data.boxPrice ?? calculateBoxPrice(
      productData.originalPrice,
      productData.unitsPerBox,
      productData.wholesaleUnit
    );

    const product = await prisma.product.create({
      data: {
        ...productData,
        boxPrice,
        isActive: isActive !== undefined ? isActive : true,
        slug,
        category: { connect: { id: categoryId } },
      },
      include: {
        category: true,
      }
    });

    res.status(201).json({
      success: true,
      data: product,
      message: { pt: 'Produto criado com sucesso', ja: '製品が作成されました' }
    });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(400).json({
      success: false,
      message: { pt: 'Erro ao criar produto', ja: '製品の作成に失敗しました' }
    });
  }
});

// PUT /api/products/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = productSchema.parse(req.body);
    const { categoryId, boxPrice: _bpIgnore, isActive, ...productData } = data;

    const boxPrice = data.boxPrice ?? calculateBoxPrice(
      productData.originalPrice,
      productData.unitsPerBox,
      productData.wholesaleUnit
    );

    const product = await prisma.product.update({
      where: { id },
      data: {
        ...productData,
        boxPrice,
        ...(isActive !== undefined && { isActive }),
        category: { connect: { id: categoryId } },
        updatedAt: new Date(),
      },
      include: { category: true }
    });

    res.json({
      success: true,
      data: product,
      message: { pt: 'Produto atualizado', ja: '製品が更新されました' }
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({
      success: false,
      message: { pt: 'Erro ao atualizar produto', ja: '製品の更新に失敗しました' }
    });
  }
});

// PATCH /api/products/:id/toggle
// Ativar ou desativar produto
router.patch('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;

    // Buscar estado atual
    const current = await prisma.product.findUnique({
      where: { id },
      select: { isActive: true, namePt: true },
    });

    if (!current) {
      return res.status(404).json({
        success: false,
        message: { pt: 'Produto não encontrado', ja: '製品が見つかりません' }
      });
    }

    const newStatus = !current.isActive;

    const product = await prisma.product.update({
      where: { id },
      data: { isActive: newStatus, updatedAt: new Date() },
      include: { category: true },
    });

    res.json({
      success: true,
      data: product,
      message: {
        pt: newStatus ? `${current.namePt} ativado` : `${current.namePt} desativado`,
        ja: newStatus ? '製品が有効になりました' : '製品が無効になりました',
      }
    });
  } catch (error) {
    console.error('Error toggling product:', error);
    res.status(500).json({
      success: false,
      message: { pt: 'Erro ao alterar status', ja: 'ステータスの変更に失敗しました' }
    });
  }
});

// DELETE /api/products/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.product.update({
      where: { id },
      data: { isActive: false }
    });

    res.json({
      success: true,
      message: { pt: 'Produto removido', ja: '製品が削除されました' }
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({
      success: false,
      message: { pt: 'Erro ao remover produto', ja: '製品の削除に失敗しました' }
    });
  }
});

export default router;