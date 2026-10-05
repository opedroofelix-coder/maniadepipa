import { supabase } from './supabase'

/** Exatamente as colunas que fetchItemsInBatches busca, nem mais nem menos. */
export interface SaleItemRow {
  sale_id: string
  description: string
  quantity: number
  cost_price_at_sale: number
  subtotal: number
}

const COLUMNS = 'sale_id, description, quantity, cost_price_at_sale, subtotal'

/** PostgREST recebe os ids na URL; em lotes para não estourar o tamanho dela. */
export async function fetchItemsInBatches(saleIds: string[]): Promise<SaleItemRow[]> {
  const BATCH = 500
  const all: SaleItemRow[] = []
  for (let i = 0; i < saleIds.length; i += BATCH) {
    const { data } = await supabase.from('sale_items').select(COLUMNS).in('sale_id', saleIds.slice(i, i + BATCH))
    all.push(...((data as SaleItemRow[]) ?? []))
  }
  return all
}

export interface ProductSold {
  description: string
  quantity: number
  revenue: number
}

/**
 * Agrega os itens por produto. A chave é a `description` gravada na venda (o
 * nome na hora que vendeu), e não o product_id, porque item avulso não tem
 * produto e o nome do cadastro pode ter mudado depois. É a mesma chave que o
 * "Mais vendidos" do Dashboard usa.
 */
export function aggregateByProduct(items: SaleItemRow[]): ProductSold[] {
  const byProduct = new Map<string, ProductSold>()
  items.forEach((i) => {
    const key = i.description
    const acc = byProduct.get(key) ?? { description: key, quantity: 0, revenue: 0 }
    acc.quantity += Number(i.quantity)
    acc.revenue += Number(i.subtotal)
    byProduct.set(key, acc)
  })
  return Array.from(byProduct.values()).sort((a, b) => a.description.localeCompare(b.description, 'pt-BR'))
}
