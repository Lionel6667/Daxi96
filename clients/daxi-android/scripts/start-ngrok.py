"""Expose le serveur Django (port 8000) via ngrok — laisser ce script tourner."""
import time
from pyngrok import ngrok

tunnel = ngrok.connect(8000, bind_tls=True)
url = tunnel.public_url
print(f"NGROK_URL={url}", flush=True)
with open("ngrok-url.txt", "w", encoding="utf-8") as f:
    f.write(url)
while True:
    time.sleep(3600)
