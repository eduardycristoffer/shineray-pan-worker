import { chromium } from 'playwright';

const PAN_LOGIN_URL = process.env.PAN_LOGIN_URL || 'https://veiculos.bancopan.com.br/login';
const PAN_USERNAME = process.env.PAN_USERNAME;
const PAN_PASSWORD = process.env.PAN_PASSWORD;

let browserPromise = null;
let contextPromise = null;

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

async function criarContextoLogado(browser) {
  // Um operador humano usa um navegador normal, não uma janela minúscula
  // ou um viewport óbvio de headless — mantemos algo padrão de desktop.
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });
  const page = await context.newPage();
  await fazerLogin(page);
  await page.close();
  return context;
}

/**
 * Retorna um contexto de navegador já autenticado no go!PAN. Faz login
 * apenas uma vez (na primeira chamada) e reaproveita a mesma sessão nas
 * chamadas seguintes — reflete como um operador humano realmente usa o
 * portal (loga uma vez, faz várias consultas na mesma sessão), em vez de
 * logar do zero a cada CPF, o que é um padrão facilmente identificável
 * como automação.
 */
async function getContext() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    });
  }
  const browser = await browserPromise;

  if (!contextPromise) {
    contextPromise = criarContextoLogado(browser);
  }
  return contextPromise;
}

/**
 * Força um novo login na próxima consulta — usar quando uma consulta
 * perceber que a sessão expirou (ex.: caiu de volta na tela de login).
 */
export function invalidarSessao() {
  contextPromise = null;
}

/**
 * Executa `fn(page)` numa aba nova dentro da sessão já autenticada.
 * Sempre fecha a aba no final, mas mantém o navegador e o login vivos
 * pra próxima consulta.
 */
export async function comPaginaAutenticada(fn) {
  const context = await getContext();
  const page = await context.newPage();
  try {
    return await fn(page);
  } finally {
    await page.close().catch(() => {});
  }
}
