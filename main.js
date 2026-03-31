const SUPABASE_URL = 'https://qkdonbbvafdbooyjjmwb.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_JYiZBz-B3k7pdY3Ivobn0w_Jz7zIWNx';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const state = { user: null, currentInvoice: null, invoices: [], logs: [], chats: [], mode: 'supabase', authView: 'login' };
const localDb = {
  read: () => JSON.parse(localStorage.getItem('rcv-local-db') || '{"usuarios":[],"notas":[],"conferencias":[],"logs":[],"chats":[],"nq_reports":[]}'),
  write: (data) => localStorage.setItem('rcv-local-db', JSON.stringify(data)),
  nextId: (items) => (items.at(-1)?.id || 0) + 1,
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
const adminNqContainer = qs('adminNqContainer');
const notaInfo = qs('notaInfo');

const isSchemaMissingError = (error) => {
  const msg = error?.message || '';
  return msg.includes('schema cache') || msg.includes('Could not find the table') || msg.includes('relation') || msg.includes('does not exist');
};

async function maybeSwitchToLocalMode(error) {
  if (!error || !isSchemaMissingError(error) || state.mode === 'local') return false;
  state.mode = 'local';
  alert('Sem schema do Supabase. Entrando em MODO LOCAL. Rode supabase-schema.sql no SQL Editor para ativar banco online.');
  return true;
}

async function dbSelect(table, options = {}) {
  if (state.mode === 'local') {
    let rows = [...(localDb.read()[table] || [])];
    Object.entries(options.eq || {}).forEach(([k, v]) => { rows = rows.filter((r) => String(r[k]) === String(v)); });
    if (options.orderBy) rows.sort((a, b) => new Date(b[options.orderBy]) - new Date(a[options.orderBy]));
    return options.single ? rows[0] || null : rows;
  }
  let query = supabase.from(table).select('*');
  Object.entries(options.eq || {}).forEach(([k, v]) => { query = query.eq(k, v); });
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
  Object.entries(match).forEach(([k, v]) => { query = query.eq(k, v); });
  const { error } = await query;
  if (await maybeSwitchToLocalMode(error)) return dbUpdate(table, match, patch);
  if (error) throw error;
}

async function dbDeleteAll(table) {
  if (state.mode === 'local') {
    const db = localDb.read(); db[table] = []; localDb.write(db); return;
  }
  const { error } = await supabase.from(table).delete().neq('id', 0);
  if (await maybeSwitchToLocalMode(error)) return dbDeleteAll(table);
  if (error) throw error;
}

function normalizeProductCode(code) {
  const digits = String(code || '').replace(/\D/g, '');
  if (!digits) return String(code || '');
  const idx2 = digits.indexOf('2');
  if (idx2 > 0) return digits.slice(idx2);
  return digits.replace(/^0+/, '') || digits;
}

function setAuthView(view) {
  state.authView = view;
  registerForm.classList.toggle('hidden', view !== 'register');
  loginForm.classList.toggle('hidden', view !== 'login');
}

function setUser(user) {
  state.user = user;
  if (user) localStorage.setItem('rcv-user', JSON.stringify(user));
  else { localStorage.removeItem('rcv-user'); qs('chatPanel').classList.add('hidden'); }
  renderAuthState();
  if (user) refreshAll();
}

function bootstrapUser() {
  const saved = localStorage.getItem('rcv-user');
  if (saved) { state.user = JSON.parse(saved); renderAuthState(); refreshAll(); }
}

async function verifySupabaseSchema() {
  try { await dbSelect('usuarios', { orderBy: 'created_at' }); } catch (error) { await maybeSwitchToLocalMode(error); }
}

function renderAuthState() {
  const user = state.user;
  authSection.classList.toggle('hidden', !!user);
  adminSection.classList.toggle('hidden', !user || user.role !== 'adm');
  operacaoSection.classList.toggle('hidden', !user || user.role !== 'operacao');
  qs('chatBubble').classList.toggle('hidden', !user);
  const isAdm = user?.role === 'adm';
  qs('btnLogs').classList.toggle('hidden', !isAdm);
  qs('btnExportLogs').classList.toggle('hidden', !isAdm);
  qs('btnClearLogs').classList.toggle('hidden', !isAdm);
}

function extractDtRemessa(infCpl) {
  return String(infCpl || '').match(/Numero\s*DT\s*:?\s*(\d+)/i)?.[1] || '';
}

function extractTransportInfo(xml, infCpl) {
  const text = (tag) => xml.getElementsByTagName(tag)[0]?.textContent?.trim() || '';
  const transporta = xml.getElementsByTagName('transporta')[0];
  const motorista = transporta?.getElementsByTagName('xNome')[0]?.textContent?.trim() || text('xContato') || '-';
  const telefoneTag = text('fone') || transporta?.getElementsByTagName('fone')[0]?.textContent?.trim() || '';
  const telefoneText = String(infCpl || '').match(/(\+?\d{10,14})/)?.[1] || '';
  const placaTag = text('placa') || text('xPlaca') || '';
  const placaText = String(infCpl || '').match(/\b[A-Z]{3}[0-9][A-Z0-9][0-9]{2}\b/i)?.[0] || '';
  return { motorista, telefone: telefoneTag || telefoneText || '-', placa: placaTag || placaText || '-' };
}

function parseXmlText(xmlText) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, 'application/xml');
  const text = (tag) => xml.getElementsByTagName(tag)[0]?.textContent?.trim() || '';
  const infCpl = text('infCpl');
  const items = Array.from(xml.getElementsByTagName('det')).map((det) => {
    const prod = det.getElementsByTagName('prod')[0];
    const get = (tag) => prod?.getElementsByTagName(tag)[0]?.textContent?.trim() || '';
    return {
      codigo: normalizeProductCode(get('cProd')),
      descricao: get('xProd'),
      quantidadeFardo: Number(get('qCom') || 0),
      quantidadePalete: Number((Number(get('qCom') || 0) / 80).toFixed(2)),
      ncm: get('NCM'),
      cfop: get('CFOP'),
    };
  });

  return {
    numeroNota: text('nNF') || text('chNFe').slice(-9),
    chave: text('chNFe'), emissao: text('dhEmi'), emitente: text('xNome'), emitenteCnpj: text('CNPJ'),
    destinatario: xml.getElementsByTagName('dest')[0]?.getElementsByTagName('xNome')[0]?.textContent?.trim() || '-',
    destinatarioCnpj: xml.getElementsByTagName('dest')[0]?.getElementsByTagName('CNPJ')[0]?.textContent?.trim() || '-',
    natureza: text('natOp'), protocolo: text('nProt'), valorTotal: Number(text('vNF') || text('vNFTot') || 0),
    pesoBruto: text('pesoB') || '-', volume: text('qVol') || '-', dtRemessa: extractDtRemessa(infCpl),
    items, transporte: extractTransportInfo(xml, infCpl), rawXml: xmlText,
  };
}

