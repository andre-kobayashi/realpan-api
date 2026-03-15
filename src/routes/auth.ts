import { Router } from 'express';
import * as jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import prisma from '../config/database';

const router = Router();

// Login bilíngue
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: {
          pt: 'Email ou senha incorretos',
          ja: 'メールまたはパスワードが正しくありません'
        }
      });
    }

    // Verificar senha com bcrypt
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: {
          pt: 'Email ou senha incorretos',
          ja: 'メールまたはパスワードが正しくありません'
        }
      });
    }

    // Verificar se usuário está ativo
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: {
          pt: 'Conta desativada',
          ja: 'アカウントが無効化されています'
        }
      });
    }

    // Atualizar lastLoginAt
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: {
        pt: 'Erro ao fazer login',
        ja: 'ログインエラー'
      }
    });
  }
});

export default router;
