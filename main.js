const SUPABASE_URL = 'https://qkdonbbvafdbooyjjmwb.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_JYiZBz-B3k7pdY3Ivobn0w_Jz7zIWNx';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const state = {
  user: null,
  currentInvoice: null,
  invoices: [],
  logs: [],
  chats: [],
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

function setUser(user) {
  state.user = user;
  localStorage.setItem('rcv-user', JSON.stringify(user));
  renderAuthState();
  if (user) {
    loadInvoices();
    loadLogs();
    loadConferencias();
    loadChats();
  }
}

function bootstrapUser() {
  const saved = localStorage.getItem('rcv-user');
  if (saved) {
    state.user = JSON.parse(saved);
    renderAuthState();
    loadInvoices();
    loadLogs();
    loadConferencias();
    loadChats();
  }
}

function renderAuthState() {
  const user = state.user;
  authSection.classList.toggle('hidden', !!user);
  adminSection.classList.toggle('hidden', !user || user.role !== 'adm');
  operacaoSection.classList.toggle('hidden', !user || user.role !== 'operacao');
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
    rawXml: xmlText,
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

  const { error } = await supabase.from('usuarios').insert(payload);
  if (error) return alert(`Erro ao cadastrar: ${error.message}`);
  alert('Usuário cadastrado com sucesso!');
  registerForm.reset();
}

async function login(evt) {
  evt.preventDefault();
  const form = new FormData(loginForm);
  const matricula = form.get('matricula');
  const senha = form.get('senha');

  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('matricula', matricula)
    .eq('senha', senha)
    .single();

  if (error || !data) return alert('Matrícula ou senha inválida.');
  setUser(data);
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
    motorista: form.get('motorista'),
    telefone_motorista: form.get('telefoneMotorista'),
    placa: form.get('placa'),
    emitente: nota.emitente,
    emissao: nota.emissao,
    valor_total: nota.valorTotal,
    itens_json: nota.items,
    xml_raw: nota.rawXml,
    publicado_por: state.user.matricula,
  };

  const { error } = await supabase.from('notas').insert(payload);
  if (error) return alert(`Erro ao publicar nota: ${error.message}`);

  invoicePreview.textContent = JSON.stringify(nota, null, 2);
  state.currentInvoice = nota;
  uploadXmlForm.reset();
  alert('Nota publicada para conferência.');

  await logAction('PUBLICACAO_NOTA', null, 0, 'Nota publicada pelo ADM', false);
  loadInvoices();
}

async function loadInvoices() {
  const { data, error } = await supabase.from('notas').select('*').order('created_at', { ascending: false });
  if (error) return;
  state.invoices = data || [];

  notaSelect.innerHTML = '';
  state.invoices.forEach((nota) => {
    const option = document.createElement('option');
    option.value = nota.id;
    option.textContent = `${nota.numero_nota}/${nota.placa} - ${nota.motorista}`;
    notaSelect.appendChild(option);
  });

  if (state.invoices.length && state.user?.role === 'operacao') {
    renderOperacaoInvoice(state.invoices[0].id);
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
    div.innerHTML = `
      <p><strong>${item.codigo}</strong> - ${item.descricao}</p>
      <label>Quantidade conferida
        <input type="number" step="0.01" min="0" required name="${item.codigo}" />
      </label>
    `;
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
    return {
      ...item,
      conferido: informado,
      divergencia: Number((informado - Number(item.quantidadeFardo)).toFixed(2)),
    };
  });

  const divergentes = conferidos.filter((c) => c.divergencia !== 0);
  let finalizadaComDivergencia = false;
  if (divergentes.length) {
    const codigos = divergentes.map((d) => d.codigo).join(', ');
    const continuar = confirm(`Há divergência nos códigos: ${codigos}. Finalizar mesmo assim?`);
    if (!continuar) return;
    finalizadaComDivergencia = true;
  }

  const payload = {
    nota_id: nota.id,
    conferente_matricula: state.user.matricula,
    observacao: form.get('observacao') || null,
    itens_conferidos: conferidos,
    status: finalizadaComDivergencia ? 'com_divergencia' : 'ok',
  };

  const { error } = await supabase.from('conferencias').insert(payload);
  if (error) return alert(`Erro ao enviar conferência: ${error.message}`);

  for (const item of divergentes) {
    await logAction('DIVERGENCIA', item.codigo, item.divergencia, `Nota ${nota.numero_nota}`, true);
  }
  if (!divergentes.length) {
    await logAction('CONFERENCIA_OK', null, 0, `Nota ${nota.numero_nota} sem divergências`, false);
  }

  alert('Conferência enviada com sucesso.');
  conferenciaForm.reset();
}

