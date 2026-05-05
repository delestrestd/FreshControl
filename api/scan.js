const handler = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const keyOk = !!process.env.ANTHROPIC_API_KEY;
    return res.status(200).json({
      status: 'ok',
      key_present: keyOk,
      key_prefix: keyOk ? process.env.ANTHROPIC_API_KEY.slice(0, 10) + '...' : 'MANQUANTE',
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { image, mimeType } = req.body || {};
  if (!image) return res.status(400).json({ error: 'Image manquante' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Clé API manquante' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: image } },
            { type: 'text', text: `Analyse cette image de produit alimentaire. Réponds UNIQUEMENT en JSON valide, sans markdown :
{"name":"nom complet du produit","gencod":"EAN 13 chiffres ou vide","expiry":"date YYYY-MM-DD ou vide","rayon":"Épicerie ou Crémerie ou Charcuterie ou Boulangerie ou Surgelés ou Boissons ou Hygiène ou Confiserie ou Traiteur"}
Si une info n'est pas visible, mets "". Ne mets jamais null.` },
          ],
        }],
      }),
    });

    const raw = await response.text();
    if (!response.ok) {
      console.error('Anthropic error:', response.status, raw);
      return res.status(500).json({ error: `Anthropic ${response.status}`, detail: raw.slice(0, 300) });
    }

    const data = JSON.parse(raw);
    const text = data.content?.[0]?.text || '{}';
    let parsed;
    try { parsed = JSON.parse(text.replace(/```json|```/g, '').trim()); }
    catch { parsed = {}; }

    return res.status(200).json({
      name:   parsed.name   || '',
      gencod: parsed.gencod || '',
      expiry: parsed.expiry || '',
      rayon:  parsed.rayon  || 'Épicerie',
    });

  } catch (err) {
    console.error('Handler error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

handler.config = { api: { bodyParser: { sizeLimit: '10mb' } } };
module.exports = handler;
