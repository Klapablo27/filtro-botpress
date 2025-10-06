import express from 'express';
import axios from 'axios';

const app = express();
app.use(express.json());

const BOTPRESS_URL = process.env.BOTPRESS_URL;

/* ⬇️ Opcional: restringe por canal y/o grupo de Freshchat (coma-separados) */
const allowedChannels = new Set(
  (process.env.ALLOWED_CHANNEL_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
);
const allowedGroups = new Set(
  (process.env.ALLOWED_GROUP_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
);

/* Lista en memoria de conversaciones Freshchat autorizadas */
const allowList = new Set();

/* ───────────────── utilidades ───────────────── */
function getConvId(ev) {
  return (
    ev?.data?.message?.freshchat_conversation_id ||
    ev?.data?.message?.conversation_id ||                              // extra
    ev?.data?.conversation?.id ||
    ev?.data?.conversation?.conversation_id ||                         // extra
    ev?.data?.resolve?.conversation?.conversation_id ||                // cierre
    ev?.data?.reopen?.conversation?.conversation_id ||                 // extra
    null
  );
}

function getChannelId(ev) {
  return (
    ev?.data?.message?.channel_id ||
    ev?.data?.conversation?.channel_id ||
    ev?.data?.resolve?.conversation?.channel_id ||                     // cierre
    null
  );
}

function getAssignedGroupId(ev) {
  return (
    ev?.data?.resolve?.conversation?.assigned_group_id ||              // cierre
    ev?.data?.conversation?.assigned_group_id ||
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
  const chanId = getChannelId(ev);
  const groupId = getAssignedGroupId(ev);
  const cierre = esCierre(ev);

  /* (A) Filtro temprano por canal si lo configuraste */
  if (allowedChannels.size && chanId && !allowedChannels.has(chanId)) {
    // Deja pasar únicamente si fuera un cierre válido por grupo (ver regla C abajo)
    if (!(cierre && (!allowedGroups.size || (groupId && allowedGroups.has(groupId))))) {
      console.log('🚫 Canal no permitido', { chanId, action, idConv });
      return res.sendStatus(200);
    }
  }

  /* 1. Semilla → autoriza conversación */
  if (esSemilla(ev) && idConv) {
    allowList.add(idConv);
    console.log('🌱 Semilla; autorizo conv', idConv);
  }

  /* 2. Ver si la conversación está autorizada */
  const autorizada = idConv && allowList.has(idConv);

  /* 3. Permitir eventos de estado (conversation_*) si la conv ya fue autorizada */
  const esEventoEstado = autorizada && action?.startsWith('conversation_');

  /* (B) Bloquear nota privada del agente (no afecta mensajes al usuario) */
  if (actor === 'agent' && typeMsg === 'private') {
    console.log('🚫 Nota privada descartada', { idConv, action });
    return res.sendStatus(200);
  }

  /* (C) Regla de cierres:
     - Pasa si la conv ya estaba autorizada
     - O si cumple canal permitido y (si definiste grupos) grupo permitido
     - Si no, se descarta el cierre “ajeno” (p. ej., otros canales) */
  if (cierre) {
    const canalOk = !allowedChannels.size || (chanId && allowedChannels.has(chanId));
    const grupoOk = !allowedGroups.size || (groupId && allowedGroups.has(groupId));
    if (!autorizada && !(canalOk && grupoOk)) {
      console.log('🚫 Cierre descartado (no autorizado / canal-grupo no permitido)', {
        idConv, chanId, groupId, action
      });
      return res.sendStatus(200);
    }
    if (idConv) {
      allowList.delete(idConv); // higiene
      console.log('🧹 Cierre detectado; borro de allowList', idConv);
    }
  }

  /* (D) Regla general para no-cierres */
  if (!cierre && !autorizada && !esEventoEstado) {
    console.log('🚫 Descarto: conv no autorizada', idConv);
    return res.sendStatus(200);
  }

  /* 4. Reenviar a Botpress */
  try {
    await axios.post(BOTPRESS_URL, ev);
    console.log('✅ Reenviado', { idConv, actor, typeMsg, action, chanId, groupId });
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
