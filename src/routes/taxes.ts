import { Router } from 'express';
import { PrismaClient, TaxType } from '@prisma/client';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

const taxSchema = z.object({
  namePt: z.string().min(1),
  nameJa: z.string().min(1),
  descriptionPt: z.string().optional(),
  descriptionJa: z.string().optional(),
  rate: z.number().min(0).max(100),
  type: z.nativeEnum(TaxType),
  applyToProducts: z.boolean().default(true),
  applyToShipping: z.boolean().default(false),
  priority: z.number().int().default(0),
  isDefault: z.boolean().default(false),
});

// GET /api/taxes - Listar todos
router.get('/', async (req, res) => {
  try {
    const taxes = await prisma.tax.findMany({
      where: { isActive: true },
      orderBy: [
        { priority: 'desc' },
        { namePt: 'asc' }
      ]
    });

    res.json({
      success: true,
      data: taxes
    });
  } catch (error) {
    console.error('Error fetching taxes:', error);
    res.status(500).json({
      success: false,
      message: { pt: 'Erro ao buscar impostos', ja: '税金の取得に失敗しました' }
    });
  }
});

// POST /api/taxes - Criar novo
router.post('/', async (req, res) => {
  try {
    const data = taxSchema.parse(req.body);

    // Se é padrão, remover padrão de outros
    if (data.isDefault) {
      await prisma.tax.updateMany({
        where: { isDefault: true },
        data: { isDefault: false }
      });
    }

    const tax = await prisma.tax.create({
      data
    });

    res.status(201).json({
      success: true,
      data: tax
    });
  } catch (error) {
    console.error('Error creating tax:', error);
    res.status(400).json({
      success: false,
      message: { pt: 'Erro ao criar imposto', ja: '税金の作成に失敗しました' }
    });
  }
});

// PUT /api/taxes/:id - Atualizar
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = taxSchema.parse(req.body);

    // Se é padrão, remover padrão de outros
    if (data.isDefault) {
      await prisma.tax.updateMany({
        where: { 
          isDefault: true,
          id: { not: id }
        },
        data: { isDefault: false }
      });
    }

    const tax = await prisma.tax.update({
      where: { id },
      data
    });

    res.json({
      success: true,
      data: tax
    });
  } catch (error) {
    console.error('Error updating tax:', error);
    res.status(400).json({
      success: false,
      message: { pt: 'Erro ao atualizar imposto', ja: '税金の更新に失敗しました' }
    });
  }
});

// DELETE /api/taxes/:id - Excluir (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.tax.update({
      where: { id },
      data: { isActive: false }
    });

    res.json({
      success: true,
      message: { pt: 'Imposto excluído', ja: '税金が削除されました' }
    });
  } catch (error) {
    console.error('Error deleting tax:', error);
    res.status(400).json({
      success: false,
      message: { pt: 'Erro ao excluir imposto', ja: '税金の削除に失敗しました' }
    });
  }
});

export default router;
