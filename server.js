const express = require('express');
const cors = require('cors');
const session = require('express-session');
const { google } = require('googleapis');
const axios = require('axios');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

const PORT = process.env.PORT || 3000;

// Configuração
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback';
const SESSION_SECRET = process.env.SESSION_SECRET || 'seu-secret-super-seguro';

const GOOGLE_OAUTH_ENABLED = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
if (!GOOGLE_OAUTH_ENABLED) {
  console.warn('⚠️ GOOGLE_CLIENT_ID e/ou GOOGLE_CLIENT_SECRET não definidos — funcionalidades do Google (backup) estarão desabilitadas.');
}

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

const oauth2Client = GOOGLE_OAUTH_ENABLED
  ? new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)
  : null;

// Global error handlers to avoid silent crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason && (reason.stack || reason));
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err && (err.stack || err));
  // Note: in production you might want to exit process after logging
});

// ===== GERENCIAMENTO DE CONEXÕES WEBSOCKET =====
const connectedClients = new Map();

wss.on('connection', (ws, req) => {
  const clientId = require('crypto').randomUUID();
  const sessionId = req.headers['sec-websocket-key'];

  connectedClients.set(clientId, {
    ws,
    sessionId,
    userId: null,
    lastActivity: Date.now()
  });

  console.log(`📱 Cliente conectado: ${clientId}`);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // Registrar usuário
      if (data.type === 'auth' && data.userId) {
        const client = connectedClients.get(clientId);
        if (client) {
          client.userId = data.userId;
        }
      }

      // Broadcast de alterações
      if (data.type === 'dataSync') {
        broadcastToUser(data.userId, {
          type: 'dataUpdate',
          data: data.payload,
          timestamp: Date.now(),
          source: clientId
        });
      }
    } catch (error) {
      console.error('Erro ao processar mensagem WebSocket:', error && (error.stack || error));
    }
  });

  ws.on('close', () => {
    connectedClients.delete(clientId);
    console.log(`📱 Cliente desconectado: ${clientId}`);
  });

  ws.on('error', (error) => {
    console.error('Erro WebSocket:', error && (error.stack || error));
  });
});

function broadcastToUser(userId, message) {
  try {
    const clients = Array.from(connectedClients.values());
    const userClients = clients.filter(c => c.userId === userId && c.ws.readyState === WebSocket.OPEN);

    userClients.forEach(client => {
      try {
        client.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('Erro ao enviar mensagem:', error && (error.stack || error));
      }
    });
  } catch (err) {
    console.error('Erro no broadcastToUser:', err && (err.stack || err));
  }
}

// ===== ROTAS DE AUTENTICAÇÃO =====
app.get('/api/auth/google', (req, res) => {
  if (!GOOGLE_OAUTH_ENABLED || !oauth2Client) {
    return res.status(501).json({ error: 'Google OAuth não configurado no servidor' });
  }

  try {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/userinfo.email'],
      prompt: 'consent'
    });
    res.json({ authUrl });
  } catch (err) {
    console.error('Erro ao gerar URL de autenticação:', err && (err.stack || err));
    res.status(500).json({ error: 'Erro ao iniciar autenticação' });
  }
});

app.get('/api/auth/google/callback', async (req, res) => {
  if (!GOOGLE_OAUTH_ENABLED || !oauth2Client) {
    return res.redirect(`/auth-error?message=${encodeURIComponent('Google OAuth não configurado')}`);
  }

  const { code } = req.query;
  if (!code) {
    return res.status(400).json({ error: 'Código de autorização não fornecido' });
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const userinfo = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });

    req.session.tokens = tokens;
    req.session.user = {
      email: userinfo.data.email,
      id: userinfo.data.id,
      name: userinfo.data.name
    };

    res.redirect(`/auth-success?email=${encodeURIComponent(userinfo.data.email)}`);
  } catch (error) {
    console.error('Erro no callback OAuth:', error && (error.stack || error));
    res.redirect(`/auth-error?message=${encodeURIComponent(error && (error.message || 'erro desconhecido'))}`);
  }
});

app.get('/api/auth/logout', (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: 'Erro ao fazer logout' });
      res.json({ success: true, message: 'Logout realizado' });
    });
  } catch (err) {
    console.error('Erro ao destruir sessão:', err && (err.stack || err));
    res.status(500).json({ error: 'Erro ao fazer logout' });
  }
});

app.get('/api/auth/status', (req, res) => {
  if (!req.session.user) {
    return res.json({ authenticated: false });
  }

  res.json({
    authenticated: true,
    user: req.session.user,
    hasRefreshToken: !!req.session.tokens?.refresh_token
  });
});

// ===== ROTAS DO DRIVE =====
const requireAuth = (req, res, next) => {
  if (!GOOGLE_OAUTH_ENABLED) {
    return res.status(501).json({ error: 'Serviço de backup não disponível (Google não configurado)' });
  }
  if (!req.session.tokens) {
    return res.status(401).json({ error: 'Não autenticado. Faça login primeiro.' });
  }
  oauth2Client.setCredentials(req.session.tokens);
  next();
};