async function registerUser(evt) {
  evt.preventDefault();
  const f = new FormData(registerForm);
  try {
    await dbInsert('usuarios', { matricula: f.get('matricula'), senha: f.get('senha'), role: f.get('role'), email: f.get('email') || null, telefone: f.get('telefone') || null });
    alert(`Usuário cadastrado com sucesso! (${state.mode.toUpperCase()})`);
    registerForm.reset();
    setAuthView('login');
  } catch (error) { alert(`Erro ao cadastrar: ${error.message}`); }
}

async function login(evt) {
  evt.preventDefault();
  const f = new FormData(loginForm);
  const data = await dbSelect('usuarios', { eq: { matricula: f.get('matricula'), senha: f.get('senha') }, single: true });
  if (!data) return alert('Matrícula ou senha inválida.');
  setUser(data);
}

function renderPdfPages(nota) {
  const p1 = qs('pdfPage1'); const p2 = qs('pdfPage2'); if (!p1 || !p2 || !nota) return;
  const nfeFmt = String(nota.numeroNota || '').padStart(9, '0').replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3');
  const chave = String(nota.chave || '').replace(/\D/g, '');

  p1.innerHTML = `<div class="pdf-mini"><b>PÁGINA 1/2 - DADOS DA NF-E</b></div>
  <div class="nf-box pdf-mini">EMISSÃO: <b>${nota.emissao || '-'}</b> | VALOR TOTAL: <b>${(nota.valorTotal || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</b><br/>NATUREZA: <b>${nota.natureza || '-'}</b> | PROTOCOLO: <b>${nota.protocolo || '-'}</b></div>
  <div class="nf-grid pdf-mini"><div class="nf-box"><b>NF-e:</b> ${nfeFmt}<br/><b>Chave:</b> ${nota.chave || '-'}</div><div class="nf-box"><b>Motorista:</b> ${nota.transporte.motorista}<br/><b>Telefone:</b> ${nota.transporte.telefone}<br/><b>Placa:</b> ${nota.transporte.placa}<br/><b>DT:</b> ${nota.dtRemessa || '-'}</div></div>
  <div class="nf-box pdf-mini"><b>Emitente:</b> ${nota.emitente} (${nota.emitenteCnpj})<br/><b>Destinatário:</b> ${nota.destinatario} (${nota.destinatarioCnpj})<br/><b>Volume:</b> ${nota.volume} | <b>Peso:</b> ${nota.pesoBruto}</div>
  <div class="barcode-wrap"><svg id="barcodeChave"></svg></div>`;

  p2.innerHTML = `<div class="pdf-mini"><b>PÁGINA 2/2 - CONFERÊNCIA / PALETES</b></div><table><thead><tr><th>Código</th><th>Descrição</th><th>NCM/CFOP</th><th>Paletes</th></tr></thead><tbody>${nota.items.map((i) => `<tr><td>${i.codigo}</td><td>${i.descricao}</td><td>${i.ncm || '-'} / ${i.cfop || '-'}</td><td></td></tr>`).join('')}</tbody></table>`;
  if (window.JsBarcode && chave.length === 44) window.JsBarcode('#barcodeChave', chave, { format: 'CODE128', width: 1.2, height: 44, displayValue: true, margin: 0 });
  uploadXmlForm.elements.motorista.value = nota.transporte.motorista;
  uploadXmlForm.elements.telefoneMotorista.value = nota.transporte.telefone;
  uploadXmlForm.elements.placa.value = nota.transporte.placa;
}

