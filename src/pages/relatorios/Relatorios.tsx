import { useState } from 'react'
import { PageHeader, Tabs } from '../../components/ui'
import { RelatorioVendas } from './RelatorioVendas'
import { RelatorioEstoque } from './RelatorioEstoque'

export function Relatorios() {
  const [tab, setTab] = useState('vendas')

  return (
    <div>
      <PageHeader title="Relatórios" subtitle="Vendas por período e valorização de estoque." />
      <Tabs
        tabs={[
          { id: 'vendas', label: 'Vendas' },
          { id: 'estoque', label: 'Estoque' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'vendas' && <RelatorioVendas />}
      {tab === 'estoque' && <RelatorioEstoque />}
    </div>
  )
}
