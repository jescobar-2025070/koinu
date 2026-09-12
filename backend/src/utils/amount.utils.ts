export const MAX_AMOUNT = 999999999999.99;
export const MAX_AMOUNT_FORMATTED = '999,999,999,999.99';

export function isAmountTooLarge(amount: number): boolean {
  return !Number.isFinite(amount) || amount > MAX_AMOUNT;
}