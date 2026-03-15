import express from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Todas as rotas requerem autenticação
router.use(authMiddleware);

// GET - Listar usuários (todos podem ver)
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { role, search, isActive } = req.query;
    
    const where: any = {};
    
    if (role) where.role = role;
    if (search) {
      where.OR = [
        { email: { contains: search as string, mode: 'insensitive' } },
        { firstName: { contains: search as string, mode: 'insensitive' } },
        { lastName: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: { pt: 'Erro ao listar usuários', ja: 'ユーザー一覧の取得に失敗しました' }
    });
  }
});

// GET - Buscar usuário por ID
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: { pt: 'Usuário não encontrado', ja: 'ユーザーが見つかりません' }
      });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      message: { pt: 'Erro ao buscar usuário', ja: 'ユーザーの取得に失敗しました' }
    });
  }
});

// POST - Criar usuário (apenas ADMIN)
router.post('/', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { email, password, firstName, lastName, phone, role } = req.body;

    // Validações
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: { pt: 'Campos obrigatórios faltando', ja: '必須フィールドが不足しています' }
      });
    }

    // Verificar se email já existe
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: { pt: 'Email já cadastrado', ja: 'メールアドレスは既に登録されています' }
      });
    }

    // Hash da senha
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        phone: phone || null,
        role: role || 'STAFF',
        createdBy: req.user?.id,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    res.status(201).json({
      success: true,
      data: user,
      message: { pt: 'Usuário criado com sucesso', ja: 'ユーザーが作成されました' }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      message: { pt: 'Erro ao criar usuário', ja: 'ユーザーの作成に失敗しました' }
    });
  }
});

// PUT - Atualizar usuário (ADMIN ou próprio usuário)
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const { email, password, firstName, lastName, phone, role, isActive } = req.body;

    // Verificar permissões
    const isOwnProfile = req.user?.id === id;
    const isAdmin = req.user?.role === 'ADMIN';

    if (!isOwnProfile && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: { pt: 'Sem permissão', ja: '権限がありません' }
      });
    }

    // Usuários não-admin não podem mudar role ou isActive
    if (!isAdmin && (role || isActive !== undefined)) {
      return res.status(403).json({
        success: false,
        message: { pt: 'Sem permissão para alterar role ou status', ja: '役割やステータスを変更する権限がありません' }
      });
    }

    const updateData: any = {
      email,
      firstName,
      lastName,
      phone: phone || null,
      updatedBy: req.user?.id,
    };

    // Apenas ADMIN pode alterar role e isActive
    if (isAdmin) {
      if (role) updateData.role = role;
      if (isActive !== undefined) updateData.isActive = isActive;
    }

    // Se mudou senha, fazer hash
    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        updatedAt: true,
      },
    });

    res.json({
      success: true,
      data: user,
      message: { pt: 'Usuário atualizado com sucesso', ja: 'ユーザーが更新されました' }
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      message: { pt: 'Erro ao atualizar usuário', ja: 'ユーザーの更新に失敗しました' }
    });
  }
});

// DELETE - Desativar usuário (soft delete - apenas ADMIN)
router.delete('/:id', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;

    // Não pode desativar a si mesmo
    if (req.user?.id === id) {
      return res.status(400).json({
        success: false,
        message: { pt: 'Não pode desativar sua própria conta', ja: '自分のアカウントを無効にすることはできません' }
      });
    }

    await prisma.user.update({
      where: { id },
      data: {
        isActive: false,
        updatedBy: req.user?.id,
      },
    });

    res.json({
      success: true,
      message: { pt: 'Usuário desativado com sucesso', ja: 'ユーザーが無効化されました' }
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: { pt: 'Erro ao desativar usuário', ja: 'ユーザーの無効化に失敗しました' }
    });
  }
});

export default router;
