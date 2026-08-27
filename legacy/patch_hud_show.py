import codecs, re

with codecs.open('vubez2.html', 'r', 'utf-8') as f:
    content = f.read()


target = "                  el.style.opacity = '1';\r\n\r\n                  // Initial Markers"
replacement = """                  el.style.opacity = '1';

                  // Show live HUD overlay
                  const hudOverlay = document.getElementById('daximap-hud-' + id);
                  if (hudOverlay) {
                      hudOverlay.style.display = 'block';
                      hudOverlay.style.opacity = '0';
                      hudOverlay.style.transition = 'opacity 0.8s ease';
                      setTimeout(() => { hudOverlay.style.opacity = '1'; }, 800);
                  }

                  // Initial Markers"""

if target in content:
    content = content.replace(target, replacement, 1)
    print('HUD show patch: OK')
else:
    
    target2 = "                  el.style.opacity = '1';\n\n                  // Initial Markers"
    if target2 in content:
        content = content.replace(target2, replacement, 1)
        print('HUD show patch (LF): OK')
    else:
        
        idx = content.find("el.style.opacity = '1';")
        if idx > 0:
            
            idx2 = content.find("el.style.opacity = '1';", idx + 10)
            if idx2 > 0:
                insert_after = idx2 + len("el.style.opacity = '1';")
                hud_code = """

                  // Show live HUD overlay
                  const hudOverlay = document.getElementById('daximap-hud-' + id);
                  if (hudOverlay) {
                      hudOverlay.style.display = 'block';
                      hudOverlay.style.opacity = '0';
                      hudOverlay.style.transition = 'opacity 0.8s ease';
                      setTimeout(() => { hudOverlay.style.opacity = '1'; }, 800);
                  }"""
                content = content[:insert_after] + hud_code + content[insert_after:]
                print(f'HUD show patch (idx): OK - inserted at pos {insert_after}')
            else:
                print('HUD show patch: FAILED - could not find second opacity line')
        else:
            print('HUD show patch: FAILED completely')

with codecs.open('vubez2.html', 'w', 'utf-8') as f:
    f.write(content)
print('Done.')
