import { comPaginaAutenticada, invalidarSessao } from './browser-session.js';
import { updateConsulta } from './lovable-callback.js';

const PAN_BASE_URL = process.env.PAN_BASE_URL || 'https://veiculos.bancopan.com.br/';
const RESULT_TIMEOUT_MS = Number(process.env.RESULT_TIMEOUT_MS || 45000);

function maskCpf(cpf) {
  return cpf ? `${cpf.slice(0, 3)}.***.***-**` : 'cpf-vazio';
}

/** Delay aleatório entre teclas — digitação perfeitamente uniforme é um
 * padrão fácil de identificar como script. */
function delayDigitacao() {
  return 20 + Math.floor(Math.random() * 40);
}

async function abrirNovaProposta(page) {
  // Uma aba nova dentro do contexto já logado começa em branco — precisa
  // navegar pra área autenticada antes de procurar qualquer elemento.
  await page.goto(PAN_BASE_URL, { waitUntil: 'domcontentloaded' });

  // Se a sessão expirou, esse goto acaba redirecionando pro /login —
  // nesse caso invalida a sessão guardada e deixa a próxima consulta
  // forçar um novo login, em vez de insistir numa sessão morta.
  if (/\/login/i.test(page.url())) {
    invalidarSessao();
    throw new Error('sessão expirada — será renovada na próxima consulta');
  }

  await page.getByRole('complementary').getByText('Nova proposta', { exact: true }).click();

  // "Financiamento" costuma já vir selecionado por padrão; clicar de novo
  // não quebra nada se já estiver marcado.
  const financiamento = page.getByText('Financiamento', { exact: true });
  if (await financiamento.isVisible().catch(() => false)) {
    await financiamento.click();
  }

  // O botão de categoria (ex.: "Moto") não precisa ser clicado — já vem
  // no estado certo por padrão. Basta preencher o CPF depois disso.
}

async function preencherCpfEAguardarResultado(page, cpf) {
  const cpfInput = page.locator('[aria-controls="listbox-cpf"]');
  const totalEncontrado = await cpfInput.count();
  console.log(`[worker] campo de CPF encontrado: ${totalEncontrado} elemento(s), URL: ${page.url()}`);

  await cpfInput.click();
  await cpfInput.pressSequentially(cpf, { delay: delayDigitacao() });

  const valorDigitado = await cpfInput.inputValue().catch(() => null);
  console.log(`[worker] valor no campo após digitar tem ${valorDigitado ? valorDigitado.length : 0} caractere(s)`);

  // A busca dispara sozinha ao completar o CPF — não existe botão aqui.
  // Corremos duas esperas em paralelo: navegação pra /comparador (aprovado
  // — o breadcrumb na tela diz "Ofertas", mas a URL real é /comparador)
  // ou aparecimento do modal de recusa (reprovado). O que vier primeiro
  // decide o resultado; timeout vira "erro" (nunca assume sucesso).
  const sucesso = page
    .waitForURL((url) => /comparador/i.test(url.pathname), { timeout: RESULT_TIMEOUT_MS })
    .then(() => ({ status: 'pre_aprovado', motivo: null }));

  // Classe real confirmada no HTML do modal: pan-mahoe-modal__container
  // (não só "pan-mahoe-modal" — tem o sufixo __container). O MESMO
  // componente de modal também é usado pra avisar "sessão expirou" —
  // isso NÃO é uma recusa de crédito, precisa ser tratado à parte pra
  // não classificar um CPF como reprovado por engano.
  const modalSelector = '.pan-mahoe-modal__container';
  const falha = page
    .waitForSelector(modalSelector, { state: 'visible', timeout: RESULT_TIMEOUT_MS })
    .then(async (el) => {
      const texto = (await el.innerText().catch(() => '')).trim();
      if (/sess[ãa]o expirou|fa[çc]a o login novamente/i.test(texto)) {
        return { status: 'erro', motivo: texto, sessaoExpirada: true };
      }
      return { status: 'reprovado', motivo: texto || 'modal de recusa (texto não capturado)' };
    });

  try {
    return await Promise.race([sucesso, falha]);
  } catch {
    const urlAtual = page.url();
    console.error(`[worker] timeout esperando resultado — URL atual: ${urlAtual}`);
    return { status: 'erro', motivo: `timeout — nem comparador nem modal apareceram (URL: ${urlAtual})` };
  }
}

/**
 * Executa a consulta completa de um CPF no go!PAN, reaproveitando a
 * sessão já logada, e grava o resultado via callback pro Lovable.
 * Se a sessão expirar no meio do processo, invalida e tenta de novo
 * UMA vez (loga de novo do zero) antes de desistir.
 */
export async function processarConsulta(consultaId, cpf, tentativa = 1) {
  console.log(`[worker] iniciando consulta ${consultaId} (cpf ${maskCpf(cpf)})${tentativa > 1 ? ` [tentativa ${tentativa}]` : ''}`);

  try {
    const resultado = await comPaginaAutenticada(async (page) => {
      await abrirNovaProposta(page);
      return preencherCpfEAguardarResultado(page, cpf);
    });

    if (resultado.sessaoExpirada && tentativa === 1) {
      console.log(`[worker] sessão expirou durante a consulta ${consultaId} — invalidando e tentando de novo`);
      invalidarSessao();
      return processarConsulta(consultaId, cpf, 2);
    }

    await updateConsulta(consultaId, resultado);
    console.log(`[worker] consulta ${consultaId} -> ${resultado.status}${resultado.motivo ? ` (${resultado.motivo})` : ''}`);
  } catch (err) {
    console.error(`[worker] erro na consulta ${consultaId}:`, err.message);
    await updateConsulta(consultaId, { status: 'erro', motivo: err.message }).catch(() => {});
  }
}
