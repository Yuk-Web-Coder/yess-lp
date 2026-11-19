(() => {
  'use strict';

  const STORAGE_KEY = 'yess_smoke_test_v1';

  // 公開時にGoogle Apps Script / Formspree等のPOST先URLを設定すると自動送信されます
  const TRACKING_CONFIG = {
    endpointUrl: 'https://script.google.com/macros/s/AKfycbzE7_hvgNOewr7lNoITkIGf0fDg261RQZ8IoaJgCseKEIBQi6QxBpBXhs26L5ZBUvf9IA/exec',
    enableGtag: true
  };

  const UNIT_PRICES = {
    carrot: 320,
    tomato: 320
  };

  const SHIPPING_FEE = 300;
  const TIER1_MIN_BAGS = 8;
  const TIER1_DISCOUNT_RATE = 0.05;
  const TIER2_MIN_BAGS = 16;
  const TIER2_DISCOUNT_RATE = 0.1;

  const PRESETS = {
    'assort-8': { carrot: 4, tomato: 4 },
    'assort-16': { carrot: 8, tomato: 8 },
    'assort-4': { carrot: 2, tomato: 2 },
    'assort-2': { carrot: 1, tomato: 1 }
  };

  const state = {
    carrotQty: 4,
    tomatoQty: 4,
    habit: '',
    reason: ''
  };

  function getParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get('utm_source') || 'direct',
      utm_campaign: params.get('utm_campaign') || 'none'
    };
  }

  function loadLog() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {
      // Ignore storage errors
    }
    return {
      views: 0,
      selects: 0,
      fakePurchases: 0,
      leads: 0,
      events: []
    };
  }

  function saveLog(log) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
    } catch (_) {
      // Ignore storage errors
    }
  }

  function getSelectionCategory() {
    if (state.carrotQty > 0 && state.tomatoQty > 0) return 'assort';
    if (state.carrotQty > 0) return 'carrot';
    if (state.tomatoQty > 0) return 'tomato';
    return 'none';
  }

  function trackEvent(type, payload = {}) {
    const log = loadLog();
    if (type === 'view') log.views += 1;
    if (type === 'select') log.selects += 1;
    if (type === 'fake_purchase') log.fakePurchases += 1;
    if (type === 'waitlist_lead') log.leads += 1;

    const totalBags = state.carrotQty + state.tomatoQty;

    log.events.push({
      timestamp: new Date().toISOString(),
      type,
      flavor: getSelectionCategory(),
      carrotQty: state.carrotQty,
      tomatoQty: state.tomatoQty,
      totalBags,
      ...getParams(),
      ...payload
    });

    saveLog(log);
    renderAnalytics();

    if (TRACKING_CONFIG.enableGtag && typeof window.gtag === 'function') {
      const gaEventMap = {
        view: 'view_item',
        select: 'select_item',
        fake_purchase: 'begin_checkout',
        waitlist_lead: 'generate_lead',
        pouch_3d: 'pouch_3d_interact'
      };
      window.gtag('event', gaEventMap[type] || type, {
        flavor: getSelectionCategory(),
        carrot_qty: state.carrotQty,
        tomato_qty: state.tomatoQty,
        total_bags: totalBags,
        ...payload
      });
    }

    if (TRACKING_CONFIG.endpointUrl) {
      if (type === 'fake_purchase') {
        sendToEndpoint({
          timestamp: new Date().toISOString(),
          type,
          flavor: getSelectionCategory(),
          carrotQty: state.carrotQty,
          tomatoQty: state.tomatoQty,
          totalBags,
          totalAmount: payload.total || 0,
          ...getParams()
        });
      } else if (type === 'view') {
        try {
          if (!sessionStorage.getItem('yess_session_viewed')) {
            sessionStorage.setItem('yess_session_viewed', '1');
            sendToEndpoint({
              timestamp: new Date().toISOString(),
              type: 'view',
              flavor: getSelectionCategory(),
              carrotQty: state.carrotQty,
              tomatoQty: state.tomatoQty,
              totalBags,
              totalAmount: 0,
              ...getParams()
            });
          }
        } catch (_) {
          // Ignore storage errors
        }
      }
    }
  }

  async function sendToEndpoint(data) {
    const url = TRACKING_CONFIG.endpointUrl;
    if (!url) return false;
    try {
      const isGas = url.includes('script.google.com');
      const res = await fetch(url, {
        method: 'POST',
        mode: isGas ? 'no-cors' : 'cors',
        headers: {
          'Content-Type': isGas ? 'text/plain;charset=utf-8' : 'application/json'
        },
        body: JSON.stringify(data),
        keepalive: true
      });
      return isGas ? true : res.ok;
    } catch (_) {
      return false;
    }
  }

  function formatYen(num) {
    return `¥${num.toLocaleString('ja-JP')}`;
  }

  function calcTotals() {
    const carrotSub = state.carrotQty * UNIT_PRICES.carrot;
    const tomatoSub = state.tomatoQty * UNIT_PRICES.tomato;
    const rawSubtotal = carrotSub + tomatoSub;
    const totalBags = state.carrotQty + state.tomatoQty;

    let discountRate = 0;
    if (totalBags >= TIER2_MIN_BAGS) {
      discountRate = TIER2_DISCOUNT_RATE;
    } else if (totalBags >= TIER1_MIN_BAGS) {
      discountRate = TIER1_DISCOUNT_RATE;
    }

    const discount = Math.round(rawSubtotal * discountRate);
    const afterDiscount = rawSubtotal - discount;

    let shipping = 0;
    if (totalBags > 0 && totalBags < TIER1_MIN_BAGS) {
      shipping = SHIPPING_FEE;
    }

    return {
      carrotSub,
      tomatoSub,
      totalBags,
      discountRate,
      discount,
      shipping,
      total: afterDiscount + shipping
    };
  }

  // Elements
  const carrotCard = document.getElementById('carrotCard');
  const tomatoCard = document.getElementById('tomatoCard');
  const carrotQtyInput = document.getElementById('carrotQtyInput');
  const tomatoQtyInput = document.getElementById('tomatoQtyInput');
  const carrotMinusBtn = document.getElementById('carrotMinusBtn');
  const carrotPlusBtn = document.getElementById('carrotPlusBtn');
  const tomatoMinusBtn = document.getElementById('tomatoMinusBtn');
  const tomatoPlusBtn = document.getElementById('tomatoPlusBtn');
  const carrotSubtotal = document.getElementById('carrotSubtotal');
  const tomatoSubtotal = document.getElementById('tomatoSubtotal');
  const benefitNote = document.getElementById('benefitNote');

  const summaryCarrot = document.getElementById('summaryCarrot');
  const summaryTomato = document.getElementById('summaryTomato');
  const summaryQty = document.getElementById('summaryQty');
  const summaryDiscountRow = document.getElementById('summaryDiscountRow');
  const summaryDiscountLabel = document.getElementById('summaryDiscountLabel');
  const summaryDiscount = document.getElementById('summaryDiscount');
  const summaryShipping = document.getElementById('summaryShipping');
  const summaryTotal = document.getElementById('summaryTotal');
  const checkoutNote = document.getElementById('checkoutNote');
  const modalChosenSummary = document.getElementById('modalChosenSummary');

  const interceptModal = document.getElementById('interceptModal');
  const fakePurchaseBtn = document.getElementById('fakePurchaseBtn');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const waitlistForm = document.getElementById('waitlistForm');
  const waitlistEmail = document.getElementById('waitlistEmail');
  const modalFormError = document.getElementById('modalFormError');
  const waitlistSubmitBtn = document.getElementById('waitlistSubmitBtn');
  const modalCompleteBox = document.getElementById('modalCompleteBox');

  const toggleAnalyticsBtn = document.getElementById('toggleAnalyticsBtn');
  const analyticsDrawer = document.getElementById('analyticsDrawer');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const resetStatsBtn = document.getElementById('resetStatsBtn');

  const privacyModal = document.getElementById('privacyModal');
  const openPrivacyBtn = document.getElementById('openPrivacyBtn');
  const openPrivacyFromModalBtn = document.getElementById('openPrivacyFromModalBtn');
  const closePrivacyBtn = document.getElementById('closePrivacyBtn');

  function syncPresetHighlight() {
    document.querySelectorAll('[data-preset]').forEach((btn) => {
      const p = PRESETS[btn.dataset.preset];
      const match = p && p.carrot === state.carrotQty && p.tomato === state.tomatoQty;
      btn.classList.toggle('is-active', Boolean(match));
    });
  }

  function updateSummary() {
    const totals = calcTotals();

    carrotQtyInput.value = String(state.carrotQty);
    tomatoQtyInput.value = String(state.tomatoQty);
    carrotMinusBtn.disabled = state.carrotQty <= 0;
    tomatoMinusBtn.disabled = state.tomatoQty <= 0;

    carrotCard.classList.toggle('has-qty', state.carrotQty > 0);
    tomatoCard.classList.toggle('has-qty', state.tomatoQty > 0);

    carrotSubtotal.textContent = formatYen(totals.carrotSub);
    tomatoSubtotal.textContent = formatYen(totals.tomatoSub);

    summaryCarrot.textContent = `${state.carrotQty}袋（${formatYen(totals.carrotSub)}）`;
    summaryTomato.textContent = `${state.tomatoQty}袋（${formatYen(totals.tomatoSub)}）`;
    summaryQty.textContent = `${totals.totalBags}袋`;

    if (totals.discount > 0) {
      summaryDiscountRow.hidden = false;
      if (summaryDiscountLabel) {
        summaryDiscountLabel.textContent = totals.discountRate >= TIER2_DISCOUNT_RATE
          ? '16袋以上 まとめ買い10%オフ'
          : '8袋以上 まとめ買い5%オフ';
      }
      summaryDiscount.textContent = `-${formatYen(totals.discount)}`;
    } else {
      summaryDiscountRow.hidden = true;
    }

    if (totals.totalBags === 0) {
      summaryShipping.textContent = '—';
      benefitNote.textContent = '1袋以上お選びください（8袋以上で送料無料＋5%オフ、16袋以上で10%オフ）。';
      fakePurchaseBtn.disabled = true;
      checkoutNote.textContent = '※ 購入するフレーバーの個数を1袋以上に設定してください';
    } else {
      fakePurchaseBtn.disabled = false;
      checkoutNote.textContent = '※ 仮購入のためお支払いは発生しません。開発後に改めて正式な購入意思を確認します';

      if (totals.shipping === 0) {
        summaryShipping.textContent = '無料';
      } else {
        summaryShipping.textContent = formatYen(totals.shipping);
      }

      if (totals.totalBags >= TIER2_MIN_BAGS) {
        benefitNote.textContent = '合計16袋以上のため「10%オフ ＋ 送料無料」が適用されています。';
      } else if (totals.totalBags >= TIER1_MIN_BAGS) {
        const remainBulk = TIER2_MIN_BAGS - totals.totalBags;
        benefitNote.textContent = `合計8袋以上のため「5%オフ ＋ 送料無料」が適用されています（あと${remainBulk}袋追加で10%オフ）。`;
      } else {
        const remainShip = TIER1_MIN_BAGS - totals.totalBags;
        benefitNote.textContent = `あと${remainShip}袋追加すると「5%オフ ＋ 送料無料」が適用されます（現在送料 ${formatYen(SHIPPING_FEE)}）。`;
      }
    }

    summaryTotal.textContent = formatYen(totals.total);

    const parts = [];
    if (state.carrotQty > 0) parts.push(`キャロット＆ビーツ味 ${state.carrotQty}袋`);
    if (state.tomatoQty > 0) parts.push(`トマト＆バジル味 ${state.tomatoQty}袋`);
    modalChosenSummary.textContent = `${parts.join(' ＋ ')}（計${totals.totalBags}袋 / 合計 ${formatYen(totals.total)}）`;

    syncPresetHighlight();
  }

  function clampQty(val) {
    const parsed = parseInt(val, 10);
    if (Number.isNaN(parsed) || parsed < 0) return 0;
    if (parsed > 99) return 99;
    return parsed;
  }

  function setQuantities(carrot, tomato, source = 'manual') {
    state.carrotQty = clampQty(carrot);
    state.tomatoQty = clampQty(tomato);
    updateSummary();
    trackEvent('select', { source });
  }

  // Preset buttons
  document.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = PRESETS[btn.dataset.preset];
      if (!p) return;
      setQuantities(p.carrot, p.tomato, `preset:${btn.dataset.preset}`);
    });
  });

  // Steppers & Inputs
  carrotMinusBtn.addEventListener('click', () => setQuantities(state.carrotQty - 1, state.tomatoQty, 'stepper:carrot-'));
  carrotPlusBtn.addEventListener('click', () => setQuantities(state.carrotQty + 1, state.tomatoQty, 'stepper:carrot+'));
  tomatoMinusBtn.addEventListener('click', () => setQuantities(state.carrotQty, state.tomatoQty - 1, 'stepper:tomato-'));
  tomatoPlusBtn.addEventListener('click', () => setQuantities(state.carrotQty, state.tomatoQty + 1, 'stepper:tomato+'));

  carrotQtyInput.addEventListener('change', () => setQuantities(carrotQtyInput.value, state.tomatoQty, 'input:carrot'));
  tomatoQtyInput.addEventListener('change', () => setQuantities(state.carrotQty, tomatoQtyInput.value, 'input:tomato'));

  // Flavor cards jump buttons (sets single flavor 1 bag to try right away)
  document.querySelectorAll('[data-jump-flavor]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.jumpFlavor;
      if (target === 'carrot') {
        setQuantities(Math.max(1, state.carrotQty), 0, 'jump:carrot');
      } else if (target === 'tomato') {
        setQuantities(0, Math.max(1, state.tomatoQty), 'jump:tomato');
      }
      document.getElementById('checkout').scrollIntoView({ behavior: 'smooth' });
    });
  });

  // Modal open / close
  function openModal() {
    interceptModal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    waitlistEmail.focus();
  }

  function closeModal() {
    interceptModal.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  fakePurchaseBtn.addEventListener('click', () => {
    const totals = calcTotals();
    if (totals.totalBags <= 0) return;
    trackEvent('fake_purchase', {
      total: totals.total
    });
    openModal();
  });

  closeModalBtn.addEventListener('click', closeModal);

  interceptModal.addEventListener('click', (e) => {
    if (e.target === interceptModal) closeModal();
  });

  function openPrivacyModal() {
    if (!privacyModal) return;
    privacyModal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    if (closePrivacyBtn) closePrivacyBtn.focus();
  }

  function closePrivacyModal() {
    if (!privacyModal) return;
    privacyModal.classList.remove('is-open');
    if (!interceptModal.classList.contains('is-open')) {
      document.body.style.overflow = '';
    }
  }

  if (openPrivacyBtn) openPrivacyBtn.addEventListener('click', openPrivacyModal);
  if (openPrivacyFromModalBtn) openPrivacyFromModalBtn.addEventListener('click', openPrivacyModal);
  if (closePrivacyBtn) closePrivacyBtn.addEventListener('click', closePrivacyModal);
  if (privacyModal) {
    privacyModal.addEventListener('click', (e) => {
      if (e.target === privacyModal) closePrivacyModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (privacyModal && privacyModal.classList.contains('is-open')) {
      closePrivacyModal();
      return;
    }
    if (interceptModal.classList.contains('is-open')) {
      closeModal();
    }
  });

  // Habit & Reason chips
  document.querySelectorAll('[data-habit]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const clicked = chip.dataset.habit;
      const isAlready = state.habit === clicked;
      state.habit = isAlready ? '' : clicked;
      document.querySelectorAll('[data-habit]').forEach((c) => {
        c.classList.toggle('is-active', c.dataset.habit === state.habit);
      });
    });
  });

  document.querySelectorAll('[data-reason]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const clicked = chip.dataset.reason;
      const isAlready = state.reason === clicked;
      state.reason = isAlready ? '' : clicked;
      document.querySelectorAll('[data-reason]').forEach((c) => {
        c.classList.toggle('is-active', c.dataset.reason === state.reason);
      });
    });
  });

  // Waitlist form submit
  waitlistForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = waitlistEmail.value.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      modalFormError.textContent = '有効なメールアドレスを入力してください。';
      waitlistEmail.focus();
      return;
    }

    modalFormError.textContent = '';
    if (waitlistSubmitBtn) {
      waitlistSubmitBtn.disabled = true;
      waitlistSubmitBtn.textContent = '送信中...';
    }

    const totals = calcTotals();
    const habit = state.habit || '未回答';
    const reason = state.reason || '未回答';

    // ローカルログには個人情報を残さず統計のみ記録
    trackEvent('waitlist_lead', {
      habit,
      reason,
      total: totals.total
    });

    // 外部URLが設定されている場合はメールアドレスを含めてPOST送信
    if (TRACKING_CONFIG.endpointUrl) {
      await sendToEndpoint({
        timestamp: new Date().toISOString(),
        type: 'waitlist_lead',
        email,
        flavor: getSelectionCategory(),
        carrotQty: state.carrotQty,
        tomatoQty: state.tomatoQty,
        totalBags: totals.totalBags,
        totalAmount: totals.total,
        habit,
        reason,
        pageUrl: window.location.href,
        ...getParams()
      });
    }

    waitlistForm.style.display = 'none';
    modalCompleteBox.classList.add('is-visible');
  });

  // Analytics drawer
  function renderAnalytics() {
    const log = loadLog();
    document.getElementById('statViews').textContent = String(log.views);
    document.getElementById('statSelects').textContent = String(log.selects);
    document.getElementById('statFakePurchases').textContent = String(log.fakePurchases);
    document.getElementById('statLeads').textContent = String(log.leads);

    const buyIntentRate = log.views > 0 ? ((log.fakePurchases / log.views) * 100).toFixed(1) : '0.0';
    const leadRate = log.fakePurchases > 0 ? ((log.leads / log.fakePurchases) * 100).toFixed(1) : '0.0';

    const flavorCounts = { assort: 0, carrot: 0, tomato: 0 };
    let totalCarrotOrdered = 0;
    let totalTomatoOrdered = 0;
    let pouch3dCount = 0;
    log.events.forEach((ev) => {
      if (ev.type === 'pouch_3d') pouch3dCount += 1;
      if (ev.type === 'fake_purchase') {
        if (flavorCounts[ev.flavor] !== undefined) flavorCounts[ev.flavor] += 1;
        totalCarrotOrdered += Number(ev.carrotQty || 0);
        totalTomatoOrdered += Number(ev.tomatoQty || 0);
      }
    });

    document.getElementById('analyticsBreakdown').textContent =
      `仮購入率 (Buy Intent / View): ${buyIntentRate}% ｜ 案内登録率 (Lead / Buy Intent): ${leadRate}% ｜ 3D操作: ${pouch3dCount}回 ｜ 注文構成: アソート(${flavorCounts.assort}) / キャロット単品(${flavorCounts.carrot}) / トマト単品(${flavorCounts.tomato}) ｜ 合計袋数: キャロット${totalCarrotOrdered}袋・トマト${totalTomatoOrdered}袋`;
  }

  document.addEventListener('yess:pouch-interact', (e) => {
    trackEvent('pouch_3d', { source: e.detail?.action || 'unknown' });
  });

  toggleAnalyticsBtn.addEventListener('click', () => {
    const isOpen = analyticsDrawer.classList.toggle('is-open');
    analyticsDrawer.setAttribute('aria-hidden', String(!isOpen));
    renderAnalytics();
  });

  exportCsvBtn.addEventListener('click', () => {
    const log = loadLog();
    const headers = ['timestamp', 'type', 'flavor', 'carrotQty', 'tomatoQty', 'totalBags', 'utm_source', 'utm_campaign', 'habit', 'reason'];
    const rows = log.events.map((ev) =>
      headers.map((h) => `"${String(ev[h] ?? '').replace(/"/g, '""')}"`).join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'yess-smoke-test-log.csv';
    link.click();
    URL.revokeObjectURL(url);
  });

  resetStatsBtn.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    renderAnalytics();
  });

  // Init
  updateSummary();
  trackEvent('view');
})();
