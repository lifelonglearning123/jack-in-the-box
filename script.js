/* Jack in the Box — small interactions
   - reveal-on-scroll
   - number count-up for big stats
   - subtle nav shadow on scroll
*/

(() => {
  'use strict';

  /* ---------- reveal on scroll ---------- */
  const revealTargets = document.querySelectorAll(
    'section h2, .pillar, .prog-card, .detail-card, .ai__chips li, .clients__roster li, .who__card, .challenge__list li, .hero__stamps'
  );
  revealTargets.forEach(el => el.classList.add('reveal'));

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

  revealTargets.forEach(el => io.observe(el));

  /* ---------- big number count-up ---------- */
  const countTargets = document.querySelectorAll('[data-count-target]');
  const countObs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const wrap = entry.target;
      const numEl = wrap.querySelector('.big-stat__num');
      const suffixEl = numEl.querySelector('.big-stat__suffix');
      const target = parseInt(wrap.dataset.countTarget, 10);
      const suffix = wrap.dataset.countSuffix || '';
      let start = null;
      const duration = 1500;

      function tick(ts) {
        if (!start) start = ts;
        const p = Math.min((ts - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        const v = Math.round(target * eased);
        numEl.firstChild.nodeValue = String(v);
        if (p < 1) requestAnimationFrame(tick);
        else numEl.firstChild.nodeValue = String(target);
      }

      // ensure suffix span is preserved
      numEl.firstChild.nodeValue = '0';
      requestAnimationFrame(tick);

      countObs.unobserve(wrap);
    });
  }, { threshold: 0.4 });
  countTargets.forEach(el => countObs.observe(el));

  /* ---------- nav shadow when scrolled ---------- */
  const nav = document.querySelector('.nav');
  const onScroll = () => {
    if (window.scrollY > 20) nav.classList.add('is-scrolled');
    else nav.classList.remove('is-scrolled');
  };
  document.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- contact form → /api/contact (GHL) ---------- */
  const form = document.getElementById('contact-form');
  if (form) {
    const btn = form.querySelector('#contact-submit');
    const addr = btn.querySelector('.email-btn__addr');
    const status = form.querySelector('#contact-status');

    const setState = (state, message) => {
      status.classList.remove('is-error', 'is-success');
      if (state === 'error') status.classList.add('is-error');
      if (state === 'success') status.classList.add('is-success');
      status.textContent = message || '';
    };

    const setBtnText = (which) => {
      const txt = addr.dataset[which] || addr.dataset.default;
      addr.textContent = txt;
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      setState('', '');

      // simple required-field validation
      const required = form.querySelectorAll('[required]');
      let firstInvalid = null;
      required.forEach(el => {
        const field = el.closest('.ghl-form__field');
        if (!el.value.trim() || (el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value))) {
          field?.classList.add('is-error');
          if (!firstInvalid) firstInvalid = el;
        } else {
          field?.classList.remove('is-error');
        }
      });
      if (firstInvalid) {
        firstInvalid.focus();
        setState('error', 'Please check the highlighted fields.');
        return;
      }

      const data = Object.fromEntries(new FormData(form).entries());

      btn.disabled = true;
      setBtnText('loading');

      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const json = await res.json().catch(() => ({}));

        if (!res.ok || !json.ok) {
          throw new Error(json.error || 'Something went wrong — please try again.');
        }

        form.classList.add('is-sent');
        setBtnText('done');
        setState(
          'success',
          json.duplicate
            ? "You're already on our list — Ian will follow up shortly."
            : "Thanks! Your enquiry is with Ian — expect a reply within one working day."
        );
      } catch (err) {
        btn.disabled = false;
        setBtnText('default');
        setState('error', err.message || 'Could not send right now. Please email ijcass63@gmail.com.');
      }
    });

    // clear field error state as the user types
    form.addEventListener('input', (e) => {
      const field = e.target.closest('.ghl-form__field');
      if (field) field.classList.remove('is-error');
    });
  }
})();
