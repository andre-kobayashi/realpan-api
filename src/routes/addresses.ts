import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Middleware de autenticação para todas as rotas
router.use(authMiddleware);

// GET - Listar endereços do cliente
router.get('/', async (req: AuthRequest, res) => {
  try {
    // Para este MVP, vamos retornar o endereço principal do Customer
    // Futuramente, criar tabela separada de endereços
    const customer = await prisma.customer.findUnique({
      where: { id: req.user?.id },
      select: {
        postalCode: true,
        prefecture: true,
        city: true,
        ward: true,
        streetAddress: true,
        building: true,
        phone: true,
      }
    });

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Cliente não encontrado' });
    }

    // Retornar como array para consistência futura
    const addresses = [];
    if (customer.postalCode) {
      addresses.push({
        id: 'primary',
        label: 'Endereço Principal / メインアドレス',
        isDefault: true,
        ...customer
      });
    }

    res.json({ success: true, data: addresses });
  } catch (error) {
    console.error('Error fetching addresses:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar endereços' });
  }
});

// PUT - Atualizar endereço principal
router.put('/', async (req: AuthRequest, res) => {
  try {
    const { postalCode, prefecture, city, ward, streetAddress, building, phone } = req.body;

    const customer = await prisma.customer.update({
      where: { id: req.user?.id },
      data: {
        postalCode,
        prefecture,
        city,
        ward: ward || null,
        streetAddress,
        building: building || null,
        phone: phone || null,
      },
      select: {
        postalCode: true,
        prefecture: true,
        city: true,
        ward: true,
        streetAddress: true,
        building: true,
        phone: true,
      }
    });

    res.json({
      success: true,
      data: {
        id: 'primary',
        label: 'Endereço Principal',
        isDefault: true,
        ...customer
      },
      message: {
        pt: 'Endereço atualizado com sucesso!',
        ja: '住所が更新されました！'
      }
    });
  } catch (error) {
    console.error('Error updating address:', error);
    res.status(500).json({ success: false, message: 'Erro ao atualizar endereço' });
  }
});

export default router;
