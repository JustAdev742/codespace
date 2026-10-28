/*
 * Corner Shop: the product lines and what is on their shelves. Plain data the
 * browser can import to draw shelves, prices and the line shop, so no game
 * logic lives here. Prices and costs are whole dollars.
 */

export type LineId = 'fruit' | 'bakery' | 'books' | 'plants' | 'toys';
export type ProductId = 'apples' | 'melons' | 'bread' | 'cakes' | 'comics' | 'storybooks' | 'basil' | 'succulents' | 'yoyos' | 'teddies';

/** The order lines are listed in, on screens and in the shop. */
export const LINE_ORDER: readonly LineId[] = ['fruit', 'bakery', 'books', 'plants', 'toys'];

/**
 * Each product line stocks two products. `cost` is what it costs to add the line to a shop
 * (the starter lines are already there). Every line beyond two also brings 10% more customers
 * (LINE_CUSTOMERS in meta.ts). Tuned by simulation so a line bought in the first half of a
 * game pays for itself before the shop shuts.
 */
export const LINES: Record<LineId, { name: string; products: readonly [ProductId, ProductId]; cost: number; blurb: string }> = {
  fruit: { name: 'Fruit', products: ['apples', 'melons'], cost: 20, blurb: 'Cheap and popular: almost everyone wants an apple.' },
  bakery: { name: 'Bakery', products: ['bread', 'cakes'], cost: 20, blurb: 'Fresh bread and cakes. A steady seller.' },
  books: { name: 'Books', products: ['comics', 'storybooks'], cost: 25, blurb: 'Comics and storybooks sell for more.' },
  plants: { name: 'Plants', products: ['basil', 'succulents'], cost: 20, blurb: 'Pots of basil and little succulents.' },
  toys: { name: 'Toys', products: ['yoyos', 'teddies'], cost: 30, blurb: 'Yo-yos, and teddy bears: the dearest thing in the shop.' },
};

/**
 * Every product. `price` is what one costs a customer, in dollars. `delivery` is how many
 * come in one delivery. `popularity` is how often customers ask for it, relative to the
 * other products the shop sells.
 */
export const PRODUCTS: Record<ProductId, { line: LineId; one: string; many: string; price: number; delivery: number; popularity: number }> = {
  apples: { line: 'fruit', one: 'apple', many: 'apples', price: 1, delivery: 10, popularity: 6 },
  melons: { line: 'fruit', one: 'watermelon', many: 'watermelons', price: 4, delivery: 3, popularity: 2 },
  bread: { line: 'bakery', one: 'loaf of bread', many: 'loaves of bread', price: 3, delivery: 5, popularity: 4 },
  cakes: { line: 'bakery', one: 'cake', many: 'cakes', price: 4, delivery: 4, popularity: 3 },
  comics: { line: 'books', one: 'comic', many: 'comics', price: 5, delivery: 4, popularity: 3 },
  storybooks: { line: 'books', one: 'storybook', many: 'storybooks', price: 9, delivery: 3, popularity: 2 },
  basil: { line: 'plants', one: 'pot of basil', many: 'pots of basil', price: 4, delivery: 4, popularity: 3 },
  succulents: { line: 'plants', one: 'succulent', many: 'succulents', price: 7, delivery: 3, popularity: 2 },
  yoyos: { line: 'toys', one: 'yo-yo', many: 'yo-yos', price: 3, delivery: 5, popularity: 3 },
  teddies: { line: 'toys', one: 'teddy bear', many: 'teddy bears', price: 14, delivery: 2, popularity: 1 },
};

/** Every product, in shelf order (line by line). */
export const PRODUCT_ORDER: readonly ProductId[] = LINE_ORDER.flatMap((l) => LINES[l].products);

/** "1 apple", "3 loaves of bread". */
export function itemText(product: ProductId, qty: number): string {
  const p = PRODUCTS[product];
  return `${qty} ${qty === 1 ? p.one : p.many}`;
}
