'use strict';
const meta = require('./whatsapp');
const db = require('./db');
const janela = require('./janela');
const { DEPOIMENTOS, PEDE_DEPO, PEDE_AUTORIZACAO, sorteia } = require('./textos');
const T = require('./textos-v2');

// Etapas (passo_atual)
const INICIO = 0, APRESENTANDO = 1, AGUARDA_INTERESSE = 5, AGUARDA_REACAO = 6, OFERTA = 7, AGUARDA_PAGAMENTO = 8, PAGO = 10;

const A1_ANTIGOS = ['A1-1.ogg', 'A1-2.ogg', 'A1-3.ogg', 'A1-4.ogg', 'A1-5.ogg'];

// Sorteia entre as versões gravadas (ex.: V2-A1-1, V2-A1-2, V2-A1-3) para o WhatsApp
// não ver o mesmo arquivo indo pra todo mundo. Sem versão nova, usa a antiga.
function variante(base, reserva) {
  const opcoes = [`${base}.ogg`, ...[1, 2, 3].map((i) => `${base}-${i}.ogg`)].filter((a) => meta.existeAudio(a));
  if (opcoes.length) return sorteia(opcoes);
  return Array.isArray(reserva) ? sorteia(reserva) : reserva;
}
const audioA1 = () => variante('V2-A1', A1_ANTIGOS);
const audioA2 = (dor) => variante(`V2-A2-${dor}`, variante('V2-A2-GERAL', 'A2-GERAL.ogg'));
const audioA3 = () => variante('V2-A3', 'A3-APP.ogg');
const audioA4 = () => variante('V2-A4', null);

// ─── uma sequência por contato; nova intenção cancela a que está rodando ─────
const geracao = new Map();
const ocupado = new Set();
const respostaAntecipada = new Map();

async function sequencia(tel, fn) {
  const g = (geracao.get(tel) || 0) + 1;
  geracao.set(tel, g);
  ocupado.add(tel);
  const vivo = () => geracao.get(tel) === g;
  try { await fn(vivo); } finally { if (vivo()) ocupado.delete(tel); }
}
function cancelar(tel) {
  geracao.set(tel, (geracao.get(tel) || 0) + 1);
  ocupado.delete(tel);
}

// ─── intenções ───────────────────────────────────────────────────────────────
const tem = (t, re) => re.test(t);
const RE = {
  pare: /^(pare|para|parar|sair|stop)\b|para de (me )?mandar|n[aã]o quero mais (receber|mensage)|me tira (da lista|daqui)|remove (meu n[uú]mero|da lista)/,
  humano: /\b(rob[oô]|bot|humano|atendente)\b|autom[aá]tic|pessoa de verdade/,
  link: /quanto custa|quanto [eé]\b|qual (o )?valor|qual (o )?pre[cç]o|pre[cç]o|manda o link|me manda o link|\blink\b|como compr|quero comprar|quero o guia|quero o pdf|onde compr/,
  jaPaguei: /j[aá] paguei|\bpaguei\b|fiz o pix|efetuei|comprei|j[aá] comprei/,
  reembolso: /reembolso|devolu[cç]|estorno|cancelar a compra/,
  confiavel: /golpe|fraude|fake|confi[aá]vel|[eé] seguro|seguran[cç]a|verdade isso/,
  pagar: /n[aã]o sei pagar|como pag|n[aã]o consigo pagar|n[aã]o entendi o pix|pix|cart[aã]o|boleto|v[ií]deo/,
  recebo: /como (eu )?receb|como chega|onde chega|vou receber/,
  caro: /\bcaro\b|desconto|mais barato|t[aá] puxado|n[aã]o tenho dinheiro|sem dinheiro/,
  funciona: /funciona mesmo|vou ganhar|ganhar dinheiro|d[aá] resultado/,
  religiao: /religi|igreja|evang[eé]lic|cat[oó]lic|esp[ií]rit/,
  fisico: /f[ií]sico|impresso|livro de papel/,
  tempo: /quanto tempo|demora|minutos por dia|tempo por dia/,
  pensar: /vou pensar|depois eu|mais tarde|outro dia/,
};

