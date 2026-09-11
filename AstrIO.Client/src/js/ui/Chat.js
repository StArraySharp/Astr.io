/**
 * Chat — 聊天室 / 通知 / 表情包 / 公告横幅(原 `bm` 单例)。
 *
 * 行为(与原实现对齐):
 *  - init():缓存 #notifications、#chatroom,注册表情包表(/resources/emojis/),
 *    渲染 #emojiContainer,并在 #chatroom 上挂右键静音菜单(#chat-ctx-menu)。
 *  - normal/command/alert/system:四种消息行,受 SettingsPanel.chat/sounds 控制。
 *  - banner():#announcement-banner,10ms 后 visible,8s 后淡出移除。
 *  - warmupCountdown():#warmup-banner,250ms 轮询倒计时,归零显示 "GO!"。
 *  - serverTimer():#private-server-timer 插入 #time 首位,1s 轮询,归零 "Ended"。
 *  - putEmojis()/putMentions():消息富文本替换。
 *
 * 已知怪癖(保持原样):
 *  - 表情表 ":23:" 键被赋值 4 次(应为 :23:/:24:/:25:),后者覆盖前者,
 *    实际只剩 23 个键,":23:" → wink.png。
 *  - alert() 播放的是 chat.mp3 而非 bellalert.mp3。
 *  - @提及检测用未转义的原始消息文本构造 RegExp。
 *  - putEmojis() 把表情代码直接 new RegExp(code, "g")(代码含 ":" 无特殊字符,安全)。
 */

export default class Chat {
  /**
   * @param {object} systems 依赖集合(重写名):
   *   $ — jQuery
   *   xssFilters — XSS 过滤库(需 inHTMLData),页面全局
   *   SettingsPanel(ui/SettingsPanel,bc)— .chat / .sounds 设置
   *   Sfx(audio/Sfx,bn)— .chat 提示音
   *   ChatService(net/ChatService,c1)— mutedIds / mute() / unmute()
   *   ChatHud(ui/ChatHud,bv)— .input(#message 聚焦)
   *   MenuForm(ui/MenuForm,bF)— .nick(@提及高亮)
   */
  constructor(systems) {
    this.systems = systems;
  }

  init() {
    const $ = this.systems.$;
    this.div = $('#notifications');
    this.iconChat = '<i class="fas fa-comment"></i>';
    this.iconAlert = '<i class="fas fa-exclamation-circle"></i>';
    this.iconBell = '<i class="fas fa-bell"></i>';
    this.chatroomdiv = $('#chatroom');
    this.emojiPath = '/resources/emojis/';
    // 怪癖:后三个键均为 ":23:"(原文如此),后者覆盖前者,最终 ":23:" → wink.png。
    this.emojis = {
      ':01:': 'angry.png',
      ':02:': 'angry-1.png',
      ':03:': 'cool.png',
      ':04:': 'crying.png',
      ':05:': 'crying-1.png',
      ':06:': 'embarrassed.png',
      ':07:': 'happy.png',
      ':08:': 'happy-1.png',
      ':09:': 'happy-2.png',
      ':10:': 'in-love.png',
      ':11:': 'kiss.png',
      ':12:': 'laughing.png',
      ':13:': 'laughing-1.png',
      ':14:': 'poo.png',
      ':15:': 'sad.png',
      ':16:': 'sad-1.png',
      ':17:': 'shocked.png',
      ':18:': 'shocked-1.png',
      ':19:': 'sick.png',
      ':20:': 'sleeping.png',
      ':21:': 'thinking.png',
      ':22:': 'tongue.png',
      ':23:': 'tongue-1.png',
      ':23:': 'vomit.png',
      ':23:': 'wink.png',
    };
    this.displayEmojis();
    this._initChatContextMenu();
  }

