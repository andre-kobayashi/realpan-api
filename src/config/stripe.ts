import Stripe from 'stripe';

// Não lançar erro se não tiver chave — permite build sem chave
const secretKey = process.env.STRIPE_SECRET_KEY || '';

export const stripe = new Stripe(secretKey, {
  apiVersion: '2025-02-24.acacia' as any,
  typescript: true,
});

export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

// Verificar se Stripe está configurado
export const isStripeConfigured = (): boolean => {
  return !!process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'process.env.STRIPE_SECRET_KEY';
};