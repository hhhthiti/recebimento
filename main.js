const SUPABASE_URL = 'https://qkdonbbvafdbooyjjmwb.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_JYiZBz-B3k7pdY3Ivobn0w_Jz7zIWNx';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const state = {
  user: null,
  currentInvoice: null,
  invoices: [],
  logs: [],
  chats: [],
  mode: 'supabase',
};

const localDb = {
  key: 'rcv-local-db',
  read() {
    return JSON.parse(localStorage.getItem(this.key) || '{"usuarios":[],"notas":[],"conferencias":[],"logs":[],"chats":[]}');
  },
  write(data) {
    localStorage.setItem(this.key, JSON.stringify(data));
  },
  nextId(items) {
    return (items.at(-1)?.id || 0) + 1;
  },
};

const qs = (id) => document.getElementById(id);
const authSection = qs('authSection');
const adminSection = qs('adminSection');
const operacaoSection = qs('operacaoSection');

const registerForm = qs('registerForm');
const loginForm = qs('loginForm');
const uploadXmlForm = qs('uploadXmlForm');
const conferenciaForm = qs('conferenciaForm');
const notaSelect = qs('notaSelect');

const invoicePreview = qs('invoicePreview');
const logsContainer = qs('logsContainer');
const adminConferencias = qs('adminConferencias');
const notaInfo = qs('notaInfo');

function isSchemaMissingError(error) {
  const msg = error?.message || '';
  return msg.includes('schema cache') || msg.includes('Could not find the table') || msg.includes('relation') || msg.includes('does not exist');
}

async function maybeSwitchToLocalMode(error) {
  if (!error || !isSchemaMissingError(error) || state.mode === 'local') return false;
  state.mode = 'local';
  alert('As tabelas do Supabase ainda não existem. O sistema entrou em MODO LOCAL para você conseguir testar agora.\n\nPara usar banco online, rode o arquivo supabase-schema.sql no SQL Editor do Supabase.');
  return true;
}

async function dbSelect(table, options = {}) {
  if (state.mode === 'local') {
    const db = localDb.read();
    let rows = [...(db[table] || [])];
    if (options.eq) {
      for (const [k, v] of Object.entries(options.eq)) rows = rows.filter((r) => String(r[k]) === String(v));
    }
    if (options.orderBy) {
      rows.sort((a, b) => (new Date(b[options.orderBy]) - new Date(a[options.orderBy])));
    }
    if (options.single) return rows[0] || null;
    return rows;
  }

  let query = supabase.from(table).select('*');
  if (options.eq) {
    for (const [k, v] of Object.entries(options.eq)) query = query.eq(k, v);
  }
  if (options.orderBy) query = query.order(options.orderBy, { ascending: false });
  if (options.single) query = query.single();

  const { data, error } = await query;
  if (await maybeSwitchToLocalMode(error)) return dbSelect(table, options);
  if (error) throw error;
  return data;
}

async function dbInsert(table, payload) {
  if (state.mode === 'local') {
    const db = localDb.read();
    const arr = db[table] || [];
    const item = { ...payload, id: localDb.nextId(arr), created_at: new Date().toISOString() };
    arr.push(item);
    db[table] = arr;
    localDb.write(db);
    return item;
  }

  const { data, error } = await supabase.from(table).insert(payload).select('*').single();
  if (await maybeSwitchToLocalMode(error)) return dbInsert(table, payload);
  if (error) throw error;
  return data;
}

async function dbUpdate(table, match, patch) {
  if (state.mode === 'local') {
    const db = localDb.read();
    db[table] = (db[table] || []).map((r) => Object.entries(match).every(([k, v]) => String(r[k]) === String(v)) ? { ...r, ...patch } : r);
    localDb.write(db);
    return;
  }

  let query = supabase.from(table).update(patch);
  for (const [k, v] of Object.entries(match)) query = query.eq(k, v);
  const { error } = await query;
  if (await maybeSwitchToLocalMode(error)) return dbUpdate(table, match, patch);
  if (error) throw error;
}

