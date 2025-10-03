import express from 'express';
import axios from 'axios';

const app = express();
app.use(express.json());

const BOTPRESS_URL = process.env.BOTPRESS_URL;

/* Lista en memoria de conversaciones Freshchat autorizadas */
const allowList = new Set();

/* ───────────── logging helper ───────────── */
function isResolutionAction(ev) {
  const action = ev?.action || '';
  const status =
    ev?.data?.conversation?.status ||
    ev?.data?.status ||
    ev?.data?.conversation_status ||
    null;

  return (
    action === 'conversation_resolution' ||
    action === 'conversation_resolved'  ||
    action === 'conversation_close'     ||
    (action === 'conversation_update' && (status === 'resolved' || status === 'closed'))
  );
}

/* Log de todas las requests (método/ruta) */
app.use((req, _res, next) => {
  console.log(`➡️  ${req.method} ${req.url}`);
  next();
});

/* ───────────────── utilidades ───────────────── */
function getConvId(ev) {
  return (
    ev?.data?.message?.freshchat_conversation_id ||
    ev?.data?.conversation?.id ||
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

/* ───────────────── webhook ───────────────── */
app.post('/webhook/freshchat', async (req, res) => {
  const ev = req.body;
  const actor = ev?.actor?.actor_type;
  const msg = ev?.data?.message || {};
  const typeMsg = msg.message_type || 'normal';
  const action = ev?.action;
  const idConv = getConvId(ev);
  const status =
    ev?.data?.conversation?.status ||
    ev?.data?.status ||
    ev?.data?.conversation_status ||
    null;

  console.log('🛰️  Incoming event:', { action, actor, typeMsg, idConv, status });

  /* Si parece evento de cierre, loguea payload completo para inspección */
  if (isResolutionAction(ev)) {
    try {
      console.log('🧾  Payload (posible cierre):\n' + JSON.stringify(ev, null, 2));
    } catch {
      console.log('🧾  Payload (posible cierre): <no serializable>');
    }
  }

  /* 1. Semilla → autoriza conversación */
  if (esSemilla(ev) && idConv) {
    allowList.add(idConv);
    console.log('🌱  Semilla; autorizo conv', idConv);
  }

  /* 2. Ver si la conversación está autorizada */
  const autorizada = idConv && allowList.has(idConv);

  /* Permitir eventos de estado (conversation_update / _status) si la conv ya fue autorizada */
  const esEventoEstado = autorizada && action?.startsWith('conversation_');
  if (esEventoEstado) {
    console.log('ℹ️  Evento de estado permitido por estar autorizada:', action, idConv);
  }

  if (!autorizada && !esEventoEstado) {
    console.log('🚫  Descarto: conv no autorizada', { idConv, action, status });
    return res.sendStatus(200);
  }

  /* 3. Bloquear nota privada del agente */
  if (actor === 'agent' && typeMsg === 'private') {
    console.log('🚫  Nota privada descartada', { idConv, action });
    return res.sendStatus(200);
  }

  /* 4. Reenviar a Botpress */
  try {
    console.log('➡️  Reenviando a Botpress...', { BOTPRESS_URL_present: !!BOTPRESS_URL, idConv, action });
    await axios.post(BOTPRESS_URL, ev);
    console.log('✅  Reenviado', { idConv, actor, typeMsg, action, status });
    res.sendStatus(200);
  } catch (e) {
    console.error('❌  Error al reenviar:', e?.message || e, { idConv, action });
    res.sendStatus(500);
  }
});

/* Endpoint simple de salud */
app.get('/', (_, res) => res.send('Filtro operativo ✅'));

app.listen(3000, () =>
  console.log('🚀  Proxy Freshchat → Botpress escuchando en 3000')
);
