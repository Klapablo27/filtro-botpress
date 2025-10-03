import express from 'express';
import axios from 'axios';

const app = express();
app.use(express.json());

const BOTPRESS_URL = process.env.BOTPRESS_URL;

/* Lista en memoria de conversaciones Freshchat autorizadas */
const allowList = new Set();

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
  const status =
    ev?.data?.conversation?.status ||
    ev?.data?.status ||
    ev?.data?.resolve?.conversation?.status ||
    null;

  return (
    a === 'conversation_resolution' ||
    a === 'conversation_resolved'  ||
    a === 'conversation_close'     ||
    (a === 'conversation_update' && (status === 'resolved' || status === 'closed'))
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

  /* 1. Semilla → autoriza conversación */
  if (esSemilla(ev) && idConv) {
    allowList.add(idConv);
    console.log('🌱 Semilla; autorizo conv', idConv);
  }

  /* 2. Ver si la conversación está autorizada */
  const autorizada = idConv && allowList.has(idConv);

  /* Permitir eventos de estado (conversation_update / _status) si la conv ya fue autorizada */
  const esEventoEstado = autorizada && action?.startsWith('conversation_');

  /* Permitir SIEMPRE el cierre, aunque la conv no esté autorizada (p.ej. reinicio del servicio) */
  const cierre = esCierre(ev);
  if (!autorizada && !esEventoEstado && !cierre) {
    console.log('🚫 Descarto: conv no autorizada', idConv);
    return res.sendStatus(200);
  }

  /* Si es cierre, limpia la allowList (opcional, buena higiene) */
  if (cierre && idConv) {
    allowList.delete(idConv);
    console.log('🧹 Cierre detectado; borro de allowList', idConv);
  }

  /* 3. Bloquear nota privada del agente (no afecta mensajes normales al usuario) */
  if (actor === 'agent' && typeMsg === 'private') {
    console.log('🚫 Nota privada descartada');
    return res.sendStatus(200);
  }

  /* 4. Reenviar a Botpress */
  try {
    await axios.post(BOTPRESS_URL, ev);
    console.log('✅ Reenviado', { idConv, actor, typeMsg, action });
    res.sendStatus(200);
  } catch (e) {
    console.error('❌ Error al reenviar:', e.message);
    res.sendStatus(500);
  }
});

/* Endpoint simple de salud */
app.get('/', (_, res) => res.send('Filtro operativo ✅'));

app.listen(3000, () =>
  console.log('🚀 Proxy Freshchat → Botpress escuchando en 3000')
);
