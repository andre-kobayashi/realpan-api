const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');
const path = require('path');

const prisma = new PrismaClient();

const FILE_PATH = path.resolve(process.argv[2] || './real_pan_import_v2.xlsx');
const DRY_RUN   = process.argv.includes('--dry-run');
const SHEET     = 'products_import';

// ── Mapeamento storageType (aceita variações) ─────────────────────────────────
const STORAGE_MAP = {
  'AMBIENT':      'AMBIENT',
  'SECO':         'AMBIENT',
  'FROZEN':       'FROZEN_READY',   // fallback genérico → pronto p/ consumo
  'FROZEN_READY': 'FROZEN_READY',
  'FROZEN_RAW':   'FROZEN_RAW',
  'CONGELADO':    'FROZEN_READY',
  'REFRIGERATED': 'REFRIGERATED',
  'REFRIGERADO':  'REFRIGERATED',
};
const VALID_STORAGE = Object.keys(STORAGE_MAP);

// ── Helpers ───────────────────────────────────────────────────────────────────
const toBool  = (v, def = false) => v === '' || v == null ? def : String(v).trim().toUpperCase() === 'TRUE';
const toInt   = (v, def = null) => v === '' || v == null ? def : parseInt(v, 10);
const toFloat = (v, def = 0.6)  => v === '' || v == null ? def : parseFloat(v);
const toStr   = (v, def = null) => v === '' || v == null ? def : String(v).trim();
const toArr   = (v)             => !v ? [] : String(v).split(',').map(s => s.trim()).filter(Boolean);
const toDate  = (v)             => !v ? null : new Date(v);

