// ESM 包装:页面 vendor.js 已提供全局 jQuery(经典脚本先于模块执行)
export default (typeof window !== 'undefined' && window.jQuery) || window.$;
