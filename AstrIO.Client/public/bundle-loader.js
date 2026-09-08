// bundle-loader.js — 替换原混淆 bundle.js 的经典脚本。
// 注入 ESM 入口(61 个原生 ES 模块,无需构建;裸说明符由服务器改写为绝对路径)。
// 入口带时间戳参数,确保任何浏览器缓存策略下都拿到最新 index.js
//(子模块均为相对路径 + 服务器 no-store,不受缓存影响)。
(function () {
  var mod = document.createElement('script');
  mod.type = 'module';
  mod.src = '/src/index.js?v=' + Date.now();
  document.currentScript.parentNode.appendChild(mod);
})();
