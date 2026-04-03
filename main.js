const SUPABASE_URL = 'https://qkdonbbvafdbooyjjmwb.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_JYiZBz-B3k7pdY3Ivobn0w_Jz7zIWNx';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const BACKEND_BASE_URL = (() => {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('backend_url');
  if (fromQuery) localStorage.setItem('rcv-backend-url', fromQuery);
  return localStorage.getItem('rcv-backend-url') || window.location.origin;
})();

const state = {
  user: null,
  currentInvoice: null,
  invoices: [],
  logs: [],
  nqLines: [],
  mode: 'supabase',
  authView: 'login',
  adminTab: 'abertas',
  logFilter: 'all',
};

const localDb = {
  read: () => JSON.parse(localStorage.getItem('rcv-local-db') || '{"usuarios":[],"notas":[],"conferencias":[],"logs":[],"chats":[],"nq_reports":[]}'),
  write: (data) => localStorage.setItem('rcv-local-db', JSON.stringify(data)),
  nextId: (items) => (items.at(-1)?.id || 0) + 1,
};

const qs = (id) => document.getElementById(id);
const authSection = qs('authSection');
const adminSection = qs('adminSection');
const operacaoSection = qs('operacaoSection');
const logsSection = qs('logsSection');
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
const duplicateWarning = qs('duplicateWarning');
const operacaoStats = qs('operacaoStats');

const FARDO_POR_PALETE = {
  20081464: 36, 20081465: 36, 20081466: 36, 20081467: 36, 20081481: 28, 20081482: 36, 20081579: 30, 20091834: 36, 20091836: 27,
  20104309: 45, 20104310: 225, 20104313: 36, 20104405: 48, 20104407: 32, 20104408: 36, 20104409: 36, 20104410: 36, 20104412: 28,
  20104413: 36, 20104414: 36, 20104415: 36, 20104416: 36, 20104417: 32, 20104418: 28, 20104419: 33, 20104420: 63, 20104421: 63,
  20104422: 65, 20104425: 36, 20104426: 27, 20104427: 14, 20104429: 27, 20104430: 15, 20105277: 27, 20106704: 36, 20106705: 36,
  20108498: 24, 20109727: 24, 20109735: 36, 20109736: 36, 20110078: 36, 90004854: 30,
};

const isSchemaMissingError = (error) => {
  const msg = error?.message || '';
  return msg.includes('schema cache') || msg.includes('Could not find the table') || msg.includes('relation') || msg.includes('does not exist');
};

async function maybeSwitchToLocalMode(error) {
  if (!error || !isSchemaMissingError(error) || state.mode === 'local') return false;
  state.mode = 'local';
  alert('Sem schema do Supabase. Entrando em MODO LOCAL. Rode o arquivo supabase-schema.sql atualizado no SQL Editor para ativar banco online.');
  return true;
}

async function dbSelect(table, options = {}) {
  if (state.mode === 'local') {
    let rows = [...(localDb.read()[table] || [])];
    Object.entries(options.eq || {}).forEach(([k, v]) => { rows = rows.filter((r) => String(r[k]) === String(v)); });
    if (options.orderBy) rows.sort((a, b) => new Date(b[options.orderBy] || 0) - new Date(a[options.orderBy] || 0));
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
    const db = localDb.read();
    db[table] = [];
    localDb.write(db);
    return;
  }
  const { error } = await supabase.from(table).delete().neq('id', 0);
  if (await maybeSwitchToLocalMode(error)) return dbDeleteAll(table);
  if (error) throw error;
}

function normalizeProductCode(code) {
  const digits = String(code || '').replace(/\D/g, '');
  if (!digits) return String(code || '');
  const idx2 = digits.indexOf('2');
  if (idx2 >= 0) return digits.slice(idx2);
  return digits.replace(/^0+/, '') || digits;
}

function getFardosPorPalete(code) {
  const normalized = Number(normalizeProductCode(code));
  return FARDO_POR_PALETE[normalized] || 1;
}

