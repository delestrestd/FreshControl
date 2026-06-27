// Endpoint serverless OPTIONNEL (analyse d'image via Claude Vision).
// SÉCURITÉ : désactivé par défaut. Il ne s'active que si la variable
// d'environnement SCAN_TOKEN est définie, et chaque requête doit alors
// présenter ce même secret dans l'en-tête `x-fc-token`. Sans cela,
// l'endpoint refuse tout appel — évite l'abus de la clé Anthropic
// (proxy ouvert facturé). N'expose jamais la clé API.
const handler = async function (req, res) {
  const ORIGIN = process.env.SCAN_ALLOWED_ORIGIN || '';
  res.setHeader('Access-Control-Allow-Origin', ORIGIN || 'null');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-fc-token');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const expected = process.env.SCAN_TOKEN;

  if (req.method === 'GET') {
    // Diagnostic minimal : ne révèle ni la clé, ni son préfixe.
    return res.status(200).json({
      status: 'ok',
      enabled: !!expected,
      key_present: !!process.env.ANTHROPIC_API_KEY,
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Garde d'accès : endpoint désactivé tant que SCAN_TOKEN n'est pas configuré.
  if (!expected) return res.status(503).json({ error: 'Endpoint désactivé (SCAN_TOKEN non configuré)' });
  const provided = req.headers['x-fc-token'];
  if (provided !== expected) return res.status(401).json({ error: 'Non autorisé' });

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
