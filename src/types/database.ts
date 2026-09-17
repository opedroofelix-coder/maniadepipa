// Tipos que espelham o schema em supabase/migrations/0001_init.sql
// Escrito à mão (simples o bastante para não depender de codegen).

export type Role = 'dono' | 'caixa' | 'estoquista'
export type PaymentMethod = 'dinheiro' | 'pix' | 'credito' | 'debito' | 'misto'
export type SimplePaymentMethod = 'dinheiro' | 'pix' | 'credito' | 'debito'
export type SaleStatus = 'completed' | 'cancelled'
export type CashMovementType = 'sangria' | 'suprimento'
export type StockMovementType = 'entrada' | 'saida' | 'ajuste'

export interface Profile {
  id: string
  full_name: string
  role: Role
  created_at: string
}

export interface Category {
  id: string
  name: string
  created_at: string
}

export interface Product {
  id: string
  code: string | null
  name: string
  category_id: string | null
  unit: string
  cost_price: number
  sale_price: number
  stock_quantity: number
  min_stock: number
  active: boolean
  created_at: string
  updated_at: string
}

export interface Customer {
  id: string
  name: string
  phone: string | null
  email: string | null
  document: string | null
  notes: string | null
  created_at: string
}

export interface CashSession {
  id: string
  cashier_id: string | null
  opened_at: string
  closed_at: string | null
  opening_amount: number
  closing_amount: number | null
  expected_amount: number | null
  status: 'open' | 'closed'
}

export interface CashMovement {
  id: string
  session_id: string
  type: CashMovementType
  amount: number
  reason: string | null
  created_at: string
}

export interface Sale {
  id: string
  cashier_id: string | null
  customer_id: string | null
  session_id: string | null
  subtotal: number
  discount: number
  total: number
  payment_method: PaymentMethod | null
  amount_received: number | null
  change_amount: number | null
  status: SaleStatus
  created_at: string
}

export interface SaleItem {
  id: string
  sale_id: string
  product_id: string | null
  description: string
  quantity: number
  unit_price: number
  cost_price_at_sale: number
  subtotal: number
}

export interface SalePayment {
  id: string
  sale_id: string
  method: SimplePaymentMethod
  amount: number
  created_at: string
}

export interface StockMovement {
  id: string
  product_id: string
  type: StockMovementType
  quantity: number
  reason: string | null
  created_by: string | null
  created_at: string
}

// Placeholder mínimo para o generic do supabase-js (não usamos codegen completo).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any
