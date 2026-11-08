const pptxgen = require('pptxgenjs');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const sharp = require('sharp');
const Fi = require('react-icons/fi');
const { applyTheme } = require('/root/.claude/skills/synced/5b54b351-1269-48c7-9925-d7e8d1d97815_80a2c1bc-2d84-4f10-af5a-cc59def8953d/pptx/scripts/apply_theme.js');

const OUT = '/home/user/buddhaspa/docs/sistema-eficiencia/Sistema_Eficiencia_Buddha_Spa_Apresentacao_v1.pptx';
const DASH = '/home/user/buddhaspa/docs/sistema-eficiencia/dashboards/';
const LOGO = '/home/user/buddhaspa/novo_logo_BUDDHA_SPA_fundo_branco.png';

const THEME = {
  name: 'Buddha Spa Eficiencia',
  headFontFace: 'Calibri', bodyFontFace: 'Calibri',
  colors: { dk1: '1C130C', lt1: 'FFFFFF', dk2: '392617', lt2: 'F6F0E8', accent1: 'B8862B', accent2: '5D3C29', accent3: '7E0000', accent4: '17998E', accent5: '4A6CC0', accent6: 'A8552A', hlink: '7E0000', folHlink: '5D3C29' },
};
const H = THEME.colors; // hex access for hex-only options

