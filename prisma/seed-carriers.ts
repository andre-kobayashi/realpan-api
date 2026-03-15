import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚚 Seeding carriers...');

  // Sagawa Express
  await prisma.carrier.upsert({
    where: { id: 'sagawa' },
    update: {},
    create: {
      id: 'sagawa',
      name: 'Sagawa Express / 佐川急便',
      namePt: 'Sagawa Express',
      trackingUrlTemplate: 'https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo={CODE}',
      rates: {
        create: [
          { minWeight: 0, maxWeight: 2000, price: 80000 },
          { minWeight: 2001, maxWeight: 5000, price: 100000 },
          { minWeight: 5001, maxWeight: 10000, price: 130000 },
          { minWeight: 10001, maxWeight: 20000, price: 160000 },
          { minWeight: 20001, maxWeight: 30000, price: 200000 },
        ]
      }
    }
  });

  // Yamato Transport
  await prisma.carrier.upsert({
    where: { id: 'yamato' },
    update: {},
    create: {
      id: 'yamato',
      name: 'Yamato Transport / ヤマト運輸',
      namePt: 'Yamato (Kuroneko)',
      trackingUrlTemplate: 'https://toi.kuronekoyamato.co.jp/cgi-bin/tneko?number={CODE}',
      rates: {
        create: [
          { minWeight: 0, maxWeight: 2000, price: 85000 },
          { minWeight: 2001, maxWeight: 5000, price: 105000 },
          { minWeight: 5001, maxWeight: 10000, price: 135000 },
          { minWeight: 10001, maxWeight: 20000, price: 165000 },
          { minWeight: 20001, maxWeight: 30000, price: 210000 },
        ]
      }
    }
  });

  // Japan Post
  await prisma.carrier.upsert({
    where: { id: 'japanpost' },
    update: {},
    create: {
      id: 'japanpost',
      name: 'Japan Post / 日本郵便',
      namePt: 'Japan Post (Yu-Pack)',
      trackingUrlTemplate: 'https://trackings.post.japanpost.jp/services/srv/search/direct?reqCodeNo1={CODE}',
      rates: {
        create: [
          { minWeight: 0, maxWeight: 2000, price: 75000 },
          { minWeight: 2001, maxWeight: 5000, price: 95000 },
          { minWeight: 5001, maxWeight: 10000, price: 125000 },
          { minWeight: 10001, maxWeight: 20000, price: 155000 },
          { minWeight: 20001, maxWeight: 30000, price: 190000 },
        ]
      }
    }
  });

  console.log('✅ Carriers seeded!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
