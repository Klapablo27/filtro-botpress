const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const BOTPRESS_URL = process.env.BOTPRESS_URL;

app.post('/webhook/freshchat', async (req, res) => {
  const event = req.body;

  if (event.channel === 'hitl' && event.integration === 'freshchat') {
    console.log('Evento Freshchat directo descartado');
    return res.sendStatus(200);
  }

  try {
    await axios.post(BOTPRESS_URL, event);
    res.sendStatus(200);
  } catch (err) {
    console.error('Error al reenviar a Botpress:', err.message);
    res.sendStatus(500);
  }
});

app.get('/', (req, res) => res.send('Filtro operativo ✅'));
app.listen(3000, () => console.log('Filtro en puerto 3000'));
