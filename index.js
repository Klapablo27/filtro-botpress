import express from 'express';
import axios from 'axios';

const app = express();
app.use(express.json());

const BOTPRESS_URL = process.env.BOTPRESS_URL;

// → aquí guardamos las conversaciones Freshchat que SÍ deben pasar
const allowList = new Set();

/**
 * Decide si este evento habilita la conversación
 */
function esSemilla(event) {
  const msg   = event?.data?.message || {};
  const actor = event?.actor?.actor_type;
  const txt   = msg?.message_parts?.[0]?.text?.content || '';
  return (
    actor === 'user' &&
    txt.includes('New Conversation Started') &&
    msg.freshchat_conversation_id
  );
}

/**
 * Devuelve true si este evento pertenece a una conversación ya autorizada
 */
function autorizada(event) {
  const id = event?.data?.message?.freshchat_conversation_id;
  return id && allowList.has(id);
}

app.post('/webhook/freshchat', async (req, res) => {
  const ev     = req.body;
  const actor  = ev?.actor?.actor_type;
  const msg    = ev?.data?.message || {};
  const type   = msg.message_type || 'normal';
  const idConv = msg.freshchat_conversation_id;

  // 1️⃣  ¿Es semilla? → autorizar conversación
  if (esSemilla(ev)) {
    allowList.add(idConv);
    console.log('🌱 Semilla detectada; autorizo conv', idConv);
  }

  // 2️⃣  ¿Pertenece a conversación autorizada?
  if (!autorizada(ev)) {
    console.log('🚫 Descarto por conversación no autorizada', idConv);
    return res.sendStatus(200);
  }

  // 3️⃣  Descartar notas privadas del agente
  const esPrivadoAgente = actor === 'agent' && type === 'private';
  if (esPrivadoAgente) {
    console.log('🚫 Nota privada descartada');
    return res.sendStatus(200);
  }

  // 4️⃣  Reenviar a Botpress
  try {
    await axios.post(BOTPRESS_URL, ev);
    console.log('✅ Reenviado', { actor, type, idConv });
    res.sendStatus(200);
  } catch (e) {
    console.error('❌ Error reenviando:', e.message);
    res.sendStatus(500);
  }
});

app.get('/', (_, res) => res.send('Filtro operativo ✅'));
app.listen(3000, () => console.log('🚀 Proxy Freshchat → Botpress en puerto 3000'));
