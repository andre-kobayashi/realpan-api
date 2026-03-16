import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Rotas
import authRoutes from './routes/auth';
import statsRoutes from './routes/stats';
import categoriesRoutes from './routes/categories';
import productsRoutes from './routes/products';
import customersRoutes from './routes/customers';
import ordersRoutes from './routes/orders';
import carriersRoutes from './routes/carriers';
import shippingRoutes from './routes/shipping';
import pricingRoutes from './routes/pricing';
import zipcodeRoutes from './routes/zipcode';
import taxesRoutes from './routes/taxes';
import uploadRoutes from './routes/upload';
import settingsRoutes from './routes/settings';
import usersRoutes from './routes/users';
import customerAuthRoutes from './routes/customerAuth';
import paymentsRoutes from './routes/payments';
import webhooksRoutes from './routes/webhooks';
import addressesRoutes from './routes/addresses';
import documentsRoutes from './routes/documents';
import kitRoutes from './routes/kits';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// CORS - Permitir admin.realpan.jp
app.use(cors({
  origin: [
    'https://admin.realpan.jp',
    'https://realpan.jp',
    'https://realpan.co.jp',
    'https://www.realpan.jp',
    'https://www.realpan.co.jp',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002'
  ],
  credentials: true
}));

// Stripe webhook - raw body ANTES do express.json()
app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhooksRoutes);
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/carriers', carriersRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/zipcode', zipcodeRoutes);
app.use('/api/taxes', taxesRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/auth/customer', customerAuthRoutes);
app.use('/api/addresses', addressesRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/kits', kitRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: { pt: 'Rota não encontrada', ja: 'ルートが見つかりません' }
  });
});

app.listen(PORT, () => {
  console.log(`🚀 API Server running on port ${PORT}`);
  console.log(`📅 Started at: ${new Date().toISOString()}`);
  console.log(`🔓 CORS enabled for: admin.realpan.jp, localhost`);
});