function classificarDor(t) {
  if (/d[ií]vida|devendo|atrasad|nome sujo|serasa|cart[aã]o|empr[eé]stimo|juros|boleto/.test(t)) return 'DIVIDA';
  if (/imprevisto|emerg[eê]ncia|reserva|quebr|rem[eé]dio|doen|desempreg|demitid/.test(t)) return 'IMPREVISTO';
  if (/fam[ií]lia|filh|m[aã]e|\bpai\b|marido|esposa|ajudar/.test(t)) return 'FAMILIA';
  if (/sobra|some|acaba|guardar|economiz|sal[aá]rio|gast|controle|organiz|entra e sai/.test(t)) return 'NAOSOBRA';
  if (/sonho|carro|viagem|casa|im[oó]vel|realizar|conquist|\bmeta\b/.test(t)) return 'VONTADE';
  if (/2027|ano novo|virada|pr[oó]ximo ano|ano que vem/.test(t)) return 'ANONOVO';
  return 'GERAL';
}

// ─── RECEBE MENSAGEM ────────────────────────────────────────────────────────
async function receberMensagem(tel, nome, texto, tipoMidia, _buf, ctwaClid, msgKey, telefoneReal) {
  if (process.env.MODO_TESTE === '1') {
    const permitidos = (process.env.NUMEROS_TESTE || '').split(',').map((s) => s.trim());
    if (!permitidos.some((p) => tel.includes(p) || (telefoneReal || '').includes(p))) return;
  }

  let cliente = await db.getCliente(tel);
  await db.cancelarAgenda(tel);
  await db.upsertCliente(tel, {
    nome: nome || cliente?.nome || '',
    ultima_msg_em: new Date(),
    janela_ate: janela.calcJanela(!!(ctwaClid || cliente?.veio_do_anuncio)),
    veio_do_anuncio: !!(ctwaClid || cliente?.veio_do_anuncio),
    ...(telefoneReal ? { fone_chave: db.chaveFone(telefoneReal) } : {}),
    ...(!cliente && !telefoneReal && !tel.includes('@') ? { fone_chave: db.chaveFone(tel) } : {}),
  });
  cliente = await db.getCliente(tel);

  if (cliente.optout) return;
  if (cliente.precisa_humano) {
    await meta.alertaDono(`${tel} (${nome}) mandou mensagem e está aguardando humano:\n"${texto}"`);
    return;
  }
  if (cliente.pagou) { await posPago(cliente, texto); return; }

  const t = (texto || '').toLowerCase();
  const passo = cliente.passo_atual || INICIO;
  const ehMidia = texto === '[mídia]' || tipoMidia === 'audio';

  // Intenções fortes valem em qualquer etapa (inclusive na 1ª mensagem)
  if (!ehMidia) {
    if (tem(t, RE.pare)) { cancelar(tel); await db.upsertCliente(tel, { optout: true }); await meta.texto(tel, T.RESPOSTAS.pare); return; }
    if (tem(t, RE.humano)) { cancelar(tel); await humano(cliente, texto); return; }
    if (tem(t, RE.jaPaguei)) { cancelar(tel); await jaPaguei(cliente); return; }
    if (tem(t, RE.reembolso)) { cancelar(tel); await meta.texto(tel, T.RESPOSTAS.reembolso); return; }
    if (tem(t, RE.link) && passo !== AGUARDA_PAGAMENTO) { cancelar(tel); await oferta(cliente); return; }
    if (tem(t, RE.confiavel)) { await meta.texto(tel, T.RESPOSTAS.confiavel); return; }
  }

  if (passo === INICIO) {
    if (msgKey) await meta.curtir(tel, msgKey);
    await apresentar(cliente);
    return;
  }
  if (ocupado.has(tel)) {
    // Respondeu enquanto o bot ainda manda a apresentação: guarda e usa depois
    if (passo === APRESENTANDO && !ehMidia) respostaAntecipada.set(tel, texto);
    return;
  }
  if (passo === AGUARDA_INTERESSE || passo === APRESENTANDO) {
    if (ehMidia) { await meta.texto(tel, 'pode me contar por escrito? assim consigo te ajudar melhor 😊'); return; }
    await apresentarAmostra(cliente, texto);
    return;
  }
  if (passo === OFERTA) { await oferta(cliente); return; } // envio interrompido (ex.: reinício)
  if (passo === AGUARDA_REACAO) {
    await meta.texto(tel, sorteia(T.RESPOSTA_FECHAMENTO));
    await oferta(cliente);
    return;
  }
  if (passo === AGUARDA_PAGAMENTO && !ehMidia) await duvidaPosLink(cliente, t);
}