async function publishInvoice(evt) {
  evt.preventDefault();
  const file = qs('xmlFile').files[0]; if (!file) return alert('Selecione um XML.');
  const nota = parseXmlText(await file.text());
  await dbInsert('notas', {
    numero_nota: nota.numeroNota, chave_nfe: nota.chave, motorista: nota.transporte.motorista,
    telefone_motorista: nota.transporte.telefone, placa: nota.transporte.placa, emitente: nota.emitente,
    emissao: nota.emissao, valor_total: nota.valorTotal, itens_json: nota.items, xml_raw: nota.rawXml,
    dt_remessa: nota.dtRemessa || '', publicado_por: state.user.matricula,
  });
  state.currentInvoice = nota;
  invoicePreview.textContent = JSON.stringify(nota, null, 2);
  renderPdfPages(nota);
  uploadXmlForm.reset();
  await logAction('PUBLICACAO_NOTA', null, 0, 'Nota publicada pelo ADM', false);
  await loadInvoices();
  alert('Nota publicada com sucesso.');
}

async function generatePdfFromPages() {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF || !window.html2canvas) return alert('Bibliotecas PDF não carregadas.');
  const pages = [qs('pdfPage1'), qs('pdfPage2')]; if (!pages[0].innerHTML.trim()) return alert('Carregue um XML antes de gerar PDF.');
  const pdf = new jsPDF('p', 'mm', 'a4');
  for (let i = 0; i < pages.length; i += 1) {
    const canvas = await window.html2canvas(pages[i], { scale: 2, useCORS: true, backgroundColor: '#fff' });
    const img = canvas.toDataURL('image/png'); const prop = pdf.getImageProperties(img);
    const m = 6; let w = 210 - m * 2; let h = (prop.height * w) / prop.width; if (h > 297 - m * 2) { h = 297 - m * 2; w = (prop.width * h) / prop.height; }
    if (i > 0) pdf.addPage(); pdf.addImage(img, 'PNG', (210 - w) / 2, m, w, h);
  }
  pdf.save(`recebimento-nfe-${String(state.currentInvoice?.numeroNota || 'sem-nfe').padStart(9, '0').slice(-9)}.pdf`);
}

