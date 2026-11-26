'use strict';
// Patch baileys crypto.js para converter qualquer tipo para Buffer
// antes de passar para o cipher do Node.js (resolve TypeError com Node 20)
const fs = require('fs');
const path = require('path');

const cryptoFile = path.join(__dirname, '..', 'node_modules', '@whiskeysockets', 'baileys', 'lib', 'Utils', 'crypto.js');

if (!fs.existsSync(cryptoFile)) {
  console.log('[patch] baileys crypto.js não encontrado, pulando');
  process.exit(0);
}

let src = fs.readFileSync(cryptoFile, 'utf8');

const MARKER = '// PATCHED_BY_POSTINSTALL';
if (src.includes(MARKER)) {
  console.log('[patch] baileys crypto.js já está patchado');
  process.exit(0);
}

// Envolve aesEncryptGCM para converter qualquer argumento para Buffer
const WRAP = `
${MARKER}
function toBuffer(v) {
    if (Buffer.isBuffer(v)) return v;
    if (v instanceof Uint8Array) return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
    if (v instanceof ArrayBuffer) return Buffer.from(v);
    if (v && typeof v.finish === 'function') return Buffer.from(v.finish()); // protobuf Writer
    if (v && v.buffer) return Buffer.from(v.buffer);
    if (Array.isArray(v)) return Buffer.from(v);
    return Buffer.alloc(0);
}

`;

// Injeta o helper no início do arquivo
src = WRAP + src;

// Substitui o corpo de aesEncryptGCM para usar toBuffer nos 4 argumentos
src = src.replace(
  /exports\.aesEncryptGCM = exports\.aesDecryptGCM = void 0;/,
  'exports.aesEncryptGCM = exports.aesDecryptGCM = void 0;'
);

// Patch direto: substitui a assinatura da função para normalizar os tipos
src = src.replace(
  /const aesEncryptGCM = \(plaintext, key, iv, additionalData\) => \{/,
  'const aesEncryptGCM = (plaintext_raw, key_raw, iv_raw, additionalData_raw) => { const plaintext = toBuffer(plaintext_raw); const key = toBuffer(key_raw); const iv = toBuffer(iv_raw); const additionalData = toBuffer(additionalData_raw);'
);

fs.writeFileSync(cryptoFile, src, 'utf8');
console.log('[patch] baileys crypto.js patchado com sucesso');
