import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';
import { calculatePrice } from '../utils/pricing';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
});

const prisma = new PrismaClient();

/**
 * Obter imagem principal do produto
 */
function getPrimaryImage(product: { primaryImage?: string | null; images?: string[] }): string | undefined {
  return product.primaryImage || product.images?.[0] || undefined;
}

/**
 * Criar sessão de checkout no Stripe
 */
export async function createCheckoutSession(
  items: Array<{ productId: string; quantity: number }>,
  customerId: string,
  successUrl: string,
  cancelUrl: string
) {
  try {
    // Buscar cliente
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new Error('Cliente não encontrado');
    }

    // Buscar produtos
    const products = await prisma.product.findMany({
      where: {
        id: { in: items.map((item) => item.productId) },
        isActive: true,
      },
      include: {
        category: true,
      },
    });

    if (products.length !== items.length) {
      throw new Error('Alguns produtos não foram encontrados');
    }

    // Criar line items para o Stripe
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map((item) => {
      const product = products.find((p) => p.id === item.productId)!;

      // Calcular preço baseado no tipo de cliente
      const pricing = calculatePrice({
        basePrice: product.originalPrice,
        customerType: customer.type,
        retailMarkup: product.retailMarkup,
        customerDiscount: customer.discountRate || 0,
        taxRate: 0.08, // TODO: Buscar do imposto do produto
      });

      return {
        price_data: {
          currency: 'jpy',
          product_data: {
            name: product.nameJa,
            description: product.shortDescJa || undefined,
            images: getPrimaryImage(product) ? [getPrimaryImage(product)!] : undefined,
          },
          unit_amount: pricing.total, // Preço já com imposto
        },
        quantity: item.quantity,
      };
    });

    // Criar ou buscar Stripe Customer
    let stripeCustomerId = customer.stripeCustomerId;

    if (!stripeCustomerId) {
      const stripeCustomer = await stripe.customers.create({
        email: customer.email,
        name:
          customer.type === 'INDIVIDUAL'
            ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim()
            : customer.companyName || undefined,
        phone: customer.phone,
        metadata: {
          realpanCustomerId: customer.id,
        },
      });

      stripeCustomerId = stripeCustomer.id;

      // Salvar Stripe Customer ID
      await prisma.customer.update({
        where: { id: customerId },
        data: { stripeCustomerId },
      });
    }

    // Criar sessão de checkout
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        customerId,
        customerType: customer.type,
      },
    });

    return session;
  } catch (error) {
    console.error('Erro ao criar sessão de checkout:', error);
    throw error;
  }
}

/**
 * Processar webhook do Stripe
 */
export async function handleWebhook(
  signature: string,
  payload: Buffer
): Promise<{ received: boolean }> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  try {
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('Checkout completado:', session.id);
        // TODO: Criar pedido no banco de dados
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log('Pagamento confirmado:', paymentIntent.id);
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log('Pagamento falhou:', paymentIntent.id);
        break;
      }

      default:
        console.log(`Evento não tratado: ${event.type}`);
    }

    return { received: true };
  } catch (error) {
    console.error('Erro ao processar webhook:', error);
    throw error;
  }
}
