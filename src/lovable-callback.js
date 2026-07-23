const LOVABLE_CALLBACK_URL = process.env.LOVABLE_CALLBACK_URL;
const PAN_WORKER_SECRET = process.env.WORKER_SECRET;

if (!LOVABLE_CALLBACK_URL) {
  console.warn('[callback] LOVABLE_CALLBACK_URL não configurada.');
}

/**
 * Em vez de escrever direto no Supabase (o Lovable Cloud não expõe a
 * service_role key pra fora), o worker devolve o resultado pra um endpoint
 * do próprio Lovable, que já tem acesso privilegiado internamente
 * (supabaseAdmin) e faz a gravação por lá.
 *
 * Nunca loga o CPF completo — a mensagem de erro/motivo pode conter o
 * texto da tela, mas nunca o valor digitado no campo de CPF.
 */
export async function updateConsulta(consultaId, { status, motivo }) {
  if (!LOVABLE_CALLBACK_URL) {
    throw new Error('LOVABLE_CALLBACK_URL não configurada — não há pra onde mandar o resultado.');
  }

  const resp = await fetch(LOVABLE_CALLBACK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PAN_WORKER_SECRET}`,
    },
    body: JSON.stringify({ consulta_id: consultaId, status, motivo: motivo ?? '' }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`callback Lovable respondeu ${resp.status}: ${text}`);
  }
}
