import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Vendas } from './pages/vendas/Vendas'
import { Estoque } from './pages/estoque/Estoque'
import { Cadastro } from './pages/cadastro/Cadastro'
import { Relatorios } from './pages/relatorios/Relatorios'
import { NaoEncontrada } from './pages/NaoEncontrada'

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/vendas" element={<Vendas />} />
            <Route path="/estoque" element={<Estoque />} />
            <Route path="/cadastro" element={<Cadastro />} />
            <Route path="/relatorios" element={<Relatorios />} />
            <Route path="*" element={<NaoEncontrada />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