// ─── 1. Curtida → A1 → depoimentos → pergunta de interesse ───────────────────
async function apresentar(cliente) {
  const tel = cliente.telefone;
  await db.upsertCliente(tel, { passo_atual: APRESENTANDO });
  await sequencia(tel, async (vivo) => {
    const a1 = audioA1();
    await meta.audio(tel, a1, [10, 12]);
    await db.upsertCliente(tel, { audio_a1_usado: a1 });
    for (const dep of DEPOIMENTOS) {
      if (!vivo()) return;
      if (dep.tipo === 'imagem') await meta.imagem(tel, dep.arquivo, dep.legenda || '');
      else await meta.texto(tel, dep.conteudo);
    }
    if (!vivo()) return;
    const antecipada = respostaAntecipada.get(tel);
    respostaAntecipada.delete(tel);
    if (antecipada) {
      ocupado.delete(tel);
      await apresentarAmostra(await db.getCliente(tel), antecipada);
      return;
    }
    await meta.texto(tel, sorteia(T.PERGUNTA_INTERESSE));
    await db.upsertCliente(tel, { passo_atual: AGUARDA_INTERESSE });
    await agendarLembretes(tel, AGUARDA_INTERESSE);
  });
}

// ─── 2. Acolhimento → A2 da dor → A3 → amostra + app → pergunta ──────────────
async function apresentarAmostra(cliente, resposta) {
  const tel = cliente.telefone;
  const dor = classificarDor((resposta || '').toLowerCase());
  await db.upsertCliente(tel, { dor, passo_atual: OFERTA });
  await sequencia(tel, async (vivo) => {
    await meta.texto(tel, sorteia(T.ACOLHIMENTO[dor]));
    if (!vivo()) return;
    const a2 = audioA2(dor);
    await meta.audio(tel, a2);
    await db.upsertCliente(tel, { audio_a2_usado: a2 });
    if (!vivo()) return;
    await meta.audio(tel, audioA3());
    if (!vivo()) return;
    await meta.imagem(tel, 'amostra-guia.jpg', T.LEGENDA_FOTO);
    if (!vivo()) return;
    await meta.documento(tel, 'Amostra-Destrave-2027.pdf', T.NOME_AMOSTRA);
    await meta.texto(tel, T.TEXTO_AMOSTRA);
    if (!vivo()) return;
    if (T.APP_TESTE) await meta.texto(tel, T.TEXTO_APP_TESTE(T.APP_TESTE));
    if (!vivo()) return;
    await meta.texto(tel, sorteia(T.PERGUNTA_FECHAMENTO));
    await db.upsertCliente(tel, { passo_atual: AGUARDA_REACAO });
    await agendarLembretes(tel, AGUARDA_REACAO);
  });
}

