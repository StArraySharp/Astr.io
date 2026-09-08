/**
 * FacebookAuth — Facebook 登录(原 `bo` 单例)。
 *
 * 行为:
 *  - init():恢复 localStorage 持久化的 fbToken(未过期则标记已登录、
 *    点亮 #login-facebook、上行 token、弹通知;过期则清除);
 *    初始化 FB SDK(appId 677505792353827,v2.0);
 *    绑定 #login-facebook / #logout 点击。
 *  - login():FB.login(scope "public_profile, email") → afterLogin。
 *  - afterLogin(resp):有 authResponse 时存 {token, expiry: now+expiresIn*1000}
 *    到 Store("extras"/"fbToken"),标记登录并上行 token;否则报错。
 *  - logout():FB.logout 回调有 authResponse 时清除本地状态与存储。
 *
 * 怪癖(与原实现对齐):
 *  - 上行调用 Keyboard.fbToken():原 bundle 中 bZ 并没有该方法
 *    (全 bundle 无定义、无动态赋值),运行到此会抛 TypeError 并中断
 *    init() 后续流程(点击绑定不执行)。此处原样保留该调用。
 *  - 过期清理仅在「存储值存在但已过期」时写入 false(布尔,非删除)。
 *  - 原实现的 `if (a6.FB) ... else {}` 空 else 为混淆器噪声,略去。
 */

export default class FacebookAuth {
  /**
   * @param {Object} systems
   * @param {Object} systems.Store — get/set("extras", "fbToken")(原 af)
   * @param {Object} systems.Keyboard — fbToken()(原 bZ;原 bundle 未定义该方法,见上)
   * @param {Object} systems.Chat — alert(title, text)(原 bm)
   * @param {Object} systems.I18n — current.notif.*(原 ah)
   * @param {Window} systems.view — 原 a6(FB 全局)
   * @param {Function} systems.jQuery — 原 a7($)
   */
  constructor(systems) {
    this.store = systems.Store;
    this.keyboard = systems.Keyboard;
    this.chat = systems.Chat;
    this.i18n = systems.I18n;
    this.view = systems.view;
    this.jQuery = systems.jQuery;
  }

  init() {
    this.loggedIn = false;
    this.token = null;
    const saved = this.store.get('extras', 'fbToken');
    if (saved) {
      if (saved.expiry > Date.now()) {
        this.token = saved.token;
        this.loggedIn = true;
        this.jQuery('#login-facebook').addClass('active');
        // 注意:原 bundle 的 bZ 上不存在 fbToken 方法,此调用会抛错(原样保留)。
        this.keyboard.fbToken();
        this.chat.alert('Facebook', this.i18n.current.notif.login_lastSession);
      } else {
        this.store.set('extras', 'fbToken', false);
      }
    }
    if (this.view.FB) {
      this.view.FB.init({
        appId: 677505792353827,
        cookie: true,
        xfbml: true,
        status: true,
        version: 'v2.0',
      });
    }
    this.jQuery('#login-facebook').click(() => {
      if (!this.loggedIn) {
        this.login();
      } else {
        this.chat.alert('Facebook', this.i18n.current.notif.alreadyLoggedIn);
      }
    });
    this.jQuery('#logout').click(() => {
      this.logout();
    });
  }

  login() {
    if (this.view.FB) {
      this.view.FB.login(response => {
        this.afterLogin(response);
      }, { scope: 'public_profile, email' });
    }
  }

  afterLogin(response) {
    if (response.authResponse) {
      this.token = response.authResponse.accessToken;
      this.store.set('extras', 'fbToken', {
        token: this.token,
        expiry: Date.now() + response.authResponse.expiresIn * 1000,
      });
      this.loggedIn = true;
      this.jQuery('#login-facebook').addClass('active');
      // 同上:原 bundle 中 bZ 无此方法,调用会抛错(原样保留)。
      this.keyboard.fbToken();
      this.chat.alert('Facebook', this.i18n.current.notif.login_success);
    } else {
      this.chat.alert('Facebook', this.i18n.current.notif.login_error);
    }
  }

  logout() {
    if (!this.loggedIn) {
      return;
    }
    this.view.FB.logout(response => {
      if (!response.authResponse) {
        return;
      }
      this.loggedIn = false;
      this.token = null;
      this.jQuery('#login-facebook').removeClass('active');
      this.chat.alert('Facebook', this.i18n.current.notif.logout);
      this.store.set('extras', 'fbToken', false);
    });
  }
}
