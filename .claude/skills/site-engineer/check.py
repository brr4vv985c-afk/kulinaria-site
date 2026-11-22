#!/usr/bin/env python3
"""Проверка сайта «А ещё есть?»: меню, фото, контакты, микроразметка, публикация."""
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
MAX_PHOTO_KB = 300

errors, warnings = [], []


def read(path):
    with open(os.path.join(ROOT, path), encoding='utf-8') as f:
        return f.read()


# --- menu.json ---
try:
    menu = json.loads(read('menu.json'))
except (OSError, json.JSONDecodeError) as e:
    print(f'ОШИБКА: menu.json не читается: {e}')
    sys.exit(1)

cat_ids = set()
dish_count = 0
for ci, cat in enumerate(menu.get('categories', [])):
    where = f'menu.json, категория №{ci + 1}'
    cid = cat.get('id', '')
    if not re.fullmatch(r'[a-z0-9-]+', cid or ''):
        errors.append(f'{where}: id «{cid}» — нужны латинские буквы, цифры, дефис')
    if cid in cat_ids:
        errors.append(f'{where}: id «{cid}» повторяется')
    cat_ids.add(cid)
    if not cat.get('title'):
        errors.append(f'{where}: нет title')
    for di, dish in enumerate(cat.get('items', [])):
        dw = f'{where} «{cat.get("title")}», блюдо «{dish.get("name", di + 1)}»'
        dish_count += 1
        if not dish.get('name'):
            errors.append(f'{dw}: нет name')
        price = dish.get('price')
        if not isinstance(price, (int, float)) or isinstance(price, bool) or price <= 0:
            errors.append(f'{dw}: price должен быть положительным числом без «₽», сейчас {price!r}')
        if not dish.get('weight'):
            warnings.append(f'{dw}: не указан вес/порция')
        photo = dish.get('photo')
        if photo:
            path = os.path.join(ROOT, photo)
            if not os.path.isfile(path):
                errors.append(f'{dw}: нет файла фото {photo}')
            elif os.path.getsize(path) > MAX_PHOTO_KB * 1024:
                warnings.append(f'{dw}: фото {photo} весит {os.path.getsize(path) // 1024} КБ — лучше сжать до ~200 КБ')

if dish_count == 0:
    errors.append('menu.json: в меню нет ни одного блюда')

# --- index.html ---
html = read('index.html')
js = read('js/main.js')

m = re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
ld = None
if not m:
    errors.append('index.html: не найдена микроразметка JSON-LD')
else:
    try:
        ld = json.loads(m.group(1))
    except json.JSONDecodeError as e:
        errors.append(f'index.html: микроразметка JSON-LD с ошибкой: {e}')

# Телефон: все tel:-ссылки и wa.me должны указывать на один номер
tels = set(re.findall(r'tel:\+?(\d+)', html + js))
was = set(re.findall(r'wa\.me/(\d+)', html))
numbers = tels | was
if len(numbers) > 1:
    errors.append(f'разные номера телефона в ссылках tel:/wa.me: {", ".join(sorted(numbers))}')
if ld and numbers:
    ld_digits = re.sub(r'\D', '', ld.get('telephone', ''))
    if ld_digits and ld_digits not in numbers:
        errors.append(f'телефон в микроразметке ({ld.get("telephone")}) не совпадает со ссылками ({", ".join(sorted(numbers))})')

for goal in ('call', 'telegram', 'whatsapp'):
    if f'data-goal="{goal}"' not in html:
        warnings.append(f'index.html: нет ссылки с data-goal="{goal}" (цель Метрики)')

if '79000000000' in html or '79000000000' in js:
    warnings.append('стоит телефон-пример +7 900 000-00-00 — замените на настоящий')

# --- публикация ---
wf = read('.github/workflows/pages.yml')
copy_line = re.search(r'cp -r (.+?) _site/', wf)
if not copy_line:
    errors.append('pages.yml: не найден шаг копирования файлов сайта')
else:
    listed = set(copy_line.group(1).split())
    ignore = {'.git', '.github', '.claude', 'README.md', 'preview', '.gitignore', 'node_modules'}
    for name in os.listdir(ROOT):
        if name not in ignore and name not in listed:
            warnings.append(f'«{name}» не публикуется: добавьте в cp в .github/workflows/pages.yml (или это не файл сайта)')
    for name in listed:
        if not os.path.exists(os.path.join(ROOT, name)):
            errors.append(f'pages.yml копирует «{name}», но такого файла нет')

print(f'Категорий: {len(cat_ids)}, блюд: {dish_count}')
for w in warnings:
    print('Предупреждение:', w)
for e in errors:
    print('ОШИБКА:', e)
print('Готово: ошибок нет' if not errors else f'Ошибок: {len(errors)}')
sys.exit(1 if errors else 0)