// ─── 3. Oferta → (A4) → garantia → link ──────────────────────────────────────
async function oferta(cliente) {
  const tel = cliente.telefone;
  await db.upsertCliente(tel, { passo_atual: OFERTA });
  await sequencia(tel, async (vivo) => {
    await meta.texto(tel, T.OFERTA(!!T.APP_TESTE));
    if (!vivo()) return;
    const a4 = audioA4();
    if (a4) {
      await meta.audio(tel, a4);
      if (!vivo()) return;
    }
    await meta.texto(tel, T.REFORCO);
    await meta.texto(tel, T.LINK);
    await meta.texto(tel, T.POS_LINK);
    await db.upsertCliente(tel, { passo_atual: AGUARDA_PAGAMENTO, link_enviado: T.LINK, preco_oferecido: T.PRECO });
    await agendarLembretes(tel, AGUARDA_PAGAMENTO);
  });
}

// ─── 4. Dúvidas depois do link ──────────────────────────────────────────────
async function duvidaPosLink(cliente, t) {
  const tel = cliente.telefone;
  const R = T.RESPOSTAS;
  if (tem(t, RE.caro)) {
    if (cliente.desconto_enviado) { await meta.texto(tel, R.pensar); return; }
    await meta.texto(tel, R.caro);
    await meta.texto(tel, T.LINK_DESCONTO);
    await db.upsertCliente(tel, { desconto_enviado: true, link_enviado: T.LINK_DESCONTO, preco_oferecido: 'R$15' });
    return;
  }
  if (tem(t, RE.pagar)) { await enviarVideoOuTexto(cliente); return; }
  if (tem(t, RE.recebo)) { await meta.texto(tel, R.recebo); return; }
  if (tem(t, RE.funciona)) { await meta.texto(tel, R.funciona); return; }
  if (tem(t, RE.religiao)) { await meta.texto(tel, R.religiao); return; }
  if (tem(t, RE.fisico)) { await meta.texto(tel, R.fisico); return; }
  if (tem(t, RE.tempo)) { await meta.texto(tel, R.tempo); return; }
  if (tem(t, RE.pensar)) { await meta.texto(tel, R.pensar); return; }
  if (/^(sim|quero|manda|pode|ok|blz|beleza)\b/.test(t)) { await enviarVideoOuTexto(cliente); return; }
  await meta.texto(tel, R.outra);
  await meta.texto(tel, cliente.link_enviado || T.LINK);
}

async function enviarVideoOuTexto(cliente) {
  const tel = cliente.telefone;
  if (meta.existeVideo('V2-COMO-COMPRAR.mp4') && !cliente.video_enviado) {
    await meta.texto(tel, T.RESPOSTAS.videoPagar);
    await meta.video(tel, 'V2-COMO-COMPRAR.mp4');
    await db.upsertCliente(tel, { video_enviado: true });
  } else {
    await meta.texto(tel, T.RESPOSTAS.pagar);
  }
}

async function humano(cliente, texto) {
  await meta.texto(cliente.telefone, T.RESPOSTAS.robo);
  await meta.alertaDono(`${cliente.telefone} (${cliente.nome || ''}) pediu atendimento humano:\n"${texto}"`);
  await db.upsertCliente(cliente.telefone, { precisa_humano: true });
}

async function jaPaguei(cliente) {
  if (cliente.pagou) { await entregar(cliente); return; }
  await meta.texto(cliente.telefone, T.RESPOSTAS.jaPaguei);
  await meta.alertaDono(`${cliente.telefone} (${cliente.nome || ''}) disse que pagou, mas a Cakto ainda não confirmou. Conferir.`);
}

// ─── lembretes: no máximo 2 por pessoa ──────────────────────────────────────
async function agendarLembretes(tel, passo) {
  await db.agendarAcao(tel, 'lembrete', { passo }, 2 * 60 * 60 * 1000);
  await db.agendarAcao(tel, 'lembrete', { passo, ultimo: true }, 22 * 60 * 60 * 1000);
}
async function lembrete(cliente, dados) {
  if (cliente.pagou || cliente.optout || cliente.precisa_humano) return;
  if ((cliente.lembretes || 0) >= 2 || cliente.passo_atual !== dados.passo) return;
  const msg = dados.ultimo ? T.LEMBRETE.ultimo : T.LEMBRETE[dados.passo];
  if (!msg) return;
  await meta.texto(cliente.telefone, msg);
  await db.upsertCliente(cliente.telefone, { lembretes: (cliente.lembretes || 0) + 1 });
}

