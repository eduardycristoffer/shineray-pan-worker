import express from 'express';
import { enfileirarConsulta, tamanhoFila } from './queue.js';

const PORT = process.env.PORT || 3000;
const WORKER_SECRET = process.env.WORKER_SECRET;

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true, fila: tamanhoFila() }));

app.post('/consulta-cpf', (req, res) => {
  const auth = req.headers.authorization || '';
  if (!WORKER_SECRET || auth !== `Bearer ${WORKER_SECRET}`) {
    return res.status(401).json({ error: 'não autorizado' });
  }

  const { consulta_id, cpf } = req.body || {};
  if (!consulta_id || !cpf) {
    return res.status(400).json({ error: 'consulta_id e cpf são obrigatórios' });
  }

  // Responde na hora — a consulta entra na fila e é processada uma de
  // cada vez (com espaçamento variável), o worker nunca abre vários
  // navegadores em paralelo.
  const posicao = enfileirarConsulta(consulta_id, cpf);
  res.status(202).json({ accepted: true, consulta_id, posicao_na_fila: posicao });
});

app.listen(PORT, () => {
  console.log(`[server] shineray-pan-worker ouvindo na porta ${PORT}`);
});