async function dbDeleteAll(table) {
  if (state.mode === 'local') {
    const db = localDb.read();
    db[table] = [];
    localDb.write(db);
    return;
  }
  const { error } = await supabase.from(table).delete().neq('id', 0);
  if (await maybeSwitchToLocalMode(error)) return dbDeleteAll(table);
  if (error) throw error;
}

function setUser(user) {
  state.user = user;
  if (user) localStorage.setItem('rcv-user', JSON.stringify(user));
  else localStorage.removeItem('rcv-user');
  renderAuthState();
  if (user) refreshAll();
}

function bootstrapUser() {
  const saved = localStorage.getItem('rcv-user');
  if (saved) {
    state.user = JSON.parse(saved);
    renderAuthState();
    refreshAll();
  }
}

async function verifySupabaseSchema() {
  try {
    await dbSelect('usuarios', { orderBy: 'created_at' });
  } catch (error) {
    await maybeSwitchToLocalMode(error);
  }
}

function renderAuthState() {
  const user = state.user;
  authSection.classList.toggle('hidden', !!user);
  adminSection.classList.toggle('hidden', !user || user.role !== 'adm');
  operacaoSection.classList.toggle('hidden', !user || user.role !== 'operacao');
  document.title = state.mode === 'local' ? 'Recebimento (MODO LOCAL)' : 'Recebimento e Conferência';
}

function parseXmlText(xmlText) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, 'application/xml');
  const text = (tag) => xml.getElementsByTagName(tag)[0]?.textContent?.trim() || '';
  const nodes = Array.from(xml.getElementsByTagName('det'));

  const items = nodes.map((detNode) => {
    const prod = detNode.getElementsByTagName('prod')[0];
    const get = (tag) => prod?.getElementsByTagName(tag)[0]?.textContent?.trim() || '';
    return {
      codigo: get('cProd'),
      descricao: get('xProd'),
      quantidadeFardo: Number(get('qCom') || 0),
      unidade: get('uCom') || 'UND',
      quantidadePalete: Number((Number(get('qCom') || 0) / 80).toFixed(2)),
    };
  });

  return {
    numeroNota: text('nNF') || text('chNFe').slice(-9),
    chave: text('chNFe'),
    emissao: text('dhEmi'),
    emitente: text('xNome'),
    valorTotal: Number(text('vNF') || text('vNFTot') || 0),
    items,
    transporte: extractTransportInfo(xml),
    rawXml: xmlText,
  };
}

function extractTransportInfo(xml) {
  const text = (tag) => xml.getElementsByTagName(tag)[0]?.textContent?.trim() || '';
  const infCpl = text('infCpl');
  const motorista = text('xNome') || text('xContato') || '-';
  const telefoneByTag = text('fone');
  const telefoneByText = infCpl.match(/(?:fone|telefone)[:\\s]*(\\+?\\d{10,14})/i)?.[1] || '';
  const placaByTag = text('placa') || text('xPlaca');
  const placaByText = infCpl.match(/\\b[A-Z]{3}[0-9][A-Z0-9][0-9]{2}\\b/i)?.[0] || '';

  return {
    motorista: motorista || '-',
    telefone: telefoneByTag || telefoneByText || '-',
    placa: placaByTag || placaByText || '-',
  };
}

async function registerUser(evt) {
  evt.preventDefault();
  const form = new FormData(registerForm);
  const payload = {
    matricula: form.get('matricula'),
    senha: form.get('senha'),
    role: form.get('role'),
    email: form.get('email') || null,
    telefone: form.get('telefone') || null,
  };

  try {
    await dbInsert('usuarios', payload);
    alert(`Usuário cadastrado com sucesso! (${state.mode.toUpperCase()})`);
    registerForm.reset();
  } catch (error) {
    alert(`Erro ao cadastrar: ${error.message}`);
  }
}

