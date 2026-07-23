import express from 'express';
import { processarConsulta } from './pan-worker.js';

const PORT = process.env.PORT || 3000;
const WORKER_SECRET = process.env.WORKER_SECRET;

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/consulta-cpf', (req, res) => {
  const auth = req.headers.authorization || '';
  if (!WORKER_SECRET || auth !== `Bearer ${WORKER_SECRET}`) {
    return res.status(401).json({ error: 'não autorizado' });
  }

  const { consulta_id, cpf } = req.body || {};
  if (!consulta_id || !cpf) {
    return res.status(400).json({ error: 'consulta_id e cpf são obrigatórios' });
  }

  // Responde na hora — login + navegação + espera do resultado pode levar
  // 20-60s, então o worker processa em background e grava direto no Supabase.
  res.status(202).json({ accepted: true, consulta_id });

  processarConsulta(consulta_id, cpf).catch((err) => {
    console.error(`[server] falha não tratada na consulta ${consulta_id}:`, err);
  });
});

app.listen(PORT, () => {
  console.log(`[server] shineray-pan-worker ouvindo na porta ${PORT}`);
});