function slugify(text) {
  return String(text)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseStorage(raw) {
  if (!raw) return null;
  const key = String(raw).trim().toUpperCase();
  return STORAGE_MAP[key] || null;
}

// ── Ler planilha ──────────────────────────────────────────────────────────────
function readSheet(filePath) {
  const wb   = XLSX.readFile(filePath);
  const ws   = wb.Sheets[SHEET];
  if (!ws) throw new Error(`Aba "${SHEET}" não encontrada.`);

  const raw    = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const fields = raw[0];
  const rows   = [];

  for (let i = 4; i < raw.length; i++) {
    const row = raw[i];
    if (!row[0] && !row[1]) continue;
    const obj = {};
    fields.forEach((f, idx) => { if (f) obj[f] = row[idx]; });
    rows.push(obj);
  }
  return rows;
}

// ── Mapear linha → objeto Prisma ──────────────────────────────────────────────
function mapRow(row, idx) {
  const errors = [];

  const hinban      = toStr(row.hinban);
  const namePt      = toStr(row.namePt);
  const nameJa      = toStr(row.nameJa);
  const categoryId  = toStr(row.categoryId);
  const origPrice   = toInt(row.originalPrice);
  const storageType = parseStorage(row.storageType);

  if (!hinban)      errors.push('hinban obrigatório');
  if (!namePt)      errors.push('namePt obrigatório');
  if (!nameJa)      errors.push('nameJa obrigatório');
  if (!categoryId)  errors.push('categoryId obrigatório');
  if (!origPrice)   errors.push('originalPrice obrigatório');
  if (!storageType) errors.push(`storageType inválido: "${row.storageType}" — use: ${VALID_STORAGE.join(' | ')}`);

  if (errors.length) return { ok: false, row: idx + 1, errors };

  const slug = toStr(row.slug) || slugify(namePt);

  const wholesaleUnit = toStr(row.wholesaleUnit) || 'UNIT';
  const unitsPerBox   = toInt(row.unitsPerBox);
  const boxPrice      = wholesaleUnit === 'BOX' && unitsPerBox
    ? origPrice * unitsPerBox
    : toInt(row.boxPrice);

  const product = {
    hinban,
    namePt,
    nameJa,
    slug,
    categoryId,
    originalPrice:  origPrice,
    storageType,
    janCode:        toStr(row.janCode),
    descriptionPt:  toStr(row.descriptionPt),
    descriptionJa:  toStr(row.descriptionJa),
    shortDescPt:    toStr(row.shortDescPt),
    shortDescJa:    toStr(row.shortDescJa),
    weight:         toStr(row.weight),
    weightGrams:    toInt(row.weightGrams),
    dimensions:     toStr(row.dimensions),
    quantityInfo:   toStr(row.quantityInfo),
    shelfLife:      toStr(row.shelfLife),
    shelfLifeDays:  toInt(row.shelfLifeDays),
    allergens:      toArr(row.allergens),
    retailMarkup:   toFloat(row.retailMarkup, 0.6),
    wholesaleUnit,
    unitsPerBox,
    boxPrice,
    promoPrice:     toInt(row.promoPrice),
    promoStartDate: toDate(row.promoStartDate),
    promoEndDate:   toDate(row.promoEndDate),
    stock:          toInt(row.stock, 0) ?? 0,
    minStock:       toInt(row.minStock, 0) ?? 0,
    stockUnit:      toStr(row.stockUnit) || 'unidade',
    availableForPf: toBool(row.availableForPf, true),
    availableForPj: toBool(row.availableForPj, true),
    isActive:       toBool(row.isActive, true),
    isFeatured:     toBool(row.isFeatured, false),
    isBestseller:   toBool(row.isBestseller, false),
    isNew:          toBool(row.isNew, false),
    isOnSale:       false,
    sortOrder:      toInt(row.sortOrder, 0) ?? 0,
    tags:           toArr(row.tags),
    metaTitlePt:    toStr(row.metaTitlePt),
    metaTitleJa:    toStr(row.metaTitleJa),
    images:         [],
    taxIds:         [],
  };

  return { ok: true, product };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n📂 Lendo arquivo: ${FILE_PATH}`);
  if (DRY_RUN) console.log('🔍 MODO DRY-RUN — nenhum dado será gravado\n');

  const rows = readSheet(FILE_PATH);
  console.log(`📋 ${rows.length} linha(s) encontrada(s)\n`);

  const valid = [], invalid = [];
  rows.forEach((row, idx) => {
    const result = mapRow(row, idx);
    if (result.ok) valid.push(result.product);
    else invalid.push(result);
  });

  if (invalid.length) {
    console.log(`❌ ${invalid.length} linha(s) com erro:\n`);
    invalid.forEach(({ row, errors }) =>
      console.log(`  Linha ${row}: ${errors.join(' | ')}`)
    );
    console.log('');
  }

  if (!valid.length) {
    console.log('⚠️  Nenhum produto válido para importar.');
    process.exit(1);
  }

  // Resumo storageType
  const stCount = valid.reduce((acc, p) => {
    acc[p.storageType] = (acc[p.storageType] || 0) + 1; return acc;
  }, {});
  console.log(`✅ ${valid.length} produto(s) válido(s)`);
  console.log('   StorageType:', JSON.stringify(stCount), '\n');

  if (DRY_RUN) {
    console.log('── Preview (primeiros 5) ──────────────────────────────');
    valid.slice(0, 5).forEach(p =>
      console.log(`  [${p.hinban}] ${p.namePt} | ¥${p.originalPrice} | ${p.storageType} | slug: ${p.slug}`)
    );
    console.log('\n✔  Dry-run concluído. Rode sem --dry-run para importar.');
    return;
  }

  // ── Upsert ────────────────────────────────────────────────────────────────
  console.log('⏳ Importando...\n');
  let created = 0, updated = 0, failed = 0;

  for (const product of valid) {
    try {
      const existing = await prisma.product.findUnique({ where: { hinban: product.hinban } });
      if (existing) {
        await prisma.product.update({ where: { hinban: product.hinban }, data: product });
        console.log(`  🔄 UPDATED  [${product.hinban}] ${product.namePt}`);
        updated++;
      } else {
        await prisma.product.create({ data: product });
        console.log(`  ➕ CREATED  [${product.hinban}] ${product.namePt}`);
        created++;
      }
    } catch (err) {
      console.error(`  ❌ FAILED   [${product.hinban}] ${product.namePt} — ${err.message}`);
      failed++;
    }
  }

  console.log(`
──────────────────────────────────────────
  ✅ Criados    : ${created}
  🔄 Atualizados: ${updated}
  ❌ Falhas     : ${failed}
──────────────────────────────────────────`);
}

main()
  .catch(err => { console.error('Fatal:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());