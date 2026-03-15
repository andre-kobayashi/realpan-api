import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

const categorySchema = z.object({
  namePt: z.string().min(1),
  nameJa: z.string().min(1),
  descriptionPt: z.string().optional(),
  descriptionJa: z.string().optional(),
});

// GET /api/categories
router.get('/', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: { products: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: { pt: 'Erro ao buscar categorias', ja: 'カテゴリーの取得に失敗しました' }
    });
  }
});

// POST /api/categories
router.post('/', async (req, res) => {
  try {
    console.log('📥 Received body:', JSON.stringify(req.body, null, 2));
    
    const data = categorySchema.parse(req.body);
    
    const slug = data.namePt
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Verificar se slug já existe
    const existing = await prisma.category.findUnique({
      where: { slug }
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: { 
          pt: `Categoria "${data.namePt}" já existe!`, 
          ja: `カテゴリー「${data.namePt}」は既に存在します！` 
        }
      });
    }

    const category = await prisma.category.create({
      data: {
        ...data,
        slug,
      }
    });

    res.status(201).json({
      success: true,
      data: category,
      message: { pt: 'Categoria criada com sucesso!', ja: 'カテゴリーが作成されました！' }
    });
  } catch (error) {
    console.error('Error creating category:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: { pt: 'Dados inválidos', ja: 'データが無効です' },
        errors: error.errors
      });
    }
    
    res.status(400).json({
      success: false,
      message: { pt: 'Erro ao criar categoria', ja: 'カテゴリーの作成に失敗しました' }
    });
  }
});

// GET /api/categories/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const category = await prisma.category.findUnique({
      where: { id }
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: { pt: 'Categoria não encontrada', ja: 'カテゴリーが見つかりません' }
      });
    }

    res.json({
      success: true,
      data: category
    });
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({
      success: false,
      message: { pt: 'Erro ao buscar categoria', ja: 'カテゴリーの取得に失敗しました' }
    });
  }
});

// PUT /api/categories/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = categorySchema.parse(req.body);

    const category = await prisma.category.update({
      where: { id },
      data
    });

    res.json({
      success: true,
      data: category
    });
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(400).json({
      success: false,
      message: { pt: 'Erro ao atualizar categoria', ja: 'カテゴリーの更新に失敗しました' }
    });
  }
});

// DELETE /api/categories/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.category.update({
      where: { id },
      data: { isActive: false }
    });

    res.json({
      success: true,
      message: { pt: 'Categoria excluída', ja: 'カテゴリーが削除されました' }
    });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(400).json({
      success: false,
      message: { pt: 'Erro ao excluir categoria', ja: 'カテゴリーの削除に失敗しました' }
    });
  }
});

export default router;
