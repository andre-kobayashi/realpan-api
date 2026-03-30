import { Router } from 'express';
import { PrismaClient, CustomerType } from '@prisma/client';
import bcrypt from 'bcrypt';

import emailService from '../services/emailService';
import { pjApprovalTemplate } from '../templates/emailTemplates';

const router = Router();
const prisma = new PrismaClient();

// GET /api/customers
router.get('/', async (req, res) => {
  try {
    const { type } = req.query;

    const where: any = {};
    
    if (type === 'PF' || type === 'INDIVIDUAL') {
      where.type = CustomerType.INDIVIDUAL;
    } else if (type === 'PJ' || type === 'BUSINESS') {
      where.type = CustomerType.BUSINESS;
    }

    const customers = await prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: customers
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({
      success: false,
      message: { pt: 'Erro ao buscar clientes', ja: '顧客の取得に失敗しました' }
    });
  }
});

// GET /api/customers/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const customer = await prisma.customer.findUnique({
      where: { id }
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: { pt: 'Cliente não encontrado', ja: '顧客が見つかりません' }
      });
    }

    res.json({
      success: true,
      data: customer
    });
  } catch (error) {
    console.error('Error fetching customer:', error);
    res.status(500).json({
      success: false,
      message: { pt: 'Erro ao buscar cliente', ja: '顧客の取得に失敗しました' }
    });
  }
});

// POST /api/customers
router.post('/', async (req, res) => {
  try {
    const { password, ...data } = req.body;

    // Se uma senha foi fornecida, fazer hash com bcrypt
    if (password) {
      data.passwordHash = await bcrypt.hash(password, 10);
    }

    // Remover campo password do data (não existe no schema)
    delete data.password;

    // Se não foi definido businessStatus e é BUSINESS, definir como PENDING
    if (data.type === 'BUSINESS' && !data.businessStatus) {
      data.businessStatus = 'PENDING';
    }

    // Garantir que isActive é true por padrão
    if (data.isActive === undefined) {
      data.isActive = true;
    }

    const customer = await prisma.customer.create({
      data
    });

    res.status(201).json({
      success: true,
      data: customer
    });
  } catch (error: any) {
    console.error('Error creating customer:', error);

    // Tratar erro de email duplicado
    if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
      return res.status(400).json({
        success: false,
        message: { pt: 'Email já cadastrado', ja: 'このメールアドレスは既に登録されています' }
      });
    }

    res.status(400).json({
      success: false,
      message: { pt: 'Erro ao criar cliente', ja: '顧客の作成に失敗しました' }
    });
  }
});

// PUT /api/customers/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { password, ...data } = req.body;

    // Se uma nova senha foi fornecida, fazer hash
    if (password) {
      data.passwordHash = await bcrypt.hash(password, 10);
    }

    // Remover campo password do data
    delete data.password;

    const customer = await prisma.customer.update({
      where: { id },
      data
    });

    res.json({
      success: true,
      data: customer,
      message: { pt: 'Cliente atualizado', ja: '顧客が更新されました' }
    });
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(400).json({
      success: false,
      message: { pt: 'Erro ao atualizar cliente', ja: '顧客の更新に失敗しました' }
    });
  }
});

// PATCH /api/customers/:id/approve
router.patch('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { approved = true } = req.body;

    const customer = await prisma.customer.update({
      where: { id },
      data: approved
        ? { approvedAt: new Date(), businessStatus: 'APPROVED' }
        : { businessStatus: 'REJECTED' }
    });

    // Send approval/rejection email (non-blocking)
    try {
      const config = await emailService.getConfig('realpan');
      const templateConfig = {
        logoUrl: config.logoUrl, companyName: config.companyName,
        companyNameJa: config.companyNameJa || null, phone: config.phone,
        website: config.website || 'https://realpan.jp',
      };
      const tmpl = pjApprovalTemplate({
        firstName: customer.firstName, lastName: customer.lastName,
        companyName: customer.companyName, email: customer.email,
        type: customer.type, businessStatus: customer.businessStatus,
      }, approved, templateConfig);
      await emailService.send({ to: customer.email, subject: tmpl.subject, html: tmpl.html,
        tags: [{ name: 'type', value: approved ? 'pj-approved' : 'pj-rejected' }] });
      console.log(`📧 PJ ${approved ? 'approval' : 'rejection'} email sent to ${customer.email}`);
    } catch (emailErr: any) {
      console.error('⚠️ Failed to send PJ email:', emailErr.message);
    }

    res.json({
      success: true,
      data: customer,
      message: approved
        ? { pt: 'Cliente aprovado', ja: '顧客が承認されました' }
        : { pt: 'Cliente rejeitado', ja: '顧客が却下されました' }
    });
  } catch (error) {
    console.error('Error approving customer:', error);
    res.status(400).json({
      success: false,
      message: { pt: 'Erro ao aprovar cliente', ja: '顧客の承認に失敗しました' }
    });
  }
});

export default router;