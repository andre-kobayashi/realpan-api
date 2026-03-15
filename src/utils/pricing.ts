/**
 * Sistema de Precificação Real Pan
 *
 * Lógica:
 * - PF (Varejo): Preço COM imposto incluído (税込み - zeikomi)
 * - PJ (Atacado): Preço SEM imposto (税抜き - zeinuki), imposto calculado separadamente
 *
 * IMPORTANTE: originalPrice é armazenado em YEN INTEIRO (ex: ¥398 = 398)
 * O Japão NÃO usa centavos. Todos os valores são inteiros.
 * Arredondamento sempre para CIMA (Math.ceil) — nunca decimais.
 */

interface PriceCalculationParams {
  basePrice: number;           // Preço base em YEN (ex: 398 = ¥398)
  customerType: 'INDIVIDUAL' | 'BUSINESS';
  retailMarkup?: number;       // Padrão 0.6 (60%)
  customerDiscount?: number;   // Para PJ: 0.10 = 10%, 0.15 = 15%, etc
  taxRate?: number;            // Taxa de imposto: 0.08 = 8%, 0.10 = 10%, etc
}

interface PriceBreakdown {
  basePrice: number;
  markup?: number;
  discount?: number;
  subtotal: number;
  tax: number;
  total: number;
  displayPrice: number;
  taxIncluded: boolean;
  formatted: {
    basePrice: string;
    subtotal: string;
    tax: string;
    total: string;
    displayPrice: string;
  };
}

/**
 * Calcula o preço final baseado no tipo de cliente
 */
export function calculatePrice(params: PriceCalculationParams): PriceBreakdown {
  const {
    basePrice,
    customerType,
    retailMarkup = 0.6,
    customerDiscount = 0,
    taxRate = 0.08,
  } = params;

  if (customerType === 'INDIVIDUAL') {
    // PF: Preço Base ÷ retailMarkup COM imposto incluído (税込み)
    const priceBeforeTax = Math.ceil(basePrice / retailMarkup);
    const tax            = Math.ceil(priceBeforeTax * taxRate);
    const displayPrice   = priceBeforeTax + tax;
    const markup         = priceBeforeTax - basePrice;

    return {
      basePrice,
      markup,
      subtotal: priceBeforeTax,
      tax,
      total: displayPrice,
      displayPrice,
      taxIncluded: true,
      formatted: {
        basePrice:    formatYen(basePrice),
        subtotal:     formatYen(priceBeforeTax),
        tax:          formatYen(tax),
        total:        formatYen(displayPrice),
        displayPrice: formatYen(displayPrice),
      },
    };
  } else {
    // PJ: Preço Base - Desconto SEM imposto (税抜き)
    const discount     = Math.ceil(basePrice * customerDiscount);
    const subtotal     = basePrice - discount;
    const tax          = Math.ceil(subtotal * taxRate);
    const total        = subtotal + tax;
    const displayPrice = subtotal;

    return {
      basePrice,
      discount,
      subtotal,
      tax,
      total,
      displayPrice,
      taxIncluded: false,
      formatted: {
        basePrice:    formatYen(basePrice),
        subtotal:     formatYen(subtotal),
        tax:          formatYen(tax),
        total:        formatYen(total),
        displayPrice: formatYen(displayPrice),
      },
    };
  }
}

/**
 * Formata valor em Yen japonês
 * Entrada: YEN INTEIRO (ex: 398 → ¥398)
 * Sem divisão por 100 — o Japão NÃO usa centavos
 */
function formatYen(amount: number): string {
  const yenValue = Math.ceil(amount);
  return `¥${yenValue.toLocaleString('ja-JP', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

/**
 * Calcula múltiplos produtos (carrinho)
 */
export function calculateCartTotal(
  items: Array<{ basePrice: number; quantity: number }>,
  customerType: 'INDIVIDUAL' | 'BUSINESS',
  customerDiscount?: number,
  taxRate?: number
): PriceBreakdown {
  const totals = items.reduce(
    (acc, item) => {
      const itemPrice = calculatePrice({
        basePrice: item.basePrice,
        customerType,
        customerDiscount,
        taxRate,
      });
      return {
        basePrice:    acc.basePrice    + itemPrice.basePrice    * item.quantity,
        subtotal:     acc.subtotal     + itemPrice.subtotal     * item.quantity,
        tax:          acc.tax          + itemPrice.tax          * item.quantity,
        total:        acc.total        + itemPrice.total        * item.quantity,
        displayPrice: acc.displayPrice + itemPrice.displayPrice * item.quantity,
      };
    },
    { basePrice: 0, subtotal: 0, tax: 0, total: 0, displayPrice: 0 }
  );

  const taxIncluded = customerType === 'INDIVIDUAL';

  return {
    ...totals,
    taxIncluded,
    formatted: {
      basePrice:    formatYen(totals.basePrice),
      subtotal:     formatYen(totals.subtotal),
      tax:          formatYen(totals.tax),
      total:        formatYen(totals.total),
      displayPrice: formatYen(totals.displayPrice),
    },
  };
}