'use strict';
const db = require('./db');
const meta = require('./whatsapp');
const { PEDE_DEPO } = require('./textos');

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
  const cliente = await db.getCliente(item.telefone);
  if (!cliente) return;

  if (item.acao === 'lembrete') {
    await require('./fluxo').lembrete(cliente, item.dados || {});
  } else if (item.acao === 'pedir_depo') {
    if (!cliente.pagou || cliente.autorizou_depo || cliente.optout) return;
    await meta.texto(cliente.telefone, PEDE_DEPO(cliente.nome?.split(' ')[0] || ''));
  }
}

function iniciarAgenda() {
  setInterval(() => processarAgenda().catch((e) => console.error('Agenda:', e.message)), 30 * 1000);
  processarAgenda().catch((e) => console.error('Agenda:', e.message));
}

module.exports = { iniciarAgenda };
