import codecs

with codecs.open('vubez2.html', 'r', 'utf-8') as f:
    content = f.read()

search = "el.style.opacity = '1';"
pos = content.find(search)
insert_after = pos + len(search)


print('Context:')
print(repr(content[pos-50:pos+100]))
print()

hud_code = "\n\n                  // Show live HUD overlay\n                  const hudOverlay = document.getElementById('daximap-hud-' + id);\n                  if (hudOverlay) {\n                      hudOverlay.style.display = 'block';\n                      hudOverlay.style.opacity = '0';\n                      hudOverlay.style.transition = 'opacity 0.8s ease';\n                      setTimeout(() => { hudOverlay.style.opacity = '1'; }, 800);\n                  }"

content = content[:insert_after] + hud_code + content[insert_after:]
print('Inserted HUD code after opacity line')

with codecs.open('vubez2.html', 'w', 'utf-8') as f:
    f.write(content)
print('Done.')