function setAuthView(view) {
  state.authView = view;
  registerForm.classList.toggle('hidden', view !== 'register');
  loginForm.classList.toggle('hidden', view !== 'login');
}

function setUser(user) {
  state.user = user;
  if (user) localStorage.setItem('rcv-user', JSON.stringify(user));
  else {
    localStorage.removeItem('rcv-user');
    qs('chatPanel').classList.add('hidden');
  }
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
  const isAdm = user?.role === 'adm';
  authSection.classList.toggle('hidden', !!user);
  adminSection.classList.toggle('hidden', !isAdm || logsSection.dataset.active === '1');
  logsSection.classList.toggle('hidden', !isAdm || logsSection.dataset.active !== '1');
  operacaoSection.classList.toggle('hidden', !user || user.role !== 'operacao');
  qs('chatBubble').classList.toggle('hidden', !user);
  qs('btnLogs').classList.toggle('hidden', !isAdm);
  qs('btnBackAdmin').classList.toggle('hidden', !isAdm || logsSection.dataset.active !== '1');
}

function setAdminTab(tab) {
  state.adminTab = tab;
  document.querySelectorAll('[data-admin-tab]').forEach((btn) => btn.classList.toggle('active', btn.dataset.adminTab === tab));
  qs('tabAbertas').classList.toggle('hidden', tab !== 'abertas');
  qs('tabConferidas').classList.toggle('hidden', tab !== 'conferidas');
  qs('tabNq').classList.toggle('hidden', tab !== 'nq');
}

function setLogsPage(active) {
  logsSection.dataset.active = active ? '1' : '0';
  renderAuthState();
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
    chave: text('chNFe'),
    emissao: text('dhEmi'),
    emitente: text('xNome'),
    emitenteCnpj: text('CNPJ'),
    destinatario: xml.getElementsByTagName('dest')[0]?.getElementsByTagName('xNome')[0]?.textContent?.trim() || '-',
    destinatarioCnpj: xml.getElementsByTagName('dest')[0]?.getElementsByTagName('CNPJ')[0]?.textContent?.trim() || '-',
    natureza: text('natOp'),
    protocolo: text('nProt'),
    valorTotal: Number(text('vNF') || text('vNFTot') || 0),
    pesoBruto: text('pesoB') || '-',
    volume: text('qVol') || '-',
    dtRemessa: extractDtRemessa(infCpl),
    items,
    transporte: extractTransportInfo(xml, infCpl),
    rawXml: xmlText,
  };
}

async function registerUser(evt) {
  evt.preventDefault();
  const f = new FormData(registerForm);
  try {
    await dbInsert('usuarios', {
      matricula: f.get('matricula'),
      senha: f.get('senha'),
      role: f.get('role'),
      email: f.get('email') || null,
      telefone: f.get('telefone') || null,
    });
    alert(`Usuário cadastrado com sucesso! (${state.mode.toUpperCase()})`);
    registerForm.reset();
    setAuthView('login');
  } catch (error) {
    alert(`Erro ao cadastrar: ${error.message}`);
  }
}

async function login(evt) {
  evt.preventDefault();
  const f = new FormData(loginForm);
  const data = await dbSelect('usuarios', { eq: { matricula: f.get('matricula'), senha: f.get('senha') }, single: true });
  if (!data) return alert('Matrícula ou senha inválida.');
  setUser(data);
}

