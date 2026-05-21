require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const { google } = require('googleapis');
const axios = require('axios');
const path = require('path');

const app = express();
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
    maxAge: 24 * 60 * 60 * 1000 // 24h
  }
}));

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

// ===== ROTAS DE AUTENTICAÇÃO =====

/**
 * GET /api/auth/google
 * Inicia o fluxo de autenticação OAuth 2.0
 */
app.get('/api/auth/google', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/userinfo.email'],
    prompt: 'consent'
  });
  res.json({ authUrl });
});

/**
 * GET /api/auth/google/callback
 * Callback após consentimento do usuário
 */
app.get('/api/auth/google/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Código de autorização não fornecido' });
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Obtém informações do usuário
    const userinfo = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });

    // Armazena na sessão
    req.session.tokens = tokens;
    req.session.user = {
      email: userinfo.data.email,
      id: userinfo.data.id,
      name: userinfo.data.name
    };

    // Redireciona para o frontend
    res.redirect(`/auth-success?email=${encodeURIComponent(userinfo.data.email)}`);
  } catch (error) {
    console.error('Erro no callback OAuth:', error.message);
    res.redirect(`/auth-error?message=${encodeURIComponent(error.message)}`);
  }
});

/**
 * GET /api/auth/logout
 * Encerra a sessão
 */
app.get('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Erro ao fazer logout' });
    res.json({ success: true, message: 'Logout realizado' });
  });
});

/**
 * GET /api/auth/status
 * Retorna o status da autenticação
 */
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

/**
 * Middleware para verificar autenticação
 */
const requireAuth = (req, res, next) => {
  if (!req.session.tokens) {
    return res.status(401).json({ error: 'Não autenticado. Faça login primeiro.' });
  }
  oauth2Client.setCredentials(req.session.tokens);
  next();
};

/**
 * POST /api/drive/upload
 * Faz upload do backup para o Google Drive
 */
app.post('/api/drive/upload', requireAuth, async (req, res) => {
  try {
    const { data, fileName = 'assistente-financeiro-backup.json' } = req.body;

    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Dados inválidos' });
    }

    // Validar tamanho (máx 5MB)
    const jsonStr = JSON.stringify(data);
    if (jsonStr.length > 5 * 1024 * 1024) {
      return res.status(413).json({ error: 'Backup muito grande (máx 5MB)' });
    }

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Procura arquivo existente
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
      // Atualiza arquivo existente
      result = await drive.files.update({
        fileId,
        media,
        fields: 'id, name, modifiedTime'
      });
    } else {
      // Cria novo arquivo
      result = await drive.files.create({
        resource: { name: fileName, mimeType: 'application/json' },
        media,
        fields: 'id, name, modifiedTime'
      });
      fileId = result.data.id;
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

/**
 * GET /api/drive/download
 * Baixa o backup do Google Drive
 */
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

/**
 * GET /api/drive/files
 * Lista arquivos de backup no Drive
 */
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

/**
 * DELETE /api/drive/files/:fileId
 * Deleta um arquivo do Drive
 */
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

/**
 * POST /api/validate/transaction
 * Valida um lançamento antes de salvar
 */
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
    uptime: process.uptime()
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

app.listen(PORT, () => {
  console.log(`\n🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log(`📁 Google Drive API habilitada`);
  console.log(`🔐 Autenticação OAuth 2.0 configurada\n`);
});

module.exports = app;