  _initChatContextMenu() {
    const $ = this.systems.$;
    const ChatService = this.systems.ChatService;
    const menu = $('<div id="chat-ctx-menu" style="display:none;position:fixed;z-index:9999;background:#1a1a2e;border:1px solid #444;border-radius:6px;padding:4px 0;min-width:130px;box-shadow:0 4px 12px rgba(0,0,0,.5)"></div>');
    $('body').append(menu);
    $(document).on('mousedown', ev => {
      if (!$(ev.target).closest('#chat-ctx-menu').length) {
        menu.hide();
      }
    });
    this.chatroomdiv.on('contextmenu', '.chatroom-nick-clickable', ev => {
      ev.preventDefault();
      const row = $(ev.currentTarget).closest('.chatroom-row');
      const playerId = parseInt(row.attr('data-player-id'), 10);
      const playerNick = row.attr('data-player-nick') || '?';
      if (!playerId) {
        return;
      }
      const isMuted = ChatService.mutedIds.has(playerId);
      const label = isMuted ? 'Unmute ' + playerNick : 'Mute ' + playerNick;
      menu.empty().append($('<div style="padding:6px 14px;cursor:pointer;color:' + (isMuted ? '#7fff7f' : '#ff6b6b') + ';font-size:13px">' + label + '</div>')
        .on('mouseenter', function () {
          $(this).css('background', 'rgba(255,255,255,.07)');
        })
        .on('mouseleave', function () {
          $(this).css('background', '');
        })
        .on('mousedown', () => {
          if (isMuted) {
            ChatService.unmute(playerId);
          } else {
            ChatService.mute(playerId);
          }
          menu.hide();
        }));
      menu.css({ left: ev.clientX, top: ev.clientY }).show();
    });
  }

  displayEmojis() {
    const $ = this.systems.$;
    const container = $('#emojiContainer');
    for (const code in this.emojis) {
      const img = $('<img src="' + this.emojiPath + this.emojis[code] + '" class="emojiPreview">');
      img.click(() => {
        const input = $('#message');
        const current = input.val();
        input.val(current + ' ' + code);
        this.systems.ChatHud.input.focus();
      });
      container.append(img);
    }
  }

  /**
   * 普通聊天行。
   * @param {string} nick 昵称
   * @param {string} message 消息
   * @param {number} isGlobal 1 时加 [G] 前缀
   * @param {string|null} tag 战队 tag([tag] 前缀)
   * @param {string|null} color 昵称颜色(rgb()/rainbow/rainbow-gradient)
   * @param {boolean} crowned 皇冠
   * @param {number|null} playerId 玩家 id(可右键静音)
   */
  normal(nick, message, isGlobal, tag, color, crowned, playerId) {
    if (this.systems.SettingsPanel.chat === 'off') {
      return;
    }
    const globalPrefix = isGlobal === 1 ? '<span class="chat-global">[G]</span> ' : '';
    const tagPrefix = tag ? '<span class="chat-tag">[' + this.systems.xssFilters.inHTMLData(tag) + ']</span> ' : '';
    this.chatroom(nick, message, this.iconChat, globalPrefix + tagPrefix, color, crowned, playerId);
  }

  /** 指令/命令行(与 normal 同参,带提示音 + 感叹图标)。 */
  command(nick, message, isGlobal, tag, color, crowned, playerId) {
    if (this.systems.SettingsPanel.chat === 'off') {
      return;
    }
    if (this.systems.SettingsPanel.sounds === 'on') {
      this.systems.Sfx.chat.play();
    }
    const globalPrefix = isGlobal === 1 ? '<span class="chat-global">[G]</span> ' : '';
    const tagPrefix = tag ? '<span class="chat-tag">[' + this.systems.xssFilters.inHTMLData(tag) + ']</span> ' : '';
    this.chatroom(nick, message, this.iconAlert, globalPrefix + tagPrefix, color, crowned, playerId);
  }

  /** 通知行(铃铛图标)。怪癖:播放 chat.mp3 而非 bellalert.mp3。 */
  alert(nick, message) {
    if (this.systems.SettingsPanel.chat === 'off') {
      return;
    }
    if (this.systems.SettingsPanel.sounds === 'on') {
      this.systems.Sfx.chat.play();
    }
    this.chatroom(nick, message, this.iconBell);
  }

