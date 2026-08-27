const express = require('express');
const http = require('http');
const https = require('https');
const app = express();


const PORT         = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'daxi_verify_2026';

const DJANGO_WEBHOOK_URL = process.env.DJANGO_WEBHOOK_URL || 'http://127.0.0.1:8000/webhook/';


app.use(express.json());

function forwardToDjango(body) {
    if (!DJANGO_WEBHOOK_URL) return;
    try {
        const url = new URL(DJANGO_WEBHOOK_URL);
        const payload = JSON.stringify(body);
        const lib = url.protocol === 'https:' ? https : http;
        const req = lib.request({
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            },
        }, () => {});
        req.on('error', err => console.warn('[DAXI] Django forward failed:', err.message));
        req.write(payload);
        req.end();
    } catch (err) {
        console.warn('[DAXI] Django forward failed:', err.message);
    }
}


app.get('/webhook', (req, res) => {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('[DAXI] ✅ Webhook Meta validé');
        return res.status(200).send(challenge);
    }

    console.warn('[DAXI] ❌ Validation échouée — token invalide ou mode incorrect');
    return res.sendStatus(403);
});


app.post('/webhook', (req, res) => {
    const body = req.body;

    if (body.object !== 'whatsapp_business_account') {
        return res.sendStatus(404);
    }

    try {
        body.entry?.forEach(entry => {
            entry.changes?.forEach(change => {
                const value = change.value;
                value.messages?.forEach(msg => {
                    const from = msg.from;
                    const type = msg.type;
                    if (type === 'text') {
                        console.log(`[DAXI] 📩 Message de ${from} : "${msg.text.body}"`);
                    } else {
                        console.log(`[DAXI] 📎 Message ${type} de ${from}`);
                    }
                });
                value.statuses?.forEach(status => {
                    console.log(`[DAXI] 📬 Statut ${status.id} : ${status.status}`);
                });
            });
        });
        forwardToDjango(body);
    } catch (err) {
        console.error('[DAXI] Erreur traitement webhook :', err.message);
    }

    res.sendStatus(200);
});

app.listen(PORT, () => {
    console.log(`[DAXI] 🚀 Webhook WhatsApp démarré sur http://localhost:${PORT}/webhook`);
    console.log(`[DAXI] 🔑 Verify token : ${VERIFY_TOKEN}`);
    console.log(`[DAXI] ↪  Forward Django : ${DJANGO_WEBHOOK_URL}`);
});
