'use strict';
const meta = require('./whatsapp');
const ia = require('./ia');
const db = require('./db');
const janela = require('./janela');
const { DEPOIMENTOS, PERGUNTA_DOR, LEMBRETE_2H, LEMBRETE_20H,
        INTRO_LINK, POS_LINK, NAO_PAGOU_40MIN, DESCONTO, POS_VENDA,
        PEDE_DEPO, PEDE_AUTORIZACAO, BANCO, linkDor, sorteia } = require('./textos');

const A1 = ['A1-1.ogg', 'A1-2.ogg', 'A1-3.ogg', 'A1-4.ogg', 'A1-5.ogg'];
const A2 = {
  DIVIDA:     'A2-DIVIDA.ogg',
  NAOSOBRA:   'A2-NAOSOBRA.ogg',
  IMPREVISTO: 'A2-IMPREVISTO.ogg',
  FAMILIA:    'A2-FAMILIA.ogg',
  VONTADE:    'A2-VONTADE.ogg',
  ANONOVO:    'A2-ANONOVO.ogg',
  GERAL:      'A2-GERAL.ogg',
};
const A3 = 'A3-APP.ogg';

// ─── RECEBE MENSAGEM DO CLIENTE ───────────────────────────────────────────────
async function receberMensagem(tel, nome, texto, tipoMidia, mediaId, ctwaClid, msgKey) {
  // Modo teste: só responde ao número do dono
  if (process.env.MODO_TESTE === '1') {
    const permitidos = (process.env.NUMEROS_TESTE || '').split(',').map(s => s.trim());
    if (!permitidos.includes(tel)) return;
  }

  let cliente = await db.getCliente(tel);

  // Se tiver mídia de áudio, transcreve
  let textoFinal = texto;
  if (tipoMidia === 'audio' && mediaId) {
    try {
      const buf = await baixarMidia(mediaId);
      textoFinal = await ia.transcrever(buf);
    } catch {}
  }

  // Cancelar agendas anteriores (cliente voltou a falar)
  await db.cancelarAgenda(tel);

  // Atualizar janela
  const veio = !!(ctwaClid || cliente?.veio_do_anuncio);
  const janelaAte = janela.calcJanela(veio);
  await db.upsertCliente(tel, {
    nome: nome || cliente?.nome || '',
    ultima_msg_em: new Date(),
    janela_ate: janelaAte,
    veio_do_anuncio: veio,
    ctwa_clid: ctwaClid || cliente?.ctwa_clid || null,
  });

  cliente = await db.getCliente(tel);

  // Se precisa de humano, avisar e parar
  if (cliente.precisa_humano) {
    await meta.alertaDono(`${tel} (${nome}) mandou nova mensagem e está aguardando humano:\n"${textoFinal}"`);
    return;
  }

  // Se já pagou: pode estar pedindo depoimento ou follow-up
  if (cliente.pagou) {
    await processarPosPago(cliente, textoFinal);
    return;
  }

  // Fluxo principal
  const passo = cliente.passo_atual || 0;
  const ehMidia = textoFinal === '[mídia]';

  if (passo === 0) {
    if (msgKey) await meta.curtir(tel, msgKey);
    await iniciarFluxo(cliente, nome);
  } else if (passo === 4 || passo === 5) {
    if (ehMidia) {
      await meta.texto(tel, 'pode me contar por texto mesmo? assim consigo te ajudar melhor 😊');
      return;
    }
    await processarRespostaCliente(cliente, textoFinal);
  } else if (passo === 8) {
    if (ehMidia) return; // ignora mídia no pós-link
    await processarPosLink(cliente, textoFinal);
  }
}