  /** 系统行(fa-bullhorn,固定 "System" 昵称)。 */
  system(message) {
    const now = new Date();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const time = now.getHours() + ':' + minutes;
    if (this.systems.SettingsPanel.sounds === 'on') {
      this.systems.Sfx.chat.play();
    }
    this.chatroomdiv.append('<div class="chatroom-row chatroom-system"><span class="chattime">' + time + '</span> <i class="fas fa-bullhorn"></i> <span class="nick system-nick">System</span> <span class="message">' + this.putEmojis(this.systems.xssFilters.inHTMLData(message)) + '</span></div>');
    this.chatroomdiv.scrollTop(this.chatroomdiv[0].scrollHeight);
  }

  /** 公告横幅:#announcement-banner,10ms 后 visible,8s 后淡出(500ms)移除。 */
  banner(text) {
    const existing = document.getElementById('announcement-banner');
    if (existing) {
      existing.remove();
    }
    const bannerEl = document.createElement('div');
    bannerEl.id = 'announcement-banner';
    bannerEl.innerHTML = '<i class="fas fa-bullhorn"></i> <span>' + this.systems.xssFilters.inHTMLData(text) + '</span>';
    document.body.appendChild(bannerEl);
    setTimeout(function () {
      bannerEl.classList.add('visible');
    }, 10);
    setTimeout(function () {
      bannerEl.classList.remove('visible');
      setTimeout(function () {
        bannerEl.remove();
      }, 500);
    }, 8000);
  }

  /** 热身倒计时:#warmup-banner,250ms 轮询;seconds<=0 仅清理;归零后 "GO!"。 */
  warmupCountdown(seconds) {
    if (this._warmupInterval) {
      clearInterval(this._warmupInterval);
    }
    const existing = document.getElementById('warmup-banner');
    if (existing) {
      existing.remove();
    }
    if (seconds <= 0) {
      return;
    }
    const endTime = Date.now() + seconds * 1000;
    const bannerEl = document.createElement('div');
    bannerEl.id = 'warmup-banner';
    bannerEl.innerHTML = '<i class="fas fa-hourglass-half"></i> <span>Warmup: ' + seconds + 's</span>';
    document.body.appendChild(bannerEl);
    setTimeout(function () {
      bannerEl.classList.add('visible');
    }, 10);
    this._warmupInterval = setInterval(function () {
      const remaining = Math.ceil((endTime - Date.now()) / 1000);
      if (remaining <= 0) {
        clearInterval(this._warmupInterval);
        bannerEl.querySelector('span').textContent = 'GO!';
        bannerEl.classList.add('warmup-go');
        setTimeout(function () {
          bannerEl.classList.remove('visible');
          setTimeout(function () {
            bannerEl.remove();
          }, 500);
        }, 2000);
        return;
      }
      bannerEl.querySelector('span').textContent = 'Warmup: ' + remaining + 's';
    }.bind(this), 250);
  }

  /** 私服计时:#private-server-timer span 插入 #time 首位(无则 body),1s 轮询。 */
  serverTimer(seconds) {
    if (this._serverTimerInterval) {
      clearInterval(this._serverTimerInterval);
    }
    const existing = document.getElementById('private-server-timer');
    if (existing) {
      existing.remove();
    }
    if (seconds <= 0) {
      return;
    }
    const endTime = Date.now() + seconds * 1000;
    const timerEl = document.createElement('span');
    timerEl.id = 'private-server-timer';
    timerEl.textContent = this._formatTimer(seconds) + '  ';
    const timeEl = document.getElementById('time');
    if (timeEl) {
      timeEl.insertBefore(timerEl, timeEl.firstChild);
    } else {
      document.body.appendChild(timerEl);
    }
    this._serverTimerInterval = setInterval(function () {
      const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      timerEl.textContent = (remaining > 0 ? this._formatTimer(remaining) : 'Ended') + '  ';
      if (remaining <= 0) {
        clearInterval(this._serverTimerInterval);
      }
    }.bind(this), 1000);
  }

