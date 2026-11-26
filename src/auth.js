'use strict';
// Auth state usando arquivos em /tmp (nativo do Baileys — sem serialização manual)
// Sessão dura enquanto Railway não reiniciar. Na próxima conexão pede pairing novamente.
const { useMultiFileAuthState } = require('@whiskeysockets/baileys');
const path = require('path');

const AUTH_DIR = process.env.AUTH_DIR || '/tmp/wa-auth';

async function useLocalAuthState() {
  return useMultiFileAuthState(AUTH_DIR);
}

module.exports = { useLocalAuthState };
