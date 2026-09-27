/**
 * Product data required by the pricing domain.
 *
 * Products are identified by SKU. Database UUIDs remain within
 * the persistence layer and are not exposed to pricing logic.
 *
 * Prices are represented as integer pence.
 */
export interface Product {
  readonly sku: string;
  readonly name: string;
  readonly pricePence: number;
}