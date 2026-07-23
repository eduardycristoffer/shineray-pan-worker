import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_TABLE = process.env.SUPABASE_TABLE || 'shineray_consultas_cpf';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[supabase] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Atualiza o registro da consulta com o resultado da automação.
 * Nunca loga o CPF completo — só os 3 primeiros dígitos, pra debug sem expor o dado.
 */
export async function updateConsulta(consultaId, { status, motivo, raw }) {
  const { error } = await supabase
    .from(SUPABASE_TABLE)
    .update({
      status,
      motivo: motivo ?? null,
      detalhes: raw ? { raw } : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', consultaId);

  if (error) {
    console.error(`[supabase] Falha ao atualizar consulta ${consultaId}:`, error.message);
    throw error;
  }
}
