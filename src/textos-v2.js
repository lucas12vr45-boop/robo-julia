'use strict';
// Textos do fluxo V2. Edite à vontade: o bot sorteia quando há mais de uma opção.

const PRECO = 'R$19,95';
const UTM = '?utm_source=whatsapp&utm_medium=x1&utm_content=fluxo_v2';
const LINK = (process.env.LINK_CHECKOUT || 'https://pay.cakto.com.br/yh5xj7c') + UTM;
const LINK_DESCONTO = (process.env.LINK_DESCONTO || 'https://pay.cakto.com.br/37n96ge') + UTM + '_desconto';
const APP_TESTE = process.env.APP_TESTE_URL || '';
const APP_COMPLETO = process.env.APP_COMPLETO_URL || '';

// Depois do A1 e dos depoimentos
const PERGUNTA_INTERESSE = [
  'me conta: o que você mais queria mudar hoje com o dinheiro? guardar, organizar o que entra e sai, ou começar 2027 com uma meta?',
];

// Uma frase antes do A2, ligada ao que a pessoa contou
const ACOLHIMENTO = {
  DIVIDA: ['entendi… conta acumulada pesa até pra olhar, né? dá pra começar devagar, sem se culpar 💛'],
  NAOSOBRA: ['entendi, aquela sensação de que o dinheiro entra e some… faz sentido começar olhando pra onde ele tá indo'],
  IMPREVISTO: ['imprevisto acontece mesmo, e desanima quando leva o pouquinho que você tinha guardado 🥺'],
  FAMILIA: ['que bonito você pensar na sua família assim 💛 dá pra dar direção pra esse desejo'],
  VONTADE: ['amei! quando o sonho ganha valor e data, ele deixa de ser só vontade ✨'],
  ANONOVO: ['que bom que você quer entrar em 2027 diferente, é o momento certinho pra isso 💛'],
  GERAL: ['obrigada por me contar 💛'],
};

// Amostra + app de teste
const LEGENDA_FOTO = 'olha um pouquinho de como ele é por dentro 👀';
const NOME_AMOSTRA = 'Amostra - Destrave Seu Dinheiro 2027.pdf';
const TEXTO_AMOSTRA = 'essa é a amostra de 5 páginas, o completo tem mais de 40 📖';
const TEXTO_APP_TESTE = (url) => `e olha esse presentinho: dá pra testar o app do Destrave aqui, direto no celular ✨\n${url}`;

// Pergunta irresistível: a pessoa responde e aí vai a oferta
const PERGUNTA_FECHAMENTO = [
  'agora me conta uma coisa… se você começasse hoje, qual seria o primeiro sonho que você colocaria no seu quadro de 2027? ✨',
  'deixa eu te perguntar: se daqui a 21 dias seu dinheiro tivesse destravado, qual seria a primeira coisa que você ia sentir? 🥹',
];
const RESPOSTA_FECHAMENTO = [
  'que lindo 🥹 então bora tirar isso do papel!',
  'aaah, eu quero muito que você sinta isso 💛 então bora começar!',
];

// Oferta e pagamento
const OFERTA = (comApp) =>
  `o Destrave Seu Dinheiro em 2027 completo sai por ${PRECO} aqui no WhatsApp.\n\n` +
  'você recebe o PDF ilustrado com o desafio de 21 dias, os exercícios e o Ritual da Virada. dá pra ler no celular ou imprimir.' +
  (comApp ? '\n\no app, se você quiser adicionar, é opcional e aparece na hora de finalizar.' : '');
const REFORCO = 'o pagamento é pela Cakto, nossa plataforma de pagamento. você tem 7 dias de garantia e pode pedir o reembolso por lá nesse prazo. assim que o pagamento pelo link abaixo for confirmado, o PDF chega sozinho aqui no WhatsApp 💛';
const POS_LINK = 'usa na compra este mesmo número de WhatsApp, com DDD, pra receber o PDF aqui. se quiser, te mando um vídeo mostrando como finalizar 😊';

