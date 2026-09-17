import { useState } from 'react'
import { PageHeader, Tabs } from '../../components/ui'
import { NiveisTab } from './NiveisTab'
import { MovimentacoesTab } from './MovimentacoesTab'

export function Estoque() {
  const [tab, setTab] = useState('niveis')

  return (
    <div>
      <PageHeader title="Estoque" subtitle="Níveis atuais e movimentações manuais." />
      <Tabs
        tabs={[
          { id: 'niveis', label: 'Níveis de estoque' },
          { id: 'movimentacoes', label: 'Movimentações' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'niveis' && <NiveisTab />}
      {tab === 'movimentacoes' && <MovimentacoesTab />}
    </div>
  )
}
