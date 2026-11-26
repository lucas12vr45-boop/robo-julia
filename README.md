# Robô Júlia — Destrave Seu Dinheiro em 2027

## 1. Coloque os seus depoimentos

Abra `src/textos.js` e preencha o array `DEPOIMENTOS` (linha 10).  
Cada depoimento pode ser texto ou imagem:

```js
// Texto:
{ tipo: 'texto', conteudo: '⭐⭐⭐⭐⭐\n"Depoimento real"\n— Nome, Cidade' }

// Imagem (coloque o arquivo em midia/imagens/dep-1.jpg):
{ tipo: 'imagem', arquivo: 'dep-1.jpg', legenda: 'resultado real 💛' }
```

---

## 2. Coloque os áudios

Pasta: `midia/audios/`  
Formato: `.ogg` (opus, mono, 48 kHz).  
Converter de MP3:
```
ffmpeg -i A1-1.mp3 -c:a libopus -b:a 32k -ac 1 -ar 48000 A1-1.ogg
```

Arquivos necessários:
- `A1-1.ogg` até `A1-5.ogg` (áudio de abertura — sorteia 1 de 5)
- `A2-DIVIDA.ogg`, `A2-NAOSOBRA.ogg`, `A2-IMPREVISTO.ogg`
- `A2-FAMILIA.ogg`, `A2-VONTADE.ogg`, `A2-ANONOVO.ogg`, `A2-GERAL.ogg`

---

## 3. Coloque o PDF

Pasta: `midia/produto/`  
Arquivo: `Destrave-Seu-Dinheiro-2027.pdf`

---

## 4. Configure na Meta (WhatsApp Cloud API)

1. **developers.facebook.com** → Meus apps → Criar app → tipo "Empresa"  
   Nome: `Destrave Atendimento` · Portfólio: Lucas
2. App → Adicionar produto → **WhatsApp** → Configurar
3. WhatsApp → Configuração da API → "Adicionar número de telefone"  
   (use um chip novo, fora do WhatsApp normal)
4. Anote `PHONE_NUMBER_ID` e `WHATSAPP_BUSINESS_ACCOUNT_ID`
5. **Token permanente:**  
   Configurações do negócio → Usuários do sistema → Adicionar (Admin)  
   → Atribuir ativos → Gerar token → permissões `whatsapp_business_messaging` + `whatsapp_business_management` → validade **Nunca**
6. **Webhook** (após o Railway estar no ar):  
   WhatsApp → Configuração → Webhook → Editar  
   - URL: `https://SEU-APP.up.railway.app/webhook/whatsapp`  
   - Token de verificação: `destrave2027julia` (ou o seu `META_VERIFY_TOKEN`)  
   - Campo: `messages`

---

## 5. Suba para o GitHub

```bash
git init
git add .
git commit -m "robo-julia inicial"
git remote add origin https://github.com/SEU-USUARIO/robo-julia.git
git push -u origin main
```

---

## 6. Configure no Railway

1. railway.com → New Project → **Deploy from GitHub repo** → `robo-julia`
2. No mesmo projeto: **New → Database → PostgreSQL**  
   (Railway cria `DATABASE_URL` sozinho)
3. Serviço → **Variables** → cole todas as variáveis do `.env.example`
4. Settings → **Networking → Generate Domain**
5. Settings → Deploy:  
   - Start command: `node src/index.js`  
   - Healthcheck path: `/health`
6. Após o deploy: abra `https://SEU-APP.up.railway.app/health` → deve aparecer `{"ok":true}`

---

## 7. Configure webhook na Cakto

Cakto → Integrações → Webhooks → Adicionar  
- URL: `https://SEU-APP.up.railway.app/webhook/cakto`  
- Evento: `Compra aprovada`  
- Produto: Destrave Seu Dinheiro em 2027

---

## 8. Checklist de teste (com MODO_TESTE=1)

- [ ] `/health` responde `{"ok":true}`
- [ ] Webhook Meta verificado (check verde no painel)
- [ ] Mande "oi" do seu número → recebe abertura + áudio A1 + depoimentos + pergunta
- [ ] Responda "tô cheio de dívida" → acolhimento + A2-DIVIDA + link R$25,93
- [ ] Mande um áudio → robô entende e responde
- [ ] "é golpe?" → resposta certa
- [ ] "tá caro" → oferta R$15 e R$10
- [ ] "é robô?" → confirma que é assistente + alerta no seu celular
- [ ] Compre o de menor valor no seu número → PDF chega na conversa
- [ ] Fique 25h sem falar → robô NÃO manda nada (janela fechada)

Depois dos testes: `MODO_TESTE=0` e ligue o anúncio! 🚀