// Dúvidas (qualquer momento)
const RESPOSTAS = {
  pare: 'tudo bem, vou encerrar as mensagens por aqui 💛',
  robo: 'esse atendimento usa uma assistente virtual e áudios preparados pra explicar o guia. tem suporte humano se você precisar, já chamei alguém pra te ajudar 💛',
  confiavel: 'pergunta justa! o link abre na Cakto porque é ela que processa o pagamento. confere o nome do Destrave e o valor antes de pagar. você tem 7 dias de garantia e pode pedir o reembolso por lá. depois da confirmação, o PDF chega sozinho aqui.',
  recebo: 'o PDF chega sozinho nesta conversa assim que o pagamento é confirmado. na compra, usa este mesmo número de WhatsApp, com DDD 😊',
  pagar: 'é bem rapidinho: abre o link, preenche seus dados com este número de WhatsApp, escolhe Pix ou cartão e confirma. no Pix, você copia o código e cola no app do seu banco, na opção Pix Copia e Cola. se travar em alguma parte, me fala qual apareceu aí',
  videoPagar: 'gravei esse passo a passo pra você ver a tela antes de finalizar 😊',
  reembolso: 'você pode pedir dentro dos 7 dias de garantia pela Cakto, em https://reembolso.cakto.com.br, usando o e-mail ou telefone da compra. se tiver dificuldade, me avisa',
  jaPaguei: 'oba! vou conferir seu pedido 💛 o PDF chega quando a plataforma confirma o pagamento. se ainda não apareceu, me manda o e-mail que você usou na compra?',
  caro: `te entendo, de verdade 💛 pra você não ficar de fora, consigo fazer o guia completo por R$15:`,
  funciona: 'vou ser sincera: ele é um guia de exercícios e reflexão sobre sua relação com o dinheiro. tem manifestação e lei da atração, junto com metas e hábitos, mas não promete renda nem resultado financeiro. a amostra ajuda a ver se combina com você',
  religiao: 'o guia tem manifestação, lei da atração e afirmações, além de metas e hábitos. não é de nenhuma religião, serve pra qualquer pessoa 😊',
  fisico: 'é digital, em PDF. dá pra ler no celular ou imprimir 😊',
  tempo: 'é um exercício por dia, uns 10 minutinhos. dá pra fazer no celular antes de dormir 😉',
  pensar: 'claro, sem pressa! ficou alguma dúvida sobre o conteúdo, o pagamento ou a entrega?',
  outra: 'qualquer dúvida me fala, tô aqui 😊 o link continua valendo 👇',
};

// Lembretes (máximo 2 por pessoa)
const LEMBRETE = {
  5: 'conseguiu ouvir o áudio? 😊 me conta o que você mais queria mudar com o dinheiro',
  6: 'conseguiu abrir a amostra? se não abriu, te mando as páginas em imagem 💛',
  8: 'ficou alguma dúvida sobre o pagamento ou sobre como receber o PDF? se precisar, tenho o vídeo do passo a passo 😊',
  ultimo: 'passando só pra saber se ficou alguma dúvida sobre o guia. se quiser retomar, tô por aqui 💛',
};

// Pós-venda
const PAGO = 'pagamento confirmado 💛 vou te enviar seu Destrave Seu Dinheiro em 2027 agora';
const ENTREGUE = 'aqui está seu guia! começa pela reflexão inicial e segue no seu ritmo, um exercício por dia. salva o arquivo pra achar fácil. se tiver dificuldade pra abrir, me chama 💛';
const ENTREGA_APP = (url) => `e aqui está o seu app do Destrave ✨ abre no celular e toca em "Adicionar à tela de início" pra ele ficar como um aplicativo:\n${url}`;

module.exports = {
  PRECO, LINK, LINK_DESCONTO, APP_TESTE, APP_COMPLETO,
  PERGUNTA_INTERESSE, ACOLHIMENTO, LEGENDA_FOTO, NOME_AMOSTRA, TEXTO_AMOSTRA, TEXTO_APP_TESTE,
  PERGUNTA_FECHAMENTO, RESPOSTA_FECHAMENTO, OFERTA, REFORCO, POS_LINK, RESPOSTAS, LEMBRETE,
  PAGO, ENTREGUE, ENTREGA_APP,
};