function renderPdfPages(nota) {
  const p1 = qs('pdfPage1');
  const p2 = qs('pdfPage2');
  if (!p1 || !p2 || !nota) return;
  const nfeFmt = String(nota.numeroNota || '').padStart(9, '0').replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3');
  const chave = String(nota.chave || '').replace(/\D/g, '');

  p1.innerHTML = `<div class="pdf-mini"><b>PÁGINA 1/2 - DADOS DA NF-E</b></div>
    <div class="nf-box pdf-mini">EMISSÃO: <b>${nota.emissao || '-'}</b> | VALOR TOTAL: <b>${(nota.valorTotal || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</b><br/>NATUREZA: <b>${nota.natureza || '-'}</b> | PROTOCOLO: <b>${nota.protocolo || '-'}</b></div>
    <div class="nf-grid pdf-mini"><div class="nf-box"><b>NF-e:</b> ${nfeFmt}<br/><b>Chave:</b> ${nota.chave || '-'}</div><div class="nf-box"><b>Motorista:</b> ${nota.transporte.motorista}<br/><b>Telefone:</b> ${nota.transporte.telefone}<br/><b>Placa:</b> ${nota.transporte.placa}<br/><b>DT:</b> ${nota.dtRemessa || '-'}</div></div>
    <div class="nf-box pdf-mini"><b>Emitente:</b> ${nota.emitente} (${nota.emitenteCnpj})<br/><b>Destinatário:</b> ${nota.destinatario} (${nota.destinatarioCnpj})<br/><b>Volume:</b> ${nota.volume} | <b>Peso:</b> ${nota.pesoBruto}</div>
    <div class="barcode-wrap"><svg id="barcodeChave"></svg></div>`;

  p2.innerHTML = `<div class="pdf-mini"><b>PÁGINA 2/2 - CONFERÊNCIA / PALETES</b></div>
  <table><thead><tr><th>Código</th><th>Descrição</th><th>NCM/CFOP</th><th>Paletes</th></tr></thead><tbody>${nota.items.map((i) => `<tr><td>${i.codigo}</td><td>${i.descricao}</td><td>${i.ncm || '-'} / ${i.cfop || '-'}</td><td></td></tr>`).join('')}</tbody></table>`;

  if (window.JsBarcode && chave.length === 44) window.JsBarcode('#barcodeChave', chave, { format: 'CODE128', width: 1.2, height: 44, displayValue: true, margin: 0 });

  uploadXmlForm.elements.motorista.value = nota.transporte.motorista;
  uploadXmlForm.elements.telefoneMotorista.value = nota.transporte.telefone;
  uploadXmlForm.elements.placa.value = nota.transporte.placa;
}

async function publishInvoice(evt) {
  evt.preventDefault();
  const file = qs('xmlFile').files[0];
  if (!file) return alert('Selecione um XML.');
  const nota = parseXmlText(await file.text());
  const alreadyExists = await dbSelect('notas', { eq: { numero_nota: nota.numeroNota } });
  if ((alreadyExists || []).length) {
    duplicateWarning?.classList.remove('hidden');
    await logAction('NOTA_DUPLICADA_BLOQUEADA', null, 0, `Tentativa de publicar NF ${nota.numeroNota} já existente`, false);
    return alert(`A NF ${nota.numeroNota} já foi publicada. Operação bloqueada para evitar duplicidade.`);
  }
  await dbInsert('notas', {
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
    dt_remessa: nota.dtRemessa || '',
    descarga_fechada: false,
    publicado_por: state.user.matricula,
  });
  state.currentInvoice = nota;
  duplicateWarning?.classList.add('hidden');
  invoicePreview.textContent = JSON.stringify(nota, null, 2);
  renderPdfPages(nota);
  uploadXmlForm.reset();
  await logAction('PUBLICACAO_NOTA', null, 0, `Nota ${nota.numeroNota} publicada pelo ADM`, false);
  await loadInvoices();
  alert('Nota publicada com sucesso.');
}

