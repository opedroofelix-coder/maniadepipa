import { PageHeader, Tabs } from '../../components/ui'
import { useTabParam } from '../../lib/tabs'
import { ProdutosTab } from './ProdutosTab'
import { CategoriasTab } from './CategoriasTab'
import { ClientesTab } from './ClientesTab'

export function Cadastro() {
  const [tab, setTab] = useTabParam(['produtos', 'categorias', 'clientes'], 'produtos')

  return (
    <div>
      <PageHeader title="Cadastro" subtitle="Produtos, categorias e clientes." />
      <Tabs
        tabs={[
          { id: 'produtos', label: 'Produtos' },
          { id: 'categorias', label: 'Categorias' },
          { id: 'clientes', label: 'Clientes' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'produtos' && <ProdutosTab />}
      {tab === 'categorias' && <CategoriasTab />}
      {tab === 'clientes' && <ClientesTab />}
    </div>
  )
}
