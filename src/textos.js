'use strict';

// ─── DEPOIMENTOS ───────────────────────────────────────────────────────────────
// Cada depoimento pode ser:
//   { tipo: 'texto', conteudo: '...' }          → manda como mensagem de texto
//   { tipo: 'imagem', arquivo: 'dep-1.jpg', legenda: '...' }  → imagem da pasta midia/imagens/
//
// PREENCHA ABAIXO COM OS DEPOIMENTOS REAIS:
const DEPOIMENTOS = [
  {
    tipo: 'imagem',
    arquivo: 'dep-1.jpg',
    legenda: '🏠 Mariana conseguiu o apartamento que "era impossível" 🥹',
  },
  {
    tipo: 'imagem',
    arquivo: 'dep-2.jpg',
    legenda: '🚗 Leverson manifestou por 32 dias e realizou o primeiro carro 😭',
  },
  {
    tipo: 'imagem',
    arquivo: 'dep-3.jpg',
    legenda: '📱 Ana Júlia queria um iPhone 16 rosa — fez os exercícios do PDF e conseguiu 🥰',
  },
];

// ─── ABERTURA (passo 1) ────────────────────────────────────────────────────────
const ABERTURA = [
  (nome) => `oii${nome ? ' ' + nome : ''}! já te mando um áudio 😊`,
  () => 'oi! que bom que você chamou, peraí que vou te mandar um áudio',
  () => 'oiii, tudo bem? deixa eu te mandar um áudio rapidinho',
];

// ─── DEPOIS DOS DEPOIMENTOS (passo 4) ─────────────────────────────────────────
const PERGUNTA_DOR = [
  'e aí, se identificou com alguma parte? 🥺',
  'qual dessas histórias mais chamou sua atenção?',
  'me conta, você também vive isso de nunca sobrar?',
  'se fizesse sentido pra você começar ainda esse ano, você toparia?',
  'consegue me falar o que mais pega pra você com dinheiro hoje?',
  'fiquei curiosa… o que mais pesa pra você hoje: dívida, guardar ou o dinheiro que some?',
];

// ─── LEMBRETES (passo 5) ───────────────────────────────────────────────────────
const LEMBRETE_2H = 'conseguiu ouvir o áudio? 😊';
const LEMBRETE_20H =
  'oi! passando só pra saber se você quer que eu te explique como funciona o guia 💛';

// ─── LINK (passo 8) ────────────────────────────────────────────────────────────
const INTRO_LINK = [
  'vou te mandar aqui ó 👇',
  'segue o link 💛',
  'aqui ó, é só clicar:',
];

const POS_LINK = [
  'dá pra pagar no Pix ou no cartão. assim que aprovar eu te mando o PDF aqui 😊',
  'é rapidinho, menos de 1 minuto. qualquer coisa no pagamento me chama',
  'quando finalizar me avisa aqui, tá? já te mando o teu guia 💛',
];

// ─── NÃO PAGOU EM 40 MIN (passo 9) ───────────────────────────────────────────
const NAO_PAGOU_40MIN =
  'conseguiu finalizar? se deu algum problema no Pix me fala que eu te ajudo 😊';

// ─── DESCONTO (passo 9) ───────────────────────────────────────────────────────
const DESCONTO = [
  'te entendo total, de verdade. pra você não ficar de fora, faço por R$15 com tudo incluso:\nhttps://pay.cakto.com.br/37n96ge?utm_source=whatsapp&utm_medium=x1&utm_content=desconto',
  'se ainda assim não der: tenho a versão Essencial por R$10, com o principal do guia:\nhttps://pay.cakto.com.br/bnzoghz?utm_source=whatsapp&utm_medium=x1&utm_content=essencial',
];

// ─── PÓS-VENDA (passo 10) ─────────────────────────────────────────────────────
const POS_VENDA = [
  'aaah que alegria!! 🥰 aqui tá o seu guia. começa pelo teste da primeira página, tá?',
  'pagamento aprovado! 💛 tá aqui teu Destrave, qualquer dúvida me chama',
];

// ─── PEDIDO DE DEPOIMENTO (passo 11, 3 dias depois) ───────────────────────────
const PEDE_DEPO = (nome) =>
  `oi${nome ? ' ' + nome : ''}! e aí, já começou o guia? me conta o que tá achando 😊`;
const PEDE_AUTORIZACAO =
  'que bom!! posso compartilhar o que você me falou (sem seu número) com outras pessoas que tão pensando em começar?';

// ─── BANCO DE RESPOSTAS (passo 9) ─────────────────────────────────────────────
// A IA reescreve levemente, mantendo o sentido
const BANCO = {
  golpe:
    'pergunta justa! o pagamento é pela Cakto, plataforma segura, e você tem 7 dias de garantia. nosso site: https://viradaprospera.shop',
  recebimento:
    'assim que aprovar eu te mando o PDF aqui no WhatsApp e chega no seu e-mail também 😊',
  ja_paguei: 'oba! já tô conferindo aqui 💛',
  nao_chegou:
    'calma, já resolvo. me manda o e-mail que você usou na compra?',
  tempo: 'é uma página por dia, uns 10 minutinhos. dá pra fazer no celular antes de dormir 😉',
  pensar:
    'claro, sem pressa! só lembrando que esse valor é só aqui no WhatsApp. qualquer coisa me chama',
  funciona:
    'vou ser sincera: não é fórmula mágica e não promete dinheiro. é um método pra você entender e mudar sua relação com o dinheiro. e se não gostar, tem 7 dias de garantia',
  religiao: 'não é de nenhuma religião, serve pra qualquer pessoa 😊',
  livro_fisico: 'por enquanto é só digital, em PDF. dá pra ler no celular ou imprimir',
  parcelar: 'pode sim, no link tem Pix, cartão e boleto',
  robo: 'uso um assistente pra conseguir responder todo mundo rápido, mas tem gente de verdade cuidando daqui. se quiser falar com uma pessoa, é só pedir 😊',
  outra: 'boa pergunta, deixa eu ver isso pra você',
};

// ─── LINKS DA CAKTO ───────────────────────────────────────────────────────────
const LINKS = {
  DIVIDA:     'https://pay.cakto.com.br/mnr7345',
  NAOSOBRA:   'https://pay.cakto.com.br/57nv6ko',
  IMPREVISTO: 'https://pay.cakto.com.br/3cwa9on',
  FAMILIA:    'https://pay.cakto.com.br/zr32wni',
  VONTADE:    'https://pay.cakto.com.br/myjszi2',
  ANONOVO:    'https://pay.cakto.com.br/35y3u4i',
  GERAL:      'https://pay.cakto.com.br/yh5xj7c',
};

const UTM = (dor) =>
  `?utm_source=whatsapp&utm_medium=x1&utm_content=${dor.toLowerCase()}`;

function linkDor(dor) {
  const base = LINKS[dor] || LINKS.GERAL;
  return base + UTM(dor);
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function sorteia(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

module.exports = {
  DEPOIMENTOS,
  ABERTURA,
  PERGUNTA_DOR,
  LEMBRETE_2H,
  LEMBRETE_20H,
  INTRO_LINK,
  POS_LINK,
  NAO_PAGOU_40MIN,
  DESCONTO,
  POS_VENDA,
  PEDE_DEPO,
  PEDE_AUTORIZACAO,
  BANCO,
  linkDor,
  sorteia,
};
