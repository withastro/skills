export interface Product {
  id: string;
  name: string;
  price: number;
}

const products: Product[] = [
  { id: 'loom', name: 'Jacquard loom', price: 1200 },
  { id: 'engine', name: 'Difference engine', price: 17000 },
];

// Stands in for a slow database or API call.
export async function getProduct(id: string): Promise<Product | undefined> {
  return products.find((product) => product.id === id);
}
