import { useState } from 'react'
import { PageHeader, Tabs } from '../../components/ui'
import { PDV } from './PDV'
import { HistoricoTab } from './HistoricoTab'

export function Vendas() {
  const [tab, setTab] = useState('caixa')

  return (
    <div>
      <PageHeader title="Vendas" subtitle="Registre vendas e acompanhe o histórico." />
      <Tabs
        tabs={[
          { id: 'caixa', label: 'Nova venda' },
          { id: 'historico', label: 'Histórico' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'caixa' && <PDV />}
      {tab === 'historico' && <HistoricoTab />}
    </div>
  )
}