async function loadInvoices() {
  state.invoices = await dbSelect('notas', { orderBy: 'created_at' }) || [];
  notaSelect.innerHTML = '';
  state.invoices.forEach((n) => { const opt = document.createElement('option'); opt.value = n.id; opt.textContent = `${n.numero_nota}/${n.placa} - ${n.motorista}`; notaSelect.appendChild(opt); });
  if (state.invoices.length && state.user?.role === 'operacao') renderOperacaoInvoice(state.invoices[0].id);
}

function renderOperacaoInvoice(notaId) {
  const nota = state.invoices.find((n) => String(n.id) === String(notaId));
  if (!nota) { notaInfo.textContent = 'Nenhuma nota disponível'; conferenciaForm.innerHTML = ''; return; }
  notaInfo.innerHTML = `<p><strong>Motorista:</strong> ${nota.motorista}</p><p><strong>Telefone:</strong> ${nota.telefone_motorista}</p><p><strong>Placa:</strong> ${nota.placa}</p><p><strong>DT/Remessa:</strong> ${nota.dt_remessa || '-'}</p>`;
  conferenciaForm.innerHTML = `<label>DT / Remessa<input name="dt_remessa" value="${nota.dt_remessa || ''}" /></label><label><input type="checkbox" name="avaria" /> Houve avaria no recebimento</label><label>Descrição da avaria<textarea name="avaria_obs" placeholder="Opcional"></textarea></label>`;
  (nota.itens_json || []).forEach((item) => {
    const code = normalizeProductCode(item.codigo);
    conferenciaForm.insertAdjacentHTML('beforeend', `<div class="item"><p><strong>${code}</strong> - ${item.descricao}</p><label>Quantidade conferida<input type="number" step="0.01" min="0" required name="${code}" /></label></div>`);
  });
  conferenciaForm.insertAdjacentHTML('beforeend', '<label>Observação<textarea name="observacao" placeholder="Opcional"></textarea></label><button type="submit">Enviar conferência</button>');
  conferenciaForm.dataset.notaId = nota.id;
}

async function submitConferencia(evt) {
  evt.preventDefault();
  const nota = state.invoices.find((n) => String(n.id) === String(conferenciaForm.dataset.notaId)); if (!nota) return;
  if (!confirm('Tem certeza que deseja terminar a conferência?')) return;
  const form = new FormData(conferenciaForm);
  const dtRemessa = form.get('dt_remessa') || nota.dt_remessa || '';
  const houveAvaria = form.get('avaria') === 'on';

  const conferidos = (nota.itens_json || []).map((item) => {
    const code = normalizeProductCode(item.codigo);
    const informado = Number(form.get(code) || 0);
    return { ...item, codigo: code, conferido: informado, divergencia: Number((informado - Number(item.quantidadeFardo)).toFixed(2)) };
  });

  const divergentes = conferidos.filter((i) => i.divergencia !== 0);
  if (divergentes.length && !confirm(`Há divergência nos códigos: ${divergentes.map((d) => d.codigo).join(', ')}. Finalizar mesmo assim?`)) return;

  await dbInsert('conferencias', {
    nota_id: nota.id,
    conferente_matricula: state.user.matricula,
    observacao: `${form.get('observacao') || ''} | DT:${dtRemessa || '-'} | Avaria:${houveAvaria ? 'Sim' : 'Não'} | ObsAvaria:${form.get('avaria_obs') || '-'}`.trim(),
    itens_conferidos: conferidos,
    status: divergentes.length ? 'com_divergencia' : 'ok',
  });

  const lines = conferidos.map((item) => [new Date().toLocaleDateString('pt-BR'), nota.placa || '-', dtRemessa || '-', nota.numero_nota, 'Mogi', item.codigo, item.quantidadeFardo ?? 0, item.conferido ?? 0].join('\t'));
  qs('nqOutput').value = `Data\tPlaca\tRemessa\tNF\tCD de Origem\tSKU\tQtde NF\tQtd Rec. FISICO\n${lines.join('\n')}`;

  for (const item of conferidos) {
    await dbInsert('nq_reports', {
      data_ref: new Date().toISOString(), placa: nota.placa || '-', remessa: dtRemessa || '-', nf: nota.numero_nota,
      cd_origem: 'Mogi', sku: item.codigo, qtde_nf: item.quantidadeFardo ?? 0, qtd_rec_fisico: item.conferido ?? 0,
      avaria: houveAvaria, faltando: Number(item.conferido) < Number(item.quantidadeFardo), criado_por: state.user.matricula,
    });
  }

  for (const item of divergentes) await logAction('DIVERGENCIA', item.codigo, item.divergencia, `Nota ${nota.numero_nota}`, true);
  if (!divergentes.length) await logAction('CONFERENCIA_OK', null, 0, `Nota ${nota.numero_nota} sem divergências`, false);
  await loadNqReports();
  alert('Conferência enviada com sucesso. Linha Excel gerada na área NQ.');
}

