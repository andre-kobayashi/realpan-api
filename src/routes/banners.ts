import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const router = Router();
const prisma = new PrismaClient();

// Upload config - temp storage, will convert to WebP
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) { cb(null, true); } else { cb(null, false); }
  },
});

const BANNER_DIR = path.join(process.cwd(), 'public/uploads/banners');
const BANNER_WIDTH = 1920;
const BANNER_HEIGHT = 1080;
const WEBP_QUALITY = 82;

// Ensure directory exists
if (!fs.existsSync(BANNER_DIR)) {
  fs.mkdirSync(BANNER_DIR, { recursive: true });
}

// ═══════════════════════════════════════════════════════════
// GET /api/banners - List all banners (public)
// ═══════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const activeOnly = String(req.query.active || '') === 'true';
    const banners = await prisma.banner.findMany({
      where: activeOnly ? { active: true } : undefined,
      orderBy: { position: 'asc' },
    });
    res.json({ success: true, data: banners });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// GET /api/banners/:id - Get single banner
// ═══════════════════════════════════════════════════════════
router.get('/:id', async (req, res) => {
  try {
    const bannerId = req.params.id as string;
    const banner = await prisma.banner.findUnique({ where: { id: bannerId } });
    if (!banner) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: banner });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/banners - Create banner
// ═══════════════════════════════════════════════════════════
router.post('/', async (req, res) => {
  try {
    const { titlePt, titleJa, subtitlePt, subtitleJa, ctaPt, ctaJa, linkUrl, imageUrl, position, active } = req.body;
    const maxPos = await prisma.banner.aggregate({ _max: { position: true } });
    const banner = await prisma.banner.create({
      data: {
        titlePt: titlePt || '',
        titleJa: titleJa || '',
        subtitlePt: subtitlePt || '',
        subtitleJa: subtitleJa || '',
        ctaPt: ctaPt || '',
        ctaJa: ctaJa || '',
        linkUrl: linkUrl || '',
        position: position ?? (maxPos._max.position || 0) + 1,
        active: active ?? true,
      },
    });
    res.json({ success: true, data: banner });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// PUT /api/banners/:id - Update banner
// ═══════════════════════════════════════════════════════════
router.put('/:id', async (req, res) => {
  try {
    const { titlePt, titleJa, subtitlePt, subtitleJa, ctaPt, ctaJa, linkUrl, position, active } = req.body;
    const banner = await prisma.banner.update({
      where: { id: req.params.id },
      data: {
        ...(titlePt !== undefined && { titlePt }),
        ...(titleJa !== undefined && { titleJa }),
        ...(subtitlePt !== undefined && { subtitlePt }),
        ...(subtitleJa !== undefined && { subtitleJa }),
        ...(ctaPt !== undefined && { ctaPt }),
        ...(ctaJa !== undefined && { ctaJa }),
        ...(linkUrl !== undefined && { linkUrl }),
        ...(position !== undefined && { position }),
        ...(active !== undefined && { active }),
        ...(req.body.imageUrl !== undefined && { imageUrl: req.body.imageUrl }),
      },
    });
    res.json({ success: true, data: banner });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// POST /api/banners/:id/image - Upload banner image (converts to WebP)
// ═══════════════════════════════════════════════════════════
router.post('/:id/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file' });
    }

    const bannerId = req.params.id as string;
    const banner = await prisma.banner.findUnique({ where: { id: bannerId } });
    if (!banner) return res.status(404).json({ success: false, message: 'Banner not found' });

    // Delete old image if exists
    if (banner.imageUrl) {
      const oldPath = path.join(process.cwd(), 'public', banner.imageUrl.replace('/api/uploads/', 'uploads/'));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    // Convert to WebP with Sharp
    const filename = `banner-${banner.id}-${Date.now()}.webp`;
    const outputPath = path.join(BANNER_DIR, filename);

    await sharp(req.file.buffer)
      .resize(BANNER_WIDTH, BANNER_HEIGHT, {
        fit: 'cover',
        position: 'center',
      })
      .webp({ quality: WEBP_QUALITY })
      .toFile(outputPath);

    const imageUrl = `/api/uploads/banners/${filename}`;

    // Update banner with image URL
    const updated = await prisma.banner.update({
      where: { id: bannerId },
      data: { imageUrl },
    });

    const stats = fs.statSync(outputPath);
    console.log(`Banner image: ${filename} (${Math.round(stats.size / 1024)}KB, ${BANNER_WIDTH}x${BANNER_HEIGHT})`);

    res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Banner image upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// DELETE /api/banners/:id - Delete banner
// ═══════════════════════════════════════════════════════════
router.delete('/:id', async (req, res) => {
  try {
    const bannerId = req.params.id as string;
    const banner = await prisma.banner.findUnique({ where: { id: bannerId } });
    if (!banner) return res.status(404).json({ success: false, message: 'Not found' });

    // Delete image file
    if (banner.imageUrl) {
      const imgPath = path.join(process.cwd(), 'public', banner.imageUrl.replace('/api/uploads/', 'uploads/'));
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    }

    await prisma.banner.delete({ where: { id: String(req.params.id) } });
    res.json({ success: true, message: 'Deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// PUT /api/banners/reorder - Reorder banners
// ═══════════════════════════════════════════════════════════
router.put('/reorder/positions', async (req, res) => {
  try {
    const { items } = req.body; // [{ id, position }]
    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'items array required' });
    }

    await prisma.$transaction(
      items.map((item: { id: string; position: number }) =>
        prisma.banner.update({
          where: { id: item.id },
          data: { position: item.position },
        })
      )
    );

    res.json({ success: true, message: 'Reordered' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
