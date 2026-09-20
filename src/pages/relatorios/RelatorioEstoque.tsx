import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { downloadCsv } from '../../lib/csv'
import { formatQuantity } from '../../lib/number'
import type { Product } from '../../types/database'
import { Badge, Button, Card, EmptyState, Loader, StatTile, TableScroll, formatCurrency } from '../../components/ui'

export function RelatorioEstoque() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('products')
      .select('*')
      .eq('active', true)
      .order('name')
      .then(({ data }) => {
        setProducts((data as Product[]) ?? [])
        setLoading(false)
      })
  }, [])

  const costValue = products.reduce((s, p) => s + p.cost_price * p.stock_quantity, 0)
  const saleValue = products.reduce((s, p) => s + p.sale_price * p.stock_quantity, 0)
  const lowStock = products.filter((p) => p.stock_quantity <= p.min_stock)

  function exportCsv() {
    const rows: (string | number)[][] = [
      ['Código', 'Produto', 'Unidade', 'Estoque', 'Mínimo', 'Preço custo', 'Preço venda', 'Valor em custo', 'Valor em venda'],
    ]
    products.forEach((p) => {
      rows.push([
        p.code ?? '',
        p.name,
        p.unit,
        Number(p.stock_quantity),
        Number(p.min_stock),
        Number(p.cost_price),
        Number(p.sale_price),
        Number(p.cost_price) * Number(p.stock_quantity),
        Number(p.sale_price) * Number(p.stock_quantity),
      ])
    })
    downloadCsv('estoque.csv', rows)
  }

  if (loading) return <Loader />

  return (
    <div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Valor em estoque (custo)" value={formatCurrency(costValue)} />
        <StatTile label="Valor em estoque (venda)" value={formatCurrency(saleValue)} />
        <StatTile
          label="Itens com estoque baixo"
          value={String(lowStock.length)}
          tone={lowStock.length > 0 ? 'critical' : 'good'}
        />
      </div>

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold text-neutral-900">Estoque baixo</h3>
          <Button variant="secondary" size="sm" onClick={exportCsv} className="w-full sm:w-auto">
            <Download size={16} /> Exportar inventário (CSV)
          </Button>
        </div>
        {lowStock.length === 0 ? (
          <EmptyState message="Nenhum produto abaixo do estoque mínimo." />
        ) : (
          <TableScroll>
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
                  <th className="py-2 pr-3">Produto</th>
                  <th className="py-2 pr-3 text-right">Estoque</th>
                  <th className="py-2 pr-3 text-right">Mínimo</th>
                  <th className="py-2">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {lowStock.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2.5 pr-3 font-medium text-neutral-900">{p.name}</td>
                    <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                      {formatQuantity(Number(p.stock_quantity))} {p.unit}
                    </td>
                    <td className="py-2.5 pr-3 text-right whitespace-nowrap text-neutral-500">
                      {formatQuantity(Number(p.min_stock))} {p.unit}
                    </td>
                    <td className="py-2.5">
                      <Badge tone="critical">Repor</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>
    </div>
  )
}
