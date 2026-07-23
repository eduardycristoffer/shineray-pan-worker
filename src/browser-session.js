import { chromium } from 'playwright';

const PAN_LOGIN_URL = process.env.PAN_LOGIN_URL || 'https://veiculos.bancopan.com.br/login';
const PAN_USERNAME = process.env.PAN_USERNAME;
const PAN_PASSWORD = process.env.PAN_PASSWORD;

let browserPromise = null;
let paginaPromise = null;

/**
 * O go!PAN usa o banner de cookies OneTrust, que fica por cima da página
 * e intercepta cliques até ser fechado. O botão de aceitar sempre usa o
 * mesmo ID (#onetrust-accept-btn-handler) em qualquer implementação padrão
 * do OneTrust — não é um seletor específico deste site, é o padrão deles.
 */
async function fecharBannerCookies(page) {
  const aceitar = page.locator('#onetrust-accept-btn-handler');
  try {
    await aceitar.waitFor({ state: 'visible', timeout: 5000 });
    await aceitar.click();
  } catch {
    // banner não apareceu — segue normalmente
  }
}

async function fazerLogin(page) {
  await page.goto(PAN_LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await fecharBannerCookies(page);

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

async function criarPaginaLogada(browser) {
  // Um operador humano usa um navegador normal, não uma janela minúscula
  // ou um viewport óbvio de headless — mantemos algo padrão de desktop.
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });
  const page = await context.newPage();
  await fazerLogin(page);
  return page;
}

/**
 * Retorna a MESMA aba (não uma nova) já autenticada no go!PAN, criando e
 * logando apenas na primeira chamada. Importante: reaproveitar a mesma
 * aba (não abrir abas novas) porque apps Angular como esse costumam
 * guardar parte do estado de sessão em sessionStorage, que não é
 * compartilhado entre abas mesmo dentro do mesmo contexto logado — uma
 * aba nova pareceria deslogada na prática mesmo com os cookies certos.
 * Isso também reflete como um operador humano realmente usa o portal:
 * loga uma vez, e clica em "Nova proposta" de novo na mesma aba pra cada
 * cliente, em vez de logar do zero a cada CPF.
 */
async function getPagina() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    });
  }
  const browser = await browserPromise;

  if (!paginaPromise) {
    paginaPromise = criarPaginaLogada(browser);
  }
  return paginaPromise;
}

/**
 * Força um novo login na próxima consulta — usar quando uma consulta
 * perceber que a sessão expirou (ex.: caiu de volta na tela de login).
 */
export function invalidarSessao() {
  paginaPromise = null;
}

/**
 * Executa `fn(page)` na aba persistente já autenticada. Não fecha a aba
 * no final — ela continua viva pra próxima consulta da fila.
 */
export async function comPaginaAutenticada(fn) {
  const page = await getPagina();
  return fn(page);
}