async function generatePdfFromPages() {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF || !window.html2canvas) return alert('Bibliotecas PDF não carregadas.');
  const pages = [qs('pdfPage1'), qs('pdfPage2')];
  if (!pages[0].innerHTML.trim()) return alert('Carregue um XML antes de gerar PDF.');
  const pdf = new jsPDF('p', 'mm', 'a4');
  for (let i = 0; i < pages.length; i += 1) {
    const canvas = await window.html2canvas(pages[i], { scale: 2, useCORS: true, backgroundColor: '#fff' });
    const img = canvas.toDataURL('image/png');
    const prop = pdf.getImageProperties(img);
    const m = 6;
    let w = 210 - m * 2;
    let h = (prop.height * w) / prop.width;
    if (h > 297 - m * 2) {
      h = 297 - m * 2;
      w = (prop.width * h) / prop.height;
    }
    if (i > 0) pdf.addPage();
    pdf.addImage(img, 'PNG', (210 - w) / 2, m, w, h);
  }

  const labels = buildEtiquetaPages(state.currentInvoice);
  labels.forEach((label) => {
    pdf.addPage('a4', 'landscape');
    const width = 297;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(62);
    pdf.text(String(label.codigo), width / 2, 72, { align: 'center' });
    pdf.setFontSize(34);
    pdf.text(`${label.fardosPorPalete} FARDOS POR PALETE`, width / 2, 105, { align: 'center' });
    pdf.setFontSize(18);
    pdf.text(`Palete ${label.paleteIndex}/${label.totalPaletes} - Etiqueta ${label.copyIndex}/2`, width / 2, 125, { align: 'center' });
    pdf.setDrawColor(20, 20, 20);
    pdf.rect(15, 140, width - 30, 48);
    pdf.setFontSize(14);
    pdf.text('Conferido por: ______________________', 25, 160);
    pdf.text('Turno: ______________________', width - 110, 160);
    pdf.text(`NF: ${state.currentInvoice?.numeroNota || '-'}   SKU: ${label.codigo}`, 25, 178);
  });
  pdf.save(`recebimento-nfe-${String(state.currentInvoice?.numeroNota || 'sem-nfe').padStart(9, '0').slice(-9)}.pdf`);
}

function buildEtiquetaPages(nota) {
  if (!nota?.items?.length) return [];
  const pages = [];
  nota.items.forEach((item) => {
    const codigo = normalizeProductCode(item.codigo);
    const fardosPorPalete = getFardosPorPalete(codigo);
    const totalPaletes = Math.max(1, Math.ceil(Number(item.quantidadeFardo || 0) / fardosPorPalete));
    for (let palete = 1; palete <= totalPaletes; palete += 1) {
      for (let copyIndex = 1; copyIndex <= 2; copyIndex += 1) {
        pages.push({ codigo, fardosPorPalete, paleteIndex: palete, totalPaletes, copyIndex });
      }
    }
  });
  return pages;
}

async function loadInvoices() {
  const allInvoices = await dbSelect('notas', { orderBy: 'created_at' }) || [];
  state.invoices = allInvoices;
  notaSelect.innerHTML = '';
  let visibleInvoices = allInvoices;
  if (state.user?.role === 'operacao') {
    const minhasConferencias = await dbSelect('conferencias', { eq: { conferente_matricula: state.user.matricula } }) || [];
    const conferidasPorMim = new Set(minhasConferencias.map((c) => String(c.nota_id)));
    visibleInvoices = allInvoices.filter((n) => !conferidasPorMim.has(String(n.id)));
    if (operacaoStats) operacaoStats.textContent = `Notas pendentes para você: ${visibleInvoices.length} de ${allInvoices.length}`;
  }

  visibleInvoices.forEach((n) => {
    const opt = document.createElement('option');
    opt.value = n.id;
    opt.textContent = `${n.numero_nota}/${n.placa} - ${n.motorista}`;
    notaSelect.appendChild(opt);
  });
  if (state.user?.role === 'operacao' && !visibleInvoices.length) {
    notaInfo.innerHTML = '<p><strong>Tudo conferido ✅</strong></p>';
    conferenciaForm.innerHTML = '';
    return;
  }
  if (visibleInvoices.length && state.user?.role === 'operacao') renderOperacaoInvoice(visibleInvoices[0].id);
}

