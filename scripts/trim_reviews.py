from pathlib import Path

p = Path(__file__).resolve().parents[1] / "vubez2.html"
t = p.read_text(encoding="utf-8")
marker = '<div class="review-card">\n                    <div class="review-card-top">\n                        <div class="review-avatar" style="background:linear-gradient(135deg,#ef4444,#b91c1c);">JM</div>'
i1 = t.find(marker)
i2 = t.find(marker, i1 + 1)
if i2 == -1:
    print("no duplicate")
else:
    cta = t.find('<div class="reviews-cta"', i2)
    t2 = t[:i2] + t[cta:]
    p.write_text(t2, encoding="utf-8")
    print("removed", len(t) - len(t2), "chars")
