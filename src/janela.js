'use strict';

// Retorna true se ainda pode mandar mensagem (dentro da janela grátis da Meta)
function dentroJanela(cliente) {
  if (!cliente.janela_ate) return false;
  return new Date() < new Date(cliente.janela_ate);
}

// Define a janela quando o cliente manda a 1ª mensagem
// - veio do anúncio (ctwa_clid): 72h
// - normal: 24h a partir da última mensagem do cliente
function calcJanela(veioDoAnuncio, agora = new Date()) {
  const horas = veioDoAnuncio ? 72 : 24;
  return new Date(agora.getTime() + horas * 60 * 60 * 1000);
}

// Fora do horário de atendimento?
function foraDoHorario() {
  const tz = process.env.FUSO || 'America/Sao_Paulo';
  const agora = new Date().toLocaleString('pt-BR', { timeZone: tz });
  const hora = new Date(agora).getHours();
  const inicio = parseInt(process.env.HORARIO_INICIO || '7');
  const fim = parseInt(process.env.HORARIO_FIM || '23');
  return hora < inicio || hora >= fim;
}

// Próximo horário de atendimento (em ms a partir de agora)
function proximoHorario() {
  const tz = process.env.FUSO || 'America/Sao_Paulo';
  const agora = new Date();
  const agoraBR = new Date(agora.toLocaleString('pt-BR', { timeZone: tz }));
  const inicio = parseInt(process.env.HORARIO_INICIO || '7');
  const amanha = new Date(agoraBR);
  amanha.setDate(amanha.getDate() + 1);
  amanha.setHours(inicio, Math.floor(Math.random() * 35) + 5, 0, 0); // 7h + 5 a 40 min
  return amanha.getTime() - agora.getTime();
}

module.exports = { dentroJanela, calcJanela, foraDoHorario, proximoHorario };