  _formatTimer(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = seconds % 60;
    if (h > 0) {
      return h + 'h ' + m + 'm';
    }
    if (m > 0) {
      return m + 'm ' + (s < 10 ? '0' : '') + s + 's';
    }
    return s + 's';
  }

  /** 把 :NN: 表情代码替换为 <img>(代码无正则特殊字符,直接拼 RegExp 安全)。 */
  putEmojis(text) {
    for (const code in this.emojis) {
      const pattern = new RegExp(code, 'g');
      text = text.replace(pattern, '<img src="' + (this.emojiPath + this.emojis[code]) + '">');
    }
    return text;
  }

  /** 把 @mention 替换为高亮 span;指向自己的昵称加 chat-mention-me(大小写不敏感)。 */
  putMentions(text) {
    const myNick = this.systems.MenuForm && this.systems.MenuForm.nick ? this.systems.xssFilters.inHTMLData(this.systems.MenuForm.nick) : null;
    return text.replace(/@(\S+)/g, (whole, name) => {
      const isMe = myNick && name.toLowerCase() === myNick.toLowerCase();
      return '<span class="chat-mention' + (isMe ? ' chat-mention-me' : '') + '">@' + name + '</span>';
    });
  }

  /**
   * 聊天行底层渲染(append 到 #chatroom 并滚到底)。
   * @param {string} nick 昵称(内部做 XSS 转义)
   * @param {string} message 消息(内部做 XSS 转义 + 表情/提及)
   * @param {string} icon 图标 HTML
   * @param {string} [prefixHTML] 行首前缀([G]/[tag])
   * @param {string|null} color 合法颜色才应用(/^(rgb\(...)|rainbow|rainbow-gradient)$/)
   * @param {boolean} crowned 皇冠 SVG
   * @param {number|null} playerId 写入 data-player-id/-nick(右键静音用)
   */
  chatroom(nick, message, icon, prefixHTML, color, crowned, playerId) {
    const xss = this.systems.xssFilters;
    const now = new Date();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const time = now.getHours() + ':' + minutes;
    const escapedNick = xss.inHTMLData(nick);
    const crown = crowned ? '<svg class="chat-crown" viewBox="0 0 24 24" width="12" height="12" fill="#FFD700"><path d="M2 19l2-10 5 5 3-8 3 8 5-5 2 10z"/></svg> ' : '';
    let nickHTML;
    const clickableClass = playerId ? ' chatroom-nick-clickable' : '';
    const validColor = /^(rgb\(\d{1,3},\d{1,3},\d{1,3}\)|rainbow|rainbow-gradient)$/.test(color) ? color : '';
    if (validColor === 'rainbow-gradient') {
      nickHTML = '<span class="nick lb-rainbow-gradient' + clickableClass + '">' + crown + escapedNick + '</span>';
    } else if (validColor) {
      nickHTML = '<span class="nick' + clickableClass + '" style="color:' + validColor + '">' + crown + escapedNick + '</span>';
    } else {
      nickHTML = '<span class="nick' + clickableClass + '">' + crown + escapedNick + '</span>';
    }
    const messageHTML = this.putMentions(this.putEmojis(xss.inHTMLData(message)));
    const myNick = this.systems.MenuForm && this.systems.MenuForm.nick ? xss.inHTMLData(this.systems.MenuForm.nick) : null;
    // 怪癖:提及检测对未转义的原始 message 做 RegExp 测试(转义后的 myNick 做源)。
    const mentioned = myNick && new RegExp('@' + myNick.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(message);
    const dataAttrs = playerId ? ' data-player-id="' + playerId + '" data-player-nick="' + escapedNick + '"' : '';
    const mentionedClass = mentioned ? ' chatroom-mentioned' : '';
    this.chatroomdiv.append('<div class="chatroom-row' + mentionedClass + '"' + dataAttrs + '>' + (prefixHTML || '') + '<span class="chattime">' + time + '</span> ' + icon + ' ' + nickHTML + ' <span class="message">' + messageHTML + '</span></div>');
    this.chatroomdiv.scrollTop(this.chatroomdiv[0].scrollHeight);
  }
}
