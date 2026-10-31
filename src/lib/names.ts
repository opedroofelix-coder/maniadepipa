/**
 * Primeiro nome para saudação ("Bom dia, Pedro!").
 *
 * Quem foi criado sem nome no Supabase fica com o e-mail em profiles.full_name
 * (ver o gatilho em 0001_init.sql), então o e-mail vira nome pela parte antes
 * do @, sem números nem separadores: "pedroh.felixx@gmail.com" -> "Pedroh".
 * Sem nada aproveitável, devolve "" e a saudação sai sem nome.
 */
export function firstName(fullName: string): string {
  const isEmail = fullName.includes('@')
  const base = isEmail ? fullName.slice(0, fullName.indexOf('@')) : fullName
  // no nome digitado só o espaço separa ("Ana-Paula" fica inteiro)
  const word = base.split(isEmail ? /[\s._\-+0-9]+/ : /\s+/).find((part) => /\p{L}/u.test(part))
  if (!word) return ''
  return word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1)
}
