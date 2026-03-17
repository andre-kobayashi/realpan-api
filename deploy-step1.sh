#!/bin/bash
# ═══════════════════════════════════════════════════════════
# DEPLOY COMPLETO - Cola este script inteiro no terminal SSH
# ═══════════════════════════════════════════════════════════

API_DIR="/home/api/htdocs/api.realpan.jp/realpan-api"
cd "$API_DIR"

echo "🍞 Real Pan - Deploy Email System"
echo "══════════════════════════════════"

# ─────────────────────────────────────────────────────────
# 1. Instalar resend
# ─────────────────────────────────────────────────────────
echo ""
echo "📦 Instalando resend..."
npm install resend
echo ""

# ─────────────────────────────────────────────────────────
# 2. Criar diretório templates
# ─────────────────────────────────────────────────────────
mkdir -p src/templates
echo "✅ Diretório src/templates/ criado"

# ─────────────────────────────────────────────────────────
# 3. Verificar se rota de email já existe no server.ts
# ─────────────────────────────────────────────────────────
if grep -q "emailRoutes" src/server.ts; then
  echo "✅ emailRoutes já existe no server.ts"
else
  echo "🔧 Adicionando emailRoutes ao server.ts..."
  
  # Adicionar import após a última linha de import
  sed -i "/import financeRoutes from '.\/routes\/finance';/a import emailRoutes from './routes/email';" src/server.ts
  
  # Adicionar rota após a rota de finance
  sed -i "/app.use('\/api\/finance', financeRoutes);/a app.use('/api/email', emailRoutes);" src/server.ts
  
  echo "✅ emailRoutes adicionado ao server.ts"
fi

# ─────────────────────────────────────────────────────────
# 4. Verificar .env
# ─────────────────────────────────────────────────────────
echo ""
if grep -q "RESEND_API_KEY" .env; then
  echo "✅ RESEND_API_KEY já existe no .env"
else
  echo ""
  echo "# ─────────────────────────────────────────────────────────" >> .env
  echo "# EMAIL (Resend)" >> .env
  echo "# ─────────────────────────────────────────────────────────" >> .env
  echo "RESEND_API_KEY=re_COLE_SUA_CHAVE_AQUI" >> .env
  echo "ADMIN_NOTIFICATION_EMAILS=clientrealpan@gmail.com" >> .env
  echo ""
  echo "⚠️  RESEND_API_KEY adicionado ao .env com placeholder"
  echo "   Edite depois: nano .env"
fi

echo ""
echo "══════════════════════════════════════════════════════"
echo "✅ Dependências OK | ✅ Diretórios OK | ✅ server.ts OK"
echo ""
echo "📄 Agora crie os 3 arquivos TypeScript."
echo "   (os conteúdos serão fornecidos separadamente)"
echo "══════════════════════════════════════════════════════"