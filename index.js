import express from 'express';
import axios from 'axios';

const app = express();
app.use(express.json());

const BOTPRESS_URL = process.env.BOTPRESS_URL;

app.post('/webhook/freshchat', async (req, res) => {
  const event = req.body;
  const now = new Date().toISOString();

  const actorType = event?.actor?.actor_type || 'sin_actor';
  const message = event?.data?.message || {};
  const partes = message?.message_parts || [];
  const texto = partes?.[0]?.text?.content || '(sin texto)';
  const convId = message?.freshchat_conversation_id || '(sin conv_id)';
  const canalId = message?.freshchat_channel_id || '(sin canal_id)';
  const tipoMensaje = message?.message_type || '(sin tipo)';
  const actorId = message?.actor_id || '(sin actor_id)';

  console.log(`📥 Evento recibido @ ${now}`);
  console.log(`🧑‍🎤 Actor tipo: ${actorType}`);
  console.log(`💬 Texto: ${texto}`);
  console.log(`💬 Tipo mensaje: ${tipoMensaje}`);
  console.log(`🧾 actor_id: ${actorId}`);
  console.log(`📡 freshchat_channel_id: ${canalId}`);
  console.log(`💬 freshchat_conversation_id: ${convId}`);
  console.log(`📦 Payload completo:\n${JSON.stringify(event, null, 2)}`);

  // No filtra nada aún
  try {
    await axios.post(BOTPRESS_URL, event);
    console.log('✅ Evento reenviado a Botpress\n');
    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Error al reenviar a Botpress:', err.message);
    res.sendStatus(500);
  }
});

app.get('/', (req, res) => {
  res.send('Filtro operativo ✅ (modo diagnóstico)');
});

app.listen(3000, () => {
  console.log('🚀 Servidor escuchando en puerto 3000');
});
