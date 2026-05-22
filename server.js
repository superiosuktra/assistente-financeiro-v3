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

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  throw new Error('❌ GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET são obrigatórios no .env');
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

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

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
      console.error('Erro ao processar mensagem WebSocket:', error);
    }
  });

  ws.on('close', () => {
    connectedClients.delete(clientId);
    console.log(`📱 Cliente desconectado: ${clientId}`);
  });

  ws.on('error', (error) => {
    console.error('Erro WebSocket:', error);
  });
});

function broadcastToUser(userId, message) {
  const clients = Array.from(connectedClients.values());
  const userClients = clients.filter(c => c.userId === userId && c.ws.readyState === WebSocket.OPEN);
  
  userClients.forEach(client => {
    try {
      client.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
    }
  });
}

// ===== ROTAS DE AUTENTICAÇÃO =====

app.get('/api/auth/google', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/userinfo.email'],
    prompt: 'consent'
  });
  res.json({ authUrl });
});

app.get('/api/auth/google/callback', async (req, res) => {
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
    console.error('Erro no callback OAuth:', error.message);
    res.redirect(`/auth-error?message=${encodeURIComponent(error.message)}`);
  }
});

app.get('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Erro ao fazer logout' });
    res.json({ success: true, message: 'Logout realizado' });
  });
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
    if (jsonStr.length > 5 * 1024 * 1024) {
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
    console.error('Erro ao fazer upload:', error.message);
    res.status(500).json({ error: `Erro ao fazer upload: ${error.message}` });
  }
});

app.get('/api/drive/download', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.query;

    if (!fileId) {
      return res.status(400).json({ error: 'fileId é obrigatório' });
    }

    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    res.setHeader('Content-Type', 'application/json');
    response.data.pipe(res);
  } catch (error) {
    console.error('Erro ao baixar backup:', error.message);
    res.status(500).json({ error: `Erro ao baixar backup: ${error.message}` });
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
    console.error('Erro ao listar arquivos:', error.message);
    res.status(500).json({ error: `Erro ao listar arquivos: ${error.message}` });
  }
});

app.delete('/api/drive/files/:fileId', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;

    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    await drive.files.delete({ fileId });

    res.json({ success: true, message: 'Arquivo deletado' });
  } catch (error) {
    console.error('Erro ao deletar arquivo:', error.message);
    res.status(500).json({ error: `Erro ao deletar arquivo: ${error.message}` });
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
  if (isNaN(amount) || amount <= 0) {
    errors.push('Valor deve ser maior que zero');
  }
  if (amount > 1000000) {
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
    websocket: wss.clients.size + ' conectados'
  });
});

// ===== TRATAMENTO DE ERROS =====
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log(`📱 PWA: http://localhost:${PORT}`);
  console.log(`🔄 WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`🔐 Autenticação OAuth 2.0 configurada`);
  console.log(`☁️  Google Drive API habilitada\n`);
});

module.exports = server;