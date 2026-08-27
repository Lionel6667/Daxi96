import codecs

with codecs.open('vubez2.html', 'r', 'utf-8') as f:
    content = f.read()


search = "el.style.opacity = '1';"
idx = 0
occurrences = []
while True:
    pos = content.find(search, idx)
    if pos == -1:
        break
    occurrences.append(pos)
    
    start = max(0, pos - 100)
    end = min(len(content), pos + 200)
    print(f'--- Occurrence at pos {pos} ---')
    print(repr(content[start:end]))
    print()
    idx = pos + 1

print(f'Total occurrences: {len(occurrences)}')
