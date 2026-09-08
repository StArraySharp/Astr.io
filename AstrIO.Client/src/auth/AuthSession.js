/**
 * AuthSession — Discord 认证会话(原 `var bq = new function(){...}()`)。
 *
 * 行为:
 *  - init():处理回调 URL(?token=&auth_error=)——存 localStorage、弹窗模式
 *    下 window.close() 并直接返回;随后 replaceState 清掉查询串;读取
 *    astrio_auth_error("banned" → alert);读取 astrio_discord_token 并解码
 *    JWT payload(exp > now 视为有效,否则删除);updateUI;useLockedColor =
 *    localStorage("astrio_use_locked_color") !== "0"(缺失即默认 true);
 *    绑定 #login-discord/#discord-logout/#use-locked-color 事件。
 *  - login():500×700 居中弹窗打开 <authBase>/auth/discord;弹窗被拦截时
 *    记录 astrio_auth_return_to 后整页跳转;否则每 300ms 轮询弹窗关闭
 *    → _onPopupClosed()。怪癖:features 串中宽度是字面量 "width=500",
 *    高度/左/右用变量拼接。
 *  - _onPopupClosed():从 localStorage 重新收养 token/错误;成功登录且
 *    Keyboard/GameConnection 就绪时补发 sendToken()。
 *  - logout():fire-and-forget XHR POST <authBase>/auth/logout
 *    (Authorization: Bearer <token>,try/catch 吞错),清本地状态。
 *  - updateUI():切换 #discord-logged-out / #discord-logged-in /
 *    #discord-avatar(CDN 头像 …/avatars/<id>/<hash>.png?size=32)/
 *    #discord-username / #auth-status-note(未登录时按 authRequired 显示
 *    "Login with Discord to play" 或 "Login with Discord to skip verification")。
 *  - onServerAuthStatus(authRequired, flag2, banned):协议 175 号包
 *    (bit1/bit2/bit4 标志);banned 时 alert 并 logout。flag2 语义未知
 *    (原实现忽略)。
 *  - _decodePayload(token):JWT——split('.') 长度须为 3,payload 做
 *    base64url→base64 替换后 atob + JSON.parse;任何异常返回 null。
 *
 * 怪癖(依赖注入替代原 typeof 守卫):
 *  原实现因声明顺序问题,以 `typeof bZ !== "undefined"` /
 *  `typeof bX !== "undefined"` 守卫对 Keyboard(bZ)/GameConnection(bX)
 *  的调用;此处等价改为可选注入(this.keyboard / this.connection 的真值
 *  检查),未注入时行为与"尚未定义"一致。
 *
 * localStorage 键(无 astrio- Store 前缀风格,原样保留):
 *  astrio_discord_token / astrio_auth_error / astrio_auth_return_to /
 *  astrio_use_locked_color。
 */

export default class AuthSession {
  /**
   * @param {Object} systems
   * @param {Window} systems.view — 原 a6
   * @param {Document} systems.document — 原 a8
   * @param {Object} [systems.Keyboard] — 上行发送器(原 bZ:sendToken/useLockedColor)
   * @param {Object} [systems.GameConnection] — 连接状态(原 bX:connected)
   */
  constructor(systems) {
    this.view = systems.view;
    this.doc = systems.document;
    this.keyboard = systems.Keyboard;
    this.connection = systems.GameConnection;
    this.loggedIn = false;
    this.token = null;
    this.user = null;
    this.authRequired = false;
    this.useLockedColor = true;
    // 原实现:var c7 = a6.__ASTRIO_AUTH_URL || location.origin(裸 location 全局)。
    this.authBaseUrl = this.view.__ASTRIO_AUTH_URL || this.view.location.origin;
  }

