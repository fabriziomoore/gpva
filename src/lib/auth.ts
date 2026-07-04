import { supabase } from "@/integrations/supabase/client";
import { claimCurrentSession } from "@/lib/session-guard";

export function teamNameToEmail(teamName: string): string {
  const slug = teamName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug}@gpva.local`;
}

export async function signInTeam(teamName: string, password: string) {
  const email = teamNameToEmail(teamName);
  let { data, error } = await supabase.auth.signInWithPassword({ email, password });
  // Fallback: usuário pode ter sido cadastrado sem hífens (ex.: "gabrielaraujo"
  // em vez de "gabriel-araujo"). Tenta o mesmo slug sem hífens.
  if (error && email.includes("-")) {
    const compact = email.replace(/-/g, "");
    const retry = await supabase.auth.signInWithPassword({ email: compact, password });
    data = retry.data;
    error = retry.error;
  }
  if (error) throw error;
  await claimCurrentSession();
  return data;
}

export async function signUpTeam(teamName: string, password: string) {
  const email = teamNameToEmail(teamName);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { team_name: teamName.trim() } },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}