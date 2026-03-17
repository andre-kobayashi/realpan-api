import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import { stripe, STRIPE_WEBHOOK_SECRET } from '../config/stripe';
import emailService from '../services/emailService';
import { orderConfirmationTemplate, adminNewOrderTemplate } from '../templates/emailTemplates';

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

        const updatedOrders = await prisma.order.updateMany({
          where: { stripePaymentIntentId: pi.id },
          data: {
            paymentStatus: 'PAID',
            status: 'PAID',
            paidAt: new Date(),
          },
        });

        // Send order confirmation email
        try {
          const order = await prisma.order.findFirst({
            where: { stripePaymentIntentId: pi.id },
            include: { items: { include: { product: true } }, customer: true, carrier: true },
          });
          if (order) {
            const config = await emailService.getConfig('realpan');
            const templateConfig = {
              logoUrl: config.logoUrl,
              companyName: config.companyName,
              companyNameJa: config.companyNameJa || null,
              phone: config.phone,
              website: config.website || 'https://realpan.jp',
            };
            const orderData = {
              orderNumber: order.orderNumber,
              items: order.items.map(item => ({
                namePt: item.namePt, nameJa: item.nameJa, hinban: item.hinban,
                quantity: item.quantity, unitPrice: item.unitPrice, subtotal: item.subtotal,
                image: item.image,
              })),
              subtotal: order.subtotal, taxAmount: order.taxAmount,
              shippingCost: order.shippingCost, daibikiFee: order.daibikiFee,
              discountAmount: order.discountAmount, total: order.total,
              paymentMethod: order.paymentMethod,
              customerName: order.customer.type === 'BUSINESS'
                ? order.customer.companyName || ''
                : `${order.customer.lastName || ''} ${order.customer.firstName || ''}`.trim(),
              customerEmail: order.customer.email,
              customerType: order.customer.type,
              shippingName: order.shippingName,
              shippingPostalCode: order.shippingPostalCode,
              shippingPrefecture: order.shippingPrefecture,
              shippingCity: order.shippingCity,
              shippingWard: order.shippingWard || undefined,
              shippingStreet: order.shippingStreet,
              shippingBuilding: order.shippingBuilding || undefined,
              deliveryDate: order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('ja-JP') : null,
              deliveryTime: order.deliveryTime || null,
              trackingCode: order.trackingCode || null,
              carrierName: order.carrier?.name || null,
            };
            // Email to customer
            const tmpl = orderConfirmationTemplate(orderData, templateConfig);
            await emailService.send({ to: order.customer.email, subject: tmpl.subject, html: tmpl.html,
              tags: [{ name: 'type', value: 'order-confirmation' }, { name: 'order', value: order.orderNumber }] });
            // Email to admin
            const adminTmpl = adminNewOrderTemplate(orderData, templateConfig);
            const adminEmails = (process.env.ADMIN_NOTIFICATION_EMAILS || 'clientrealpan@gmail.com').split(',').map((e: string) => e.trim());
            await emailService.send({ to: adminEmails, subject: adminTmpl.subject, html: adminTmpl.html,
              tags: [{ name: 'type', value: 'admin-new-order' }, { name: 'order', value: order.orderNumber }] });
            console.log(`📧 Order confirmation emails sent for ${order.orderNumber}`);
          }
        } catch (emailErr: any) {
          console.error('⚠️ Failed to send order email (non-blocking):', emailErr.message);
        }
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