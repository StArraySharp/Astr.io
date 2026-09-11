// main.js — 客户端入口加载器。
// 注入 ESM 入口（纯 ES 模块,无需构建）;带时间戳参数防缓存。
(function () {
  var mod = document.createElement('script');
  mod.type = 'module';
  mod.src = '/js/index.js?v=' + Date.now();
  document.currentScript.parentNode.appendChild(mod);
})();
