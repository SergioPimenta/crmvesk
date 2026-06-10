/** Normaliza chaves retornadas pelo Postgres (aliases sem aspas viram minúsculas). */
const KEY_ALIASES = {
  pipelineid: 'pipelineId',
  stagekey: 'stageKey',
  empresaid: 'empresaId',
  isdefault: 'isDefault',
  contatoid: 'contatoId',
  contatoemail: 'contatoEmail',
  contatotelefone: 'contatoTelefone',
  contatonome: 'contatoNome',
  dealid: 'dealId',
  proximaacao: 'proximaAcao',
  ultimainteracao: 'ultimaInteracao',
  precisafollowup: 'precisaFollowUp',
  enviadaem: 'enviadaEm',
  baseurl: 'baseUrl',
  instancename: 'instanceName',
  apikey: 'apiKey',
  webhooksecret: 'webhookSecret',
  maxpos: 'maxPos',
  phonenumberid: 'phoneNumberId',
  accesstoken: 'accessToken',
  verifytoken: 'verifyToken',
  graphversion: 'graphVersion',
  appsecret: 'appSecret',
  wabaid: 'wabaId',
  metaappid: 'metaAppId',
  remotejid: 'remoteJid',
  contactid: 'contactId',
  contactname: 'contactName',
  lastmessage: 'lastMessage',
  lastmessageat: 'lastMessageAt',
  fromme: 'fromMe',
  messageat: 'messageAt',
  wamessageid: 'waMessageId',
  attendancestatus: 'attendanceStatus',
  userid: 'userId',
  siteurl: 'siteUrl',
  sitename: 'siteName',
  monitorcode: 'monitorCode',
  pipelinename: 'pipelineName',
  stagetitle: 'stageTitle',
  pageviews: 'pageViews',
  buttonclicks: 'buttonClicks',
  lastseenat: 'lastSeenAt',
  createdat: 'createdAt',
  updatedat: 'updatedAt',
};

export function normalizeRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const [lower, camel] of Object.entries(KEY_ALIASES)) {
    if (out[camel] === undefined && out[lower] !== undefined) {
      out[camel] = out[lower];
    }
  }
  return out;
}

export function normalizeRows(rows) {
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}
