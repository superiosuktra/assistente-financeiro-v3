# 🚀 Assistente Financeiro V3

**Aplicação completa de gestão financeira pessoal com autenticação OAuth 2.0 e integração Google Drive.**

![Status](https://img.shields.io/badge/status-active-brightgreen?style=flat-square)
![Node.js](https://img.shields.io/badge/Node.js-16%2B-green?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)

## 🎯 Recursos Principais

### 💰 Gestão Financeira
- ✅ Registro de receitas e despesas
- ✅ Categorização automática de transações
- ✅ Alertas para contas a vencer
- ✅ Relatórios mensais detalhados
- ✅ Gráficos interativos (Chart.js)
- ✅ Análise por categoria de gastos

### 🔐 Segurança & Autenticação
- ✅ OAuth 2.0 com Google (protocolo seguro)
- ✅ Sessões protegidas (httpOnly cookies)
- ✅ Validação de dados no backend
- ✅ Proteção contra CSRF
- ✅ Criptografia de sessão

### ☁️ Backup & Sincronização
- ✅ Backup automático no Google Drive
- ✅ Restauração de dados em um clique
- ✅ Service Worker para funcionamento offline
- ✅ Sincronização automática quando reconectar
- ✅ Histórico de backups

### 🎮 Interatividade & Gamificação
- ✅ 10 badges diferentes para desbloquear
- ✅ Animações de números (contadores)
- ✅ Search & filter avançado em tempo real
- ✅ Exportação em CSV e PDF
- ✅ Modo escuro/claro
- ✅ Interface responsiva (mobile-first)

### 📱 Progressive Web App (PWA)
- ✅ Instalável no celular/desktop
- ✅ Funciona offline
- ✅ Ícones customizados
- ✅ Splash screen
- ✅ Background sync

## 🛠️ Stack Tecnológico

### Frontend
- **HTML5** - Estrutura semântica
- **CSS3** - Design responsivo com variáveis CSS
- **JavaScript Vanilla** - Sem frameworks, performático
- **Chart.js** - Gráficos interativos
- **LocalStorage API** - Armazenamento local
- **Service Workers** - Suporte offline

### Backend
- **Node.js** - Runtime JavaScript
- **Express** - Framework web minimalista
- **Google APIs** - Autenticação OAuth 2.0 e Google Drive
- **Express-session** - Gerenciamento de sessões
- **CORS** - Segurança de origem cruzada
- **dotenv** - Variáveis de ambiente

### APIs Externas
- **Google OAuth 2.0** - Autenticação segura
- **Google Drive API v3** - Backup e sincronização
- **Google Userinfo API** - Dados do usuário

## 📋 Pré-requisitos

### Sistema
- Node.js 16+ ([Download](https://nodejs.org))
- npm ou yarn
- Git

### Google Cloud Setup
1. Acesse [Google Cloud Console](https://console.cloud.google.com)
2. Crie um novo projeto
3. Ative as APIs:
   - Google Drive API
   - Google+ API
4. Crie credenciais OAuth 2.0:
   - Tipo: Aplicação Web
   - URIs autorizados:
     - `http://localhost:3000`
     - `http://localhost:3000/api/auth/google/callback`
5. Copie `Client ID` e `Client Secret`

## 🚀 Instalação & Setup

### 1. Clone o repositório
```bash
git clone https://github.com/superiosuktra/assistente-financeiro-v3.git
cd assistente-financeiro-v3
```

### 2. Instale as dependências
```bash
npm install
```

### 3. Configure variáveis de ambiente
```bash
cp .env.example .env
```

Edite `.env` com suas credenciais:
```env
GOOGLE_CLIENT_ID=seu-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=seu-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
PORT=3000
NODE_ENV=development
SESSION_SECRET=seu-secret-super-seguro-mude-em-producao
```

### 4. Inicie o servidor
```bash
# Desenvolvimento (com reload automático)
npm run dev

# Produção
npm start
```

### 5. Acesse a aplicação
```
http://localhost:3000
```

## 📖 Guia de Uso

### Dashboard
- Visualize saldo atual, gastos do mês e contas pendentes
- Acompanhe fluxo de caixa em tempo real
- Receba alertas de vencimentos

### Lançamentos
- **Novo Lançamento**: Registre receitas ou despesas
- **Filtros Avançados**: Busque por descrição, categoria ou tipo
- **Edição Rápida**: Clique no ícone ✏️ para editar
- **Exportação**: CSV ou PDF com resumo completo

### Metas
- Acompanhe progresso das 3 metas sugeridas
- Customize suas próprias metas
- Receba dicas de planejamento automático

### Relatórios
- Total de entradas e saídas
- Distribuição por categoria (gráfico tipo donuts)
- Resumo mensal com análises

### Conquistas
- Desbloqueie 10 badges diferentes
- Veja notificações quando atingir metas
- Acompanhe progresso gamificado

### Google Drive
- **Login**: Clique em "Entrar com Google"
- **Backup**: Salve dados no Drive com um clique
- **Restaurar**: Recupere backups anteriores
- **Offline**: App funciona 100% sem internet

## 🔑 Funcionalidades Técnicas Avançadas

### Autenticação OAuth 2.0
```javascript
// Fluxo seguro:
// 1. Usuário clica em "Entrar com Google"
// 2. Redireciona para Google (login seguro)
// 3. Google redireciona com código de autorização
// 4. Backend troca código por access_token
// 5. Token armazenado em sessão (httpOnly cookie)
// 6. Acesso ao Drive garantido
```

### Backup Automático
```javascript
// Processa:
// 1. Coleta estado do app (transactions, reminders)
// 2. Serializa para JSON
// 3. Procura arquivo anterior no Drive
// 4. Atualiza ou cria novo arquivo
// 5. Registra timestamp do backup
```

### Service Worker (Offline)
```javascript
// Estratégia Cache-First + Network:
// 1. Assets estáticos: servidos do cache
// 2. API calls: tenta rede, cai para cache
// 3. Sincronização: background sync quando reconectar
// 4. Notificações: alerts via push notifications
```

### Validação Backend
```javascript
// Valida ANTES de salvar:
// - Tipo (income/expense)
// - Descrição (obrigatória, <100 chars)
// - Valor (positivo, <1M)
// - Data (formato ISO)
// - Categoria (obrigatória)
```

## 📊 Estrutura de Dados

### State
```javascript
{
  sync: {
    connected: boolean,
    lastBackup: string | null,
    email: string,
    driveFileId: string
  },
  transactions: [
    {
      id: string (UUID),
      type: 'income' | 'expense',
      description: string,
      category: string,
      expenseKind: string,
      date: string (YYYY-MM-DD),
      amount: number
    }
  ],
  reminders: [
    {
      id: string,
      title: string,
      dueDate: string,
      amount: number
    }
  ]
}
```

## 🎨 Temas & Customização

### Cores
- **Primária**: #01696f (azul-verde)
- **Sucesso**: #437a22 (verde)
- **Aviso**: #964219 (laranja)
- **Erro**: #a13544 (vermelho)
- **Azul**: #006494

### CSS Variables
Todas as cores, espaçamentos e raios podem ser customizados em `:root` no `index.html`

## 🧪 Testes Locais

### Cenários de Teste

1. **Login com Google**
   - Clique em "Entrar com Google"
   - Selecione sua conta Google
   - Autorize o acesso ao Drive

2. **Registrar Transação**
   - Vá para "Lançamentos"
   - Preencha tipo, descrição, categoria, valor
   - Clique "Salvar Lançamento"

3. **Fazer Backup**
   - Esteja logado no Google
   - Clique "Backup agora"
   - Verifique no Google Drive

4. **Modo Offline**
   - Registre transações
   - Desconecte a internet
   - App continua funcionando normalmente
   - Dados sincronizam quando voltar online

5. **Desbloqueio de Badges**
   - Registre 1 transação (desbloqueie "Primeiro Voo")
   - Acumule R$ 1.000 (desbloqueie "Mil Reais")
   - Faça um backup (desbloqueie "Seguro na Nuvem")

## 🚨 Troubleshooting

### "Erro ao obter autorização do Google"
**Causa**: Client ID inválido ou origem não autorizada
**Solução**:
- Verifique GOOGLE_CLIENT_ID em .env
- Adicione `http://localhost:3000` em URIs autorizados no Cloud Console
- Limpe cache do navegador

### "Erro ao fazer upload para o Drive"
**Causa**: Token expirou ou permissão revogada
**Solução**:
- Faça logout: clique "Logout"
- Faça login novamente
- Autorize o acesso ao Drive

### "Service Worker não registrado"
**Causa**: HTTPS necessário em produção
**Solução**: Em dev, HTTP funciona. Em produção, use HTTPS obrigatoriamente

### "Dados não sincronizam"
**Causa**: Sessão expirada
**Solução**:
- Abra DevTools (F12)
- Vá para Application > Cookies
- Verifique se `connect.sid` existe
- Se não, faça login novamente

## 📦 Deploy (Vercel/Heroku/Railway)

### Variáveis de Ambiente Produção
```env
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=https://seu-dominio.com/api/auth/google/callback
PORT=3000
NODE_ENV=production
SESSION_SECRET=seu-secret-aleatorio-muito-seguro
```

### Vercel
```bash
npm install -g vercel
vercel --env GOOGLE_CLIENT_ID=xxx --env GOOGLE_CLIENT_SECRET=xxx
```

### Railway
```bash
railway link
railway up
```

### Heroku
```bash
heroku create seu-app
git push heroku main
heroku config:set GOOGLE_CLIENT_ID=xxx
```

## 🤝 Contribuições

Contribuições são bem-vindas! Para reportar bugs ou sugerir features:

1. Abra uma [Issue](https://github.com/superiosuktra/assistente-financeiro-v3/issues)
2. Descreva o problema/sugestão detalhadamente
3. Se possível, forneça print/video
4. Faça um Fork e submeta um Pull Request

## 📜 Licença

MIT License - veja [LICENSE](LICENSE) para detalhes

## 👤 Autor

**Erick Moreira**
- GitHub: [@superiosuktra](https://github.com/superiosuktra)
- Email: erickmoreiraguimaraes@gmail.com

## 🙏 Agradecimentos

- Google APIs por OAuth 2.0 e Drive API
- Chart.js por gráficos interativos
- Comunidade open source

## 📞 Suporte

Precisa de ajuda? Abra uma [Issue](https://github.com/superiosuktra/assistente-financeiro-v3/issues) com:
- Descrição clara do problema
- Passos para reproduzir
- Seu ambiente (OS, Node version, browser)
- Screenshots/logs se possível

---

**⭐ Se este projeto ajudou você, considere dar uma estrela!**