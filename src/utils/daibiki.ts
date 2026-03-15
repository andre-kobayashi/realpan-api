// ═══════════════════════════════════════════════════════════
// src/utils/daibiki.ts
// Cálculo de taxa de daibiki (代引き手数料)
// ═══════════════════════════════════════════════════════════

type DaibikiRate = {
  maxAmount: number; // Valor máximo do pedido para esta faixa (em YEN)
  fee: number;       // Taxa (税別, sem imposto)
};

/**
 * Calcula a taxa de daibiki baseada no valor do pedido e nas faixas da transportadora.
 * 
 * @param orderAmount - Valor total do pedido (em YEN)
 * @param rates - Faixas de taxa [{maxAmount, fee}] ordenadas por maxAmount
 * @param taxRate - Taxa de imposto (ex: 0.10 para 10%)
 * @returns Objeto com fee (税別), tax, total (税込)
 * 
 * Regra para valores acima da última faixa:
 * - Base: taxa da última faixa
 * - Para cada ¥100,000 extras acima do maxAmount da última faixa, adiciona ¥1,000
 * - Limite máximo: ¥5,000,000
 */
export function calculateDaibikiFee(
  orderAmount: number,
  rates: DaibikiRate[],
  taxRate: number = 0.10
): { fee: number; tax: number; total: number } {
  // Sem faixas configuradas = sem daibiki
  if (!rates || rates.length === 0) {
    return { fee: 0, tax: 0, total: 0 };
  }

  // Limite máximo
  if (orderAmount > 5000000) {
    return { fee: 0, tax: 0, total: 0 }; // Acima de ¥5M não aceita daibiki
  }

  // Ordenar faixas por maxAmount
  const sorted = [...rates].sort((a, b) => a.maxAmount - b.maxAmount);

  // Encontrar faixa aplicável
  for (const rate of sorted) {
    if (orderAmount <= rate.maxAmount) {
      const fee = rate.fee;
      const tax = Math.ceil(fee * taxRate);
      return { fee, tax, total: fee + tax };
    }
  }

  // Valor acima de todas as faixas → calcular escalonado
  const lastRate = sorted[sorted.length - 1];
  const excess = orderAmount - lastRate.maxAmount;
  const extraSteps = Math.ceil(excess / 100000); // Cada ¥100,000 extras
  const extraFee = extraSteps * 1000;
  const fee = lastRate.fee + extraFee;
  const tax = Math.ceil(fee * taxRate);

  return { fee, tax, total: fee + tax };
}

/**
 * Formata a taxa de daibiki para exibição
 */
export function formatDaibikiInfo(
  rates: DaibikiRate[],
  taxRate: number = 0.10,
  locale: 'pt' | 'ja' = 'ja'
): string[] {
  if (!rates || rates.length === 0) return [];
  
  const sorted = [...rates].sort((a, b) => a.maxAmount - b.maxAmount);
  
  return sorted.map(rate => {
    const total = rate.fee + Math.ceil(rate.fee * taxRate);
    if (locale === 'ja') {
      return `¥${rate.maxAmount.toLocaleString()}以下: ¥${total.toLocaleString()}（税込）`;
    }
    return `Até ¥${rate.maxAmount.toLocaleString()}: ¥${total.toLocaleString()} (c/ imposto)`;
  });
}