app.post('/api/drive/upload', requireAuth, async (req, res) => {
  try {
    const { data, fileName = 'assistente-financeiro-backup.json' } = req.body;

    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Dados inválidos' });
    }

    const jsonStr = JSON.stringify(data);
    if (Buffer.byteLength(jsonStr, 'utf8') > 5 * 1024 * 1024) {
      return res.status(413).json({ error: 'Backup muito grande (máx 5MB)' });
    }

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const fileList = await drive.files.list({
      q: `name='${fileName}' and trashed=false`,
      spaces: 'drive',
      fields: 'files(id, name, modifiedTime)',
      pageSize: 1
    });

    let fileId = fileList.data.files?.[0]?.id;
    const media = {
      mimeType: 'application/json',
      body: JSON.stringify(data, null, 2)
    };

    let result;
    if (fileId) {
      result = await drive.files.update({
        fileId,
        media,
        fields: 'id, name, modifiedTime'
      });
    } else {
      result = await drive.files.create({
        resource: { name: fileName, mimeType: 'application/json' },
        media,
        fields: 'id, name, modifiedTime'
      });
      fileId = result.data.id;
    }

    // Notificar outros dispositivos
    if (req.session.user) {
      broadcastToUser(req.session.user.id, {
        type: 'backupSync',
        fileId,
        timestamp: result.data.modifiedTime,
        message: 'Backup sincronizado em outro dispositivo'
      });
    }

    res.json({
      success: true,
      fileId,
      fileName: result.data.name,
      lastModified: result.data.modifiedTime,
      message: fileId ? 'Backup atualizado com sucesso' : 'Backup criado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao fazer upload:', error && (error.stack || error));
    res.status(500).json({ error: `Erro ao fazer upload: ${error && (error.message || 'erro desconhecido')}` });
  }
});

app.get('/api/drive/download', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.query;

    if (!fileId) {
      return res.status(400).json({ error: 'fileId é obrigatório' });
    }

    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });

    res.setHeader('Content-Type', 'application/json');

    response.data.on('error', (err) => {
      console.error('Stream de download erro:', err && (err.stack || err));
      if (!res.headersSent) res.status(500).json({ error: 'Erro ao transmitir arquivo' });
      try { res.end(); } catch (e) {}
    });

    res.on('error', (err) => {
      console.error('Erro de resposta ao cliente:', err && (err.stack || err));
    });

    response.data.pipe(res);
  } catch (error) {
    console.error('Erro ao baixar backup:', error && (error.stack || error));
    res.status(500).json({ error: `Erro ao baixar backup: ${error && (error.message || 'erro desconhecido')}` });
  }
});

app.get('/api/drive/files', requireAuth, async (req, res) => {
  try {
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const fileList = await drive.files.list({
      q: `name contains 'assistente-financeiro' and trashed=false`,
      spaces: 'drive',
      fields: 'files(id, name, modifiedTime, size)',
      pageSize: 10,
      orderBy: 'modifiedTime desc'
    });

    res.json({
      files: fileList.data.files || [],
      count: fileList.data.files?.length || 0
    });
  } catch (error) {
    console.error('Erro ao listar arquivos:', error && (error.stack || error));
    res.status(500).json({ error: `Erro ao listar arquivos: ${error && (error.message || 'erro desconhecido')}` });
  }
});

app.delete('/api/drive/files/:fileId', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;

    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    await drive.files.delete({ fileId });

    res.json({ success: true, message: 'Arquivo deletado' });
  } catch (error) {
    console.error('Erro ao deletar arquivo:', error && (error.stack || error));
    res.status(500).json({ error: `Erro ao deletar arquivo: ${error && (error.message || 'erro desconhecido')}` });
  }
});

// ===== ROTAS DE VALIDAÇÃO =====
app.post('/api/validate/transaction', (req, res) => {
  const { type, description, category, amount, date } = req.body;
  const errors = [];

  if (!type || !['income', 'expense'].includes(type)) {
    errors.push('Tipo inválido (deve ser "income" ou "expense")');
  }
  if (!description || description.trim().length < 1) {
    errors.push('Descrição obrigatória');
  }
  if (description && description.length > 100) {
    errors.push('Descrição muito longa (máx 100 caracteres)');
  }
  if (!category || category.trim().length < 1) {
    errors.push('Categoria obrigatória');
  }
  if (isNaN(amount) || Number(amount) <= 0) {
    errors.push('Valor deve ser maior que zero');
  }
  if (Number(amount) > 1000000) {
    errors.push('Valor muito alto (máx R$ 1.000.000)');
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.push('Data inválida (formato: YYYY-MM-DD)');
  }

  if (errors.length > 0) {
    return res.status(400).json({ valid: false, errors });
  }

  res.json({ valid: true });
});

// ===== HEALTH CHECK =====
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    websocket: (wss && wss.clients && typeof wss.clients.size === 'number') ? wss.clients.size + ' conectados' : 'unknown'
  });
});

// ===== TRATAMENTO DE ERROS =====
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err && (err.stack || err));
  if (res.headersSent) return next(err);
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? (err && err.message) : undefined
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log(`📱 PWA: http://localhost:${PORT}`);
  console.log(`🔄 WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`🔐 Autenticação OAuth 2.0 ${GOOGLE_OAUTH_ENABLED ? 'configurada' : 'não configurada'}`);
  console.log(`☁️  Google Drive API ${GOOGLE_OAUTH_ENABLED ? 'habilitada' : 'desabilitada'}\n`);
});

module.exports = server;