async function icon(IconComp, color, size = 256) {
  const svg = renderToStaticMarkup(React.createElement(IconComp, { color: '#' + color, size }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return 'image/png;base64,' + buf.toString('base64');
}

(async () => {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  pres.title = 'Sistema de Eficiência Buddha Spa';
  pres.author = 'Buddha Wellness Group';
  pres.company = 'Buddha Wellness Group';
  const C = pres.SchemeColor;
  const W = 13.333, Hh = 7.5;
  const FOOT = 'Sistema de Eficiência Buddha Spa · Visão geral · Confidencial';

  // ---- layouts
  pres.defineSlideMaster({ title: 'COVER', background: { color: H.dk2 }, objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: 0.8, y: 2.55, w: 9.5, h: 1.6, fontSize: 44, bold: true, color: H.lt1, margin: 0, valign: 'top' } } },
    { placeholder: { options: { name: 'body', type: 'body', x: 0.8, y: 4.2, w: 9.6, h: 1.2, fontSize: 20, color: 'D9B36A', margin: 0, valign: 'top' } } },
  ] });
  pres.defineSlideMaster({ title: 'DARK', background: { color: H.dk2 }, objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: 0.8, y: 0.55, w: 11.7, h: 0.8, fontSize: 30, bold: true, color: H.lt1, margin: 0, align: 'left' } } },
    { text: { text: FOOT, options: { x: 0.8, y: 7.02, w: 8, h: 0.3, fontSize: 9, color: 'B8A999', margin: 0 } } },
  ], slideNumber: { x: 12.2, y: 7.02, w: 0.6, h: 0.3, fontSize: 9, color: 'B8A999', align: 'right' } });
  pres.defineSlideMaster({ title: 'CONTENT', background: { color: H.lt1 }, objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.42, w: 12.1, h: 0.75, fontSize: 28, bold: true, color: H.dk2, margin: 0, valign: 'middle', align: 'left' } } },
    { text: { text: FOOT, options: { x: 0.6, y: 7.02, w: 8, h: 0.3, fontSize: 9, color: '8C7F74', margin: 0 } } },
  ], slideNumber: { x: 12.2, y: 7.02, w: 0.6, h: 0.3, fontSize: 9, color: '8C7F74', align: 'right' } });

  // helpers
  const txt = (s, t, o) => s.addText(t, Object.assign({ isTextBox: true, margin: 0, fontFace: 'Calibri' }, o));
  const rect = (s, o) => s.addShape(pres.ShapeType.rect, o);
  const rrect = (s, o) => s.addShape(pres.ShapeType.roundRect, Object.assign({ rectRadius: 0.1 }, o));
  const shadow = () => ({ type: 'outer', blur: 6, offset: 1, angle: 90, color: '392617', opacity: 0.12 });
  const bullets = (items, o = {}) => items.map((t, i) => ({ text: t, options: Object.assign({ bullet: true, breakLine: i < items.length - 1, paraSpaceAfter: 6 }, o) }));
  const subtitle = (s, t) => txt(s, t, { x: 0.6, y: 1.12, w: 12.1, h: 0.4, fontSize: 13, color: '8C7F74' });

  // icons (pre-render)
  const ic = {};
  const want = { split: [Fi.FiGitBranch, 'A8552A'], eye: [Fi.FiEyeOff, 'B8862B'], clock: [Fi.FiClock, '7E0000'], monitor: [Fi.FiActivity, '392617'], org: [Fi.FiCheckSquare, 'B8862B'], mood: [Fi.FiHeart, '7E0000'], dp: [Fi.FiUserCheck, '5D3C29'], rep: [Fi.FiSend, '4A6CC0'], gov: [Fi.FiShield, '6D6A64'], lock: [Fi.FiLock, 'FFFFFF'], db: [Fi.FiDatabase, '392617'], msg: [Fi.FiMessageSquare, '392617'], check: [Fi.FiCheckCircle, '3F8F4F'], alert: [Fi.FiAlertTriangle, 'B8862B'], users: [Fi.FiUsers, '392617'], layers: [Fi.FiLayers, 'FFFFFF'], zap: [Fi.FiZap, 'B8862B'], code: [Fi.FiCode, '7E0000'], flag: [Fi.FiFlag, 'B8862B'], cal: [Fi.FiCalendar, '392617'], brief: [Fi.FiBriefcase, '392617'], target: [Fi.FiTarget, '392617'], share: [Fi.FiShare2, '392617'], tool: [Fi.FiTool, '392617'], star: [Fi.FiStar, '392617'], map: [Fi.FiMap, '392617'], focus: [Fi.FiCrosshair, '392617'], moon: [Fi.FiMoon, '392617'], up: [Fi.FiTrendingUp, '392617'], grid: [Fi.FiGrid, '392617'], refresh: [Fi.FiRefreshCw, '392617'], award: [Fi.FiAward, '392617'], link: [Fi.FiLink, '392617'], sun: [Fi.FiSunrise, '392617'] };
  for (const k of Object.keys(want)) ic[k] = await icon(want[k][0], want[k][1]);

  // =============== 1. CAPA
  pres.addSection({ title: 'Abertura' });
  let s = pres.addSlide({ masterName: 'COVER', sectionTitle: 'Abertura' });
  s.addShape(pres.ShapeType.ellipse, { x: 9.3, y: -1.2, w: 6.2, h: 6.2, fill: { color: 'B8862B', transparency: 82 }, line: { color: 'B8862B', transparency: 100 } });
  s.addShape(pres.ShapeType.ellipse, { x: 10.4, y: 3.6, w: 4.8, h: 4.8, fill: { color: '5D3C29', transparency: 55 }, line: { color: '5D3C29', transparency: 100 } });
  s.addShape(pres.ShapeType.ellipse, { x: 0.8, y: 0.7, w: 1.5, h: 1.5, fill: { color: 'FFFFFF' }, line: { color: 'FFFFFF' } });
  s.addImage({ path: LOGO, x: 0.88, y: 0.78, w: 1.34, h: 1.34 });
  txt(s, 'DOCUMENTO DE VISÃO · NOVEMBRO 2026', { x: 0.8, y: 2.3, w: 8, h: 0.3, fontSize: 11, color: 'D9B36A', charSpacing: 3, bold: true });
  s.addText('Sistema de Eficiência Buddha Spa', { placeholder: 'title' });
  s.addText('Rede de agentes de IA para monitoramento, organização e ganho de eficiência da franqueadora', { placeholder: 'body' });
  txt(s, 'Buddha Wellness Group · Buddha Spa\nVisão para CEO, Tecnologia e Gente & Gestão · Confidencial', { x: 0.8, y: 6.3, w: 9, h: 0.7, fontSize: 12, color: 'D9C9B8' });
  s.addNotes('Abertura. Este material resume a visão de negócio do Sistema de Eficiência e acompanha o documento completo (PDF) e o documento técnico.');

  // =============== 2. O PROBLEMA
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Abertura' });
  s.addText('O problema que o sistema resolve', { placeholder: 'title' });
  subtitle(s, 'Cerca de 100 colaboradores, CLT e PJ, recebem demanda por sete canais e ninguém enxerga o todo');
  const probs = [
    ['split', 'Demanda fragmentada', 'Pedidos chegam por WhatsApp, Teams, e-mail, chamado SULTS, reunião, intranet e corredor. O Planner registra só uma parte. Não há visão única por pessoa nem por time.'],
    ['eye', 'Percepção sem medida', 'O diagnóstico NR-1 mostrou sensação de sobrecarga. Gestores não conseguem confirmar nem refutar: não existe medida de carga versus 44h, nem de previsto versus entregue.'],
    ['clock', 'Controles manuais e tardios', 'O cruzamento ponto x catraca x facial é feito à mão pelo DP, meses depois. Alertas chegam quando o problema já aconteceu.'],
  ];
  probs.forEach((p, i) => {
    const x = 0.6 + i * 4.1;
    rrect(s, { x, y: 1.75, w: 3.9, h: 3.55, fill: { color: H.lt2 }, line: { color: 'EAD9C6', width: 0.75 }, shadow: shadow() });
    s.addShape(pres.ShapeType.ellipse, { x: x + 0.3, y: 2.05, w: 0.7, h: 0.7, fill: { color: 'FFFFFF' }, line: { color: 'EAD9C6', width: 0.75 } });
    s.addImage({ data: ic[p[0]], x: x + 0.47, y: 2.22, w: 0.36, h: 0.36 });
    txt(s, p[1], { x: x + 0.3, y: 2.95, w: 3.3, h: 0.45, fontSize: 18, bold: true, color: C.text2 });
    txt(s, p[2], { x: x + 0.3, y: 3.45, w: 3.3, h: 1.7, fontSize: 13, color: '5F5148', valign: 'top' });
  });
  const stats = [['7', 'canais de entrada de demanda'], ['44h', 'de capacidade semanal sem medida de uso'], ['D+60', 'de atraso no fechamento manual de ponto x catraca'], ['26', 'ações do plano NR-1 que este sistema instrumenta']];
  stats.forEach((st, i) => {
    const x = 0.6 + i * 3.05;
    txt(s, st[0], { x, y: 5.55, w: 2.9, h: 0.7, fontSize: 34, bold: true, color: 'B8862B' });
    txt(s, st[1], { x, y: 6.25, w: 2.9, h: 0.5, fontSize: 11.5, color: '8C7F74' });
  });
  s.addNotes('Três sintomas que o diagnóstico NR-1 confirmou. O sistema ataca os três com dados que já existem nas ferramentas corporativas.');

  // =============== 3. A SOLUÇÃO
  s = pres.addSlide({ masterName: 'DARK', sectionTitle: 'Abertura' });
  s.addText('A solução em uma frase', { placeholder: 'title' });
  txt(s, 'Uma rede de seis agentes de IA que coleta diariamente o que já está nas ferramentas corporativas, transforma em uma visão única de demanda, carga, entrega, jornada e clima por pessoa, time e diretoria, devolve ao colaborador um copiloto diário de organização e aos gestores dashboards, alertas em tempo real e relatórios periódicos, tudo sob governança rígida de acesso, log e aprovação.', { x: 0.8, y: 1.55, w: 11.7, h: 2.1, fontSize: 20, color: 'FFFFFF', valign: 'top', lineSpacingMultiple: 1.15 });
  const ag = [['1', 'Monitor de Atividades', 'o que está acontecendo', 'monitor'], ['2', 'Organizador', 'copiloto do colaborador', 'org'], ['3', 'Termômetro de Humor', 'clima e stress por área', 'mood'], ['4', 'Gestão de DP', 'jornada e assiduidade', 'dp'], ['5', 'Reports e Alertas', 'a pessoa certa, na hora certa', 'rep'], ['6', 'Governança', 'acesso, log e parâmetros', 'gov']];
  ag.forEach((a, i) => {
    const x = 0.8 + i * 1.98;
    rrect(s, { x, y: 4.05, w: 1.84, h: 2.3, fill: { color: 'FFFFFF', transparency: 92 }, line: { color: 'D9B36A', width: 0.75, transparency: 40 } });
    s.addShape(pres.ShapeType.ellipse, { x: x + 0.25, y: 4.3, w: 0.6, h: 0.6, fill: { color: 'B8862B' }, line: { color: 'B8862B' } });
    txt(s, a[0], { x: x + 0.25, y: 4.3, w: 0.6, h: 0.6, fontSize: 18, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
    txt(s, a[1], { x: x + 0.2, y: 5.05, w: 1.5, h: 0.6, fontSize: 13, bold: true, color: 'FFFFFF', valign: 'top' });
    txt(s, a[2], { x: x + 0.2, y: 5.6, w: 1.5, h: 0.6, fontSize: 11, color: 'D9C9B8', valign: 'top' });
  });
  txt(s, 'Não é ferramenta punitiva · só lê, nunca escreve nas fontes · não substitui gestor, DP nem Jurídico · conversa pertence aos participantes', { x: 0.8, y: 6.5, w: 11.7, h: 0.4, fontSize: 11.5, color: 'D9B36A', italic: true });
  s.addNotes('Resumo da proposta. Reforçar o que o sistema não é: não pune, não escreve em nome de ninguém, não decide.');

  // =============== 4. PRINCÍPIOS
  pres.addSection({ title: 'Desenho' });
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Desenho' });
  s.addText('Dez princípios de desenho', { placeholder: 'title' });
  subtitle(s, 'Valem para todos os agentes e são o critério de aceite para o time de Tecnologia');
  const pr = [['Somente leitura nas fontes', 'Nenhum agente escreve em Teams, Outlook, WhatsApp, SULTS ou fSense. A única escrita é nos sistemas do próprio Sistema de Eficiência e, com confirmação do colaborador, no Planner.'],
    ['Dado observado é imutável', 'O fato bruto nunca é apagado. O que muda, com aprovação, é a classificação ou a justificativa. O De/Para fica para sempre.'],
    ['O colaborador vê o próprio espelho', 'Cada pessoa enxerga seus dados de atividade e jornada como o gestor os vê, exceto o Termômetro de Humor.'],
    ['Hierarquia define visibilidade', 'Gestor vê liderados; gestor de gestores vê a árvore; diretor vê a diretoria; CEO vê tudo; DP e G&G veem toda a jornada.'],
    ['Conversa pertence aos participantes', 'Conteúdo só gera dado para quem participou e para o diretor da área. Nada é inferido de conversas de terceiros.'],
    ['Separação entre medir e julgar', 'Os agentes medem, classificam e alertam. Avaliação, disciplina e folha continuam processos humanos.'],
    ['Aprovação sempre no Teams', 'Colaborador solicita, gestor decide em card. Após 48h úteis, dados de jornada sobem ao DP. Tudo com log.'],
    ['Minimização e retenção', 'Conteúdo bruto retido por prazo curto; ficam metadados e classificações. Screenshots do fSense ficam fora dos dashboards.'],
    ['Parametrizável com dupla aprovação', 'Limiares, taxonomias e horários em um painel. Mudanças exigem duas pessoas de TI; o diretor ajusta só a própria área.'],
    ['Explicável', 'Todo KPI, alerta ou sugestão mostra quais fatos o geraram, com link para a origem. Sem caixa-preta.']];
  pr.forEach((p, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.6 + col * 6.15, y = 1.65 + row * 1.08;
    rrect(s, { x, y, w: 5.95, h: 0.98, fill: { color: 'FFFFFF' }, line: { color: 'E6DDD3', width: 0.75 }, shadow: shadow() });
    s.addShape(pres.ShapeType.ellipse, { x: x + 0.18, y: y + 0.24, w: 0.5, h: 0.5, fill: { color: H.lt2 }, line: { color: 'EAD9C6', width: 0.5 } });
    txt(s, String(i + 1), { x: x + 0.18, y: y + 0.24, w: 0.5, h: 0.5, fontSize: 14, bold: true, color: 'B8862B', align: 'center', valign: 'middle' });
    txt(s, p[0], { x: x + 0.82, y: y + 0.1, w: 5, h: 0.3, fontSize: 13.5, bold: true, color: C.text2 });
    txt(s, p[1], { x: x + 0.82, y: y + 0.4, w: 5, h: 0.55, fontSize: 10.5, color: '5F5148', valign: 'top' });
  });
  s.addNotes('Os dez princípios resolvem antecipadamente as dúvidas de implementação. O time de TI deve usá-los como critério de aceite.');

  // =============== 5. ARQUITETURA
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Desenho' });
  s.addText('Arquitetura funcional: a rede de agentes', { placeholder: 'title' });
  subtitle(s, 'A camada de coleta traz e normaliza; os agentes 1 a 4 interpretam; o 5 comunica; o 6 governa. O Orquestrador aciona cada um na hora certa');
  const layers = [
    ['Camada 0 · Fontes', ['Microsoft 365: Teams, Outlook, Calendário, Planner, OneDrive, SharePoint', 'Databricks: SULTS, Control iD, intranet, portal jurídico', 'fSense (toda a empresa)', 'WhatsApp Web (exportação)', 'Trello pontual · Feedz secundário', 'SO da estação'], 'F6F0E8', '392617'],
    ['Camada 1 · Coleta e classificação', ['Coletor diário por fonte, incremental, isolado', 'Classificador IA: Demanda, Interação, Bloco de tempo, Evento de jornada, Sinal de humor', 'Cadastro de pessoas e hierarquia (fonte das permissões)'], 'EAD9C6', '392617'],
    ['Camada 2 · Agentes de negócio', ['1 · Monitor de Atividades', '2 · Organizador de Atividades', '3 · Termômetro de Comunicação e Humor', '4 · Gestão de DP'], '5D3C29', 'FFFFFF'],
    ['Camada 3 · Comunicação e governança', ['5 · Reports e Alertas', '6 · Governança, Auditoria e Parametrização', 'Orquestrador: agenda, encadeia, reprocessa, registra'], '392617', 'FFFFFF'],
    ['Camada 4 · Canais', ['Dashboards web com filtros', 'Teams: cards de alerta e de aprovação, resumo das 08h, chat', 'E-mail: relatórios em PDF', 'Chat do colaborador'], 'F6F0E8', '392617'],
  ];
  layers.forEach((L, i) => {
    const y = 1.62 + i * 1.05;
    rrect(s, { x: 0.6, y, w: 2.6, h: 0.92, fill: { color: L[2] }, line: { color: L[2] } });
    txt(s, L[0], { x: 0.75, y, w: 2.35, h: 0.92, fontSize: 13, bold: true, color: L[3], valign: 'middle' });
    const n = L[1].length, gw = 9.45, gap = 0.1, cw = (gw - gap * (n - 1)) / n;
    L[1].forEach((t, j) => {
      const x = 3.3 + j * (cw + gap);
      rrect(s, { x, y, w: cw, h: 0.92, fill: { color: 'FFFFFF' }, line: { color: 'E6DDD3', width: 0.75 }, shadow: shadow() });
      rect(s, { x: x + 0.12, y: y + 0.12, w: 0.06, h: 0.68, fill: { color: i === 2 ? 'B8862B' : i === 3 ? '7E0000' : 'A8552A' }, line: { color: 'FFFFFF', transparency: 100 } });
      txt(s, t, { x: x + 0.27, y, w: cw - 0.35, h: 0.92, fontSize: n > 4 ? 9.5 : 10.5, color: '241A12', valign: 'middle' });
    });
    if (i < layers.length - 1) txt(s, '▼', { x: 1.75, y: y + 0.9, w: 0.3, h: 0.17, fontSize: 9, color: 'B8862B', align: 'center' });
  });
  s.addNotes('Separar coleta, classificação e interpretação permite trocar uma fonte sem quebrar o resto, aplicar permissões em um ponto só e auditar onde cada dado nasceu.');

  // =============== 6. FONTES
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Desenho' });
  s.addText('Fontes de dados', { placeholder: 'title' });
  subtitle(s, 'Tudo o que já existe nas ferramentas contratadas. Coleta somente leitura, incremental, com retenção curta do conteúdo bruto');
  const fontes = [
    ['msg', 'Microsoft 365', 'Teams (chats, canais, reuniões e transcrições), Outlook, Calendário, OneDrive e SharePoint. O Planner é a ferramenta principal de tarefas: referência de demanda formal planejada. Adoção ainda baixa, que o Organizador ajuda a acelerar.', 'Horária'],
    ['db', 'Databricks (lakehouse)', 'SULTS (chamados de franqueados e entre áreas, SLAs), Control iD (catraca, ponto, reconhecimento facial), intranet e portal jurídico. Recebe também as novas fontes.', 'Diária, ideal horária'],
    ['monitor', 'fSense · já em toda a empresa', 'Tempo por aplicação e site, categoria trabalho/pessoal/não aprovado, atividade e ociosidade, jornada aderida. Screenshots e geolocalização existem na ferramenta, mas ficam fora dos agentes.', 'Diária, ideal horária'],
    ['share', 'WhatsApp Web corporativo', 'Leitura por exportação de conversas e transcrição de áudios a partir da estação ligada, sem API oficial e sem escrita. Identifica demanda, prazo e tom. Nunca o número pessoal.', 'Contínua com estação ativa'],
    ['grid', 'Trello e Asana residual', 'Trello para quem ainda usa; Asana mantido só para poucos colaboradores após o cancelamento geral. Nomenclaturas unificadas com o Planner.', 'Horária'],
    ['users', 'Feedz e cadastro de pessoas', 'Feedz com pouco uso e em avaliação: só agregados, sem KPI relevante apoiado nele. Cadastro de pessoas e hierarquia mantido por G&G, com vigência, é a fonte das permissões.', 'Diária / sob demanda'],
  ];
  fontes.forEach((f, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.6 + col * 6.15, y = 1.65 + row * 1.75;
    rrect(s, { x, y, w: 5.95, h: 1.62, fill: { color: 'FFFFFF' }, line: { color: 'E6DDD3', width: 0.75 }, shadow: shadow() });
    s.addShape(pres.ShapeType.ellipse, { x: x + 0.2, y: y + 0.22, w: 0.62, h: 0.62, fill: { color: H.lt2 }, line: { color: 'EAD9C6', width: 0.5 } });
    s.addImage({ data: ic[f[0]], x: x + 0.36, y: y + 0.38, w: 0.3, h: 0.3 });
    txt(s, f[1], { x: x + 1.0, y: y + 0.12, w: 3.0, h: 0.35, fontSize: 14, bold: true, color: C.text2 });
    txt(s, f[3], { x: x + 3.9, y: y + 0.16, w: 1.95, h: 0.3, fontSize: 9.5, color: 'B8862B', bold: true, align: 'right' });
    txt(s, f[2], { x: x + 1.0, y: y + 0.5, w: 4.8, h: 1.05, fontSize: 10.5, color: '5F5148', valign: 'top' });
  });
  s.addNotes('O Planner substitui o Asana como ferramenta principal de tarefas. O Feedz tem pouco uso e pode ser desativado, por isso nenhum KPI importante depende dele.');

  // =============== AGENT SLIDES
  pres.addSection({ title: 'Agentes' });
  const agentSlide = (num, title, who, img, items, notes, color) => {
    const sl = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Agentes' });
    sl.addShape(pres.ShapeType.ellipse, { x: 0.6, y: 0.45, w: 0.7, h: 0.7, fill: { color }, line: { color } });
    txt(sl, String(num), { x: 0.6, y: 0.45, w: 0.7, h: 0.7, fontSize: 22, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
    txt(sl, title, { x: 1.45, y: 0.42, w: 11.2, h: 0.5, fontSize: 28, bold: true, color: C.text2, valign: 'middle' });
    txt(sl, who, { x: 1.45, y: 0.92, w: 11.2, h: 0.3, fontSize: 11.5, color: '8C7F74' });
    sl.addText(bullets(items, { fontSize: 12.5, color: '241A12', paraSpaceAfter: 9 }), { x: 0.6, y: 1.5, w: 4.0, h: 5.3, isTextBox: true, margin: 0, valign: 'top', fontFace: 'Calibri' });
    rrect(sl, { x: 4.78, y: 1.5, w: 8.0, h: 4.5, fill: { color: 'FFFFFF' }, line: { color: 'E6DDD3', width: 0.75 }, shadow: shadow() });
    sl.addImage({ path: DASH + img, x: 4.85, y: 1.57, w: 7.86, h: 4.42 });
    txt(sl, 'Mockup ilustrativo do dashboard · dados fictícios', { x: 4.78, y: 6.05, w: 8, h: 0.3, fontSize: 9.5, color: '8C7F74', italic: true, align: 'right' });
    sl.addNotes(notes);
    return sl;
  };
  agentSlide(1, 'Monitor de Atividades', 'Vê: colaborador (o próprio) · gestor (liderados) · gestor de gestores (árvore) · diretor (área) · CEO (tudo). Edita: ninguém diretamente', 'monitor_colaborador.png', [
    'Mostra, sem opinião, o que está acontecendo: carga versus 44h, origem (gestor, outra área, franqueado, CEO, cliente), canal (Planner, SULTS, Teams, e-mail, WhatsApp) e planejamento (formal planejada, formal reativa, informal).',
    'Previsto x entregue, SLAs do SULTS, aderência de estimativa, mix de tipo de atividade, ferramentas mais usadas, rede de interações, fragmentação e blocos de foco.',
    'Visão consolidada do time: mapa de calor pessoa x semana, concentração de demanda, pontos únicos de falha, temas da semana e alertas de sobrecarga ou ociosidade.',
    'Todo indicador abre o relatório detalhado das linhas que o compõem. O colaborador não altera o Monitor: se discorda, pede ajuste e o gestor decide via Teams, com De/Para e log.',
  ], 'Base factual dos demais agentes. O ranking é de carga, para redistribuição, nunca de desempenho.', '392617');

  // relatório detalhado (drill-down)
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Agentes' });
  s.addText('Do indicador ao detalhe: relatório detalhado de atividades', { placeholder: 'title' });
  subtitle(s, 'Qualquer número, barra ou célula dos dashboards abre a lista das linhas que o compõem, com os mesmos filtros e permissões');
  s.addText(bullets([
    'Ao clicar, por exemplo, em "demandas via SULTS", aparecem todas as demandas desse canal: data de chegada, o que é, quem demandou, origem, pessoa, departamento, planejamento, prazo ou SLA, estimado e realizado, status e link para a fonte.',
    'Filtros por período, pessoa, departamento, origem, canal, demandante, tipo, status e tema; agrupamento, ordenação e exportação em Excel e PDF.',
    'Cada linha abre o histórico completo: chegada, classificação, entrada no Organizador, sugestões e ajustes aprovados.',
    'Herda a permissão do dashboard de origem; totais do detalhe sempre batem com o indicador clicado.',
  ], { fontSize: 12.5, color: '241A12', paraSpaceAfter: 9 }), { x: 0.6, y: 1.5, w: 4.0, h: 5.3, isTextBox: true, margin: 0, valign: 'top', fontFace: 'Calibri' });
  rrect(s, { x: 4.78, y: 1.5, w: 8.0, h: 4.5, fill: { color: 'FFFFFF' }, line: { color: 'E6DDD3', width: 0.75 }, shadow: shadow() });
  s.addImage({ path: DASH + 'relatorio_detalhado.png', x: 4.85, y: 1.57, w: 7.86, h: 4.42 });
  txt(s, 'Mockup ilustrativo do relatório detalhado · dados fictícios', { x: 4.78, y: 6.05, w: 8, h: 0.3, fontSize: 9.5, color: '8C7F74', italic: true, align: 'right' });
  s.addNotes('Rastreabilidade de cada KPI: o detalhe em linhas é a prova do indicador. Vale para Monitor, DP e Reports; o Termômetro mostra apenas sinais agregados.');

  // faixas de carga slide
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Agentes' });
  s.addText('Faixas de carga: como o termômetro lê a semana', { placeholder: 'title' });
  subtitle(s, 'Índice de carga = carga estimada da semana ÷ capacidade (44h; 40h quando a lei mudar; PJ pela jornada contratual). Limiares parametrizáveis');
  const faixas = [['Até 65%', 'Possível ociosidade', 'Alerta ao gestor após 2 semanas, cruzado com ociosidade do fSense', '7F8AA3'], ['65 a 90%', 'Saudável', 'Faixa alvo. Nenhuma ação', '3F8F4F'], ['90 a 100%', 'Atenção', 'Organizador sugere replanejamento; gestor vê no consolidado', 'B8862B'], ['Acima de 100%', 'Sobrecarga', 'Alerta ao gestor em 2 semanas seguidas ou pico acima de 120%; diretor em 4 semanas', 'C0392B']];
  faixas.forEach((f, i) => {
    const x = 0.6 + i * 3.08;
    rrect(s, { x, y: 1.7, w: 2.93, h: 1.95, fill: { color: 'FFFFFF' }, line: { color: 'E6DDD3', width: 0.75 }, shadow: shadow() });
    s.addShape(pres.ShapeType.ellipse, { x: x + 0.25, y: 1.95, w: 0.32, h: 0.32, fill: { color: f[3] }, line: { color: f[3] } });
    txt(s, f[0], { x: x + 0.7, y: 1.9, w: 2.1, h: 0.42, fontSize: 20, bold: true, color: C.text2 });
    txt(s, f[1], { x: x + 0.25, y: 2.4, w: 2.5, h: 0.35, fontSize: 14, bold: true, color: f[3] });
    txt(s, f[2], { x: x + 0.25, y: 2.78, w: 2.5, h: 0.8, fontSize: 10.5, color: '5F5148', valign: 'top' });
  });
  const people = ['Colab. A', 'Colab. B', 'Colab. C', 'Colab. D', 'Colab. E', 'Colab. F', 'Colab. G', 'Colab. H', 'Colab. I', 'Colab. J'];
  const vals = [106, 83, 112, 70, 91, 103, 63, 96, 84, 99];
  s.addChart(pres.ChartType.bar, [{ name: 'Índice de carga (%)', labels: people, values: vals }], {
    x: 0.6, y: 3.9, w: 8.2, h: 3.0, barDir: 'col', chartColors: ['5D3C29'], showTitle: true, title: 'Exemplo: índice de carga do time na semana (dados fictícios)', titleFontSize: 11, titleColor: '392617', titleFontFace: '+mn-lt',
    showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 9, dataLabelColor: '5F5148', dataLabelFontFace: '+mn-lt', dataLabelFormatCode: '0"%"',
    catAxisLabelColor: '8C7F74', catAxisLabelFontSize: 9, catAxisLabelFontFace: '+mn-lt', valAxisLabelColor: '8C7F74', valAxisLabelFontSize: 9, valAxisLabelFontFace: '+mn-lt', valAxisMinVal: 0, valAxisMaxVal: 130, valAxisMajorUnit: 25,
    valGridLine: { color: 'ECE5DC', size: 0.5 }, catGridLine: { style: 'none' }, showLegend: false, barGapWidthPct: 60,
  });
  rrect(s, { x: 9.05, y: 3.9, w: 3.68, h: 3.0, fill: { color: H.lt2 }, line: { color: 'EAD9C6', width: 0.75 } });
  s.addText(bullets(['Carga estimada = estimativas das demandas abertas na semana + horas de reunião agendadas + tempo médio histórico de resposta a interações.', 'Estimativa inicial vem do histórico do próprio colaborador e da área; o colaborador ajusta no Organizador e o ajuste fica registrado.', 'Neste exemplo três pessoas estão acima de 100% e uma abaixo de 65%: o gestor recebe alerta e a visão de redistribuição.'], { fontSize: 10.5, color: '241A12', paraSpaceAfter: 6 }), { x: 9.25, y: 4.05, w: 3.3, h: 2.75, isTextBox: true, margin: 0, valign: 'top', fontFace: 'Calibri' });
  s.addNotes('Faixas definidas pela direção: até 65% ociosidade; 65 a 90% saudável; 90 a 100% atenção; acima de 100% sobrecarga.');

  agentSlide(2, 'Organizador de Atividades', 'Vê e edita: o próprio colaborador. Vê e sugere: gestor, gestor de gestores, diretor, CEO. O plano é gestão do colaborador', 'organizador.png', [
    'Copiloto pessoal: reúne tudo o que a pessoa tem no colo (Planner, SULTS, atas de reunião, pedidos em e-mail, Teams e WhatsApp dirigidos a ela) e propõe o plano da semana e do mês, com estimativas e prioridades.',
    'Só entra o que teve interação com o próprio colaborador. Itens detectados chegam como "propostos" e são aceitos, ajustados ou descartados por ele.',
    'Chat em linguagem natural para mudar estimativas, mover prazos, cancelar, adicionar demandas e anexar arquivos. Tudo em log. Pode criar a tarefa no Planner com um clique.',
    'O gestor pode propor mudança de prioridade: chega como sugestão, só vale se o colaborador acatar. Mudanças diretas do gestor acontecem apenas nos sistemas de origem, como Planner e SULTS.',
    'Resumo diário às 08h no Teams para cada colaborador e consolidado para o gestor.',
  ], 'O Organizador é a parte do sistema em que o colaborador manda. Isso sustenta o engajamento e a adoção do Planner.', 'B8862B');

  agentSlide(3, 'Termômetro de Comunicação e Humor', 'Vê: diretor da área (sua área), Diretoria de G&G e CEO (tudo). Colaboradores e gestores intermediários não acessam', 'termometro_humor.png', [
    'Lê tom e padrões de comunicação em Teams, e-mail, WhatsApp corporativo e SULTS: mensagens tensas ou urgentes, fora do horário, tempo de resposta caindo, escalonamentos. Feedz entra só como sinal secundário e agregado.',
    'Índice de 0 a 100 por time e área (0 a 35 sereno, 36 a 65 atenção, 66 a 100 crítico), tendência, mapa de atrito entre áreas, temas de tensão e correlação com carga e jornada.',
    'Pessoa em faixa crítica e conversa sensível geram alerta imediato ao diretor da área e à Diretoria de G&G, sem transcrição do conteúdo.',
    'Finalidade preventiva, alinhada à NR-1. Não embasa avaliação, PDI, folha ou decisão disciplinar. Todo acesso a conteúdo fica em log nominal.',
  ], 'Termômetro informativo para a liderança. Áreas com menos de 4 pessoas mostram só a faixa.', '7E0000');

  agentSlide(4, 'Gestão de DP: jornada, assiduidade e aderência', 'Vê: colaborador (o próprio), gestor (liderados), Diretoria de G&G e equipe de DP (tudo), CEO. Altera dado de RH: somente DP', 'dp_jornada.png', [
    'Cruza automaticamente ponto, catraca, reconhecimento facial, atividade na estação (fSense e SO) e calendário. Substitui as planilhas manuais de ponto x catraca.',
    'Detecta inconsistências: ponto remoto com catraca mais de 10 minutos depois, ponto sem catraca, catraca sem ponto, estação inativa dentro do ponto, geolocalização fora do raio.',
    'Toda inconsistência notifica colaborador e gestor via Teams às 08h do dia seguinte; o colaborador tem 48h úteis para justificar e o gestor decide. Depois disso, só o DP aprova.',
    'Horas extras, trabalho fora do horário e ociosidade na jornada são vistos pelo gestor da área, DP e G&G, não pelo colaborador.',
    'Banco de horas recalculado a cada aprovação; fechamento mensal com divergências e saldos para o DP. Nada vai para a folha sem validação humana.',
  ], 'PJ não tem ponto nem folha: mede-se apenas aderência à jornada contratual para gestão de capacidade.', '5D3C29');

  agentSlide(5, 'Reports e Alertas', 'Entrega para colaboradores, gestores, diretores, Diretoria de G&G, equipe de DP e CEO, cada um no seu recorte', 'relatorio_ceo.png', [
    'Diário às 08h: resumo do dia para cada colaborador; consolidado dos liderados e aprovações pendentes para o gestor; inconsistências de jornada para o DP.',
    'Semanal (segunda, 08h): semana do time para gestores e diretores; termômetro de humor da área para o diretor.',
    'Mensal (1º dia útil): relatório da área para o diretor; da empresa para o CEO; de pessoas e jornada para G&G e DP; de logs para TI. Inclui destaques positivos e decisões sugeridas.',
    'Tempo real: conversa sensível, faixa crítica de humor, gargalo de entrega, tema importante fora da agenda, SLA vencendo, irregularidade de ponto, sobrecarga sustentada. Regra anti-ruído com limite diário por severidade.',
  ], 'A matriz completa de relatórios e o catálogo de alertas estão no documento de visão.', '4A4F5C');

  // =============== 13. GOVERNANÇA
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Agentes' });
  s.addShape(pres.ShapeType.ellipse, { x: 0.6, y: 0.45, w: 0.7, h: 0.7, fill: { color: '6D6A64' }, line: { color: '6D6A64' } });
  txt(s, '6', { x: 0.6, y: 0.45, w: 0.7, h: 0.7, fontSize: 22, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
  txt(s, 'Governança, Auditoria e Parametrização', { x: 1.45, y: 0.42, w: 11.2, h: 0.5, fontSize: 28, bold: true, color: C.text2, valign: 'middle' });
  txt(s, 'Quem vê o quê, como um dado muda, o que fica registrado e como as regras são ajustadas', { x: 1.45, y: 0.92, w: 11.2, h: 0.3, fontSize: 11.5, color: '8C7F74' });
  const hdr = ['Perfil', 'Monitor (1)', 'Organizador (2)', 'Humor (3)', 'DP (4)', 'Reports (5)', 'Parâmetros (6)'];
  const rows = [
    ['Colaborador', 'Próprio (leitura)', 'Próprio (edita)', '—', 'Próprio; contesta em 48h', 'Resumo diário', '—'],
    ['Gestor direto', 'Liderados', 'Liderados (leitura e sugestão)', '—', 'Liderados; aprova em 48h; vê extras e ociosidade', 'Diário e semanal do time', '—'],
    ['Gestor de gestores', 'Árvore abaixo', 'Árvore (leitura)', '—', 'Árvore; escalonamento', 'Semanal consolidado', '—'],
    ['Diretor de área', 'Diretoria', 'Diretoria (leitura)', 'Sua área', 'Diretoria', 'Semanal e mensal; alertas', 'Parâmetros da área'],
    ['Diretoria de G&G', 'Empresa', 'Empresa (leitura)', 'Empresa', 'Empresa', 'Mensal de pessoas e humor', 'Limiares de humor e jornada'],
    ['Equipe de DP', '—', '—', '—', 'Empresa; aprova fora da janela e dados de RH', 'Diário e mensal de DP', 'Regras de banco de horas'],
    ['CEO', 'Tudo', 'Tudo (leitura)', 'Tudo', 'Tudo', 'Mensal da empresa; críticos', 'Leitura e auditoria'],
    ['TI (administração)', 'Metadados e logs', 'Metadados e logs', '—', 'Metadados e logs', 'Relatório de logs', 'Tudo, com dupla aprovação'],
  ];
  const tbl = [hdr.map(h => ({ text: h, options: { bold: true, color: 'FFFFFF', fill: { color: '392617' }, fontSize: 10 } }))].concat(rows.map((r, i) => r.map((c, j) => ({ text: c, options: { fontSize: 9.5, color: c === '—' ? 'B4A79A' : '241A12', bold: j === 0, fill: { color: i % 2 ? 'FBF8F4' : 'FFFFFF' } } }))));
  s.addTable(tbl, { x: 0.6, y: 1.4, w: 8.3, colW: [1.35, 1.1, 1.3, 0.85, 1.55, 1.2, 0.95], border: { type: 'solid', color: 'E6DDD3', pt: 0.5 }, fontFace: 'Calibri', valign: 'middle', margin: 0.05, rowH: 0.45 });
  rrect(s, { x: 9.15, y: 1.4, w: 3.58, h: 5.4, fill: { color: H.lt2 }, line: { color: 'EAD9C6', width: 0.75 } });
  txt(s, 'Regras que não mudam', { x: 9.35, y: 1.55, w: 3.2, h: 0.35, fontSize: 14, bold: true, color: C.text2 });
  s.addText(bullets(['Colaborador nunca muda o próprio dado: pede, e o gestor decide via Teams com De/Para.', 'Dado de RH só muda com aprovação do DP, mesmo quando pedido por gestor.', 'Gestores têm chat exclusivo de Alteração de Dados; o colaborador é notificado e pode contestar.', 'Logs de acesso, alteração e operação são imutáveis e vão em relatório mensal para TI; G&G e CEO auditam a qualquer momento.', 'Parâmetros globais: dupla aprovação de TI, uma delas o gestor de TI. Diretor ajusta pesos, limiares e temas da própria área dentro de faixas.', 'TI administra sem ver conteúdo: metadados e logs apenas.'], { fontSize: 10.5, color: '241A12', paraSpaceAfter: 6 }), { x: 9.35, y: 1.95, w: 3.2, h: 4.7, isTextBox: true, margin: 0, valign: 'top', fontFace: 'Calibri' });
  s.addNotes('Matriz de acesso derivada automaticamente do cadastro de hierarquia mantido por G&G.');

  // =============== 14. FLUXO DE/PARA
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Agentes' });
  s.addText('Fluxo de contestação e aprovação via Teams', { placeholder: 'title' });
  subtitle(s, 'Vale para dados de atividade (Monitor) e de jornada (DP). O fato bruto nunca muda; muda a classificação, com De/Para e log');
  const steps = [['Dado computado', 'D+1 o dado aparece no painel do colaborador e do gestor. Inconsistências de DP são notificadas às 08h do dia seguinte a ambos.', '392617'], ['Colaborador justifica', 'No chat: "das 14h às 16h estava em reunião com franqueado sem agenda". Anexa evidência. Relógio de 48h úteis começa na notificação.', '5D3C29'], ['Card para o gestor', 'De e Para lado a lado, link para o fato de origem, botões Aprovar, Recusar e Pedir informação. Prazo de 2 dias úteis; sem resposta escala ao gestor do gestor e avisa o DP.', 'B8862B'], ['Decisão registrada', 'Aprovado: classificação muda, fato bruto fica, log guarda quem, quando e o quê. Recusado: colaborador recebe o motivo.', '3F8F4F'], ['Fora da janela ou dado de RH', 'Depois das 48h, ou sempre que for ponto, horas ou banco: o gestor só recomenda e o DP decide.', '7E0000']];
  steps.forEach((st, i) => {
    const x = 0.6 + i * 2.48;
    rrect(s, { x, y: 1.9, w: 2.33, h: 3.6, fill: { color: 'FFFFFF' }, line: { color: 'E6DDD3', width: 0.75 }, shadow: shadow() });
    s.addShape(pres.ShapeType.ellipse, { x: x + 0.2, y: 2.1, w: 0.55, h: 0.55, fill: { color: st[2] }, line: { color: st[2] } });
    txt(s, String(i + 1), { x: x + 0.2, y: 2.1, w: 0.55, h: 0.55, fontSize: 16, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
    txt(s, st[0], { x: x + 0.2, y: 2.8, w: 1.95, h: 0.6, fontSize: 14, bold: true, color: C.text2, valign: 'top' });
    txt(s, st[1], { x: x + 0.2, y: 3.4, w: 1.95, h: 2.0, fontSize: 10.5, color: '5F5148', valign: 'top' });
    if (i < 4) txt(s, '›', { x: x + 2.3, y: 3.3, w: 0.2, h: 0.5, fontSize: 24, color: 'B8862B', align: 'center' });
  });
  const kp = [['08h', 'notificação no dia seguinte, para colaborador e gestor'], ['48h úteis', 'para justificar; depois a alçada sobe ao DP'], ['2 dias úteis', 'para o gestor decidir antes de escalar'], ['100%', 'das alterações com log imutável e relatório para TI']];
  kp.forEach((k, i) => {
    const x = 0.6 + i * 3.08;
    rrect(s, { x, y: 5.8, w: 2.93, h: 1.0, fill: { color: H.lt2 }, line: { color: 'EAD9C6', width: 0.75 } });
    txt(s, k[0], { x: x + 0.2, y: 5.88, w: 2.6, h: 0.45, fontSize: 20, bold: true, color: 'B8862B' });
    txt(s, k[1], { x: x + 0.2, y: 6.3, w: 2.6, h: 0.45, fontSize: 10, color: '5F5148' });
  });
  s.addNotes('O Teams é o canal de aprovação porque todos já o usam, registra quem clicou e quando, e abre o dashboard pelo próprio card.');

  // =============== 15. COMPLEMENTARES
  pres.addSection({ title: 'Escopo e entrega' });
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Escopo e entrega' });
  s.addText('Funcionalidades transversais de gestão', { placeholder: 'title' });
  subtitle(s, 'Catorze capacidades que atravessam os agentes, usam os mesmos dados e entram em produção ao longo das três fases');
  const comp = [['cal', 'Eficiência de reuniões', 'horas, participantes, sem pauta ou ata, sobreposições'], ['map', 'Matriz de demanda área x área', 'quem demanda quem, com volume, canal e SLA'], ['brief', 'Demandas de franqueados', 'volume, tema e canal por franquia; o que vira FAQ'], ['target', 'Rastreador de pedidos do CEO e da diretoria', 'status e responsável sem precisar perguntar'], ['alert', 'Ponto único de falha', 'demandas que só uma pessoa atende; base para sucessão'], ['focus', 'Blocos de foco e fragmentação', 'tempo contínuo sem interrupção; blocos sugeridos'], ['moon', 'Fora do horário como risco NR-1', 'mensagens e atividade fora da janela, por pessoa e área'], ['check', 'Formalização assistida no Planner', 'demanda informal vira tarefa ou chamado com um clique'], ['up', 'Capacidade por área', 'horas de demanda versus disponíveis; insumo de dimensionamento'], ['users', 'Onboarding de novos colaboradores', 'plano dos 90 dias; sinal de subcarga ou isolamento'], ['tool', 'Shadow IT e uso não aprovado', 'aplicações relevantes por área para Segurança da Informação'], ['award', 'Reconhecimento positivo', 'relatórios destacam entregas no prazo e boas práticas'], ['link', 'Sincronização de nomenclaturas', 'Planner, Trello e SULTS com prioridade, status e prazo comparáveis'], ['sun', 'Modo "semana que vem"', 'toda sexta o plano da próxima semana e a visão do gestor para redistribuir']];
  comp.forEach((c, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.6 + col * 6.15, y = 1.6 + row * 0.76;
    rrect(s, { x, y, w: 5.95, h: 0.66, fill: { color: 'FFFFFF' }, line: { color: 'E6DDD3', width: 0.75 } });
    s.addShape(pres.ShapeType.ellipse, { x: x + 0.14, y: y + 0.13, w: 0.4, h: 0.4, fill: { color: H.lt2 }, line: { color: 'EAD9C6', width: 0.5 } });
    s.addImage({ data: ic[c[0]], x: x + 0.24, y: y + 0.23, w: 0.2, h: 0.2 });
    txt(s, c[1], { x: x + 0.68, y: y + 0.07, w: 5.2, h: 0.28, fontSize: 12, bold: true, color: C.text2 });
    txt(s, c[2], { x: x + 0.68, y: y + 0.35, w: 5.2, h: 0.28, fontSize: 10, color: '5F5148' });
  });
  s.addNotes('Funcionalidades transversais do sistema, distribuídas entre as fases 1 a 3 do roadmap.');

  // =============== 16. ROADMAP
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Escopo e entrega' });
  s.addText('Roadmap: 100% implantado em 6 meses', { placeholder: 'title' });
  subtitle(s, 'Toda a empresa desde a Fase 1, sem piloto: o fSense já está em todas as estações e as demais fontes já existem');
  const ph = [['Fase 1 · Meses 1 e 2', 'Fundação e controle', ['Cadastro de pessoas e hierarquia saneado por G&G', 'Coletor: Microsoft 365, Databricks (SULTS, Control iD), fSense, Planner, Trello', 'Agente 1 Monitor: carga, origem, canal, previsto x entregue, ferramentas', 'Agente 4 DP: cruzamento completo, notificação 08h, contestação em 48h', 'Agente 6: matriz de acesso, fluxo De/Para, logs', 'Agente 5: resumo das 08h simples; alertas de jornada e SLA', 'Complementos: rastreador do CEO, shadow IT, reconhecimento, nomenclaturas'], '392617'],
    ['Fase 2 · Meses 3 e 4', 'Copiloto e clima', ['Agente 2 Organizador completo: kanban, chat, estimativas, upload, formalização assistida no Planner', 'WhatsApp Web por exportação; transcrições de reunião', 'Agente 3 Termômetro por área, após comunicado e política interna', 'Relatórios semanais e mensais por público; catálogo completo de alertas', 'Painel de parametrização com dupla aprovação; parâmetros do diretor', 'Complementos: reuniões, franqueados, foco, fora do horário, "semana que vem"'], 'B8862B'],
    ['Fase 3 · Meses 5 e 6', 'Inteligência e integração', ['Matriz área x área, capacidade por área, ponto único de falha, retrabalho', 'Correlação carga x humor x horas; onboarding', 'Aprendizado contínuo das estimativas e taxonomias por área', 'Integração dos saldos de banco de horas com a folha, com validação do DP', 'Revisão de finalidades e retenção com Jurídico; ajustes finos e encerramento do projeto'], '7B6B5B']];
  ph.forEach((p, i) => {
    const x = 0.6 + i * 4.1;
    rrect(s, { x, y: 1.65, w: 3.95, h: 5.2, fill: { color: p[3] }, line: { color: p[3] } });
    txt(s, p[0], { x: x + 0.25, y: 1.82, w: 3.5, h: 0.35, fontSize: 12, bold: true, color: 'D9B36A', charSpacing: 1 });
    txt(s, p[1], { x: x + 0.25, y: 2.15, w: 3.5, h: 0.5, fontSize: 20, bold: true, color: 'FFFFFF' });
    s.addText(bullets(p[2], { fontSize: 11.5, color: 'FFFFFF', paraSpaceAfter: 8 }), { x: x + 0.25, y: 2.75, w: 3.5, h: 4.0, isTextBox: true, margin: 0, valign: 'top', fontFace: 'Calibri' });
  });
  s.addNotes('Meta da direção: implantação completa em até 6 meses. A Fase 1 já começa com toda a empresa.');

  // =============== 17. NO-CODE VS CÓDIGO
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Escopo e entrega' });
  s.addText('No-code primeiro, código onde segurança e controle mandam', { placeholder: 'title' });
  subtitle(s, 'Critério de decisão para o time de Tecnologia. O detalhamento está no documento técnico');
  const cols2 = [['zap', 'No-code (velocidade)', 'EDF5EE', '3F8F4F', ['Fluxos de aprovação no Teams, cards, resumo das 08h e envio de relatórios: Power Automate ou n8n', 'Dashboards: Power BI sobre o Databricks, que a empresa já usa', 'Conectores padrão para Microsoft Graph, Planner, Trello', 'Orquestração de agendas simples e notificações']], ['code', 'Código em Python (segurança e controle)', 'F9EFEF', '7E0000', ['Agente local nas estações para exportação do WhatsApp Web e telemetria do SO, assinado e distribuído por TI', 'Classificador de IA (demanda, tom, estimativa) com prompts versionados e avaliação de precisão', 'Cruzamento de jornada e cálculo de banco de horas com regras auditáveis e testes automatizados', 'Camada de permissões, logs imutáveis e painel de parâmetros com dupla aprovação']]];
  cols2.forEach((c, i) => {
    const x = 0.6 + i * 6.2;
    rrect(s, { x, y: 1.7, w: 5.95, h: 4.9, fill: { color: c[2] }, line: { color: c[2] } });
    s.addShape(pres.ShapeType.ellipse, { x: x + 0.3, y: 1.95, w: 0.7, h: 0.7, fill: { color: 'FFFFFF' }, line: { color: 'FFFFFF' } });
    s.addImage({ data: ic[c[0]], x: x + 0.47, y: 2.12, w: 0.36, h: 0.36 });
    txt(s, c[1], { x: x + 1.15, y: 1.95, w: 4.6, h: 0.7, fontSize: 18, bold: true, color: c[3], valign: 'middle' });
    s.addText(bullets(c[4], { fontSize: 14, color: '241A12', paraSpaceAfter: 14 }), { x: x + 0.3, y: 2.9, w: 5.35, h: 3.5, isTextBox: true, margin: 0, valign: 'top', fontFace: 'Calibri' });
  });
  s.addNotes('A fronteira entre no-code e código é definida por segurança da informação e necessidade de auditoria, não por preferência.');

  // =============== 18. PENDÊNCIAS E PRÓXIMOS PASSOS
  s = pres.addSlide({ masterName: 'DARK', sectionTitle: 'Escopo e entrega' });
  s.addText('Decisões registradas e próximos passos', { placeholder: 'title' });
  rrect(s, { x: 0.8, y: 1.55, w: 5.7, h: 5.1, fill: { color: 'FFFFFF', transparency: 92 }, line: { color: 'D9B36A', width: 0.75, transparency: 40 } });
  txt(s, 'Decisões registradas', { x: 1.05, y: 1.75, w: 5.2, h: 0.4, fontSize: 16, bold: true, color: 'D9B36A' });
  s.addText(bullets(['Retenção do conteúdo bruto de mensagens e transcrições: 30 dias; metadados e classificações permanecem.', 'PJ no Agente 4: apenas aderência à jornada contratual para capacidade, sem banco de horas nem folha.', 'Perímetro: toda a franqueadora e holding, incluindo operação internacional e Instituto, com gestor definido no cadastro de G&G.', 'WhatsApp por exportação em lote com transcrição de áudios; prova de conceito na primeira quinzena da Fase 1.', 'Todo indicador abre o relatório detalhado das linhas que o compõem, com filtros e exportação.'], { fontSize: 12.5, color: 'FFFFFF', paraSpaceAfter: 9 }), { x: 1.05, y: 2.25, w: 5.2, h: 4.2, isTextBox: true, margin: 0, valign: 'top', fontFace: 'Calibri' });
  rrect(s, { x: 6.85, y: 1.55, w: 5.7, h: 5.1, fill: { color: 'B8862B' }, line: { color: 'B8862B' } });
  txt(s, 'Próximos passos', { x: 7.1, y: 1.75, w: 5.2, h: 0.4, fontSize: 16, bold: true, color: 'FFFFFF' });
  s.addText(bullets(['Tecnologia e G&G revisam o documento de visão e o documento técnico.', 'G&G saneia o cadastro de pessoas e hierarquia e define o cadastro vivo.', 'TI define a squad do projeto, as credenciais de leitura (Microsoft Graph, Databricks, fSense) e o ambiente no lakehouse.', 'Jurídico formaliza retenção, PJ e comunicado único aos colaboradores no RIPD.', 'Início da Fase 1 com toda a empresa; primeira leitura dos dashboards do Monitor e de DP em até 8 semanas.'], { fontSize: 12.5, color: 'FFFFFF', paraSpaceAfter: 9 }), { x: 7.1, y: 2.25, w: 5.2, h: 4.2, isTextBox: true, margin: 0, valign: 'top', fontFace: 'Calibri' });
  s.addNotes('Fechamento. Decisões já registradas pela Diretoria e cinco próximos passos para iniciar a Fase 1.');

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log('written', OUT);
})().catch(e => { console.error(e); process.exit(1); });
