export interface BasketLine {
  readonly sku: string;
  readonly quantity: number;
}

/**
 * Basket input used by the pricing domain after HTTP validation.
 *
 */
export interface BasketRequest {
  readonly items: readonly BasketLine[];
  readonly couponCode?: string;
}

/**
 * Represents one individually priced unit used during promotion evaluation.
 *
 * Unit IDs are unique within a normalised basket calculation so item-level
 * promotions can track which units have already been consumed.
 */
export interface BasketUnit {
  readonly id: string;
  readonly sku: string;
  readonly pricePence: number;
}