// ─── PASSO 0–3: INÍCIO DO FLUXO ──────────────────────────────────────────────
async function iniciarFluxo(cliente, nome) {
  const tel = cliente.telefone;
  await db.upsertCliente(tel, { passo_atual: 1 });

  // Passo 1 — áudio A1 (sem texto de abertura)
  const usados = cliente.audio_a1_usado ? [cliente.audio_a1_usado] : [];
  const disponiveis = A1.filter((a) => !usados.includes(a));
  const audioEscolhido = sorteia(disponiveis.length ? disponiveis : A1);
  await meta.audio(tel, audioEscolhido, [10, 12]);
  await db.upsertCliente(tel, { audio_a1_usado: audioEscolhido });

  // Passo 3 — depoimentos (espera o cliente ouvir o áudio)
  for (const dep of DEPOIMENTOS) {
    if (dep.tipo === 'texto') {
      await meta.texto(tel, dep.conteudo);
    } else if (dep.tipo === 'imagem') {
      await meta.imagem(tel, dep.arquivo, dep.legenda || '');
    }
  }

  // Passo 4 — pergunta de dor
  await meta.texto(tel, sorteia(PERGUNTA_DOR));
  await db.upsertCliente(tel, { passo_atual: 5 });

  // Passo 5 — agendar lembretes se não responder
  await db.agendarAcao(tel, 'lembrete1', {}, 2 * 60 * 60 * 1000);
  await db.agendarAcao(tel, 'lembrete2', {}, 20 * 60 * 60 * 1000);
}

// ─── PASSO 6–8: RESPOSTA DO CLIENTE ──────────────────────────────────────────
async function processarRespostaCliente(cliente, texto) {
  const tel = cliente.telefone;
  const t = texto.toLowerCase();

  // Atalhos por palavras-chave simples (sem IA)
  if (/quanto custa|quanto é|qual o valor|qual o preço|preço|manda o link|me manda o link|como compro|como pago/.test(t)) {
    await enviarLink(cliente, 'GERAL');
    return;
  }
  if (/paguei|já paguei|efetuei|confirmei/.test(t)) {
    await verificarPagamento(cliente);
    return;
  }
  if (/robô|robo|bot|automático|automatico|humano|atendente/.test(t)) {
    await meta.texto(tel, BANCO.robo);
    await meta.alertaDono(`${tel} perguntou se é robô/pediu humano.`);
    await db.upsertCliente(tel, { precisa_humano: true });
    return;
  }

  // Passo 6 — acolhimento fixo (sem IA)
  await db.upsertCliente(tel, { dor: 'GERAL', passo_atual: 6 });
  await meta.texto(tel, 'entendo você, isso pesa mesmo… 🥺');

  // Passo 7 — áudio A2 GERAL
  await meta.audio(tel, A2.GERAL);
  await db.upsertCliente(tel, { audio_a2_usado: A2.GERAL, passo_atual: 7 });

  // Passo 7b — áudio A3 (vantagens + app) e amostra do guia
  if (meta.existeAudio(A3)) {
    await meta.audio(tel, A3);
  }
  await meta.imagem(tel, 'amostra-guia.jpg', 'olha um pouquinho de como ele é por dentro 👀');
  await meta.documento(tel, 'Amostra-Destrave-2027.pdf', 'Amostra - Destrave Seu Dinheiro 2027.pdf');

  // Passo 8 — link
  await enviarLink(cliente, 'GERAL');
}

// ─── ENVIAR LINK ──────────────────────────────────────────────────────────────
async function enviarLink(cliente, dor) {
  const tel = cliente.telefone;
  const link = linkDor(dor);
  await meta.texto(tel, sorteia(INTRO_LINK));
  await meta.texto(tel, link);
  await meta.texto(tel, sorteia(POS_LINK));
  await db.upsertCliente(tel, { passo_atual: 8, link_enviado: link, preco_oferecido: dor });

  // Agenda: 40 min sem pagar → perguntar
  await db.agendarAcao(tel, 'nao_pagou_40min', {}, 40 * 60 * 1000);
}

