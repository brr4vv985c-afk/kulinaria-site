(function () {
  'use strict';

  // ===== Настройки (меняйте здесь) =====
  var CONFIG = {
    // ID счётчика Яндекс.Метрики (впишите после создания счётчика, см. README)
    metrikaId: null,
    phone: '+79000000000',            // для звонка
    phoneText: '+7 900 000-00-00',    // как показывать
    whatsapp: '79000000000',          // номер без «+»
    telegram: 'aeshcheest',           // имя в Telegram без «@»
    deliveryPrice: 200,               // стоимость доставки, ₽
    freeDeliveryFrom: 1500            // бесплатная доставка от суммы, ₽ (0 — всегда платная)
  };

  var PLACEHOLDER = 'images/placeholder.svg';
  var STORAGE_KEY = 'aeshcheest-order';
  var priceFormat = new Intl.NumberFormat('ru-RU');

  var dishes = {};   // ключ → блюдо
  var cart = {};     // ключ → количество
  var form = { mode: 'pickup', address: '', time: '', name: '', comment: '' };

  function rub(n) { return priceFormat.format(n) + ' ₽'; }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // ===== Хранение корзины в браузере =====
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ cart: cart, form: form })); } catch (e) { /* нет доступа — не страшно */ }
  }
  function load() {
    try {
      var data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (data.form) Object.keys(form).forEach(function (k) { if (typeof data.form[k] === 'string') form[k] = data.form[k]; });
      return data.cart || {};
    } catch (e) { return {}; }
  }

  // ===== Меню =====
  function stepper(key) {
    var box = el('div', 'stepper');
    box.dataset.key = key;
    var minus = el('button', 'stepper__btn', '−');
    minus.type = 'button';
    minus.dataset.act = 'dec';
    minus.setAttribute('aria-label', 'Убрать одну порцию: ' + dishes[key].name);
    var qty = el('span', 'stepper__qty');
    var plus = el('button', 'stepper__btn', '+');
    plus.type = 'button';
    plus.dataset.act = 'inc';
    plus.setAttribute('aria-label', 'Добавить: ' + dishes[key].name);
    box.appendChild(minus);
    box.appendChild(qty);
    box.appendChild(plus);
    return box;
  }

  function renderDish(item, key) {
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

    var body = el('div', 'dish__body');
    body.appendChild(el('p', 'dish__name', item.name));
    if (item.description) body.appendChild(el('p', 'dish__desc', item.description));
    if (item.weight) body.appendChild(el('p', 'dish__weight', item.weight));
    var meta = el('div', 'dish__meta');
    meta.appendChild(el('span', 'dish__price', rub(item.price)));
    meta.appendChild(stepper(key));
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
      items.forEach(function (item) {
        var key = cat.id + '/' + item.name;
        dishes[key] = item;
        grid.appendChild(renderDish(item, key));
      });
      section.appendChild(grid);
      list.appendChild(section);
    });

    // корзина из прошлого визита: только блюда, которые всё ещё есть в меню
    var saved = load();
    Object.keys(saved).forEach(function (key) {
      var n = parseInt(saved[key], 10);
      if (dishes[key] && n > 0) cart[key] = Math.min(n, 99);
    });

    highlightTabs(tabs, list);
    update();
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

  // ===== Корзина =====
  function change(key, delta) {
    if (!dishes[key]) return;
    var n = (cart[key] || 0) + delta;
    if (n > 0) cart[key] = Math.min(n, 99); else delete cart[key];
    if (delta > 0) reachGoal('cart_add');
    update();
  }

  function totals() {
    var count = 0, sum = 0;
    Object.keys(cart).forEach(function (key) {
      count += cart[key];
      sum += cart[key] * dishes[key].price;
    });
    var delivery = 0;
    if (form.mode === 'delivery' && sum > 0) {
      delivery = CONFIG.freeDeliveryFrom && sum >= CONFIG.freeDeliveryFrom ? 0 : CONFIG.deliveryPrice;
    }
    return { count: count, sum: sum, delivery: delivery, total: sum + delivery };
  }

  function orderText() {
    var t = totals();
    if (!t.count) return 'Здравствуйте! Хочу сделать заказ.';
    var lines = ['Здравствуйте! Хочу сделать заказ:'];
    Object.keys(cart).forEach(function (key) {
      var d = dishes[key];
      lines.push('• ' + d.name + (d.weight ? ' (' + d.weight + ')' : '') + ' — ' + cart[key] + ' × ' + rub(d.price) + ' = ' + rub(cart[key] * d.price));
    });
    if (t.count) {
      if (form.mode === 'delivery') {
        lines.push('Доставка: ' + (t.delivery ? rub(t.delivery) : 'бесплатно'));
      }
      lines.push('Итого: ' + rub(t.total));
    }
    lines.push('');
    lines.push('Получение: ' + (form.mode === 'delivery' ? 'доставка' : 'самовывоз'));
    if (form.mode === 'delivery' && form.address.trim()) lines.push('Адрес: ' + form.address.trim());
    if (form.time.trim()) lines.push('Когда: ' + form.time.trim());
    if (form.name.trim()) lines.push('Имя: ' + form.name.trim());
    if (form.comment.trim()) lines.push('Комментарий: ' + form.comment.trim());
    return lines.join('\n').trim();
  }

  function renderCartList() {
    var list = document.getElementById('cart-list');
    list.textContent = '';
    Object.keys(cart).forEach(function (key) {
      var d = dishes[key];
      var li = el('li', 'cart-item');
      var info = el('div', 'cart-item__info');
      info.appendChild(el('span', 'cart-item__name', d.name));
      info.appendChild(el('span', 'cart-item__sum', rub(d.price) + (cart[key] > 1 ? ' × ' + cart[key] + ' = ' + rub(d.price * cart[key]) : '')));
      li.appendChild(info);
      li.appendChild(stepper(key));
      list.appendChild(li);
    });
  }

  // счётчики у блюд в меню и в корзине
  function syncSteppers() {
    document.querySelectorAll('.stepper').forEach(function (box) {
      var n = cart[box.dataset.key] || 0;
      box.classList.toggle('is-empty', !n);
      box.querySelector('.stepper__qty').textContent = n || '';
    });
  }

  function update() {
    var t = totals();

    var dialog = document.getElementById('order-dialog');
    if (dialog.open) renderCartList();
    syncSteppers();

    // кнопки «Заказать» / «Корзина»
    var label = t.count ? 'Корзина · ' + t.count + ' шт. · ' + rub(t.sum) : 'Заказать';
    document.querySelectorAll('[data-order-label]').forEach(function (n) { n.textContent = label; });
    document.body.classList.toggle('has-cart', t.count > 0);

    // содержимое корзины
    dialog.classList.toggle('is-empty', !t.count);
    document.getElementById('cart-subtotal').textContent = rub(t.sum);
    document.getElementById('cart-delivery-row').hidden = form.mode !== 'delivery';
    document.getElementById('cart-delivery').textContent = t.delivery ? rub(t.delivery) : 'бесплатно';
    document.getElementById('cart-total').textContent = rub(t.total);

    var hint = document.getElementById('cart-hint');
    var left = CONFIG.freeDeliveryFrom - t.sum;
    if (form.mode === 'delivery' && CONFIG.freeDeliveryFrom && left > 0) {
      hint.textContent = 'До бесплатной доставки — ещё ' + rub(left);
      hint.hidden = false;
    } else {
      hint.hidden = true;
    }
    document.getElementById('field-address').hidden = form.mode !== 'delivery';

    // ссылки отправки с текстом заказа
    var text = orderText();
    document.querySelectorAll('[data-send="whatsapp"]').forEach(function (a) {
      a.href = 'https://wa.me/' + CONFIG.whatsapp + '?text=' + encodeURIComponent(text);
    });

    save();
  }

  // ===== Окно заказа =====
  var dialog = document.getElementById('order-dialog');

  function openOrder() {
    reachGoal('order_open');
    renderCartList();
    syncSteppers();
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      location.hash = '#contacts';
    }
  }

  document.querySelectorAll('[data-order]').forEach(function (btn) {
    btn.addEventListener('click', openOrder);
  });

  // закрытие по нажатию на затемнённый фон или на «Закрыть» / «Открыть меню»
  dialog.addEventListener('click', function (e) {
    if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
  });

  // плюс / минус — и в меню, и в корзине
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.stepper__btn');
    if (!btn) return;
    var key = btn.closest('.stepper').dataset.key;
    change(key, btn.dataset.act === 'inc' ? 1 : -1);
  });

  // поля формы
  var fields = document.getElementById('order-form');
  Object.keys(form).forEach(function (name) {
    var inputs = fields.querySelectorAll('[name="' + name + '"]');
    inputs.forEach(function (input) {
      if (input.type === 'radio') input.checked = input.value === form[name];
      else input.value = form[name];
      input.addEventListener(input.type === 'radio' ? 'change' : 'input', function () {
        form[name] = input.value;
        update();
      });
    });
  });

  // Сначала проверяем адрес; true — можно отправлять
  function readyToSend() {
    if (totals().count && form.mode === 'delivery' && !form.address.trim()) {
      var address = fields.querySelector('[name="address"]');
      address.focus();
      toast('Укажите адрес доставки');
      return false;
    }
    return true;
  }

  document.querySelectorAll('[data-send="whatsapp"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (!readyToSend()) e.preventDefault();
    });
  });

  // Telegram не умеет вставлять текст в чат сам — копируем заказ
  document.querySelectorAll('[data-send="telegram"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (!readyToSend()) { e.preventDefault(); return; }
      if (!totals().count) return;
      copy(orderText());
      toast('Заказ скопирован — вставьте его в чат Telegram');
    });
  });

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(function () { copyFallback(text); });
    } else {
      copyFallback(text);
    }
  }
  function copyFallback(text) {
    var area = el('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    dialog.appendChild(area);
    area.select();
    try { document.execCommand('copy'); } catch (e) { /* не получилось — клиент напишет сам */ }
    area.remove();
  }

  var toastTimer;
  function toast(message) {
    var node = document.getElementById('toast');
    node.textContent = message;
    node.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.classList.remove('is-visible'); }, 3500);
  }

  // ===== Цели для Метрики / Директа: call, telegram, whatsapp, order_open, cart_add =====
  function reachGoal(name) {
    if (CONFIG.metrikaId && typeof window.ym === 'function') {
      window.ym(CONFIG.metrikaId, 'reachGoal', name);
    }
  }
  document.addEventListener('click', function (e) {
    var link = e.target.closest('[data-goal]');
    if (link) reachGoal(link.dataset.goal);
  });

  // ===== Загрузка меню =====
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
      var a = el('a', null, CONFIG.phoneText);
      a.href = 'tel:' + CONFIG.phone;
      p.appendChild(a);
      list.appendChild(p);
      update();
    });

  document.getElementById('year').textContent = new Date().getFullYear();
})();
