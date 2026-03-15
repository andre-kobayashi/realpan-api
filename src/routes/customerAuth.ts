import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// ===== REGISTER =====
router.post('/register', async (req, res) => {
  try {
    const {
      type, // 'INDIVIDUAL' ou 'BUSINESS'
      firstName,
      lastName,
      email,
      password,
      phone,
      postalCode,
      prefecture,
      city,
      ward,
      streetAddress,
      building,
      // PJ only
      companyName,
      taxId,
      houjinBangou,
      invoiceNumber,
    } = req.body;

    // Validações
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: {
          pt: 'Campos obrigatórios faltando',
          ja: '必須フィールドが不足しています'
        }
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: {
          pt: 'Senha deve ter no mínimo 6 caracteres',
          ja: 'パスワードは6文字以上必要です'
        }
      });
    }

    // Verificar se email já existe
    const existing = await prisma.customer.findUnique({
      where: { email }
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: {
          pt: 'Email já cadastrado',
          ja: 'このメールアドレスは既に登録されています'
        }
      });
    }

    // Hash da senha
    const passwordHash = await bcrypt.hash(password, 10);

    // Status: PF = APPROVED, PJ = PENDING
    const businessStatus = type === 'BUSINESS' ? 'PENDING' : 'APPROVED';

    // Criar cliente
    const customer = await prisma.customer.create({
      data: {
        type,
        businessStatus,
        isActive: true,
        email,
        passwordHash,
        firstName,
        lastName,
        phone: phone || '',
        postalCode: postalCode || null,
        prefecture: prefecture || null,
        city: city || null,
        ward: ward || null,
        streetAddress: streetAddress || null,
        building: building || null,
        // PJ fields
        companyName: companyName || null,
        companyNameKana: null,
        houjinBangou: houjinBangou || taxId || null,
        invoiceNumber: invoiceNumber || null,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        type: true,
        businessStatus: true,
      }
    });

    // Se for PF, já faz login automaticamente
    if (type === 'INDIVIDUAL') {
      const token = jwt.sign(
        { id: customer.id, email: customer.email, type: customer.type },
        process.env.JWT_SECRET!,
        { expiresIn: '30d' }
      );

      return res.status(201).json({
        success: true,
        token,
        customer: {
          ...customer,
          customerType: customer.type,
        },
        message: {
          pt: 'Conta criada com sucesso!',
          ja: 'アカウントが作成されました！'
        }
      });
    }

    // PJ: não faz login, aguarda aprovação
    res.status(201).json({
      success: true,
      customer: {
        ...customer,
        customerType: customer.type,
      },
      message: {
        pt: 'Solicitação enviada! Aguarde aprovação.',
        ja: '申請が送信されました！承認をお待ちください。'
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: {
        pt: 'Erro ao criar conta',
        ja: 'アカウント作成エラー'
      }
    });
  }
});

// ===== LOGIN =====
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: {
          pt: 'Email e senha são obrigatórios',
          ja: 'メールアドレスとパスワードは必須です'
        }
      });
    }

    const customer = await prisma.customer.findUnique({
      where: { email },
    });

    if (!customer) {
      return res.status(401).json({
        success: false,
        message: {
          pt: 'Email ou senha incorretos',
          ja: 'メールアドレスまたはパスワードが正しくありません'
        }
      });
    }

    // Verificar se tem senha (clientes antigos podem não ter)
    if (!customer.passwordHash) {
      return res.status(401).json({
        success: false,
        message: {
          pt: 'Esta conta não possui senha. Entre em contato para definir uma senha.',
          ja: 'このアカウントにはパスワードが設定されていません。お問い合わせください。'
        }
      });
    }

    // Verificar senha
    const isValidPassword = await bcrypt.compare(password, customer.passwordHash);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: {
          pt: 'Email ou senha incorretos',
          ja: 'メールアドレスまたはパスワードが正しくありません'
        }
      });
    }

    // Verificar se está ativo
    if (customer.isActive === false) {
      return res.status(403).json({
        success: false,
        message: {
          pt: 'Conta desativada',
          ja: 'アカウントが無効化されています'
        }
      });
    }

    // Se for PJ, verificar se foi aprovado
    if (customer.type === 'BUSINESS' && customer.businessStatus === 'PENDING') {
      return res.status(403).json({
        success: false,
        message: {
          pt: 'Sua conta ainda está em análise. Aguarde aprovação.',
          ja: 'アカウントはまだ審査中です。承認をお待ちください。'
        }
      });
    }

    if (customer.type === 'BUSINESS' && customer.businessStatus === 'REJECTED') {
      return res.status(403).json({
        success: false,
        message: {
          pt: 'Sua solicitação foi recusada. Entre em contato conosco.',
          ja: '申請が却下されました。お問い合わせください。'
        }
      });
    }

    // Atualizar lastLoginAt
    await prisma.customer.update({
      where: { id: customer.id },
      data: { lastLoginAt: new Date() },
    });

    // Gerar token
    const token = jwt.sign(
      {
        id: customer.id,
        email: customer.email,
        type: customer.type,
      },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      customer: {
        id: customer.id,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        type: customer.type,
        customerType: customer.type, // Para o frontend isPJ check
        businessStatus: customer.businessStatus,
        companyName: customer.companyName,
        phone: customer.phone,
        discountRate: customer.discountRate,
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

// ===== ME (verificar token) =====
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ success: false, message: 'No token' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

    const customer = await prisma.customer.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        type: true,
        businessStatus: true,
        isActive: true,
        phone: true,
        postalCode: true,
        prefecture: true,
        city: true,
        ward: true,
        streetAddress: true,
        building: true,
        companyName: true,
        discountRate: true,
      }
    });

    if (!customer || customer.isActive === false) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    res.json({
      success: true,
      customer: {
        ...customer,
        customerType: customer.type, // Para o frontend isPJ check
      }
    });
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
});

export default router;