// ─── PÓS-LINK: OBJEÇÕES / PERGUNTAS ─────────────────────────────────────────
async function processarPosLink(cliente, texto) {
  const tel = cliente.telefone;
  const { intencao } = await ia.classificar(texto);

  if (intencao === 'caro') {
    await meta.texto(tel, DESCONTO[0]);
    await meta.texto(tel, DESCONTO[1]);
    return;
  }
  if (intencao === 'ja_pagou') {
    await verificarPagamento(cliente);
    return;
  }
  if (['robo', 'humano'].includes(intencao)) {
    await meta.texto(tel, await ia.reescreverBanco('robo', BANCO.robo));
    await meta.alertaDono(`${tel} pediu humano.`);
    await db.upsertCliente(tel, { precisa_humano: true });
    return;
  }

  // Banco de respostas por palavra-chave (sem IA)
  const t = texto.toLowerCase();
  if (/golpe|fraude|fake|falso|mentira/.test(t)) {
    await meta.texto(tel, BANCO.golpe);
  } else if (/pensar|depois|amanhã|semana/.test(t)) {
    await meta.texto(tel, BANCO.pensar);
  } else if (/tempo|minuto|hora|quando|demorar/.test(t)) {
    await meta.texto(tel, BANCO.tempo);
  } else {
    // Qualquer outra coisa: reenvia o link sem inventar resposta
    await meta.texto(tel, 'qualquer dúvida me fala, tô aqui 😊 o link ainda tá válido 👇');
    await meta.texto(tel, cliente.link_enviado || linkDor('GERAL'));
  }
}

// ─── VERIFICAR PAGAMENTO ─────────────────────────────────────────────────────
async function verificarPagamento(cliente) {
  const tel = cliente.telefone;
  if (cliente.pagou) {
    await entregarPDF(cliente);
  } else {
    await meta.texto(tel, BANCO.ja_paguei);
    await meta.alertaDono(`${tel} disse que pagou mas não está registrado. Verificar na Cakto.`);
    await db.upsertCliente(tel, { precisa_humano: true });
  }
}

// ─── ENTREGA DO PDF ──────────────────────────────────────────────────────────
async function entregarPDF(cliente) {
  const tel = cliente.telefone;
  await meta.texto(tel, sorteia(POS_VENDA));
  await meta.documento(tel, 'Destrave-Seu-Dinheiro-2027.pdf', 'Destrave Seu Dinheiro em 2027.pdf');
}

// ─── WEBHOOK CAKTO: VENDA CONFIRMADA ─────────────────────────────────────────
async function vendaConfirmada(telefone, email) {
  let cliente = await db.getCliente(telefone);
  if (!cliente) {
    // Cliente não está no banco (comprou direto pelo link, não pelo WhatsApp)
    await meta.alertaDono(`Venda confirmada para ${telefone} (${email}), mas cliente não está no WhatsApp. Entregar manualmente.`);
    return;
  }
  await db.cancelarAgenda(telefone);
  await db.upsertCliente(telefone, { pagou: true, pago_em: new Date(), email, passo_atual: 10 });
  cliente = await db.getCliente(telefone);
  await entregarPDF(cliente);

  // Agenda pedido de depoimento em 3 dias
  await db.agendarAcao(telefone, 'pedir_depo', {}, 3 * 24 * 60 * 60 * 1000);
}

// ─── PÓS-PAGO: DEPOIMENTO ────────────────────────────────────────────────────
async function processarPosPago(cliente, texto) {
  const tel = cliente.telefone;
  if (!cliente.autorizou_depo) {
    // Verifica se respondeu à pergunta de depoimento
    const { intencao } = await ia.classificar(texto);
    if (['conta_dor', 'outra'].includes(intencao) && texto.length > 10) {
      // Parece positivo — pede autorização
      await meta.texto(tel, PEDE_AUTORIZACAO);
    } else if (texto.toLowerCase().includes('sim') || texto.toLowerCase().includes('pode')) {
      await db.upsertCliente(tel, { autorizou_depo: true });
      await meta.alertaDono(`⭐ ${tel} (${cliente.nome}) autorizou depoimento:\n"${texto}"`);
    }
  }
}

// ─── DOWNLOAD DE MÍDIA ───────────────────────────────────────────────────────
// Com Baileys, o buffer já vem baixado — só repassa
async function baixarMidia(bufferOuId) {
  if (Buffer.isBuffer(bufferOuId)) return bufferOuId;
  throw new Error('mediaId inválido para Baileys');
}

module.exports = { receberMensagem, vendaConfirmada, PEDE_DEPO };