function renderOperacaoInvoice(notaId) {
  const nota = state.invoices.find((n) => String(n.id) === String(notaId));
  if (!nota) {
    notaInfo.textContent = 'Nenhuma nota disponível';
    conferenciaForm.innerHTML = '';
    return;
  }
  notaInfo.innerHTML = `<p><strong>Motorista:</strong> ${nota.motorista}</p><p><strong>Telefone:</strong> ${nota.telefone_motorista}</p><p><strong>Placa:</strong> ${nota.placa}</p><p><strong>DT/Remessa:</strong> ${nota.dt_remessa || '-'}</p>`;
  conferenciaForm.innerHTML = `
    <div class="unit-choice">
      <strong>Unidade da conferência (bem visível)</strong>
      <label><input type="radio" name="unidade_conferencia" value="fardo" checked /> Informar em FARDOS</label>
      <label><input type="radio" name="unidade_conferencia" value="palete" /> Informar em PALETES</label>
    </div>
    <label><input type="checkbox" name="avaria" /> Veio avariado</label>
    <label><input type="checkbox" name="faltando" /> Veio faltando</label>
    <label>Descrição da avaria (opcional)<textarea name="avaria_obs"></textarea></label>`;

  (nota.itens_json || []).forEach((item) => {
    const code = normalizeProductCode(item.codigo);
    const fardosPorPalete = getFardosPorPalete(code);
    conferenciaForm.insertAdjacentHTML('beforeend', `<div class="item"><p><strong>${code}</strong> - ${item.descricao}</p><p class="hint">${fardosPorPalete} fardos por palete</p><label>Quantidade conferida<input type="number" step="0.01" min="0" required name="${code}" /></label></div>`);
  });

  conferenciaForm.insertAdjacentHTML('beforeend', '<label>Observação<textarea name="observacao" placeholder="Opcional"></textarea></label><button type="submit">Enviar conferência</button>');
  conferenciaForm.dataset.notaId = nota.id;
}

async function submitConferencia(evt) {
  evt.preventDefault();
  const nota = state.invoices.find((n) => String(n.id) === String(conferenciaForm.dataset.notaId));
  if (!nota) return;
  if (!confirm('Tem certeza que deseja terminar a conferência?')) return;

  const form = new FormData(conferenciaForm);
  const houveAvaria = form.get('avaria') === 'on';
  const houveFaltaMarcada = form.get('faltando') === 'on';
  const unidade = form.get('unidade_conferencia') || 'fardo';
  const conferidos = (nota.itens_json || []).map((item) => {
    const code = normalizeProductCode(item.codigo);
    const informadoRaw = Number(form.get(code) || 0);
    const fatorPalete = getFardosPorPalete(code);
    const informadoFardo = unidade === 'palete' ? Number((informadoRaw * fatorPalete).toFixed(2)) : informadoRaw;
    return {
      ...item,
      codigo: code,
      conferido: informadoFardo,
      conferido_raw: informadoRaw,
      unidade_conferencia: unidade,
      fator_palete: fatorPalete,
      divergencia: Number((informadoFardo - Number(item.quantidadeFardo)).toFixed(2)),
    };
  });

  const divergentes = conferidos.filter((i) => i.divergencia !== 0);
  if (divergentes.length && !confirm(`Há divergência nos códigos: ${divergentes.map((d) => d.codigo).join(', ')}. Finalizar mesmo assim?`)) return;

  await dbInsert('conferencias', {
    nota_id: nota.id,
    conferente_matricula: state.user.matricula,
    observacao: `${form.get('observacao') || ''}`.trim(),
    avaria: houveAvaria,
    faltando: houveFaltaMarcada,
    avaria_obs: `${form.get('avaria_obs') || ''}`.trim(),
    status: divergentes.length ? 'com_divergencia' : 'ok',
    itens_conferidos: conferidos,
  });

  for (const item of conferidos) {
    await dbInsert('nq_reports', {
      data_ref: new Date().toISOString(),
      placa: nota.placa || '-',
      remessa: nota.dt_remessa || '-',
      nf: nota.numero_nota,
      cd_origem: 'Mogi',
      sku: item.codigo,
      qtde_nf: item.quantidadeFardo ?? 0,
      qtd_rec_fisico: item.conferido ?? 0,
      avaria: houveAvaria,
      faltando: houveFaltaMarcada || Number(item.conferido) < Number(item.quantidadeFardo),
      criado_por: state.user.matricula,
    });
  }

  if (houveFaltaMarcada) await logAction('FALTA_INFORMADA', null, 0, `Nota ${nota.numero_nota} marcada com falta`, false);
  for (const item of divergentes) await logAction('DIVERGENCIA', item.codigo, item.divergencia, `Nota ${nota.numero_nota}`, true);
  if (!divergentes.length) await logAction('CONFERENCIA_OK', null, 0, `Nota ${nota.numero_nota} sem divergências`, false);

  alert('Conferência enviada com sucesso.');
  await loadInvoices();
}

