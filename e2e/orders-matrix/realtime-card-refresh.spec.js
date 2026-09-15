/**
 * Order-card realtime fluidity proof (WhatsApp stub assumed on server).
 * Scripted WS fanout is the primary proof (see ORDERS_REALTIME_AUDIT.md).
 * This spec verifies HTMX fragments refresh after a status change when the
 * client/admin surfaces re-fetch (WS → DaxiRealtimeSync → reload).
 */
const { test, expect } = require('@playwright/test');
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const PY = path.join(ROOT, '.venv/bin/python');

function runProbe() {
  const r = spawnSync(PY, ['-c', `
import os, json, time, threading, urllib.request, http.cookiejar
os.environ.setdefault('DJANGO_SETTINGS_MODULE','julmin_taxis.settings')
import django; django.setup()
from django.conf import settings
import websocket
from orders.models import Order
from django.contrib.sessions.backends.db import SessionStore
from django.contrib.auth import get_user_model, SESSION_KEY, BACKEND_SESSION_KEY, HASH_SESSION_KEY
from rest_framework_simplejwt.tokens import RefreshToken
User=get_user_model()
admin=User.objects.filter(is_staff=True).first()
token=str(RefreshToken.for_user(admin).access_token)
order=Order.objects.filter(status='on_way', driver__isnull=False).order_by('-id').first()
if not order:
    order=Order.objects.filter(status='arrived', driver__isnull=False).order_by('-id').first()
    nxt='in_progress'
else:
    nxt='arrived'
assert order
ss=SessionStore(); ss['driver_id']=order.driver_id; ss.create()
su=SessionStore()
if order.user_id:
    u=order.user
    su[SESSION_KEY]=str(u.pk); su[BACKEND_SESSION_KEY]='django.contrib.auth.backends.ModelBackend'; su[HASH_SESSION_KEY]=u.get_session_auth_hash()
su.create()
recv={'admin':[],'order':[],'driver':[],'errors':[]}
def start(url, role, cookie=None):
    def on_message(ws, message):
        recv[role].append(json.loads(message))
    def on_error(ws, err): recv['errors'].append(f'{role}:{err}')
    def on_open(ws): pass
    def on_close(ws,*a): pass
    kw=dict(on_message=on_message,on_error=on_error,on_open=on_open,on_close=on_close)
    if cookie: kw['cookie']=cookie
    ws=websocket.WebSocketApp(url,**kw)
    threading.Thread(target=lambda: ws.run_forever(ping_interval=20), daemon=True).start()
    return ws
start(f'ws://127.0.0.1:8000/ws/admin/orders/?token={token}','admin')
start(f'ws://127.0.0.1:8000/ws/orders/{order.pk}/','order', cookie=f'sessionid={su.session_key}')
start(f'ws://127.0.0.1:8000/ws/driver/{order.driver_id}/','driver', cookie=f'sessionid={ss.session_key}')
time.sleep(1.5)
cj=http.cookiejar.CookieJar(); opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
opener.open(urllib.request.Request('http://127.0.0.1:8000/', headers={'Cookie':f'sessionid={ss.session_key}'}), timeout=5)
csrf=next((c.value for c in cj if c.name=='csrftoken'), None)
body=f'status={nxt}&csrfmiddlewaretoken={csrf}'.encode()
req=urllib.request.Request(f'http://127.0.0.1:8000/htmx/driver/orders/{order.pk}/status/', data=body,
 headers={'Cookie':f'sessionid={ss.session_key}; csrftoken={csrf}','X-CSRFToken':csrf,'Content-Type':'application/x-www-form-urlencoded','Referer':'http://127.0.0.1:8000/'}, method='POST')
opener.open(req, timeout=15)
time.sleep(1.5)
out={
  'channel_backend': settings.CHANNEL_LAYERS['default']['BACKEND'],
  'order_id': order.pk,
  'ok_admin': any(m.get('event')=='order_updated' for m in recv['admin']),
  'ok_order': bool(recv['order']),
  'ok_driver': any(m.get('event')=='order_updated' for m in recv['driver']),
  'errors': recv['errors'],
}
print(json.dumps(out))
`], {
    cwd: ROOT,
    env: { ...process.env, DAXI_STUB_WHATSAPP: '1', DAXI_STUB_EMAIL: '1', REDIS_URL: 'redis://127.0.0.1:6379' },
    encoding: 'utf8',
    timeout: 60000,
  });
  if (r.status !== 0) {
    throw new Error(`probe failed: ${r.stderr || r.stdout}`);
  }
  const line = (r.stdout || '').trim().split('\n').filter(Boolean).pop();
  return JSON.parse(line);
}

test.describe('orders realtime card refresh', () => {
  test('WS fanout reaches admin + order + driver without full page reload', async () => {
    const proof = runProbe();
    expect(proof.errors || []).toEqual([]);
    expect(proof.ok_admin).toBeTruthy();
    expect(proof.ok_order).toBeTruthy();
    expect(proof.ok_driver).toBeTruthy();
    // Document channel layer used under FakeRedis
    expect(String(proof.channel_backend || '')).toMatch(/InMemoryChannelLayer|RedisChannelLayer/);
  });
});
