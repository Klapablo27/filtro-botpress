app.post('/webhook/freshchat', async (req, res) => {
  const ev = req.body;

  const actor = ev?.actor?.actor_type;        // 'user' o 'agent'
  const msg   = ev?.data?.message || {};
  const type  = msg.message_type || 'normal'; // 'normal' o 'private'

  const esUsuario      = actor === 'user';
  const esAgentePublic = actor === 'agent' && type === 'normal';

  if (!(esUsuario || esAgentePublic)) {
    console.log('🚫 Descartado –', { actor, type });
    return res.sendStatus(200);
  }

  try {
    await axios.post(BOTPRESS_URL, ev);
    console.log('✅ Reenviado –', { actor, type });
    res.sendStatus(200);
  } catch (e) {
    console.error('❌ Error reenviando a BP:', e.message);
    res.sendStatus(500);
  }
});