  init() {
    const params = new URLSearchParams(this.view.location.search);
    const token = params.get('token');
    const authError = params.get('auth_error');
    if (token || authError) {
      if (token) {
        localStorage.setItem('astrio_discord_token', token);
      }
      if (authError === 'banned') {
        localStorage.setItem('astrio_auth_error', 'banned');
      }
      if (this.view.opener) {
        this.view.close();
        return;
      }
      params.delete('token');
      params.delete('auth_error');
      let path = this.view.location.pathname;
      if (params.toString()) {
        path += '?' + params.toString();
      }
      this.view.history.replaceState({}, '', path);
    }
    const storedError = localStorage.getItem('astrio_auth_error');
    if (storedError) {
      localStorage.removeItem('astrio_auth_error');
      if (storedError === 'banned') {
        alert('Your Discord account has been banned from this server.');
      }
    }
    const storedToken = localStorage.getItem('astrio_discord_token');
    if (storedToken) {
      const payload = this._decodePayload(storedToken);
      if (payload && payload.exp && payload.exp > Date.now() / 1000) {
        this.token = storedToken;
        this.loggedIn = true;
        this.user = {
          discordId: payload.discordId,
          username: payload.username,
          avatar: payload.avatar,
        };
      } else {
        localStorage.removeItem('astrio_discord_token');
      }
    }
    this.updateUI();
    const storedToggle = localStorage.getItem('astrio_use_locked_color');
    // 怪癖:与 "0" 比较——缺失(null)也视为 true,仅显式 "0" 关闭。
    this.useLockedColor = storedToggle !== '0';
    this.syncToggleUI();
    const self = this;
    const loginBtn = this.doc.getElementById('login-discord');
    if (loginBtn) {
      loginBtn.addEventListener('click', function () {
        self.login();
      });
    }
    const logoutBtn = this.doc.getElementById('discord-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        self.logout();
      });
    }
    const toggle = this.doc.getElementById('use-locked-color');
    if (toggle) {
      toggle.addEventListener('change', function () {
        self.setUseLockedColor(this.checked);
      });
    }
  }

  login() {
    const width = 500;
    const height = 700;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;
    // 怪癖:宽度为字面量 "width=500",其余为变量拼接(原样保留)。
    const popup = this.view.open(
      this.authBaseUrl + '/auth/discord',
      'astrio_discord_login',
      'width=500,height=' + height + ',left=' + left + ',top=' + top,
    );
    if (!popup) {
      localStorage.setItem('astrio_auth_return_to', this.view.location.href);
      this.view.location.href = this.authBaseUrl + '/auth/discord';
      return;
    }
    const self = this;
    const poll = setInterval(function () {
      if (!popup || popup.closed) {
        clearInterval(poll);
        self._onPopupClosed();
      }
    }, 300);
  }

  _onPopupClosed() {
    const storedToken = localStorage.getItem('astrio_discord_token');
    if (storedToken) {
      const payload = this._decodePayload(storedToken);
      if (payload && payload.exp && payload.exp > Date.now() / 1000) {
        this.token = storedToken;
        this.loggedIn = true;
        this.user = {
          discordId: payload.discordId,
          username: payload.username,
          avatar: payload.avatar,
        };
      }
    }
    const storedError = localStorage.getItem('astrio_auth_error');
    if (storedError) {
      localStorage.removeItem('astrio_auth_error');
      if (storedError === 'banned') {
        alert('Your Discord account has been banned from this server.');
      }
    }
    this.updateUI();
    // 原:typeof bZ !== "undefined" && typeof bX !== "undefined" && bX.connected
    if (this.loggedIn && this.keyboard && this.connection && this.connection.connected) {
      this.keyboard.sendToken();
    }
  }

  logout() {
    if (this.token) {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', this.authBaseUrl + '/auth/logout', true);
        xhr.setRequestHeader('Authorization', 'Bearer ' + this.token);
        xhr.send();
      } catch (e) {}
    }
    localStorage.removeItem('astrio_discord_token');
    this.loggedIn = false;
    this.token = null;
    this.user = null;
    this.updateUI();
  }

  getToken() {
    return this.token;
  }

  updateUI() {
    const loggedOutEl = this.doc.getElementById('discord-logged-out');
    const loggedInEl = this.doc.getElementById('discord-logged-in');
    const avatarEl = this.doc.getElementById('discord-avatar');
    const usernameEl = this.doc.getElementById('discord-username');
    const noteEl = this.doc.getElementById('auth-status-note');
    if (this.loggedIn && this.user) {
      if (loggedOutEl) {
        loggedOutEl.style.display = 'none';
      }
      if (loggedInEl) {
        loggedInEl.style.display = '';
      }
      if (usernameEl) {
        usernameEl.textContent = this.user.username;
      }
      if (avatarEl && this.user.avatar) {
        avatarEl.src =
          'https://cdn.discordapp.com/avatars/' + this.user.discordId + '/' + this.user.avatar + '.png?size=32';
        avatarEl.style.display = '';
      } else if (avatarEl) {
        avatarEl.style.display = 'none';
      }
      if (noteEl) {
        noteEl.style.display = 'none';
      }
    } else {
      if (loggedOutEl) {
        loggedOutEl.style.display = '';
      }
      if (loggedInEl) {
        loggedInEl.style.display = 'none';
      }
      if (noteEl) {
        if (this.authRequired) {
          noteEl.textContent = 'Login with Discord to play';
          noteEl.style.display = '';
        } else {
          noteEl.textContent = 'Login with Discord to skip verification';
          noteEl.style.display = '';
        }
      }
    }
  }

  /**
   * 协议 175 号包状态回执。
   * @param {boolean} authRequired bit1:登录后才能玩
   * @param {boolean} flag2 bit2:语义未知(原实现收到但未使用)
   * @param {boolean} banned bit4:封禁 → alert + logout
   */
  onServerAuthStatus(authRequired, flag2, banned) {
    this.authRequired = authRequired;
    if (banned) {
      alert('Your Discord account has been banned.');
      this.logout();
      return;
    }
    this.updateUI();
  }

  syncToggleUI() {
    const toggle = this.doc.getElementById('use-locked-color');
    if (toggle) {
      toggle.checked = this.useLockedColor;
    }
  }

  setUseLockedColor(flag) {
    this.useLockedColor = !!flag;
    localStorage.setItem('astrio_use_locked_color', flag ? '1' : '0');
    this.syncToggleUI();
    // 原:typeof bZ !== "undefined" 守卫。
    if (this.keyboard) {
      this.keyboard.useLockedColor(this.useLockedColor);
    }
  }

  /** JWT payload 解码(base64url,不做签名校验);异常返回 null。 */
  _decodePayload(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(b64));
    } catch (e) {
      return null;
    }
  }
}
