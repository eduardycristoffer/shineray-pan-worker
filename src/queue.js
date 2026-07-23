import { processarConsulta } from './pan-worker.js';

const MIN_INTERVALO_MS = Number(process.env.MIN_INTERVALO_MS || 3000);
const MAX_INTERVALO_MS = Number(process.env.MAX_INTERVALO_MS || 8000);

const fila = [];
let processando = false;

function jitter() {
  return MIN_INTERVALO_MS + Math.random() * (MAX_INTERVALO_MS - MIN_INTERVALO_MS);
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processarFila() {
  if (processando) return;
  processando = true;

  while (fila.length > 0) {
    const { consultaId, cpf } = fila.shift();
    await processarConsulta(consultaId, cpf);

    // Espera um intervalo variável antes da próxima — nada de disparar
    // consultas em sequência perfeita, isso é a assinatura de um script.
    if (fila.length > 0) {
      await esperar(jitter());
    }
  }

  processando = false;
}

/**
 * Adiciona uma consulta na fila e garante que o processamento está
 * rodando. Só uma consulta é processada por vez — rajadas de leads
 * esperam na fila em vez de abrir vários navegadores simultâneos.
 */
export function enfileirarConsulta(consultaId, cpf) {
  fila.push({ consultaId, cpf });
  const posicao = fila.length;
  processarFila();
  return posicao;
}

export function tamanhoFila() {
  return fila.length;
}
