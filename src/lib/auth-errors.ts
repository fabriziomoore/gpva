// Traduz mensagens de erro do Supabase Auth para pt-BR.
const MAP: Array<[RegExp, string]> = [
  [/password is known to be weak.*/i, "Esta senha é considerada fraca e fácil de adivinhar. Escolha outra senha."],
  [/password should be at least (\d+) characters?/i, "A senha deve ter pelo menos $1 caracteres."],
  [/password should contain/i, "A senha não atende aos requisitos mínimos de segurança."],
  [/new password should be different from the old password/i, "A nova senha deve ser diferente da senha atual."],
  [/invalid login credentials/i, "Credenciais inválidas. Verifique equipe e senha."],
  [/email not confirmed/i, "E-mail não confirmado."],
  [/user already registered/i, "Este usuário já está cadastrado."],
  [/rate limit|too many requests/i, "Muitas tentativas. Aguarde alguns instantes e tente novamente."],
  [/network|failed to fetch/i, "Falha de conexão. Verifique sua internet."],
  [/invalid.*email/i, "E-mail inválido."],
  [/weak.?password/i, "Senha fraca. Escolha uma senha mais forte."],
  [/unable to validate email address/i, "Não foi possível validar o e-mail."],
  [/signup.*disabled|signups?.*not allowed/i, "Cadastros estão desativados."],
];

export function translateAuthError(err: unknown, fallback = "Ocorreu um erro. Tente novamente."): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!raw) return fallback;
  for (const [re, pt] of MAP) {
    if (re.test(raw)) return raw.replace(re, pt);
  }
  return raw;
}