require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const crypto = require('crypto');
const FormData = require('form-data');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;
const CLIENT_ID = process.env.TERABOX_CLIENT_ID;
const CLIENT_SECRET = process.env.TERABOX_CLIENT_SECRET;
const REDIRECT_URI = process.env.TERABOX_REDIRECT_URI;
const TARGET_DIR = process.env.TERABOX_TARGET_DIR || '/Apps/RecebimentoJSL';

const TERABOX_AUTH_BASE = 'https://www.terabox.com';
const TERABOX_API_BASE = 'https://www.terabox.com/rest/2.0';

let teraboxToken = null;

function ensureConfig() {
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    const err = new Error('Variáveis TERABOX_CLIENT_ID/SECRET/REDIRECT_URI não configuradas.');
    err.statusCode = 500;
    throw err;
  }
}

function ensureToken() {
  if (!teraboxToken) {
    const err = new Error('TeraBox não autenticado. Acesse /auth/terabox primeiro.');
    err.statusCode = 401;
    throw err;
  }
}

function buildTxtBuffer(content) {
  return Buffer.from(content, 'utf8');
}

function sha1Buffer(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

async function preUpload({ accessToken, fileName, fileBuffer }) {
  const filePath = `${TARGET_DIR}/${fileName}`;
  const response = await axios.post(`${TERABOX_API_BASE}/xpan/file`, null, {
    params: {
      method: 'precreate',
      access_token: accessToken,
      path: filePath,
      size: fileBuffer.length,
      isdir: 0,
      autoinit: 1,
      block_list: JSON.stringify([sha1Buffer(fileBuffer)]),
    },
  });
  return response.data;
}

async function uploadPart({ accessToken, uploadId, filePath, fileBuffer, partSeq = 0 }) {
  const formData = new FormData();
  formData.append('file', fileBuffer, { filename: 'part0' });

  const response = await axios.post(`${TERABOX_API_BASE}/pcs/superfile2`, formData, {
    params: {
      method: 'upload',
      type: 'tmpfile',
      access_token: accessToken,
      path: filePath,
      uploadid: uploadId,
      partseq: partSeq,
    },
    headers: formData.getHeaders(),
    maxBodyLength: Infinity,
  });

  return response.data;
}

async function createFile({ accessToken, fileName, fileBuffer, uploadId }) {
  const filePath = `${TARGET_DIR}/${fileName}`;
  const response = await axios.post(`${TERABOX_API_BASE}/xpan/file`, null, {
    params: {
      method: 'create',
      access_token: accessToken,
      path: filePath,
      size: fileBuffer.length,
      isdir: 0,
      uploadid: uploadId,
      block_list: JSON.stringify([sha1Buffer(fileBuffer)]),
    },
  });
  return response.data;
}

app.get('/health', (req, res) => {
  res.json({ ok: true, teraboxConnected: !!teraboxToken });
});

app.get('/auth/terabox', (req, res) => {
  try {
    ensureConfig();
    const authUrl = `${TERABOX_AUTH_BASE}/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(CLIENT_ID)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
    res.redirect(authUrl);
  } catch (error) {
    res.status(error.statusCode || 500).send(error.message);
  }
});

app.get('/auth/terabox/callback', async (req, res) => {
  try {
    ensureConfig();
    const { code } = req.query;
    if (!code) return res.status(400).send('Código de autorização não recebido.');

    const tokenResponse = await axios.post(`${TERABOX_AUTH_BASE}/oauth2/token`, null, {
      params: {
        grant_type: 'authorization_code',
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
      },
    });

    teraboxToken = tokenResponse.data.access_token;
    res.send('TeraBox conectado com sucesso.');
  } catch (error) {
    console.error('Erro callback TeraBox:', error?.response?.data || error.message);
    res.status(500).send('Erro ao autenticar com o TeraBox.');
  }
});

app.post('/exportar-txt-terabox', async (req, res) => {
  try {
    ensureConfig();
    ensureToken();

    const { fileName, content } = req.body;
    if (!fileName || !content) {
      return res.status(400).json({ success: false, error: 'fileName e content são obrigatórios.' });
    }

    const fileBuffer = buildTxtBuffer(content);
    const filePath = `${TARGET_DIR}/${fileName}`;

    const pre = await preUpload({ accessToken: teraboxToken, fileName, fileBuffer });
    const uploadId = pre.uploadid || pre.uploadId;
    if (!uploadId) {
      return res.status(500).json({ success: false, error: 'Pre-upload sem uploadId.', details: pre });
    }

    const uploaded = await uploadPart({ accessToken: teraboxToken, uploadId, filePath, fileBuffer, partSeq: 0 });
    const created = await createFile({ accessToken: teraboxToken, fileName, fileBuffer, uploadId });

    return res.json({ success: true, message: 'TXT enviado ao TeraBox com sucesso.', preUpload: pre, uploadPart: uploaded, createFile: created });
  } catch (error) {
    console.error('Erro exportar TXT TeraBox:', error?.response?.data || error.message);
    const status = error.statusCode || error?.response?.status || 500;
    return res.status(status).json({ success: false, error: 'Falha ao enviar TXT ao TeraBox.', details: error?.response?.data || error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor backend em http://localhost:${PORT}`);
});