async function logAction(tipo, codigo, quantidadeDivergencia, mensagem, divergente) {
  await dbInsert('logs', { tipo, codigo, quantidade_divergencia: quantidadeDivergencia, mensagem, divergente, usuario_matricula: state.user?.matricula || 'sistema' });
  await loadLogs();
}

async function loadLogs() {
  const data = await dbSelect('logs', { orderBy: 'created_at' });
  logsContainer.innerHTML = '';
  (data || []).forEach((log) => {
    const row = document.createElement('div'); row.className = `log ${log.divergente ? 'divergente' : ''}`;
    row.innerHTML = `<strong>${new Date(log.created_at).toLocaleString('pt-BR')}</strong> - usuário ${log.usuario_matricula} - ${log.tipo} - cód: ${log.codigo || '-'} - divergência: ${log.quantidade_divergencia || 0}<br/>${log.mensagem || ''}`;
    logsContainer.appendChild(row);
  });
}

async function loadConferencias() {
  const data = await dbSelect('conferencias', { orderBy: 'created_at' });
  adminConferencias.innerHTML = '';
  (data || []).forEach((conf) => {
    const nota = state.invoices.find((n) => n.id === conf.nota_id);
    const div = document.createElement('div');
    const divergencias = (conf.itens_conferidos || []).filter((i) => i.divergencia !== 0);
    const dtObs = String(conf.observacao || '').match(/DT:([^|]+)/)?.[1]?.trim() || '-';
    const avariaObs = String(conf.observacao || '').match(/Avaria:([^|]+)/)?.[1]?.trim() || '-';
    div.className = `conferencia ${divergencias.length ? 'divergente' : ''}`;
    div.innerHTML = `<p><strong>Conferente:</strong> ${conf.conferente_matricula}</p><p><strong>Status:</strong> ${conf.status}</p><p><strong>DT/NF:</strong> ${dtObs} / NF ${nota?.numero_nota || '-'}</p><p><strong>Avaria:</strong> ${avariaObs}</p><p><strong>Observação:</strong> ${conf.observacao || '-'}</p><p><strong>Divergências:</strong> ${divergencias.map((d) => `${d.codigo} (${d.divergencia})`).join(', ') || 'Nenhuma'}</p>`;
    adminConferencias.appendChild(div);
  });
}

async function loadNqReports() {
  if (!adminNqContainer) return;
  const data = await dbSelect('nq_reports', { orderBy: 'data_ref' });
  adminNqContainer.innerHTML = '';
  (data || []).forEach((r) => {
    const div = document.createElement('div');
    div.className = `log ${r.faltando || r.avaria ? 'divergente' : ''}`;
    div.textContent = `${new Date(r.data_ref).toLocaleString('pt-BR')} | NF ${r.nf} | DT ${r.remessa} | Placa ${r.placa} | SKU ${r.sku} | Qtde NF ${r.qtde_nf} x Rec. ${r.qtd_rec_fisico} | Avaria: ${r.avaria ? 'Sim' : 'Não'}`;
    adminNqContainer.appendChild(div);
  });
}

async function recoverBySms() {
  const matricula = prompt('Informe a matrícula'); if (!matricula) return;
  const telefone = prompt('Informe o telefone cadastrado (com DDI)'); if (!telefone) return;
  const novaSenha = Math.random().toString(36).slice(-8);
  try {
    await dbUpdate('usuarios', { matricula, telefone }, { senha: novaSenha });
    if (state.mode === 'supabase') {
      const { error } = await supabase.functions.invoke('send-sms', { body: { to: telefone, message: `Nova senha: ${novaSenha}` } });
      if (error) throw error;
    }
    alert(`Senha resetada. Nova senha: ${novaSenha}`);
  } catch (error) { alert(`SMS não funcionou. Configure send-sms no Supabase (Twilio).\nErro: ${error.message}`); }
}

