import { chromium } from 'playwright';
import { updateConsulta } from './lovable-callback.js';

const PAN_LOGIN_URL = process.env.PAN_LOGIN_URL || 'https://veiculos.bancopan.com.br/login';
const PAN_USERNAME = process.env.PAN_USERNAME;
const PAN_PASSWORD = process.env.PAN_PASSWORD;
const CATEGORIA_VEICULO = process.env.PAN_CATEGORIA || 'Moto';
const RESULT_TIMEOUT_MS = Number(process.env.RESULT_TIMEOUT_MS || 30000);

function maskCpf(cpf) {
  return cpf ? `${cpf.slice(0, 3)}.***.***-**` : 'cpf-vazio';
}

async function login(page) {
  await page.goto(PAN_LOGIN_URL, { waitUntil: 'domcontentloaded' });

  await page.locator('#login').fill(PAN_USERNAME);

  // O campo de senha vem com readonly no load e libera no foco (proteção
  // contra autofill). Clicar antes de digitar garante que o estado muda.
  const senhaInput = page.locator('#password');
  await senhaInput.click();
  await senhaInput.pressSequentially(PAN_PASSWORD, { delay: 30 });

  await page.getByRole('button', { name: 'Entrar' }).click();

  // Espera sair da tela de login (troca de URL ou menu "Nova proposta" visível).
  await Promise.race([
    page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 }),
    page.getByText('Nova proposta').waitFor({ state: 'visible', timeout: 20000 }),
  ]);
}

async function abrirNovaProposta(page) {
  await page.getByText('Nova proposta', { exact: true }).click();

  // "Financiamento" costuma já vir selecionado por padrão; clicar de novo
  // não quebra nada se já estiver marcado.
  const financiamento = page.getByText('Financiamento', { exact: true });
  if (await financiamento.isVisible().catch(() => false)) {
    await financiamento.click();
  }

  // TODO: confirmar se o texto do botão de categoria é exatamente
  // CATEGORIA_VEICULO ("Moto") — ajustar se o seletor real for outro
  // (ex.: ícone + texto num componente custom).
  await page.getByRole('button', { name: CATEGORIA_VEICULO }).click();
}

async function preencherCpfEAguardarResultado(page, cpf) {
  const cpfInput = page.locator('[aria-controls="listbox-cpf"]');
  await cpfInput.click();
  await cpfInput.pressSequentially(cpf, { delay: 30 });

  // A busca dispara sozinha ao completar o CPF — não existe botão aqui.
  // Corremos duas esperas em paralelo: navegação pra Ofertas (aprovado)
  // ou aparecimento de um modal/dialog (reprovado). O que vier primeiro
  // decide o resultado; timeout vira "erro" (nunca assume sucesso).
  const sucesso = page
    .waitForURL((url) => /ofertas/i.test(url.pathname), { timeout: RESULT_TIMEOUT_MS })
    .then(() => ({ status: 'pre_aprovado', motivo: null }));

  const modalSelector = '[role="dialog"], [aria-modal="true"], .modal, .pan-mahoe-modal';
  const falha = page
    .waitForSelector(modalSelector, { state: 'visible', timeout: RESULT_TIMEOUT_MS })
    .then(async (el) => {
      const texto = (await el.innerText().catch(() => '')).trim();
      return { status: 'reprovado', motivo: texto || 'modal de recusa (texto não capturado)' };
    });

  try {
    return await Promise.race([sucesso, falha]);
  } catch {
    return { status: 'erro', motivo: 'timeout — nem Ofertas nem modal apareceram' };
  }
}

/**
 * Executa a consulta completa de um CPF no go!PAN e grava o resultado
 * direto no Supabase. Feita pra rodar em background (fire-and-forget
 * a partir do endpoint HTTP).
 */
export async function processarConsulta(consultaId, cpf) {
  console.log(`[worker] iniciando consulta ${consultaId} (cpf ${maskCpf(cpf)})`);

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await login(page);
    await abrirNovaProposta(page);
    const resultado = await preencherCpfEAguardarResultado(page, cpf);

    await updateConsulta(consultaId, resultado);
    console.log(`[worker] consulta ${consultaId} -> ${resultado.status}`);
  } catch (err) {
    console.error(`[worker] erro na consulta ${consultaId}:`, err.message);
    await updateConsulta(consultaId, { status: 'erro', motivo: err.message }).catch(() => {});
  } finally {
    await browser.close();
  }
}
