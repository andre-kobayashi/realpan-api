import express from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

interface CompanyKeyParams {
  companyKey?: string;
  type?: string;
}

const router = express.Router();
const prisma = new PrismaClient();

// Configurar upload de imagens
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = req.params.type; // 'logo' ou 'hanko'
    const uploadPath = path.join(__dirname, '../../../public/uploads', type + 's');
    
    // Criar diretório se não existir
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const companyKey = req.body.companyKey || 'realpan';
    const ext = path.extname(file.originalname);
    cb(null, `${companyKey}-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas (jpg, png, webp)'));
    }
  }
});

// GET - Buscar configurações
router.get('/:companyKey?', async (req, res) => {
  try {
    const { companyKey = 'realpan' } = req.params as CompanyKeyParams;
    
    let settings = await prisma.companySettings.findUnique({
      where: { companyKey }
    });
    
    // Se não existir, criar com valores padrão
    if (!settings) {
      settings = await prisma.companySettings.create({
        data: {
          companyKey,
          companyName: 'Real Pan',
          companyNameJa: 'レアルパン',
          email: 'contato@realpan.jp',
          phone: '+81 90-1234-5678',
          postalCode: '437-0000',
          prefecture: '静岡県',
          city: '袋井市',
          streetAddress: '',
          taxId: '', // Valor padrão
        }
      });
    }
    
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({
      success: false,
      message: { pt: 'Erro ao carregar configurações', ja: '設定の読み込みに失敗しました' }
    });
  }
});

// PUT - Atualizar configurações
router.put('/:companyKey', async (req, res) => {
  try {
    const { companyKey } = req.params as CompanyKeyParams;
    const data = req.body;
    
    console.log('📝 Payload recebido:', JSON.stringify(data, null, 2));
    
    // Remover campos que não devem ser atualizados diretamente
    delete data.id;
    delete data.createdAt;
    delete data.updatedAt;
    delete data.companyKey;
    
    const settings = await prisma.companySettings.upsert({
      where: { companyKey },
      update: data,
      create: {
        companyKey,
        ...data
      }
    });
    
    res.json({
      success: true,
      data: settings,
      message: { pt: 'Configurações salvas com sucesso', ja: '設定が保存されました' }
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(400).json({
      success: false,
      message: { pt: 'Erro ao salvar configurações', ja: '設定の保存に失敗しました' }
    });
  }
});

// POST - Upload de logo ou hanko
router.post('/upload/:type', upload.single('file'), async (req, res) => {
  try {
    const { type } = req.params; // 'logo' ou 'hanko'
    const { companyKey = 'realpan' } = req.body;
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: { pt: 'Nenhum arquivo enviado', ja: 'ファイルが選択されていません' }
      });
    }
    
    const fileUrl = `/uploads/${type}s/${req.file.filename}`;
    
    // Atualizar no banco
    const fieldName = type === 'logo' ? 'logoUrl' : 'hankoUrl';
    const settings = await prisma.companySettings.update({
      where: { companyKey },
      data: { [fieldName]: fileUrl }
    });
    
    res.json({
      success: true,
      data: {
        url: fileUrl,
        settings
      },
      message: { 
        pt: `${type === 'logo' ? 'Logo' : 'Hanko'} atualizado com sucesso`, 
        ja: `${type === 'logo' ? 'ロゴ' : '印鑑'}がアップロードされました` 
      }
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({
      success: false,
      message: { pt: 'Erro ao fazer upload', ja: 'アップロードに失敗しました' }
    });
  }
});

export default router;
