(function () {
  'use strict';

  // ID счётчика Яндекс.Метрики (впишите после создания счётчика, см. README)
  var METRIKA_ID = null;

  var PLACEHOLDER = 'images/placeholder.svg';
  var priceFormat = new Intl.NumberFormat('ru-RU');

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function renderDish(item) {
    var li = el('li', 'dish');

    var img = el('img');
    img.src = item.photo || PLACEHOLDER;
    img.alt = item.name;
    img.width = 96;
    img.height = 96;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.onerror = function () {
      img.onerror = null;
      img.src = PLACEHOLDER;
    };
    li.appendChild(img);

    var body = el('div');
    body.appendChild(el('p', 'dish__name', item.name));
    if (item.description) body.appendChild(el('p', 'dish__desc', item.description));
    var meta = el('div', 'dish__meta');
    meta.appendChild(el('span', 'dish__weight', item.weight || ''));
    meta.appendChild(el('span', 'dish__price', priceFormat.format(item.price) + ' ₽'));
    body.appendChild(meta);
    li.appendChild(body);
    return li;
  }

  function renderMenu(data) {
    var tabs = document.getElementById('menu-tabs');
    var list = document.getElementById('menu-list');
    list.textContent = '';

    data.categories.forEach(function (cat) {
      var items = cat.items.filter(function (i) { return i.available !== false; });
      if (!items.length) return;

      var tab = el('a', 'tab', cat.title);
      tab.href = '#cat-' + cat.id;
      tab.dataset.cat = cat.id;
      tabs.appendChild(tab);

      var section = el('section', 'menu__cat');
      section.id = 'cat-' + cat.id;
      section.appendChild(el('h3', null, cat.title));
      var grid = el('ul', 'menu__grid');
      items.forEach(function (item) { grid.appendChild(renderDish(item)); });
      section.appendChild(grid);
      list.appendChild(section);
    });

    highlightTabs(tabs, list);
  }

  // Подсвечиваем категорию, которую сейчас видно на экране
  function highlightTabs(tabs, list) {
    if (!('IntersectionObserver' in window)) return;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = entry.target.id.replace('cat-', '');
        Array.prototype.forEach.call(tabs.children, function (tab) {
          var active = tab.dataset.cat === id;
          tab.classList.toggle('is-active', active);
          if (active && typeof tabs.scrollTo === 'function') {
            tabs.scrollTo({ left: tab.offsetLeft - 16, behavior: 'smooth' });
          }
        });
      });
    }, { rootMargin: '-120px 0px -60% 0px' });
    Array.prototype.forEach.call(list.children, function (s) { observer.observe(s); });
  }

  fetch('menu.json', { cache: 'no-cache' })
    .then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    })
    .then(renderMenu)
    .catch(function () {
      var list = document.getElementById('menu-list');
      list.textContent = '';
      var p = el('p', 'menu__error', 'Не удалось загрузить меню. Позвоните нам, и мы всё расскажем: ');
      var a = el('a', null, '+7 900 000-00-00');
      a.href = 'tel:+79000000000';
      p.appendChild(a);
      list.appendChild(p);
    });

  // Окно «Заказать»
  var dialog = document.getElementById('order-dialog');
  document.querySelectorAll('[data-order]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      reachGoal('order_open');
      if (dialog && typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        location.hash = '#contacts';
      }
    });
  });
  if (dialog) {
    // закрытие по нажатию на затемнённый фон
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog) dialog.close();
    });
  }

  // Цели для Метрики / Директа: call, telegram, whatsapp, order_open
  function reachGoal(name) {
    if (METRIKA_ID && typeof window.ym === 'function') {
      window.ym(METRIKA_ID, 'reachGoal', name);
    }
  }
  document.addEventListener('click', function (e) {
    var link = e.target.closest('[data-goal]');
    if (link) reachGoal(link.dataset.goal);
  });

  document.getElementById('year').textContent = new Date().getFullYear();
})();
