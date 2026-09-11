/**
 * GoogleAuth — Google 登录(原 `bp` 单例,gapi.auth2 / Google+)。
 *
 * 行为:
 *  - init():恢复 localStorage 持久化的 googleToken(未过期则标记已登录、
 *    点亮 #login-google、上行 token、弹通知;过期则清除);
 *    加载 gapi "auth2" 模块并以 client_id
 *    686981379285-oroivr8u2ag1dtm3ntcs6vi05i3cpv0j.apps.googleusercontent.com
 *    (cookiepolicy "single_host_origin")初始化,把点击处理挂到
 *    #login-google 元素;绑定 #logout 点击。
 *  - afterLogin(googleUser):getAuthResponse(true).access_token 存
 *    {token, expiry: expires_at} 到 Store("extras"/"googleToken");
 *    标记登录并上行 token;无 token 则报错。
 *  - logout():gapi.auth2.getAuthInstance().signOut(),清本地状态与存储。
 *
 * 怪癖(与原实现对齐):
 *  - 上行调用 Keyboard.googleToken():原 bundle 中 bZ 并没有该方法
 *    (全 bundle 无定义、无动态赋值),运行到此会抛 TypeError 并中断
 *    init() 后续流程(gapi 初始化、点击绑定不执行)。原样保留。
 *  - attachClickHandler 失败回调仅 console.log。
 *  - init() 开头的 {QEuLT/vFDIf/BBwbO} 局部常量对象为混淆器噪声,略去。
 */

export default class GoogleAuth {
  /**
   * @param {Object} systems
   * @param {Object} systems.Store — get/set("extras", "googleToken")(原 af)
   * @param {Object} systems.Keyboard — googleToken()(原 bZ;原 bundle 未定义该方法,见上)
   * @param {Object} systems.Chat — alert(title, text)(原 bm)
   * @param {Object} systems.I18n — current.notif.*(原 ah)
   * @param {Window} systems.view — 原 a6(gapi 全局)
   * @param {Document} systems.document — 原 a8
   * @param {Function} systems.jQuery — 原 a7($)
   */
  constructor(systems) {
    this.store = systems.Store;
    this.keyboard = systems.Keyboard;
    this.chat = systems.Chat;
    this.i18n = systems.I18n;
    this.view = systems.view;
    this.document = systems.document;
    this.jQuery = systems.jQuery;
  }

  init() {
    this.loggedIn = false;
    this.token = null;
    const saved = this.store.get('extras', 'googleToken');
    if (saved) {
      if (saved.expiry > Date.now()) {
        this.token = saved.token;
        this.loggedIn = true;
        this.jQuery('#login-google').addClass('active');
        // 注意:原 bundle 的 bZ 上不存在 googleToken 方法,此调用会抛错(原样保留)。
        this.keyboard.googleToken();
        this.chat.alert('Google+', this.i18n.current.notif.login_lastSession);
      } else {
        this.store.set('extras', 'googleToken', false);
      }
    }
    if (this.view.gapi) {
      this.view.gapi.load('auth2', () => {
        const auth2 = this.view.gapi.auth2.init({
          client_id: '686981379285-oroivr8u2ag1dtm3ntcs6vi05i3cpv0j.apps.googleusercontent.com',
          cookiepolicy: 'single_host_origin',
        });
        const button = this.document.getElementById('login-google');
        auth2.attachClickHandler(
          button,
          {},
          googleUser => {
            this.afterLogin(googleUser);
          },
          error => {
            console.log(error);
          }
        );
      });
    }
    this.jQuery('#logout').click(() => {
      this.logout();
    });
  }

  afterLogin(googleUser) {
    const authResponse = googleUser.getAuthResponse(true);
    const accessToken = authResponse.access_token;
    if (accessToken) {
      this.token = accessToken;
      this.store.set('extras', 'googleToken', {
        token: this.token,
        expiry: authResponse.expires_at,
      });
      this.loggedIn = true;
      this.jQuery('#login-google').addClass('active');
      // 同上:原 bundle 中 bZ 无此方法,调用会抛错(原样保留)。
      this.keyboard.googleToken();
      this.chat.alert('Google+', this.i18n.current.notif.login_success);
    } else {
      this.chat.alert('Google+', this.i18n.current.notif.login_error);
    }
  }

  logout() {
    if (!this.loggedIn) {
      return;
    }
    const authInstance = this.view.gapi.auth2.getAuthInstance();
    authInstance.signOut();
    this.loggedIn = false;
    this.token = null;
    this.jQuery('#login-google').removeClass('active');
    this.chat.alert('Google+', this.i18n.current.notif.logout);
    this.store.set('extras', 'googleToken', false);
  }
}
