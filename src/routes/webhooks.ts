import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import { stripe, STRIPE_WEBHOOK_SECRET } from '../config/stripe';

const router = Router();
const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════════
// POST /api/webhooks/stripe
// Recebe eventos do Stripe e atualiza pedidos
// IMPORTANTE: Este endpoint precisa de raw body (não JSON parsed)
// ═══════════════════════════════════════════════════════════
router.post('/stripe', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];
  const signature = Array.isArray(sig) ? sig[0] : sig;

  if (!signature) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error('⚠️ Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  console.log(`📨 Stripe webhook: ${event.type}`);

  try {
    switch (event.type) {
      // ── Pagamento com cartão confirmado ──
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        console.log(`✅ Payment succeeded: ${pi.id} (¥${pi.amount})`);

        await prisma.order.updateMany({
          where: { stripePaymentIntentId: pi.id },
          data: {
            paymentStatus: 'PAID',
            status: 'PAID',
          },
        });
        break;
      }

      // ── Pagamento falhou ──
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        console.log(`❌ Payment failed: ${pi.id}`);

        await prisma.order.updateMany({
          where: { stripePaymentIntentId: pi.id },
          data: {
            paymentStatus: 'FAILED',
          },
        });
        break;
      }

      // ── Pagamento cancelado ──
      case 'payment_intent.canceled': {
        const pi = event.data.object as Stripe.PaymentIntent;
        console.log(`🚫 Payment canceled: ${pi.id}`);

        await prisma.order.updateMany({
          where: { stripePaymentIntentId: pi.id },
          data: {
            paymentStatus: 'FAILED',
            status: 'CANCELED',
          },
        });
        break;
      }

      // ── Konbini: aguardando pagamento (ação necessária) ──
      case 'payment_intent.requires_action': {
        const pi = event.data.object as Stripe.PaymentIntent;
        console.log(`⏳ Payment requires action: ${pi.id}`);
        // Konbini: cliente recebeu instruções de pagamento
        break;
      }

      // ── Reembolso ──
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        const piId = charge.payment_intent as string;
        console.log(`💸 Refunded: ${piId}`);

        if (piId) {
          await prisma.order.updateMany({
            where: { stripePaymentIntentId: piId },
            data: {
              paymentStatus: 'REFUNDED',
            },
          });
        }
        break;
      }

      // ── Checkout Session completada (legacy, se usar) ──
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`🛒 Checkout completed: ${session.id}`);

        if (session.payment_intent) {
          await prisma.order.updateMany({
            where: {
              OR: [
                { stripeSessionId: session.id },
                { stripePaymentIntentId: session.payment_intent as string },
              ],
            },
            data: {
              paymentStatus: 'PAID',
              status: 'PAID',
              stripePaymentIntentId: session.payment_intent as string,
            },
          });
        }
        break;
      }

      default:
        console.log(`ℹ️ Unhandled event: ${event.type}`);
    }
  } catch (error) {
    console.error(`❌ Error processing webhook ${event.type}:`, error);
    // Retorna 200 mesmo com erro para não ficar em retry
    return res.status(200).json({ received: true, error: 'Processing error' });
  }

  res.status(200).json({ received: true });
});

export default router;