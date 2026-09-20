import { useEffect, useState } from 'react'
import { AlertTriangle, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatQuantity } from '../../lib/number'
import type { Product } from '../../types/database'
import { Badge, Card, EmptyState, Input, Loader, TableScroll } from '../../components/ui'

export function NiveisTab() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [onlyLow, setOnlyLow] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase.from('products').select('*').eq('active', true).order('name')
      setProducts((data as Product[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = products
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    .filter((p) => !onlyLow || p.stock_quantity <= p.min_stock)

  const lowCount = products.filter((p) => p.stock_quantity <= p.min_stock).length

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <Input
            placeholder="Buscar produto"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar produto"
          />
        </div>
        <button
          type="button"
          onClick={() => setOnlyLow(!onlyLow)}
          aria-pressed={onlyLow}
          className={
            onlyLow
              ? 'flex items-center justify-center gap-2 rounded-lg bg-[#d03b3b]/10 px-3 py-2.5 text-sm font-medium text-[#d03b3b]'
              : 'flex items-center justify-center gap-2 rounded-lg bg-neutral-100 px-3 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-200'
          }
        >
          <AlertTriangle size={16} />
          Estoque baixo {lowCount > 0 && `(${lowCount})`}
        </button>
      </div>

      {loading ? (
        <Loader />
      ) : filtered.length === 0 ? (
        <EmptyState message="Nenhum produto encontrado." />
      ) : (
        <TableScroll>
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
                <th className="py-2 pr-3">Produto</th>
                <th className="py-2 pr-3 text-right">Estoque atual</th>
                <th className="py-2 pr-3 text-right">Mínimo</th>
                <th className="py-2">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.map((p) => {
                const low = p.stock_quantity <= p.min_stock
                return (
                  <tr key={p.id}>
                    <td className="py-2.5 pr-3 font-medium text-neutral-900">{p.name}</td>
                    <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                      {formatQuantity(Number(p.stock_quantity))} {p.unit}
                    </td>
                    <td className="py-2.5 pr-3 text-right whitespace-nowrap text-neutral-500">
                      {formatQuantity(Number(p.min_stock))} {p.unit}
                    </td>
                    <td className="py-2.5">
                      <Badge tone={low ? 'critical' : 'good'}>{low ? 'Baixo' : 'Ok'}</Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableScroll>
      )}
    </Card>
  )
}
