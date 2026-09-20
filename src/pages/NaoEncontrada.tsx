import { Link } from 'react-router-dom'
import { Card } from '../components/ui'

export function NaoEncontrada() {
  return (
    <Card className="mx-auto max-w-md text-center">
      <p className="text-3xl font-semibold text-neutral-300">404</p>
      <h1 className="mt-2 text-lg font-semibold text-neutral-900">Página não encontrada</h1>
      <p className="mt-1 text-sm text-neutral-500">O endereço que você abriu não existe neste sistema.</p>
      <Link to="/" className="mt-4 inline-block text-sm font-medium text-[#d6247a] hover:underline">
        Voltar para o Dashboard
      </Link>
    </Card>
  )
}