async function login(evt) {
  evt.preventDefault();
  const form = new FormData(loginForm);
  const matricula = form.get('matricula');
  const senha = form.get('senha');

  try {
    const data = await dbSelect('usuarios', { eq: { matricula, senha }, single: true });
    if (!data) return alert('Matrícula ou senha inválida.');
    setUser(data);
  } catch (error) {
    alert(`Erro no login: ${error.message}`);
  }
}

async function publishInvoice(evt) {
  evt.preventDefault();
  const file = qs('xmlFile').files[0];
  if (!file) return alert('Selecione um XML.');

  const xmlText = await file.text();
  const nota = parseXmlText(xmlText);
  const form = new FormData(uploadXmlForm);
  const payload = {
    numero_nota: nota.numeroNota,
    chave_nfe: nota.chave,
    motorista: nota.transporte.motorista,
    telefone_motorista: nota.transporte.telefone,
    placa: nota.transporte.placa,
    emitente: nota.emitente,
    emissao: nota.emissao,
    valor_total: nota.valorTotal,
    itens_json: nota.items,
    xml_raw: nota.rawXml,
    publicado_por: state.user.matricula,
  };

  try {
    await dbInsert('notas', payload);
    invoicePreview.textContent = JSON.stringify(nota, null, 2);
    renderPdfPages(nota);
    state.currentInvoice = nota;
    uploadXmlForm.reset();
    alert(`Nota publicada para conferência. (${state.mode.toUpperCase()})`);

    await logAction('PUBLICACAO_NOTA', null, 0, 'Nota publicada pelo ADM', false);
    await loadInvoices();
  } catch (error) {
    alert(`Erro ao publicar nota: ${error.message}`);
  }
}

function renderPdfPages(nota) {
  const page1 = qs('pdfPage1');
  const page2 = qs('pdfPage2');
  if (!page1 || !page2 || !nota) return;

  const formatarNfe = (nfe) => String(nfe || '').padStart(9, '0').replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3');
  const chave = String(nota.chave || '').replace(/\\D/g, '');
  const chaveLegivel = chave.length === 44 ? chave.match(/.{1,4}/g).join(' ') : (nota.chave || '-');

  page1.innerHTML = `
      <div class="pdf-mini"><b>PÁGINA 1/2 - DADOS DA NF-E</b></div>
      <div class="nf-box pdf-mini">
        RECEBIMENTO OPERAÇÃO<br/>
        EMISSÃO: <b>${nota.emissao || '-'}</b> | VALOR TOTAL: <b>${(nota.valorTotal || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</b>
      </div>
      <div class="nf-grid pdf-mini">
        <div class="nf-box"><b>NF-e Nº</b><br>${formatarNfe(nota.numeroNota)}<br><b>Chave:</b> ${nota.chave || '-'}</div>
        <div class="nf-box"><b>Data recebimento</b><div class="line-space"></div><b>Assinatura</b><div class="line-space"></div></div>
      </div>
      <div class="pdf-title">EMITENTE</div>
      <div class="nf-box pdf-mini"><b>${nota.emitente || '-'}</b></div>
      <div class="pdf-title">CHAVE DE ACESSO</div>
      <div class="nf-box pdf-mini">${chaveLegivel}</div>
      <div class="barcode-wrap"><svg id="barcodeChave"></svg></div>
  `;

  page2.innerHTML = `
      <div class="pdf-mini"><b>PÁGINA 2/2 - CONFERÊNCIA / PALETES</b></div>
      <h3>NF-e ${formatarNfe(nota.numeroNota)} - Motorista ${nota.transporte?.motorista || '-'}</h3>
      <table>
        <thead><tr><th>CÓDIGO</th><th>DESCRIÇÃO</th><th>PALETES RECEBIDOS</th></tr></thead>
        <tbody>
          ${(nota.items || []).map((item) => `<tr><td>${item.codigo}</td><td>${item.descricao}</td><td></td></tr>`).join('')}
        </tbody>
      </table>
  `;

  if (window.JsBarcode && chave.length === 44) {
    window.JsBarcode('#barcodeChave', chave, { format: 'CODE128', width: 1.2, height: 44, displayValue: true, margin: 0 });
  }

  const form = uploadXmlForm;
  form.elements.motorista.value = nota.transporte?.motorista || '-';
  form.elements.telefoneMotorista.value = nota.transporte?.telefone || '-';
  form.elements.placa.value = nota.transporte?.placa || '-';
}