async function fecharDescarga(idNota) {
  await dbUpdate('notas', { id: idNota }, { descarga_fechada: true });
  await logAction('DESCARGA_FECHADA', null, 0, `Descarga NF ${state.invoices.find((n) => n.id === idNota)?.numero_nota || '-' } fechada pelo ADM`, false);
  await refreshAll();
}

async function loadConferencias() {
  const data = await dbSelect('conferencias', { orderBy: 'created_at' });
  adminConferencias.innerHTML = '';
  (data || []).forEach((conf) => {
    const nota = state.invoices.find((n) => n.id === conf.nota_id);
    const divergencias = (conf.itens_conferidos || []).filter((i) => i.divergencia !== 0);
    const card = document.createElement('div');
    card.className = `conferencia ${divergencias.length ? 'divergente' : ''} ${conf.faltando ? 'faltando' : ''}`;
    card.innerHTML = `
      <p><strong>Conferente:</strong> ${conf.conferente_matricula}</p>
      <p><strong>Status:</strong> ${conf.status}</p>
      <p><strong>DT/NF:</strong> ${nota?.dt_remessa || '-'} / NF ${nota?.numero_nota || '-'}</p>
      <p><strong>Avaria:</strong> ${conf.avaria ? 'Sim' : 'Não'} | <strong>Falta:</strong> ${conf.faltando ? 'Sim' : 'Não'}</p>
      <p><strong>Observação:</strong> ${conf.observacao || '-'}</p>
      <p><strong>Divergências:</strong> ${divergencias.map((d) => `${d.codigo} (${d.divergencia})`).join(', ') || 'Nenhuma'}</p>
      ${nota?.descarga_fechada ? '<p><strong>Descarga:</strong> Fechada</p>' : `<button class="btn-close" data-nota-close="${nota?.id}">Fechar descarga e enviar para logs</button>`}`;
    adminConferencias.appendChild(card);
  });

  document.querySelectorAll('[data-nota-close]').forEach((btn) => {
    btn.addEventListener('click', () => fecharDescarga(Number(btn.dataset.notaClose)));
  });
}

async function loadNqReports() {
  if (!adminNqContainer) return;
  const data = await dbSelect('nq_reports', { orderBy: 'data_ref' });
  adminNqContainer.innerHTML = '';
  state.nqLines = [];
  (data || []).forEach((r) => {
    const line = [new Date(r.data_ref).toLocaleDateString('pt-BR'), r.placa || '-', r.remessa || '-', r.nf || '-', r.cd_origem || 'Mogi', r.sku || '-', r.qtde_nf ?? 0, r.qtd_rec_fisico ?? 0].join('\t');
    state.nqLines.push(line);
    const div = document.createElement('div');
    div.className = `log ${r.faltando ? 'faltando' : ''} ${r.avaria ? 'divergente' : ''}`;
    div.innerHTML = `<code>${line}</code><button class="copy-line" data-copy="${encodeURIComponent(line)}">Copiar linha</button>`;
    adminNqContainer.appendChild(div);
  });

  document.querySelectorAll('.copy-line').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(decodeURIComponent(btn.dataset.copy));
      btn.textContent = 'Copiado!';
      setTimeout(() => { btn.textContent = 'Copiar linha'; }, 1200);
    });
  });
}

function formatFileTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

