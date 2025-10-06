import express from 'express';
import axios from 'axios';

const app = express();
app.use(express.json());

const BOTPRESS_URL = process.env.BOTPRESS_URL;

/* Lista en memoria de conversaciones Freshchat autorizadas */
const allowList = new Set();

/* ───────────── helpers de logging ───────────── */
function getStatus(ev) {
  return (
    ev?.data?.conversation?.status ||
    ev?.data?.status ||
    ev?.data?.resolve?.conversation?.status ||
    null
  );
}
function getChannelId(ev) {
  return (
    ev?.data?.message?.channel_id ||
    ev?.data?.conversation?.channel_id ||
    ev?.data?.resolve?.conversation?.channel_id ||
    null
  );
}
function getAssignedGroupId(ev) {
  return (
    ev?.data?.resolve?.conversation?.assigned_group_id ||
    ev?.data?.conversation?.assigned_group_id ||
    null
  );
}

/* Log de toda request que entra (método, ruta y headers clave) */
app.use((req, _res, next) => {
  console.log(`➡️  ${req.method} ${req.url}`);
  console.log('   headers:', {
    'content-type': req.headers['content-type'],
    'x-freshchat-signature': !!req.headers['x-freshchat-signature'],
    'user-agent': req.headers['user-agent'],
  });
  next();
});

/* ───────────────── utilidades ───────────────── */
function getConvId(ev) {
  return (
    ev?.data?.message?.freshchat_conversation_id ||
    ev?.data?.message?.conversation_id ||                              // extra
    ev?.data?.conversation?.id ||
    ev?.data?.conversation?.conversation_id ||                         // extra
    ev?.data?.resolve?.conversation?.conversation_id ||                // ← cierre (tu payload)
    ev?.data?.reopen?.conversation?.conversation_id ||                 // extra
    null
  );
}

function esSemilla(ev) {
  const actor = ev?.actor?.actor_type;
  const txt = ev?.data?.message?.message_parts?.[0]?.text?.content || '';
  const act = ev?.action;
  return (
    (act === 'conversation_create') || // derivación HITL
    (actor === 'user' && txt.includes('New Conversation Started')) // fallback viejo
  );
}

/* Detectar evento de cierre/resolución */
function esCierre(ev) {
  const a = ev?.action || '';
  const status = getStatus(ev);
  return (
    a === 'conversation_resolution' ||
    a === 'conversation_resolved'  ||
    a === 'conversation_close'     ||
    (a === 'conversation_update' && (status === 'resolved' || status === 'closed'))
  );
}

/* ───────────────── webhook ───────────────── */
app.post('/webhook/freshchat', async (req, res) => {
  const t0 = Date.now();
  const ev = req.body;

  const actor = ev?.actor?.actor_type;
  const msg = ev?.data?.message || {};
  const typeMsg = msg.message_type || 'normal';
  const action = ev?.action;

  const idConv  = getConvId(ev);
  const chanId  = getChannelId(ev);
  const groupId = getAssignedGroupId(ev);
  const status  = getStatus(ev);
  const cierre  = esCierre(ev);

  /* Meta del evento */
  const meta = { action, actor, typeMsg, idConv, chanId, groupId, status, cierre };
  console.log('🛰️  meta:', meta);

  /* Si parece evento de cierre, loguea payload completo para inspección */
  if (cierre) {
    try {
      console.log('🧾  Payload (cierre):\n' + JSON.stringify(ev, null, 2));
    } catch {
      console.log('🧾  Payload (cierre): <no serializable>');
    }
  }

  /* 1. Semilla → autoriza conversación */
  if (esSemilla(ev) && idConv) {
    allowList.add(idConv);
    console.log('🌱  Semilla; autorizo conv', idConv, ' | allowList.size=', allowList.size);
  }

  /* 2. Ver si la conversación está autorizada */
  const autorizada = idConv && allowList.has(idConv);
  console.log('🔐  autorizada=', !!autorizada);

  /* Permitir eventos de estado (conversation_update / _status) si la conv ya fue autorizada */
  const esEventoEstado = autorizada && action?.startsWith('conversation_');
  if (esEventoEstado) {
    console.log('ℹ️  Evento de estado permitido por estar autorizada:', action, idConv);
  }

  /* Permitir SIEMPRE el cierre, aunque la conv no esté autorizada (p.ej. reinicio del servicio) */
  if (!autorizada && !esEventoEstado && !cierre) {
    console.log('🚫  Descarto: conv no autorizada', { idConv, action, chanId, groupId, status });
    return res.sendStatus(200);
  }

  /* Si es cierre, limpia la allowList (higiene) */
  if (cierre && idConv) {
    allowList.delete(idConv);
    console.log('🧹  Cierre detectado; borro de allowList', idConv, ' | allowList.size=', allowList.size);
  }

  /* 3. Bloquear nota privada del agente */
  if (actor === 'agent' && typeMsg === 'private') {
    console.log('🚫  Nota privada descartada', { idConv, action });
    return res.sendStatus(200);
  }

  /* 4. Reenviar a Botpress */
  try {
    console.log('➡️  Reenviando a Botpress...', { bpUrlSet: !!BOTPRESS_URL, idConv, action });
    const bpRes = await axios.post(BOTPRESS_URL, ev);
    const ms = Date.now() - t0;
    console.log('✅  Reenviado', { idConv, actor, typeMsg, action, status, bpStatus: bpRes?.status, ms });
    res.sendStatus(200);
  } catch (e) {
    const ms = Date.now() - t0;
    console.error('❌  Error al reenviar:', e?.message || e, { idConv, action, ms });
    res.sendStatus(500);
  }
});

/* Endpoint simple de salud */
app.get('/', (_, res) => res.send('Filtro operativo ✅'));

app.listen(3000, () =>
  console.log('🚀  Proxy Freshchat → Botpress escuchando en 3000')
);