async function loadInvoices() {
  try {
    const data = await dbSelect('notas', { orderBy: 'created_at' });
    state.invoices = data || [];

    notaSelect.innerHTML = '';
    state.invoices.forEach((nota) => {
      const option = document.createElement('option');
      option.value = nota.id;
      option.textContent = `${nota.numero_nota}/${nota.placa} - ${nota.motorista}`;
      notaSelect.appendChild(option);
    });

    if (state.invoices.length && state.user?.role === 'operacao') renderOperacaoInvoice(state.invoices[0].id);
  } catch (error) {
    console.error(error);
  }
}

function renderOperacaoInvoice(notaId) {
  const nota = state.invoices.find((n) => String(n.id) === String(notaId));
  if (!nota) {
    notaInfo.textContent = 'Nenhuma nota disponível';
    conferenciaForm.innerHTML = '';
    return;
  }

  notaInfo.innerHTML = `<p><strong>Motorista:</strong> ${nota.motorista}</p>
  <p><strong>Telefone:</strong> ${nota.telefone_motorista}</p>
  <p><strong>Placa:</strong> ${nota.placa}</p>`;

  conferenciaForm.innerHTML = '';
  nota.itens_json.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `<p><strong>${item.codigo}</strong> - ${item.descricao}</p>
      <label>Quantidade conferida
      <input type="number" step="0.01" min="0" required name="${item.codigo}" />
      </label>`;
    conferenciaForm.appendChild(div);
  });

  const obs = document.createElement('label');
  obs.innerHTML = `Observação
    <textarea name="observacao" placeholder="Opcional"></textarea>`;
  conferenciaForm.appendChild(obs);

  const btn = document.createElement('button');
  btn.type = 'submit';
  btn.textContent = 'Enviar conferência';
  conferenciaForm.appendChild(btn);
  conferenciaForm.dataset.notaId = nota.id;
}

async function submitConferencia(evt) {
  evt.preventDefault();
  const notaId = conferenciaForm.dataset.notaId;
  const nota = state.invoices.find((n) => String(n.id) === String(notaId));
  if (!nota) return;
  if (!confirm('Tem certeza que deseja terminar a conferência?')) return;

  const form = new FormData(conferenciaForm);
  const conferidos = nota.itens_json.map((item) => {
    const informado = Number(form.get(item.codigo) || 0);
    return { ...item, conferido: informado, divergencia: Number((informado - Number(item.quantidadeFardo)).toFixed(2)) };
  });

  const divergentes = conferidos.filter((c) => c.divergencia !== 0);
  let status = 'ok';
  if (divergentes.length) {
    const codigos = divergentes.map((d) => d.codigo).join(', ');
    if (!confirm(`Há divergência nos códigos: ${codigos}. Finalizar mesmo assim?`)) return;
    status = 'com_divergencia';
  }

  try {
    await dbInsert('conferencias', {
      nota_id: nota.id,
      conferente_matricula: state.user.matricula,
      observacao: form.get('observacao') || null,
      itens_conferidos: conferidos,
      status,
    });

    for (const item of divergentes) {
      await logAction('DIVERGENCIA', item.codigo, item.divergencia, `Nota ${nota.numero_nota}`, true);
    }
    if (!divergentes.length) await logAction('CONFERENCIA_OK', null, 0, `Nota ${nota.numero_nota} sem divergências`, false);

    alert(`Conferência enviada com sucesso. (${state.mode.toUpperCase()})`);
    conferenciaForm.reset();
  } catch (error) {
    alert(`Erro ao enviar conferência: ${error.message}`);
  }
}

