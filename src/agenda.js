'use strict';
const db = require('./db');
const meta = require('./whatsapp');
const { LEMBRETE_2H, LEMBRETE_20H, NAO_PAGOU_40MIN, PEDE_DEPO } = require('./textos');
const { vendaConfirmada } = require('./fluxo');
const { dentroJanela } = require('./janela');

async function processarAgenda() {
  const pendentes = await db.pegarPendentes();
  for (const item of pendentes) {
    await db.marcarFeito(item.id);
    try {
      await executar(item);
    } catch (e) {
      console.error('Agenda erro:', item.acao, e.message);
    }
  }
}

async function executar(item) {
  const tel = item.telefone;
  const cliente = await db.getCliente(tel);
  if (!cliente) return;

  switch (item.acao) {
    case 'lembrete1':
      if (!dentroJanela(cliente) || cliente.passo_atual >= 6) return;
      await meta.texto(tel, LEMBRETE_2H);
      break;

    case 'lembrete2':
      if (!dentroJanela(cliente) || cliente.passo_atual >= 6) return;
      await meta.texto(tel, LEMBRETE_20H);
      break;

    case 'nao_pagou_40min':
      if (cliente.pagou || cliente.passo_atual < 8) return;
      if (!dentroJanela(cliente)) return;
      await meta.texto(tel, NAO_PAGOU_40MIN);
      break;

    case 'pedir_depo': {
      if (!cliente.pagou || cliente.autorizou_depo) return;
      // Só pede se o cliente falou algo nas últimas 24h
      const ult = cliente.ultima_msg_em ? new Date(cliente.ultima_msg_em) : null;
      const h24 = new Date(Date.now() - 24 * 60 * 60 * 1000);
      if (!ult || ult < h24) return;
      await meta.texto(tel, PEDE_DEPO(cliente.nome?.split(' ')[0] || ''));
      break;
    }

    case 'retomar': {
      // Retomar fluxo após horário de atendimento
      const fluxo = require('./fluxo');
      const { nome, texto } = item.dados || {};
      await fluxo.receberMensagem(tel, nome, texto, null, null, null);
      break;
    }
  }
}

// Roda a cada 30 segundos
function iniciarAgenda() {
  setInterval(processarAgenda, 30 * 1000);
  processarAgenda(); // roda imediatamente ao subir
}

module.exports = { iniciarAgenda };
