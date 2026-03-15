import { Router, Request } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

const UPLOAD_DIR      = '/home/api/htdocs/api.realpan.jp/public/uploads';
const UPLOAD_URL_BASE = 'https://api.realpan.jp/uploads';

// ── Configurações de imagem para catálogo mobile ───────────────────────────
const IMAGE_CONFIG = {
  // Imagem principal: 800×800px quadrada, WebP qualidade 88
  // Ideal para catálogo: nítida em retina, leve em 3G (~40-80KB)
  main: {
    size:    800,
    quality: 88,
    effort:  4,   // 0-6: balanceia velocidade vs compressão
  },
  // Thumbnail: 400×400px para listagens e grids
  thumb: {
    size:    400,
    quality: 80,
    effort:  4,
  },
} as const;

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.memoryStorage();
const upload  = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB — crop no frontend reduz antes do envio
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Tipo de arquivo não permitido. Use JPG, PNG ou WebP.'));
  },
});

// ── POST /api/upload/images ────────────────────────────────────────────────
router.post('/images', upload.array('images', 10), async (req: Request, res) => {
  try {
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: { pt: 'Nenhuma imagem enviada', ja: '画像がアップロードされていません' },
      });
    }

    const uploadedUrls: string[] = [];

    for (const file of req.files) {
      // ── Imagem principal 800×800 ────────────────────────────────────────
      const mainFilename = `${uuidv4()}.webp`;
      const mainFilepath = path.join(UPLOAD_DIR, mainFilename);

      await sharp(file.buffer)
        .rotate()                          // corrige orientação EXIF (fotos de celular)
        .resize(IMAGE_CONFIG.main.size, IMAGE_CONFIG.main.size, {
          fit:              'cover',        // quadrado — corta bordas se necessário
          position:         'centre',
          withoutEnlargement: false,        // permite ampliar imagens pequenas
        })
        .webp({
          quality: IMAGE_CONFIG.main.quality,
          effort:  IMAGE_CONFIG.main.effort,
          lossless: false,
        })
        .toFile(mainFilepath);

      // ── Thumbnail 400×400 ───────────────────────────────────────────────
      const thumbFilename = `${uuidv4()}-thumb.webp`;
      const thumbFilepath = path.join(UPLOAD_DIR, thumbFilename);

      await sharp(file.buffer)
        .rotate()
        .resize(IMAGE_CONFIG.thumb.size, IMAGE_CONFIG.thumb.size, {
          fit:      'cover',
          position: 'centre',
        })
        .webp({
          quality: IMAGE_CONFIG.thumb.quality,
          effort:  IMAGE_CONFIG.thumb.effort,
          lossless: false,
        })
        .toFile(thumbFilepath);

      // Log de tamanhos para monitoramento
      const mainStat  = fs.statSync(mainFilepath);
      const thumbStat = fs.statSync(thumbFilepath);
      console.log(
        `[upload] ${mainFilename} — main: ${(mainStat.size / 1024).toFixed(1)}KB` +
        ` | thumb: ${(thumbStat.size / 1024).toFixed(1)}KB`
      );

      uploadedUrls.push(`${UPLOAD_URL_BASE}/${mainFilename}`);
    }

    res.json({
      success: true,
      data: { urls: uploadedUrls },
      message: { pt: 'Imagens enviadas com sucesso', ja: '画像が正常にアップロードされました' },
    });
  } catch (error) {
    console.error('[upload] error:', error);
    res.status(500).json({
      success: false,
      message: { pt: 'Erro ao fazer upload', ja: 'アップロードエラー' },
    });
  }
});

// ── DELETE /api/upload/images ──────────────────────────────────────────────
router.delete('/images', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || !String(url).startsWith(UPLOAD_URL_BASE)) {
      return res.status(400).json({
        success: false,
        message: { pt: 'URL inválida', ja: '無効なURL' },
      });
    }

    const filename  = String(url).replace(`${UPLOAD_URL_BASE}/`, '');
    const filepath  = path.join(UPLOAD_DIR, filename);

    // Remover imagem principal
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);

    // Remover thumbnail correspondente (mesmo UUID, sufixo -thumb)
    const uuid          = filename.replace('.webp', '');
    const thumbPattern  = path.join(UPLOAD_DIR, `${uuid}-thumb.webp`);
    if (fs.existsSync(thumbPattern)) fs.unlinkSync(thumbPattern);

    res.json({
      success: true,
      message: { pt: 'Imagem removida', ja: '画像が削除されました' },
    });
  } catch (error) {
    console.error('[upload] delete error:', error);
    res.status(500).json({
      success: false,
      message: { pt: 'Erro ao remover', ja: '削除エラー' },
    });
  }
});

export default router;