async function logAction(tipo, codigo, quantidadeDivergencia, mensagem, divergente) {
  await dbInsert('logs', {
    tipo,
    codigo,
    quantidade_divergencia: quantidadeDivergencia,
    mensagem,
    divergente,
    usuario_matricula: state.user?.matricula || 'sistema',
  });
  await loadLogs();
}

async function loadLogs() {
  const data = await dbSelect('logs', { orderBy: 'created_at' });
  state.logs = data || [];
  logsContainer.innerHTML = '';
  state.logs.forEach((log) => {
    const row = document.createElement('div');
    row.className = `log ${log.divergente ? 'divergente' : ''}`;
    row.innerHTML = `<strong>${new Date(log.created_at).toLocaleString('pt-BR')}</strong> - usuário ${log.usuario_matricula} - ${log.tipo} - cód: ${log.codigo || '-'} - divergência: ${log.quantidade_divergencia || 0}<br/>${log.mensagem || ''}`;
    logsContainer.appendChild(row);
  });
}

async function loadConferencias() {
  const data = await dbSelect('conferencias', { orderBy: 'created_at' });
  adminConferencias.innerHTML = '';
  (data || []).forEach((conf) => {
    const div = document.createElement('div');
    const divergencias = (conf.itens_conferidos || []).filter((i) => i.divergencia !== 0);
    div.className = `conferencia ${divergencias.length ? 'divergente' : ''}`;
    div.innerHTML = `<p><strong>Conferente:</strong> ${conf.conferente_matricula}</p>
      <p><strong>Status:</strong> ${conf.status}</p>
      <p><strong>Observação:</strong> ${conf.observacao || '-'}</p>
      <p><strong>Divergências:</strong> ${divergencias.map((d) => `${d.codigo} (${d.divergencia})`).join(', ') || 'Nenhuma'}</p>`;
    adminConferencias.appendChild(div);
  });
}

async function recoverBySms() {
  const matricula = prompt('Informe a matrícula');
  if (!matricula) return;
  const telefone = prompt('Informe o telefone cadastrado (com DDI)');
  if (!telefone) return;

  const novaSenha = Math.random().toString(36).slice(-8);
  try {
    await dbUpdate('usuarios', { matricula, telefone }, { senha: novaSenha });
    if (state.mode === 'supabase') {
      await supabase.functions.invoke('send-sms', { body: { to: telefone, message: `Nova senha: ${novaSenha}` } });
    }
    alert(`Senha resetada. ${state.mode === 'supabase' ? 'SMS solicitado à edge function.' : 'MODO LOCAL: exiba a senha ao usuário.'}\nNova senha: ${novaSenha}`);
  } catch (error) {
    alert(`Erro: ${error.message}`);
  }
}

async function recoverByEmail() {
  const matricula = prompt('Informe a matrícula');
  if (!matricula) return;

  const novaSenha = Math.random().toString(36).slice(-8);
  try {
    await dbUpdate('usuarios', { matricula }, { senha: novaSenha });
    if (state.mode === 'supabase') {
      await supabase.functions.invoke('send-email', {
        body: { to: 'leseliv487@fengnu.com', subject: 'Nova senha', text: `Nova senha: ${novaSenha}` },
      });
    }
    alert(`Senha resetada. ${state.mode === 'supabase' ? 'Email solicitado à edge function.' : 'MODO LOCAL: exiba a senha ao usuário.'}\nNova senha: ${novaSenha}`);
  } catch (error) {
    alert(`Erro: ${error.message}`);
  }
}

