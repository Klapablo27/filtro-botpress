import express from 'express';
import axios from 'axios';

const app = express();
app.use(express.json());

const BOTPRESS_URL = process.env.BOTPRESS_URL;

app.post('/webhook/freshchat', async (req, res) => {
  const event = req.body;

  console.log('🔔 Llego un POST al filtro');
  console.log('🧾 Body recibido:', JSON.stringify(event, null, 2));

  if (event.channel === 'hitl' && event.integration === 'freshchat') {
    console.log('🚫 Evento Freshchat directo descartado');
    return res.sendStatus(200);
  }

  try {
    await axios.post(BOTPRESS_URL, event);
    console.log('✅ Evento reenviado a Botpress');
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
