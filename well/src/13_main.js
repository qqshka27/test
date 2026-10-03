// ===== Точка входа =====

(function start() {
  const go = () => {
    const hot = window.claude && window.claude.hot;
    if (hot && hot.ready) hot.ready(boot);
    else boot((hot && hot.data) || {});
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
  else go();
})();