function exportLogs() {
  const blob = new Blob([JSON.stringify(state.logs, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `logs-${new Date().toISOString()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function clearLogs() {
  if (!confirm('Deseja apagar todos os logs?')) return;
  await dbDeleteAll('logs');
  await loadLogs();
}

async function generatePdfFromPages() {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF || !window.html2canvas) {
    alert('Bibliotecas de PDF não carregadas.');
    return;
  }
  const pages = [qs('pdfPage1'), qs('pdfPage2')].filter(Boolean);
  if (!pages.length || !pages[0].innerHTML.trim()) {
    alert('Carregue um XML antes de gerar PDF.');
    return;
  }
  const pdf = new jsPDF('p', 'mm', 'a4');
  for (let i = 0; i < pages.length; i += 1) {
    const canvas = await window.html2canvas(pages[i], { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    const img = canvas.toDataURL('image/png');
    const prop = pdf.getImageProperties(img);
    const margin = 6;
    const maxW = 210 - margin * 2;
    const maxH = 297 - margin * 2;
    let w = maxW;
    let h = (prop.height * w) / prop.width;
    if (h > maxH) {
      h = maxH;
      w = (prop.width * h) / prop.height;
    }
    const x = (210 - w) / 2;
    if (i > 0) pdf.addPage();
    pdf.addImage(img, 'PNG', x, margin, w, h);
  }
  const nfe = String(state.currentInvoice?.numeroNota || 'sem-nfe').padStart(9, '0').slice(-9);
  pdf.save(`recebimento-nfe-${nfe}.pdf`);
}

function printInvoice() {
  generatePdfFromPages();
}

function toggleChat() {
  qs('chatPanel').classList.toggle('hidden');
}

async function sendChat(evt) {
  evt.preventDefault();
  const input = qs('chatInput');
  const text = input.value.trim();
  if (!text) return;

  const destinoRole = state.user.role === 'adm' ? 'operacao' : 'adm';
  await dbInsert('chats', {
    from_matricula: state.user.matricula,
    from_role: state.user.role,
    to_role: destinoRole,
    mensagem: text,
  });
  input.value = '';
  await loadChats();
}

async function loadChats() {
  if (!state.user) return;
  const data = await dbSelect('chats', { orderBy: 'created_at' });
  state.chats = (data || []).filter((msg) => msg.to_role === state.user.role || msg.from_matricula === state.user.matricula);

  const chatMessages = qs('chatMessages');
  chatMessages.innerHTML = '';
  state.chats
    .slice()
    .reverse()
    .forEach((m) => {
      const p = document.createElement('p');
      p.className = m.from_matricula === state.user.matricula ? 'mine' : 'theirs';
      p.textContent = `${m.from_matricula}: ${m.mensagem}`;
      chatMessages.appendChild(p);
    });
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function refreshAll() {
  await loadInvoices();
  await loadLogs();
  await loadConferencias();
  await loadChats();
}

registerForm.addEventListener('submit', registerUser);
loginForm.addEventListener('submit', login);
uploadXmlForm.addEventListener('submit', publishInvoice);
conferenciaForm.addEventListener('submit', submitConferencia);
notaSelect.addEventListener('change', (evt) => renderOperacaoInvoice(evt.target.value));

qs('recoverSms').addEventListener('click', recoverBySms);
qs('recoverEmail').addEventListener('click', recoverByEmail);
qs('btnExportLogs').addEventListener('click', exportLogs);
qs('btnClearLogs').addEventListener('click', clearLogs);
qs('btnLogout').addEventListener('click', () => setUser(null));
qs('btnPrintInvoice').addEventListener('click', printInvoice);
qs('btnPrintMaterials').addEventListener('click', printInvoice);
qs('chatBubble').addEventListener('click', toggleChat);
qs('chatForm').addEventListener('submit', sendChat);
qs('btnLogs').addEventListener('click', () => logsContainer.scrollIntoView({ behavior: 'smooth' }));
qs('xmlFile').addEventListener('change', async (evt) => {
  const file = evt.target.files?.[0];
  if (!file) return;
  try {
    const xmlText = await file.text();
    const nota = parseXmlText(xmlText);
    state.currentInvoice = nota;
    invoicePreview.textContent = JSON.stringify(nota, null, 2);
    renderPdfPages(nota);
  } catch (error) {
    console.error(error);
  }
});

setInterval(() => {
  if (!state.user) return;
  loadChats();
  if (state.user.role === 'adm') {
    loadConferencias();
    loadLogs();
  }
}, 6000);

(async () => {
  await verifySupabaseSchema();
  bootstrapUser();
})();