async function recoverByEmail() {
  const matricula = prompt('Informe a matrícula'); if (!matricula) return;
  const novaSenha = Math.random().toString(36).slice(-8);
  try {
    await dbUpdate('usuarios', { matricula }, { senha: novaSenha });
    if (state.mode === 'supabase') {
      const { error } = await supabase.functions.invoke('send-email', { body: { to: 'leseliv487@fengnu.com', subject: 'Nova senha', text: `Nova senha: ${novaSenha}` } });
      if (error) throw error;
    }
    alert(`Senha resetada. Nova senha: ${novaSenha}`);
  } catch (error) { alert(`E-mail não funcionou. Configure send-email no Supabase (Resend/SMTP).\nErro: ${error.message}`); }
}

function exportLogs() {
  const blob = new Blob([JSON.stringify(state.logs, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `logs-${new Date().toISOString()}.json`; a.click();
  URL.revokeObjectURL(url);
}

async function clearLogs() { if (confirm('Deseja apagar todos os logs?')) { await dbDeleteAll('logs'); await loadLogs(); } }
function toggleChat() { qs('chatPanel').classList.toggle('hidden'); }

async function sendChat(evt) {
  evt.preventDefault();
  const text = qs('chatInput').value.trim(); if (!text) return;
  await dbInsert('chats', { from_matricula: state.user.matricula, from_role: state.user.role, to_role: state.user.role === 'adm' ? 'operacao' : 'adm', mensagem: text });
  qs('chatInput').value = '';
  await loadChats();
}

async function loadChats() {
  if (!state.user) return;
  const data = await dbSelect('chats', { orderBy: 'created_at' });
  const filtered = (data || []).filter((m) => m.to_role === state.user.role || m.from_matricula === state.user.matricula);
  const container = qs('chatMessages'); container.innerHTML = '';
  filtered.slice().reverse().forEach((m) => {
    const p = document.createElement('p'); p.className = m.from_matricula === state.user.matricula ? 'mine' : 'theirs'; p.textContent = `${m.from_matricula}: ${m.mensagem}`;
    container.appendChild(p);
  });
}

async function refreshAll() {
  await loadInvoices();
  if (state.user?.role === 'adm') { await loadLogs(); await loadConferencias(); await loadNqReports(); }
  await loadChats();
}

registerForm.addEventListener('submit', registerUser);
loginForm.addEventListener('submit', login);
uploadXmlForm.addEventListener('submit', publishInvoice);
conferenciaForm.addEventListener('submit', submitConferencia);
notaSelect.addEventListener('change', (evt) => renderOperacaoInvoice(evt.target.value));
qs('showLogin').addEventListener('click', () => setAuthView('login'));
qs('showRegister').addEventListener('click', () => setAuthView('register'));
qs('recoverSms').addEventListener('click', recoverBySms);
qs('recoverEmail').addEventListener('click', recoverByEmail);
qs('btnExportLogs').addEventListener('click', exportLogs);
qs('btnClearLogs').addEventListener('click', clearLogs);
qs('btnLogout').addEventListener('click', () => setUser(null));
qs('btnPrintInvoice').addEventListener('click', generatePdfFromPages);
qs('btnPrintMaterials').addEventListener('click', generatePdfFromPages);
qs('chatBubble').addEventListener('click', toggleChat);
qs('chatForm').addEventListener('submit', sendChat);
qs('btnLogs').addEventListener('click', () => logsContainer.scrollIntoView({ behavior: 'smooth' }));
qs('btnDensity').addEventListener('click', () => {
  document.body.classList.toggle('tablet-mode');
  qs('btnDensity').textContent = document.body.classList.contains('tablet-mode') ? 'Modo desktop' : 'Modo tablet';
});
qs('xmlFile').addEventListener('change', async (evt) => {
  const file = evt.target.files?.[0]; if (!file) return;
  const nota = parseXmlText(await file.text());
  state.currentInvoice = nota;
  invoicePreview.textContent = JSON.stringify(nota, null, 2);
  renderPdfPages(nota);
});

setInterval(() => {
  if (!state.user) return;
  loadChats();
  if (state.user.role === 'adm') { loadConferencias(); loadLogs(); loadNqReports(); }
}, 6000);

(async () => {
  await verifySupabaseSchema();
  setAuthView('login');
  bootstrapUser();
})();
