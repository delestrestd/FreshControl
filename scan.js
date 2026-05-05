/**
 * FreshControl — /api/scan
 * POST : reçoit une photo base64 → Claude Vision lit le gencod →
 *        cherche dans tous les onglets Google Sheets (une marque par onglet) →
 *        retourne {found, produit, gencod, type_produit, marque}
 *
 * Variables d'environnement Vercel :
 *   ANTHROPIC_API_KEY   — clé API Anthropic (Claude Vision)
 *   GOOGLE_SHEET_ID     — ID du Google Sheet (visible dans l'URL)
 *   CATALOGUE_TABS      — onglets séparés par virgule  ex: "Lea_Nature,Marque2,Marque3"
 *                         chaque onglet doit avoir colonnes : gencod, Libellé produit, Famille
 */

export const config = { maxDuration: 30 }; // 30s timeout Vercel

export default async function handler(req, res) {
  // ── CORS ─────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { image, mimeType = 'image/jpeg', magasin, lat, lng, user } = req.body || {};

  if (!image) return res.status(400).json({ error: 'image manquante' });

  // ── ÉTAPE 1 : Claude Vision lit le code-barres ────────────────────────────
  let gencod = null;
  let produitVision = null;

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-20250514',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType, data: image },
            },
            {
              type: 'text',
              text: 'Lis le code-barres EAN sur ce produit alimentaire. Retourne UNIQUEMENT un JSON valide : {"gencod": "1234567890123", "produit": "nom visible sur emballage"}. Si pas de code-barres lisible : {"gencod": null, "produit": null}. Aucun autre texte.',
            },
          ],
        }],
      }),
    });

    const claudeData = await claudeRes.json();
    const raw = claudeData.content?.[0]?.text || '';

    try {
      const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      const match = clean.match(/\{[\s\S]*?\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        gencod       = parsed.gencod  ? String(parsed.gencod).replace(/\s/g, '') : null;
        produitVision = parsed.produit || null;
      }
    } catch (_) {}
  } catch (err) {
    return res.status(502).json({ error: 'Erreur Claude Vision', detail: err.message });
  }

  if (!gencod) {
    return res.status(200).json({ found: false, reason: 'no_barcode', produit_vision: produitVision });
  }

  // ── ÉTAPE 2 : Chercher le gencod dans tous les onglets Google Sheets ──────
  const SHEET_ID   = process.env.GOOGLE_SHEET_ID;
  const TABS       = (process.env.CATALOGUE_TABS || 'Produits').split(',').map(t => t.trim());

  for (const tab of TABS) {
    try {
      const url     = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
      const csvRes  = await fetch(url, { headers: { 'Accept': 'text/csv' } });
      if (!csvRes.ok) continue;

      const csv     = await csvRes.text();
      const rows    = parseCSV(csv);
      if (rows.length < 2) continue;

      const headers     = rows[0].map(h => h.toLowerCase().trim());
      const gencodIdx   = headers.findIndex(h => h.includes('gencod') || h.includes('ean') || h.includes('code'));
      const nomIdx      = headers.findIndex(h => h.includes('libellé') || h.includes('libelle') || h.includes('nom') || h.includes('produit'));
      const familleIdx  = headers.findIndex(h => h.includes('famille') || h.includes('type') || h.includes('rayon') || h.includes('catégorie'));

      if (gencodIdx < 0) continue;

      for (let i = 1; i < rows.length; i++) {
        const row      = rows[i];
        const rowCode  = (row[gencodIdx] || '').replace(/\s/g, '').replace(/^'/, ''); // leading apostrophe Excel
        if (rowCode === gencod) {
          return res.status(200).json({
            found:        true,
            produit:      (nomIdx >= 0 ? row[nomIdx] : null) || produitVision || '',
            gencod:       gencod,
            type_produit: familleIdx >= 0 ? row[familleIdx] : '',
            marque:       tab,   // ← quel onglet/marque a matché
          });
        }
      }
    } catch (_) {
      // onglet inaccessible → on continue sur le suivant
      continue;
    }
  }

  // Gencod lu mais absent de tous les onglets
  return res.status(200).json({
    found:         false,
    gencod:        gencod,
    produit_vision: produitVision, // nom éventuellement lu sur l'emballage par Claude
  });
}

// ── Parser CSV minimal (gère les guillemets) ──────────────────────────────────
function parseCSV(text) {
  const rows = [];
  const lines = text.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const row = [];
    let inQuote = false, cell = '';
    for (const ch of line) {
      if (ch === '"')       inQuote = !inQuote;
      else if (ch === ',' && !inQuote) { row.push(cell.trim()); cell = ''; }
      else                  cell += ch;
    }
    row.push(cell.trim());
    rows.push(row.map(c => c.replace(/^"|"$/g, '').trim()));
  }
  return rows;
}
