const express = require('express');
const path = require('path');

const app = express();

// Servir instalador PWA
app.get('/install', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'install.html'));
});

// QR Code endpoint
app.get('/api/install-qr', (req, res) => {
  const baseUrl = req.headers.host || 'localhost:3000';
  const installUrl = `${req.protocol}://${baseUrl}`;
  
  // Gerar QR code simples
  res.json({
    url: installUrl,
    qrCode: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(installUrl)}`
  });
});

module.exports = app;