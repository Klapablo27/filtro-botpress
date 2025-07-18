import express from 'express';
import axios from 'axios';

const app = express();
app.use(express.json());

const BOTPRESS_URL = process.env.BOTPRESS_URL;

/**
 * Reenvía a Botpress solo:
 *   • actor_type = 'user'    (mensajes del cliente)
 *   • actor_type = 'agent' && message_type = 'normal'  (mensajes públicos del ejecutivo)
 * Todo lo demás (p.e. notas privadas del agente) se descarta.
 */
app.post('/webhook/freshchat', async (req, res) => {
  const ev   = req.body;
  const now  = new Date().toISOString();

  const actor = ev?.actor?.actor_type || 'sin_actor';
  const msg   = ev?.data?.message     || {};
  const type  = msg.message_type      || 'normal';
  const text  = msg?.message_parts?.[0]?.text?.content?.trim() || '(sin texto)';

  const esUsuario        = actor === 'user';
  const esAgentePublico  = actor === 'agent' && type === 'normal';

  console.log(`📥 ${now} • actor:${actor} • tipo:${type} • txt:${text.slice(0,60)}`);

  if (!(esUsuario || esAgentePublico)) {
    console.log('🚫  Descartado (privado/sistema)\n');
    return res.sendStatus(200);
  }

  try {
    await axios.post(BOTPRESS_URL, ev);
    console.log('✅  Reenviado a Botpress\n');
    res.sendStatus(200);
  } catch (err) {
    console.error('❌  Error reenviando:', err.message);
    res.sendStatus(500);
  }
});

app.get('/', (_, res) => res.send('Filtro operativo ✅'));
app.listen(3000, () => console.log('🚀  Servidor en puerto 3000'));
