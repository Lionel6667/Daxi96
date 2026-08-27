import codecs
import re

file_path = 'vubez2.html'
with codecs.open(file_path, 'r', 'utf-8') as f:
    content = f.read()

target = """                // ── Manual Interaction Logic
                const stopFollow = () => {
                    if (inst.isFollowing && !inst.isIntro) {"""

replacement = """                // ── Manual Interaction Logic
                const stopFollow = (e) => {
                    if (e && !e.originalEvent) return;
                    if (inst.isFollowing && !inst.isIntro) {"""

content = content.replace(target, replacement)

with codecs.open(file_path, 'w', 'utf-8') as f:
    f.write(content)
print('stopFollow patched.')
