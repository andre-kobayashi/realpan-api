import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

function enrichKit(kit: any): any {
  const effectivePrice = kit.promoPrice ?? kit.basePrice;
  const savingsAmount = kit.promoPrice ? kit.basePrice - kit.promoPrice : 0;
  const savingsPercent = kit.promoPrice ? Math.round((savingsAmount / kit.basePrice) * 100) : 0;
  const totalItems = (kit.items || []).reduce((sum: number, item: any) => sum + item.quantity, 0);
  const imgs = kit.images || [];
  const primaryImage = imgs.find((img: any) => img.isPrimary) || imgs[0] || null;
  return { ...kit, effectivePrice, savingsAmount, savingsPercent, totalItems, primaryImage: primaryImage?.imageUrl || null };
}

const inc = {
  items: { include: { product: true }, orderBy: { sortOrder: 'asc' } },
  images: { orderBy: { sortOrder: 'asc' } },
  giftProduct: true,
};

router.get('/', async (_req: Request, res: Response) => {
  try {
    const kits = await (prisma as any).kit.findMany({ include: inc, orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }] });
    res.json({ success: true, data: kits.map(enrichKit) });
  } catch (error) { console.error(error); res.status(500).json({ success: false, message: 'Failed' }); }
});

router.get('/:idOrSlug', async (req: Request, res: Response) => {
  try {
    const { idOrSlug } = req.params;
    let kit: any = await (prisma as any).kit.findUnique({ where: { id: idOrSlug }, include: inc });
    if (!kit) kit = await (prisma as any).kit.findUnique({ where: { slug: idOrSlug }, include: inc });
    if (!kit) return res.status(404).json({ success: false, message: 'Kit not found' });
    res.json({ success: true, data: enrichKit(kit) });
  } catch (error) { console.error(error); res.status(500).json({ success: false, message: 'Failed' }); }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const b = req.body;
    const kit = await (prisma as any).kit.create({
      data: {
        slug: b.slug, namePt: b.namePt, nameJa: b.nameJa,
        descriptionPt: b.descriptionPt || null, descriptionJa: b.descriptionJa || null,
        basePrice: b.basePrice, promoPrice: b.promoPrice || null,
        isActive: b.isActive ?? true, isFeatured: b.isFeatured ?? false,
        sortOrder: b.sortOrder || 0, giftEnabled: b.giftEnabled ?? false,
        giftProductId: b.giftEnabled ? b.giftProductId : null,
        items: { create: (b.items || []).map((item: any, i: number) => ({ productId: item.productId, quantity: item.quantity || 1, sortOrder: i })) },
        images: { create: (b.images || []).map((img: any, i: number) => ({ imageUrl: String(Array.isArray(img.imageUrl) ? img.imageUrl[0] : img.imageUrl), isPrimary: img.isPrimary ?? (i === 0), sortOrder: i })) },
      },
      include: inc,
    });
    res.json({ success: true, data: enrichKit(kit) });
  } catch (error: any) {
    console.error(error);
    if (error.code === 'P2002') return res.status(400).json({ success: false, message: 'Slug already exists' });
    res.status(500).json({ success: false, message: 'Failed to create kit' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const b = req.body;
    await (prisma as any).kitItem.deleteMany({ where: { kitId: id } });
    await (prisma as any).kitImage.deleteMany({ where: { kitId: id } });
    const kit = await (prisma as any).kit.update({
      where: { id },
      data: {
        slug: b.slug, namePt: b.namePt, nameJa: b.nameJa,
        descriptionPt: b.descriptionPt || null, descriptionJa: b.descriptionJa || null,
        basePrice: b.basePrice, promoPrice: b.promoPrice || null,
        isActive: b.isActive ?? true, isFeatured: b.isFeatured ?? false,
        sortOrder: b.sortOrder || 0, giftEnabled: b.giftEnabled ?? false,
        giftProductId: b.giftEnabled ? b.giftProductId : null,
        items: { create: (b.items || []).map((item: any, i: number) => ({ productId: item.productId, quantity: item.quantity || 1, sortOrder: i })) },
        images: { create: (b.images || []).map((img: any, i: number) => ({ imageUrl: String(Array.isArray(img.imageUrl) ? img.imageUrl[0] : img.imageUrl), isPrimary: img.isPrimary ?? (i === 0), sortOrder: i })) },
      },
      include: inc,
    });
    res.json({ success: true, data: enrichKit(kit) });
  } catch (error: any) {
    console.error(error);
    if (error.code === 'P2002') return res.status(400).json({ success: false, message: 'Slug already exists' });
    res.status(500).json({ success: false, message: 'Failed to update kit' });
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await (prisma as any).kit.update({ where: { id }, data: req.body });
    const kit = await (prisma as any).kit.findUnique({ where: { id }, include: inc });
    res.json({ success: true, data: enrichKit(kit) });
  } catch (error) { console.error(error); res.status(500).json({ success: false, message: 'Failed' }); }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await (prisma as any).kit.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Kit deleted' });
  } catch (error) { console.error(error); res.status(500).json({ success: false, message: 'Failed' }); }
});

export default router;
