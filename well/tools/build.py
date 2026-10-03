#!/usr/bin/env python3
"""Собирает игру в один HTML-файл.

dist/index.html    — самостоятельная страница (можно открыть в браузере или выложить куда угодно)
dist/artifact.html — фрагмент без <html>/<head> для публикации как Artifact
"""
import pathlib

root = pathlib.Path(__file__).resolve().parent.parent
src = sorted((root / 'src').glob('*.js'))
script = '\n'.join(f'// ---- {f.name} ----\n' + f.read_text(encoding='utf-8') for f in src)
shell = (root / 'shell.html').read_text(encoding='utf-8')
assert '/*SCRIPT*/' in shell
page = shell.replace('/*SCRIPT*/', '"use strict";\n' + script.replace('</script', '<\\/script'))

dist = root / 'dist'
dist.mkdir(exist_ok=True)
(dist / 'artifact.html').write_text(page, encoding='utf-8')

head, body = page.split('<div id="app">', 1)
standalone = (
    '<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    + head + '</head>\n<body>\n<div id="app">' + body + '</body>\n</html>\n'
)
(dist / 'index.html').write_text(standalone, encoding='utf-8')
print(f'собрано: {len(src)} файлов, {len(page) // 1024} КБ')
