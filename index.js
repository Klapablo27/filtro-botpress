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
  const tipoMensaje = message?.message_type || '(sin tipo)';

  // 👇 lógica de descarte clara y precisa
  const esPrivadoDeAgente = (actorType === 'agent' && tipoMensaje === 'private');

  console.log(`📥 Evento recibido @ ${now}`);
  console.log(`🧑‍🎤 Actor tipo: ${actorType}`);
  console.log(`💬 Tipo mensaje: ${tipoMensaje}`);
  console.log(`💬 Texto: ${texto}`);

  if (esPrivadoDeAgente) {
    console.log('🚫 Mensaje privado de agente descartado');
    return res.sendStatus(200);
  }

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
  res.send('Filtro operativo ✅');
});

app.listen(3000, () => {
  console.log('🚀 Servidor escuchando en puerto 3000');
});
