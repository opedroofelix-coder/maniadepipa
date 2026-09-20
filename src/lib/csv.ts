// CSV para abrir no Excel em português: separador ";" e número com vírgula
// decimal. Com ponto decimal o Excel pt-BR lê a célula como texto.

function formatCell(cell: string | number): string {
  if (typeof cell === 'number') {
    return Number.isFinite(cell) ? String(cell).replace('.', ',') : ''
  }
  return String(cell ?? '')
}

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = formatCell(cell)
          return /[",;\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
        })
        .join(';'),
    )
    .join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  // o link precisa estar no DOM para o download disparar em todos os navegadores,
  // e a URL só pode ser revogada depois que o download começou
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