async function logAction(tipo, codigo, quantidadeDivergencia, mensagem, divergente) {
  await supabase.from('logs').insert({
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
  const { data } = await supabase.from('logs').select('*').order('created_at', { ascending: false });
  state.logs = data || [];
  logsContainer.innerHTML = '';
  state.logs.forEach((log) => {
    const row = document.createElement('div');
    row.className = `log ${log.divergente ? 'divergente' : ''}`;
    row.innerHTML = `<strong>${new Date(log.created_at).toLocaleString('pt-BR')}</strong> - 
      usuário ${log.usuario_matricula} - ${log.tipo} - cód: ${log.codigo || '-'} - divergência: ${log.quantidade_divergencia || 0} <br/>
      ${log.mensagem || ''}`;
    logsContainer.appendChild(row);
  });
}

async function loadConferencias() {
  const { data } = await supabase.from('conferencias').select('*').order('created_at', { ascending: false });
  adminConferencias.innerHTML = '';
  (data || []).forEach((conf) => {
    const div = document.createElement('div');
    const divergencias = (conf.itens_conferidos || []).filter((i) => i.divergencia !== 0);
    div.className = `conferencia ${divergencias.length ? 'divergente' : ''}`;
    div.innerHTML = `
      <p><strong>Conferente:</strong> ${conf.conferente_matricula}</p>
      <p><strong>Status:</strong> ${conf.status}</p>
      <p><strong>Observação:</strong> ${conf.observacao || '-'}</p>
      <p><strong>Divergências:</strong> ${divergencias.map((d) => `${d.codigo} (${d.divergencia})`).join(', ') || 'Nenhuma'}</p>
    `;
    adminConferencias.appendChild(div);
  });
}

async function recoverBySms() {
  const matricula = prompt('Informe a matrícula');
  if (!matricula) return;
  const telefone = prompt('Informe o telefone cadastrado (com DDI)');
  if (!telefone) return;

  const novaSenha = Math.random().toString(36).slice(-8);
  const { error } = await supabase
    .from('usuarios')
    .update({ senha: novaSenha })
    .eq('matricula', matricula)
    .eq('telefone', telefone);

  if (error) return alert(`Erro: ${error.message}`);

  await supabase.functions.invoke('send-sms', {
    body: { to: telefone, message: `Nova senha: ${novaSenha}` },
  });
  alert('Senha resetada. SMS enviado (requer edge function send-sms configurada).');
}

async function recoverByEmail() {
  const matricula = prompt('Informe a matrícula');
  if (!matricula) return;

  const novaSenha = Math.random().toString(36).slice(-8);
  const { error } = await supabase.from('usuarios').update({ senha: novaSenha }).eq('matricula', matricula);
  if (error) return alert(`Erro: ${error.message}`);

  await supabase.functions.invoke('send-email', {
    body: { to: 'leseliv487@fengnu.com', subject: 'Nova senha', text: `Nova senha: ${novaSenha}` },
  });

  alert('Senha resetada. Email enviado (requer edge function send-email configurada).');
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
  await supabase.from('logs').delete().neq('id', 0);
  loadLogs();
}

function printInvoice() {
  window.print();
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
  await supabase.from('chats').insert({
    from_matricula: state.user.matricula,
    from_role: state.user.role,
    to_role: destinoRole,
    mensagem: text,
  });
  input.value = '';
  loadChats();
}

async function loadChats() {
  if (!state.user) return;
  const { data } = await supabase
    .from('chats')
    .select('*')
    .or(`to_role.eq.${state.user.role},from_role.eq.${state.user.role}`)
    .order('created_at', { ascending: true });
  state.chats = (data || []).filter(
    (msg) => msg.to_role === state.user.role || msg.from_matricula === state.user.matricula,
  );

  const chatMessages = qs('chatMessages');
  chatMessages.innerHTML = '';
  state.chats.forEach((m) => {
    const p = document.createElement('p');
    p.className = m.from_matricula === state.user.matricula ? 'mine' : 'theirs';
    p.textContent = `${m.from_matricula}: ${m.mensagem}`;
    chatMessages.appendChild(p);
  });
  chatMessages.scrollTop = chatMessages.scrollHeight;
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

setInterval(() => {
  if (state.user) {
    loadChats();
    if (state.user.role === 'adm') {
      loadConferencias();
      loadLogs();
    }
  }
}, 6000);

bootstrapUser();
