import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed...');

  // Criar usuários
  const admin = await prisma.user.upsert({
    where: { email: 'admin@realpan.jp' },
    update: {},
    create: {
      email: 'admin@realpan.jp',
      firstName: 'Admin',
      lastName: 'Real Pan',
      passwordHash: 'admin123',
      role: 'ADMIN',
      isActive: true,
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: 'manager@realpan.jp' },
    update: {},
    create: {
      email: 'manager@realpan.jp',
      firstName: 'Manager',
      lastName: 'Real Pan',
      passwordHash: 'manager123',
      role: 'MANAGER',
      isActive: true,
    },
  });

  console.log('✅ Usuários criados:');
  console.log('  - Admin:', admin.email);
  console.log('  - Manager:', manager.email);
  
  console.log('🎉 Seed concluído!');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
