const express = require('express');
const path = require('path');
const {GoogleAuth} = require('google-auth-library');

const app = express();
app.use(express.json({ limit: '12mb' }));

const PORT = process.env.PORT || 3000;

// Simple health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// POST /api/generate
// Body: { extraNotes, base64Data, mimeType }
app.post('/api/generate', async (req, res) => {
  try {
    const { extraNotes, base64Data, mimeType } = req.body || {};
    if (!base64Data || typeof base64Data !== 'string') {
      return res.status(400).json({ error: 'Missing base64Data' });
    }

    // Limit payload size (base64 length) to ~10MB file => ~13.3MB base64 -> chars
    const MAX_BASE64_LENGTH = 14 * 1024 * 1024; // ~14MB
    if (base64Data.length > MAX_BASE64_LENGTH) {
      return res.status(413).json({ error: 'File too large' });
    }

    const promptText = `Sen uzman bir Türk hukuk avukatısın. Sana sunulan bu belgeyi/görseli dikkatlice analiz et.\nEk olarak kullanıcının belirttiği şu notları da dikkate al: "${extraNotes || ''}"\n\nGÖREVİN:\nYüklenen belgedeki tüm detayları (Mahkeme adı, dosya numarası, taraflar, olaylar, kararlar veya iddialar) analiz ederek Türk Mahkemelerine sunulmaya uygun tam, eksiksiz ve resmi bir DİLEKÇE hazırla.\n\nDilekçe şu formatta olmalıdır:\n1. MAHKEME BAŞLIĞI\n2. DOSYA NO / ESAS NO (Varsa)\n3. DAVACI / DAVALI VEYA TALEP EDEN BİLGİLERİ\n4. KONU\n5. AÇIKLAMALAR (Belgeden çıkarılan kronolojik olaylar ve hukuki değerlendirme)\n6. HUKUKİ NEDENLER VE DELİLLER\n7. SONUÇ VE İSTEM`;

    const requestBody = {
      contents: [
        { parts: [ { text: promptText } ] },
        { parts: [ { inline_data: { mime_type: mimeType || 'image/jpeg', data: base64Data } } ] }
      ]
    };

    // Acquire an access token from application default credentials
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const client = await auth.getClient();
    const accessTokenResp = await client.getAccessToken();
    const accessToken = (typeof accessTokenResp === 'string') ? accessTokenResp : (accessTokenResp && accessTokenResp.token) ? accessTokenResp.token : null;

    if (!accessToken) {
      return res.status(500).json({ error: 'Unable to obtain access token on server. Ensure service account credentials are configured.' });
    }

    // Models to try
    const models = ['gemini-1.5-pro', 'gemini-1.5-flash'];
    let lastError = null;
    let apiResponse = null;

    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify(requestBody),
        });

        const data = await resp.json();
        if (!resp.ok) {
          lastError = data || { status: resp.status, statusText: resp.statusText };
          continue; // try next model
        }

        apiResponse = data;
        break;
      } catch (err) {
        lastError = { message: err.message };
      }
    }

    if (!apiResponse) {
      return res.status(502).json({ error: 'No successful response from Generative Language API', details: lastError });
    }

    // Return the raw API response along with a simplified extracted text (if possible)
    const extracted = extractGeneratedText(apiResponse);
    return res.json({ ok: true, modelResponse: apiResponse, extracted: extracted });

  } catch (err) {
    console.error('Server error', err);
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
});

function extractGeneratedText(apiResponse) {
  if (!apiResponse) return null;

  if (Array.isArray(apiResponse.candidates)) {
    for (const cand of apiResponse.candidates) {
      if (Array.isArray(cand.content)) {
        for (const item of cand.content) {
          if (typeof item.text === 'string' && item.text.trim()) return item.text.trim();
          if (Array.isArray(item.parts)) {
            for (const p of item.parts) {
              if (typeof p.text === 'string' && p.text.trim()) return p.text.trim();
            }
          }
        }
      }
      if (Array.isArray(cand.output)) {
        for (const out of cand.output) {
          if (Array.isArray(out.content)) {
            for (const c of out.content) {
              if (typeof c.text === 'string' && c.text.trim()) return c.text.trim();
            }
          }
        }
      }
    }
  }

  if (Array.isArray(apiResponse.output)) {
    for (const out of apiResponse.output) {
      if (Array.isArray(out.content)) {
        for (const c of out.content) {
          if (typeof c.text === 'string' && c.text.trim()) return c.text.trim();
        }
      }
    }
  }

  if (typeof apiResponse.text === 'string' && apiResponse.text.trim()) return apiResponse.text.trim();
  return null;
}

// Start server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
