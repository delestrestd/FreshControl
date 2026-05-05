/**
 * FreshControl — /api/save-scan
 * POST : enregistre un produit scanné dans l'onglet "scans" du Google Sheet
 *
 * Variables d'environnement :
 *   GOOGLE_SHEET_ID         — ID du sheet
 *   GOOGLE_SERVICE_ACCOUNT  — JSON du compte de service Google (stringifié)
 *
 * Format attendu dans req.body :
 *   { produit, gencod, dlc, type_produit, marque, magasin, lat, lng, user, statut }
 *
 * NOTE : cet endpoint est OPTIONNEL.
 * Si vous ne configurez pas le compte de service, les scans restent en localStorage.
 * Pour activer : créez un compte de service Google Cloud, partagez le Sheet avec son email.
 */

export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Sans compte de service configuré, on retourne OK silencieusement
  // (l'app garde tout en localStorage)
  if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
    return res.status(200).json({ saved: false, reason: 'no_service_account_configured' });
  }

  const SHEET_ID = process.env.GOOGLE_SHEET_ID;
  const body     = req.body || {};

  try {
    // Authentification OAuth2 avec compte de service
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const token          = await getAccessToken(serviceAccount);

    const now   = new Date().toISOString();
    const row   = [
      now,
      body.produit        || '',
      body.gencod         || '',
      body.dlc            || '',
      body.type_produit   || '',
      body.marque         || '',
      body.magasin        || '',
      body.lat            || '',
      body.lng            || '',
      body.user           || '',
      body.statut         || 'non_perime',
    ];

    const appendRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/scans!A:K:append?valueInputOption=USER_ENTERED`,
      {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ values: [row] }),
      }
    );

    if (!appendRes.ok) {
      const err = await appendRes.text();
      return res.status(502).json({ saved: false, error: err });
    }

    return res.status(200).json({ saved: true });
  } catch (err) {
    return res.status(500).json({ saved: false, error: err.message });
  }
}

// JWT + OAuth2 pour compte de service Google (sans dépendance externe)
async function getAccessToken(sa) {
  const now    = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim  = {
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now,
  };

  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const msg  = `${b64(header)}.${b64(claim)}`;

  // Import RSA key
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToBinary(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(msg));
  const jwt = `${msg}.${Buffer.from(sig).toString('base64url')}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const { access_token } = await tokenRes.json();
  return access_token;
}

function pemToBinary(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}