async function guardarLogsNoTerabox() {
  if (!state.user || state.user.role !== 'adm') return alert('Apenas ADM pode guardar logs no TeraBox.');
  if (!state.logs.length) return alert('Sem logs para guardar.');
  const header = 'DataHora\tUsuario\tTipo\tCodigo\tQtdDivergencia\tMensagem';
  const lines = state.logs.map((log) => [
    new Date(log.created_at).toISOString(),
    log.usuario_matricula || '-',
    log.tipo || '-',
    log.codigo || '-',
    log.quantidade_divergencia ?? 0,
    (log.mensagem || '').replace(/\n/g, ' ').trim(),
  ].join('\t'));
  const content = `${header}\n${lines.join('\n')}`;
  const fileName = `logs-carregamento-${formatFileTimestamp()}.txt`;
  try {
    const resp = await fetch(`${BACKEND_BASE_URL}/exportar-txt-terabox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, content }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.success) throw new Error(data.error || 'Falha no backend');
    alert(`Logs guardados no TeraBox com sucesso: ${fileName}`);
  } catch (error) {
    alert(`Falha ao guardar logs no TeraBox. Verifique backend/URL e autenticação.\nBackend atual: ${BACKEND_BASE_URL}\nErro: ${error.message}`);
  }
}

async function logAction(tipo, codigo, quantidadeDivergencia, mensagem, divergente) {
  await dbInsert('logs', { tipo, codigo, quantidade_divergencia: quantidadeDivergencia, mensagem, divergente, usuario_matricula: state.user?.matricula || 'sistema' });
  await loadLogs();
}

function renderLogs() {
  const search = (qs('logSearch')?.value || '').toLowerCase().trim();
  logsContainer.innerHTML = '';

  state.logs
    .filter((log) => {
      if (state.logFilter === 'divergente') return !!log.divergente;
      if (state.logFilter === 'falta') return log.tipo === 'FALTA_INFORMADA';
      if (state.logFilter === 'ok') return !log.divergente && log.tipo !== 'FALTA_INFORMADA';
      return true;
    })
    .filter((log) => `${log.tipo} ${log.usuario_matricula} ${log.codigo || ''} ${log.mensagem || ''}`.toLowerCase().includes(search))
    .forEach((log) => {
      const row = document.createElement('div');
      row.className = `log ${log.divergente ? 'divergente' : ''} ${log.tipo === 'FALTA_INFORMADA' ? 'faltando' : ''}`;
      row.innerHTML = `<strong>${new Date(log.created_at).toLocaleString('pt-BR')}</strong> - usuário ${log.usuario_matricula} - ${log.tipo} - cód: ${log.codigo || '-'} - divergência: ${log.quantidade_divergencia || 0}<br/>${log.mensagem || ''}`;
      logsContainer.appendChild(row);
    });
}

async function loadLogs() {
  state.logs = await dbSelect('logs', { orderBy: 'created_at' }) || [];
  renderLogs();
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
      const { error } = await supabase.functions.invoke('send-sms', { body: { to: telefone, message: `Nova senha: ${novaSenha}` } });
      if (error) throw error;
    }
    alert(`Senha resetada. Nova senha: ${novaSenha}`);
  } catch (error) {
    alert(`SMS não funcionou. Configure send-sms no Supabase (Twilio).\nErro: ${error.message}`);
  }
}

async function recoverByEmail() {
  const matricula = prompt('Informe a matrícula');
  if (!matricula) return;
  const novaSenha = Math.random().toString(36).slice(-8);
  try {
    await dbUpdate('usuarios', { matricula }, { senha: novaSenha });
    if (state.mode === 'supabase') {
      const { error } = await supabase.functions.invoke('send-email', { body: { to: 'leseliv487@fengnu.com', subject: 'Nova senha', text: `Nova senha: ${novaSenha}` } });
      if (error) throw error;
    }
    alert(`Senha resetada. Nova senha: ${novaSenha}`);
  } catch (error) {
    alert(`E-mail não funcionou. Configure send-email no Supabase (Resend/SMTP).\nErro: ${error.message}`);
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
  if (confirm('Deseja apagar todos os logs?')) {
    await dbDeleteAll('logs');
    await loadLogs();
  }
}

function toggleChat() { qs('chatPanel').classList.toggle('hidden'); }

async function sendChat(evt) {
  evt.preventDefault();
  const text = qs('chatInput').value.trim();
  if (!text) return;
  await dbInsert('chats', { from_matricula: state.user.matricula, from_role: state.user.role, to_role: state.user.role === 'adm' ? 'operacao' : 'adm', mensagem: text });
  qs('chatInput').value = '';
  await loadChats();
}

async function loadChats() {
  if (!state.user) return;
  const data = await dbSelect('chats', { orderBy: 'created_at' });
  const filtered = (data || []).filter((m) => m.to_role === state.user.role || m.from_matricula === state.user.matricula);
  const container = qs('chatMessages');
  container.innerHTML = '';
  filtered.slice().reverse().forEach((m) => {
    const p = document.createElement('p');
    p.className = m.from_matricula === state.user.matricula ? 'mine' : 'theirs';
    p.textContent = `${m.from_matricula}: ${m.mensagem}`;
    container.appendChild(p);
  });
}

async function refreshAll() {
  await loadInvoices();
  if (state.user?.role === 'adm') {
    await loadLogs();
    await loadConferencias();
    await loadNqReports();
  }
  await loadChats();
}

registerForm.addEventListener('submit', registerUser);
loginForm.addEventListener('submit', login);
uploadXmlForm?.addEventListener('submit', publishInvoice);
conferenciaForm.addEventListener('submit', submitConferencia);
notaSelect.addEventListener('change', (evt) => renderOperacaoInvoice(evt.target.value));
qs('showLogin').addEventListener('click', () => setAuthView('login'));
qs('showRegister').addEventListener('click', () => setAuthView('register'));
qs('recoverSms').addEventListener('click', recoverBySms);
qs('recoverEmail').addEventListener('click', recoverByEmail);
qs('btnExportLogs').addEventListener('click', exportLogs);
qs('btnClearLogs').addEventListener('click', clearLogs);
qs('btnLogout').addEventListener('click', () => setUser(null));
qs('btnPrintInvoice')?.addEventListener('click', generatePdfFromPages);
qs('chatBubble').addEventListener('click', toggleChat);
qs('chatForm').addEventListener('submit', sendChat);
qs('btnLogs').addEventListener('click', () => setLogsPage(true));
qs('btnBackAdmin').addEventListener('click', () => setLogsPage(false));
qs('logSearch').addEventListener('input', renderLogs);
qs('btnGuardarTerabox')?.addEventListener('click', guardarLogsNoTerabox);

qs('btnDensity').addEventListener('click', () => {
  document.body.classList.toggle('tablet-mode');
  qs('btnDensity').textContent = document.body.classList.contains('tablet-mode') ? 'Modo desktop' : 'Modo tablet';
});

qs('xmlFile')?.addEventListener('change', async (evt) => {
  const file = evt.target.files?.[0];
  if (!file) return;
  const nota = parseXmlText(await file.text());
  const alreadyExists = await dbSelect('notas', { eq: { numero_nota: nota.numeroNota } });
  duplicateWarning?.classList.toggle('hidden', !(alreadyExists || []).length);
  state.currentInvoice = nota;
  invoicePreview.textContent = JSON.stringify(nota, null, 2);
  renderPdfPages(nota);
});

document.querySelectorAll('[data-admin-tab]').forEach((btn) => {
  btn.addEventListener('click', () => setAdminTab(btn.dataset.adminTab));
});

document.querySelectorAll('[data-log-filter]').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.logFilter = btn.dataset.logFilter;
    document.querySelectorAll('[data-log-filter]').forEach((x) => x.classList.toggle('active', x.dataset.logFilter === state.logFilter));
    renderLogs();
  });
});

setInterval(() => {
  if (!state.user) return;
  loadChats();
  if (state.user.role === 'adm') {
    loadConferencias();
    loadLogs();
    loadNqReports();
  }
}, 6000);

(async () => {
  setLogsPage(false);
  setAdminTab('abertas');
  await verifySupabaseSchema();
  setAuthView('login');
  bootstrapUser();
})();
