(function () {
  'use strict';

  const topbar = document.querySelector('.topbar');
  const sidebar = document.querySelector('.side');
  const main = document.querySelector('.main');
  if (!topbar || !sidebar || !main) return;

  const menuButton = document.createElement('button');
  menuButton.type = 'button';
  menuButton.className = 'wb-menu-toggle';
  menuButton.setAttribute('aria-label', '打开目录');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.textContent = '☰';
  topbar.insertBefore(menuButton, topbar.firstChild);

  const shade = document.createElement('div');
  shade.className = 'wb-side-shade';
  shade.setAttribute('aria-hidden', 'true');
  document.body.appendChild(shade);

  function closeSidebar() {
    document.body.classList.remove('wb-side-open');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', '打开目录');
  }

  menuButton.addEventListener('click', function () {
    const isOpen = document.body.classList.toggle('wb-side-open');
    menuButton.setAttribute('aria-expanded', String(isOpen));
    menuButton.setAttribute('aria-label', isOpen ? '关闭目录' : '打开目录');
  });
  shade.addEventListener('click', closeSidebar);

  sidebar.addEventListener('click', function (event) {
    const link = event.target.closest('a');
    if (!link) return;
    sidebar.querySelectorAll('a.wb-active').forEach(function (item) {
      item.classList.remove('wb-active');
    });
    link.classList.add('wb-active');
    if (window.matchMedia('(max-width: 980px)').matches) closeSidebar();
  });

  function syncTopbarHeight() {
    document.documentElement.style.setProperty('--wb-topbar-height', topbar.offsetHeight + 'px');
  }
  syncTopbarHeight();
  window.addEventListener('resize', syncTopbarHeight, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(syncTopbarHeight).observe(topbar);

  const originalGoStage = window.goStage;
  if (typeof originalGoStage === 'function') {
    window.goStage = function () {
      const result = originalGoStage.apply(this, arguments);
      closeSidebar();
      main.classList.remove('stage-enter');
      void main.offsetWidth;
      main.classList.add('stage-enter');
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return result;
    };
  }
})();
