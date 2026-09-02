from pathlib import Path

p = Path(__file__).resolve().parents[1] / "vubez2.html"
t = p.read_text(encoding="utf-8")
start = t.find('<div class="reviews-ribbon" id="reviewsRibbon">')
end = t.find('<div class="reviews-cta"', start)
if start < 0 or end < 0:
    print("markers not found")
    raise SystemExit(1)
ribbon = t[start:end]
cards = ribbon.split('<div class="review-card">')
keep_n = 3
if len(cards) > keep_n + 1:
    new_ribbon = '<div class="review-card">'.join(cards[: keep_n + 1])
    t2 = t[:start] + new_ribbon + t[end:]
    p.write_text(t2, encoding="utf-8")
    print("removed", len(cards) - 1 - keep_n, "cards, saved", len(t) - len(t2), "chars")
else:
    print("already", len(cards) - 1, "cards")
