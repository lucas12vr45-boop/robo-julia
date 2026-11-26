'use strict';
const meta = require('./meta');
const ia = require('./ia');
const db = require('./db');
const janela = require('./janela');
const { DEPOIMENTOS, ABERTURA, PERGUNTA_DOR, LEMBRETE_2H, LEMBRETE_20H,
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

function delay(min, max) {
  return new Promise((r) => setTimeout(r, (Math.random() * (max - min) + min) * 1000));
}

// ─── RECEBE MENSAGEM DO CLIENTE ───────────────────────────────────────────────
async function receberMensagem(tel, nome, texto, tipoMidia, mediaId, ctwaClid) {
  // Modo teste: só responde ao número do dono
  if (process.env.MODO_TESTE === '1') {
    const permitidos = (process.env.NUMEROS_TESTE || '').split(',').map(s => s.trim());
    if (!permitidos.includes(tel)) return;
  }

  if (janela.foraDoHorario()) {
    await db.agendarAcao(tel, 'retomar', { nome, texto }, janela.proximoHorario());
    return;
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

  if (passo === 0) {
    await iniciarFluxo(cliente, nome);
  } else if (passo >= 4 && passo < 8) {
    // Aguardando resposta do cliente (passo 5)
    await processarRespostaCliente(cliente, textoFinal);
  } else if (passo === 8) {
    // Depois do link: perguntas, objeções
    await processarPosLink(cliente, textoFinal);
  }
}

// ─── PASSO 0–3: INÍCIO DO FLUXO ──────────────────────────────────────────────
async function iniciarFluxo(cliente, nome) {
  const tel = cliente.telefone;
  await db.upsertCliente(tel, { passo_atual: 1 });

  // Passo 1 — abertura
  await delay(20, 60);
  const msgAbertura = sorteia(ABERTURA)(nome?.split(' ')[0] || '');
  await meta.texto(tel, msgAbertura);

  // Passo 2 — áudio A1 (sorteia, não repete)
  await delay(5, 10);
  const usados = cliente.audio_a1_usado ? [cliente.audio_a1_usado] : [];
  const disponiveis = A1.filter((a) => !usados.includes(a));
  const audioEscolhido = sorteia(disponiveis.length ? disponiveis : A1);
  await meta.audio(tel, audioEscolhido);
  await db.upsertCliente(tel, { audio_a1_usado: audioEscolhido });

  // Passo 3 — depoimentos (textos ou imagens)
  await delay(5, 10);
  for (const dep of DEPOIMENTOS) {
    await delay(3, 6);
    if (dep.tipo === 'texto') {
      await meta.texto(tel, dep.conteudo);
    } else if (dep.tipo === 'imagem') {
      await meta.imagem(tel, dep.arquivo, dep.legenda || '');
    }
  }

  // Passo 4 — pergunta de dor
  await delay(8, 15);
  await meta.texto(tel, sorteia(PERGUNTA_DOR));
  await db.upsertCliente(tel, { passo_atual: 5 });

  // Passo 5 — agendar lembretes se não responder
  await db.agendarAcao(tel, 'lembrete1', {}, 2 * 60 * 60 * 1000);
  await db.agendarAcao(tel, 'lembrete2', {}, 20 * 60 * 60 * 1000);
}

// ─── PASSO 6–8: RESPOSTA DO CLIENTE ──────────────────────────────────────────
async function processarRespostaCliente(cliente, texto) {
  const tel = cliente.telefone;

  // Histórico simples (só a msg atual por enquanto)
  const historico = texto;
  const { dor, intencao } = await ia.classificar(historico);

  // Atalhos: pergunta preço/link antes de contar a dor
  if (['pergunta_preco', 'quer_link'].includes(intencao)) {
    await enviarLink(cliente, 'GERAL');
    return;
  }
  if (intencao === 'ja_pagou') {
    await verificarPagamento(cliente);
    return;
  }
  if (['robo', 'humano'].includes(intencao)) {
    await meta.texto(tel, await ia.reescreverBanco('robo', BANCO.robo));
    await meta.alertaDono(`${tel} perguntou se é robô/pediu humano.`);
    await db.upsertCliente(tel, { precisa_humano: true });
    return;
  }

  // Passo 6 — acolhimento
  await delay(15, 40);
  const frase = await ia.acolhimento(historico);
  await meta.texto(tel, frase);
  await db.upsertCliente(tel, { dor, passo_atual: 6 });

  // Passo 7 — áudio A2 da dor
  await delay(6, 10);
  const a2 = A2[dor] || A2.GERAL;
  await meta.audio(tel, a2);
  await db.upsertCliente(tel, { audio_a2_usado: a2 });

  // Passo 8 — link
  await enviarLink(cliente, dor);
}

// ─── ENVIAR LINK ──────────────────────────────────────────────────────────────
async function enviarLink(cliente, dor) {
  const tel = cliente.telefone;
  const link = linkDor(dor);
  await delay(2, 6);
  await meta.texto(tel, sorteia(INTRO_LINK));
  await delay(1, 2);
  await meta.texto(tel, link);
  await delay(2, 4);
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
    await delay(2, 4);
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

  // Banco de respostas
  const mapa = {
    desconfia: 'golpe',
    pensar: 'pensar',
    tempo: 'tempo',
    outra: 'outra',
  };
  const chave = mapa[intencao] || 'outra';
  const base = BANCO[chave] || BANCO.outra;
  const resp = await ia.reescreverBanco(chave, base);
  await meta.texto(tel, resp);

  if (chave === 'outra') {
    await meta.alertaDono(`${tel} fez uma pergunta que não sei responder:\n"${texto}"`);
    await db.upsertCliente(tel, { precisa_humano: true });
  }
}

// ─── VERIFICAR PAGAMENTO ─────────────────────────────────────────────────────
async function verificarPagamento(cliente) {
  const tel = cliente.telefone;
  if (cliente.pagou) {
    await entregarPDF(cliente);
  } else {
    await meta.texto(tel, await ia.reescreverBanco('ja_pagou', BANCO.ja_pagou));
    await meta.alertaDono(`${tel} disse que pagou mas não está registrado. Verificar na Cakto.`);
    await db.upsertCliente(tel, { precisa_humano: true });
  }
}

// ─── ENTREGA DO PDF ──────────────────────────────────────────────────────────
async function entregarPDF(cliente) {
  const tel = cliente.telefone;
  await meta.texto(tel, sorteia(POS_VENDA));
  await delay(1, 3);
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
async function baixarMidia(mediaId) {
  const fetch = require('node-fetch');
  const r1 = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${process.env.META_TOKEN}` },
  });
  const { url } = await r1.json();
  const r2 = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.META_TOKEN}` },
  });
  return r2.buffer();
}

module.exports = { receberMensagem, vendaConfirmada, PEDE_DEPO };