// ─── pagamento confirmado (webhook da Cakto) ────────────────────────────────
// itens: ['guia','app','planilha','mapa','lunar'] — cada um é entregue uma vez só
async function vendaConfirmada({ telefone, email, pedidoId, itens }) {
  const cliente = await db.buscarPorFone(telefone);
  if (!cliente) {
    await meta.alertaDono(`💰 Venda confirmada (${telefone}, ${email}: ${itens.join(', ')}), mas não achei essa pessoa no WhatsApp. Entregar manualmente.`);
    return;
  }
  const jaTinha = !!cliente.pagou;
  cancelar(cliente.telefone);
  await db.cancelarAgenda(cliente.telefone);
  await db.upsertCliente(cliente.telefone, { pagou: true, pago_em: cliente.pago_em || new Date(), email, passo_atual: PAGO, pedido_id: pedidoId });
  await entregarItens(await db.getCliente(cliente.telefone), itens);
  if (!jaTinha) await db.agendarAcao(cliente.telefone, 'pedir_depo', {}, 3 * 24 * 60 * 60 * 1000);
}

async function entregarItens(cliente, itens) {
  const tel = cliente.telefone;
  const feitos = new Set((cliente.itens_entregues || '').split(',').filter(Boolean));
  const pendentes = itens.filter((i) => !feitos.has(i));
  if (!pendentes.length) return; // aviso repetido da Cakto
  try {
    if (pendentes.includes('guia')) {
      await meta.texto(tel, T.PAGO);
      await meta.documento(tel, 'Destrave-Seu-Dinheiro-2027.pdf', 'Destrave Seu Dinheiro em 2027.pdf');
      feitos.add('guia');
      await db.upsertCliente(tel, { entregue: true, itens_entregues: [...feitos].join(',') });
      await meta.texto(tel, T.ENTREGUE);
    } else {
      await meta.texto(tel, 'pagamento confirmado 💛 já te mando aqui');
    }
    for (const item of pendentes.filter((i) => i !== 'guia')) {
      if (!T.ENTREGA_ITEM[item]) continue;
      await meta.texto(tel, T.ENTREGA_ITEM[item]);
      feitos.add(item);
      await db.upsertCliente(tel, { itens_entregues: [...feitos].join(','), ...(item === 'app' ? { comprou_app: true } : {}) });
    }
  } catch (e) {
    await meta.alertaDono(`⚠️ Falha ao entregar (${pendentes.join(', ')}) para ${tel}: ${e.message}. Entregar manualmente.`);
  }
}

// Reenvio quando o cliente diz que não chegou
async function entregar(cliente) {
  await db.upsertCliente(cliente.telefone, { itens_entregues: '' });
  const itens = ['guia', ...(cliente.itens_entregues || '').split(',').filter((i) => i && i !== 'guia')];
  await entregarItens(await db.getCliente(cliente.telefone), itens);
}

async function posPago(cliente, texto) {
  const t = (texto || '').toLowerCase();
  if (tem(t, RE.reembolso)) { await meta.texto(cliente.telefone, T.RESPOSTAS.reembolso); return; }
  if (/n[aã]o (chegou|recebi|abre|abriu)/.test(t)) { await entregar(cliente); return; }
  if (cliente.autorizou_depo) return;
  if (/^(sim|pode|claro|autorizo)/.test(t)) {
    await db.upsertCliente(cliente.telefone, { autorizou_depo: true });
    await meta.alertaDono(`⭐ ${cliente.telefone} (${cliente.nome}) autorizou usar o comentário como depoimento.`);
  } else if (t.length > 15) {
    await meta.texto(cliente.telefone, PEDE_AUTORIZACAO);
  }
}

module.exports = { receberMensagem, vendaConfirmada, lembrete, PEDE_DEPO, classificarDor };
