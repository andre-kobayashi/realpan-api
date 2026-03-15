// seed-sagawa-regions.ts
// Executar com: npx ts-node seed-sagawa-regions.ts
// Ou compilar e rodar: npx tsc seed-sagawa-regions.ts && node seed-sagawa-regions.js

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════
// Regiões da Sagawa com prefeituras
// ═══════════════════════════════════════════════════
const SAGAWA_REGIONS = [
  {
    name: '北海道', namePt: 'Hokkaido', sortOrder: 1, extraDays: 2,
    extraDaysNote: '北海道は通常より2日多くかかります / Hokkaido: +2 dias',
    prefectures: ['北海道'],
    // peso(g): [2000, 5000, 10000, 20000, 30000, 50000]
    prices: [870, 1260, 1745, 2425, 3100, 5100],
  },
  {
    name: '北東北', namePt: 'Tohoku Norte', sortOrder: 2, extraDays: 0,
    prefectures: ['青森県', '岩手県', '秋田県'],
    prices: [870, 1110, 1455, 1890, 2375, 4375],
  },
  {
    name: '南東北', namePt: 'Tohoku Sul', sortOrder: 3, extraDays: 0,
    prefectures: ['宮城県', '山形県', '福島県'],
    prices: [870, 1065, 1355, 1795, 2280, 4280],
  },
  {
    name: '関東', namePt: 'Kanto', sortOrder: 4, extraDays: 0,
    prefectures: ['茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県', '山梨県'],
    prices: [775, 820, 915, 1260, 1795, 3795],
  },
  {
    name: '信越', namePt: 'Shinetsu', sortOrder: 5, extraDays: 0,
    prefectures: ['新潟県', '長野県'],
    prices: [775, 820, 915, 1260, 1795, 3795],
  },
  {
    name: '北陸', namePt: 'Hokuriku', sortOrder: 6, extraDays: 0,
    prefectures: ['富山県', '石川県', '福井県'],
    prices: [775, 820, 915, 1110, 1400, 3400],
  },
  {
    name: '東海', namePt: 'Tokai', sortOrder: 7, extraDays: 0,
    prefectures: ['岐阜県', '静岡県', '愛知県', '三重県'],
    prices: [550, 700, 900, 1100, 1350, 3350],
  },
  {
    name: '関西', namePt: 'Kansai', sortOrder: 8, extraDays: 0,
    prefectures: ['滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県'],
    prices: [775, 870, 1065, 1305, 1550, 3550],
  },
  {
    name: '中国', namePt: 'Chugoku', sortOrder: 9, extraDays: 0,
    prefectures: ['鳥取県', '島根県', '岡山県', '広島県', '山口県'],
    prices: [870, 970, 1110, 1600, 2130, 4130],
  },
  {
    name: '四国', namePt: 'Shikoku', sortOrder: 10, extraDays: 0,
    prefectures: ['徳島県', '香川県', '愛媛県', '高知県'],
    prices: [870, 970, 1110, 1600, 2130, 4130],
  },
  {
    name: '北九州', namePt: 'Kyushu Norte', sortOrder: 11, extraDays: 0,
    prefectures: ['福岡県', '佐賀県', '長崎県', '大分県'],
    prices: [870, 1065, 1355, 1840, 2375, 4375],
  },
  {
    name: '南九州', namePt: 'Kyushu Sul', sortOrder: 12, extraDays: 0,
    prefectures: ['熊本県', '宮崎県', '鹿児島県'],
    prices: [870, 1110, 1400, 1990, 2615, 4615],
  },
  {
    name: '沖縄', namePt: 'Okinawa', sortOrder: 13, extraDays: 2,
    extraDaysNote: '沖縄は通常より2日多くかかります / Okinawa: +2 dias',
    prefectures: ['沖縄県'],
    prices: [870, 1400, 2280, 3300, 4315, 6515],
  },
];

// Faixas de peso (em gramas)
const WEIGHT_BRACKETS = [
  { min: 0,     max: 2000,  label: '〜2kg' },
  { min: 2001,  max: 5000,  label: '〜5kg' },
  { min: 5001,  max: 10000, label: '〜10kg' },
  { min: 10001, max: 20000, label: '〜20kg' },
  { min: 20001, max: 30000, label: '〜30kg' },
  { min: 30001, max: 50000, label: '〜50kg' },
];

async function main() {
  // Encontrar Sagawa pelo nome
  const sagawa = await prisma.carrier.findFirst({
    where: {
      OR: [
        { name: { contains: 'Sagawa' } },
        { name: { contains: '佐川' } },
        { namePt: { contains: 'Sagawa' } },
      ]
    }
  });

  if (!sagawa) {
    console.error('❌ Sagawa não encontrada! Crie primeiro no admin.');
    process.exit(1);
  }

  console.log(`✅ Sagawa encontrada: ${sagawa.id} (${sagawa.name})`);

  // Limpar regiões e rates regionais existentes
  const existingRegions = await prisma.shippingRegion.findMany({
    where: { carrierId: sagawa.id }
  });

  if (existingRegions.length > 0) {
    console.log(`🗑️  Removendo ${existingRegions.length} regiões existentes...`);
    // Remover rates ligadas a regiões primeiro
    await prisma.shippingRate.deleteMany({
      where: { regionId: { in: existingRegions.map(r => r.id) } }
    });
    await prisma.shippingRegion.deleteMany({
      where: { carrierId: sagawa.id }
    });
  }

  // Criar regiões + rates
  let totalRates = 0;

  for (const region of SAGAWA_REGIONS) {
    console.log(`📍 Criando região: ${region.name} (${region.prefectures.length} prefeituras)`);

    const created = await prisma.shippingRegion.create({
      data: {
        carrierId: sagawa.id,
        name: region.name,
        namePt: region.namePt,
        prefectures: region.prefectures,
        extraDays: region.extraDays,
        extraDaysNote: region.extraDaysNote || null,
        sortOrder: region.sortOrder,
      }
    });

    // Criar rates para cada faixa de peso
    for (let i = 0; i < WEIGHT_BRACKETS.length; i++) {
      const bracket = WEIGHT_BRACKETS[i];
      const price = region.prices[i];

      if (price) {
        await prisma.shippingRate.create({
          data: {
            carrierId: sagawa.id,
            regionId: created.id,
            minWeight: bracket.min,
            maxWeight: bracket.max,
            price: price,
          }
        });
        totalRates++;
      }
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════');
  console.log(`✅ ${SAGAWA_REGIONS.length} regiões criadas`);
  console.log(`✅ ${totalRates} faixas de preço criadas`);
  console.log('═══════════════════════════════════════');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());