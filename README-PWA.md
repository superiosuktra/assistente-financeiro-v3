# 🚀 PWA - Progressive Web App - Assistente Financeiro V3

## ✨ O que é PWA?

Uma **Progressive Web App (PWA)** é um aplicativo web que funciona como um app nativo em qualquer dispositivo:
- 📱 Celular (Android/iOS)
- 💻 PC (Windows/Mac/Linux)
- 🌐 Navegador web

## 🎯 Instalação

### 1️⃣ No Navegador (Qualquer Dispositivo)

```
1. Abra: https://seu-dominio.com/install
2. Escaneie o QR Code com seu celular
3. Clique em "Instalar app"
4. Pronto! ✅
```

### 2️⃣ Android

```
1. Abra o app no Chrome/Edge
2. Menu (⋮) → "Instalar app"
3. Confirme
4. App instalado na tela inicial
```

### 3️⃣ iOS

```
1. Abra o app no Safari
2. Compartilhar (↗) → "Adicionar à tela inicial"
3. Nomeie e confirme
4. App instalado na tela inicial
```

## 🔄 Sincronização em Tempo Real

Os dados são sincronizados automaticamente entre:
- 📱 Celular
- 💻 PC
- 🌐 Navegador
- ☁️ Google Drive

### Como funciona:

1. **Celular A** → Salva um lançamento
2. **WebSocket** → Envia em tempo real
3. **Celular B / PC** → Recebe e atualiza automaticamente
4. **Google Drive** → Backup automático

## 🛜 Funciona Offline

Sem internet?

- ✅ Continua funcionando
- 📝 Salva localmente
- 🔄 Sincroniza quando retorna online

## 📡 Arquitetura

```
┌─────────────┐
│   Celular   │
│  (PWA App)  │
└──────┬──────┘
       │ WebSocket
       │
       v
┌─────────────────────────┐
│   Servidor Node.js      │
│  - Express              │
│  - WebSocket (ws)       │
│  - Google Drive API     │
└──────┬──────────────────┘
       │
       ├──→ Celular 2 (Sincroniza)
       ├──→ PC (Sincroniza)
       └──→ Google Drive (Backup)
```

## 🔐 Segurança

- ✅ OAuth 2.0 (Google)
- ✅ Dados criptografados
- ✅ Session segura
- ✅ HTTPS recomendado

## 📦 Arquivos PWA

```
public/
├── index.html              # App principal
├── manifest.json           # Metadados PWA
├── sw.js                   # Service Worker (offline)
├── install.html            # Página de instalação
└── js/
    └── websocket-sync.js   # Sincronização em tempo real
```

## 🚀 Deploy

### Local

```bash
npm install
npm start
# Acesse: http://localhost:3000/install
```

### Produção

```bash
# Use um serviço como Heroku, Vercel, Railway, etc.
export GOOGLE_CLIENT_ID=seu-id
export GOOGLE_CLIENT_SECRET=seu-secret
npm start
```

## 📲 Links Úteis

- 📋 **Instalação**: `/install`
- 🏠 **App**: `/`
- 📊 **API**: `/api/`
- 🔗 **WebSocket**: `ws://seu-dominio.com`

## 💡 Dicas

1. **QR Code**: Escaneie para compartilhar o link com amigos
2. **Offline**: Dados salvos localmente, sincronizam quando online
3. **Atualização**: App atualiza automaticamente quando você acessa
4. **Notificações**: Ativa notificações push (opcional)

## 🔧 Troubleshooting

### "App não aparece para instalar"

- ✅ Use HTTPS em produção
- ✅ Carregue a página completamente
- ✅ Abra em Chrome/Edge/Samsung Internet

### "Dados não sincronizam"

- ✅ Verifique conexão WebSocket
- ✅ Abra DevTools (F12) → Console
- ✅ Procure por "🔗 WebSocket conectado"

### "Offline não funciona"

- ✅ Service Worker deve estar registrado
- ✅ Veja DevTools → Application → Service Workers
- ✅ Status deve ser "activated"

## 📞 Suporte

Tem dúvidas? Abra uma issue no GitHub!
