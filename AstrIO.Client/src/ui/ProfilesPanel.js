/**
 * ProfilesPanel — 皮肤档案选择 UI(原 `be`)。
 *
 * 行为:
 *  - 8 个档案槽(Store "profiles" 桶:selected / tag / pin / profile1..8),
 *    #profile-left / #profile-right 循环切换:左 = ((selected+6)%8)+1,右 = (selected%8)+1。
 *  - #nick / #tag 输入框禁止键入 "."(keyCode 190);blur 时清洗并保存:
 *    nick 去 ./[/] 截 15 字,tag/pin 去 零宽空格/[/] 截 5 字。
 *  - 皮肤 URL 校验(skinCheck):空串或 https:// 开头,非法时回填 MenuForm 当前值。
 *  - 游戏中(isAlive)修改 nick/tag/pin 会被拒绝并回填。
 *  - 预览:#skin1-preview / #skin2-preview 以 background:url(...) 展示。
 */

const DEFAULT_SKIN = 'https://i.imgur.com/SDtpV5t.png';
const DEFAULT_SKIN2 = 'https://i.imgur.com/7HJDsCA.png';

export default class ProfilesPanel {
  /**
   * @param {object} systems
   * @param {import('jquery')} systems.$ jQuery(原 a7)
   * @param {{ get(name: string, key: string): *, set(name: string, key: string, value: *): void }} systems.Store
   *   持久化(原 af)
   * @param {{ current: { notif: { nickChangeInGame: string } } }} systems.I18n
   *   语言系统(原 ah,游戏中改名提示文案)
   * @param {{ nick: string, skin: string, skin2: string, tag: string, pin: string, isAlive: boolean }} systems.MenuForm
   *   菜单表单(原 bF,玩家资料真值来源)
   * @param {{ spectator(flag: boolean): void }} systems.PartySync
   *   战队同步(原 c3,tag 变更后通知)
   * @param {{ alert(text: string, notifText?: string): void }} systems.Chat
   *   聊天/通知(原 bm,alert 提示)
   */
  constructor(systems) {
    this.$ = systems.$;
    this.store = systems.Store;
    this.i18n = systems.I18n;
    this.menuForm = systems.MenuForm;
    this.partySync = systems.PartySync;
    this.chat = systems.Chat;
    this.selected = 1;
    this.tag = '';
    this.pin = '';
    this.profile = null;
  }

  init() {
    this.selected = ~~this.store.get('profiles', 'selected') || 1;
    this.tag = this.store.get('profiles', 'tag') || '';
    this.pin = this.store.get('profiles', 'pin') || '';
    this.profile = this.store.get('profiles', 'profile' + this.selected);
    this.stripLegacyDots();
    this.profileSelect();
    this.setDomValues();
    this.addEvents();
  }

  /** 从 Store 重读 tag/pin/档案并刷新 DOM(导入设置后调用)。 */
  reinitializateData() {
    this.tag = this.store.get('profiles', 'tag') || '';
    this.pin = this.store.get('profiles', 'pin') || '';
    this.profile = this.store.get('profiles', 'profile' + this.selected);
    this.stripLegacyDots();
    this.setDomValues();
  }

  /**
   * 旧档迁移:去掉 nick 与 tag 中的 "."(历史版本允许输入点号)。
   * 怪癖:replace 只替换第一处;第二段直接写 this.profile.tag,
   * 若档案缺失(this.profile 为 false)会抛 TypeError,且该修改不落盘 —— 均保持原样。
   */
  stripLegacyDots() {
    if (this.profile) {
      if (this.profile.nick.includes('.')) {
        this.profile.nick = this.profile.nick.replace('.', '');
        this.store.set('profiles', 'profile' + this.selected, this.profile);
      }
    }
    if (this.tag.includes('.')) {
      this.profile.tag = this.tag.replace('.', '');
    }
  }

  /** 绑定左右切换按钮与 #nick/#tag 的 "." 屏蔽(方法名沿用原实现)。 */
  profileSelect() {
    this.$('#profile-left').on('click', () => {
      const prev = (this.selected + 6) % 8 + 1;
      this.switch(prev);
      this.updatePreviewSkin1(prev);
      this.updatePreviewSkin2(prev);
    });
    this.$('#profile-right').on('click', () => {
      const next = this.selected % 8 + 1;
      this.switch(next);
      this.updatePreviewSkin1(next);
      this.updatePreviewSkin2(next);
    });
    this.$('#nick').on('keydown', event => {
      if (event.keyCode === 190) {
        event.preventDefault();
        return;
      }
    });
    this.$('#tag').on('keydown', event => {
      if (event.keyCode === 190) {
        event.preventDefault();
        return;
      }
    });
  }

  /** 把当前档案写入表单并落盘(缺失时写默认档案)。 */
  setDomValues() {
    let profile = this.store.get('profiles', 'profile' + this.selected);
    const defaults = {
      nick: '',
      skin: DEFAULT_SKIN,
      skin2: DEFAULT_SKIN2,
    };
    if (!profile) {
      profile = defaults;
    }
    this.store.set('profiles', 'profile' + this.selected, profile);
    this.$('#nick').val(profile.nick);
    this.$('#skin').val(profile.skin);
    this.$('#skin2').val(profile.skin2);
    this.$('#skin1-preview').css('background', 'url(' + profile.skin + ')');
    this.$('#skin2-preview').css('background', 'url(' + profile.skin2 + ')');
    this.$('#tag').val(this.tag);
    this.$('#pin').val(this.pin);
  }

  /** 校验两个皮肤输入:空串或 https:// 开头;非法时回填并返回 false。 */
  skinCheck() {
    const skin = this.$('#skin').val().trim();
    const skin2 = this.$('#skin2').val().trim();
    const isValid = url => url === '' || url.match(/^https:\/\//i);
    if (!isValid(skin)) {
      this.$('#skin').val(this.menuForm.skin);
      return false;
    }
    if (!isValid(skin2)) {
      this.$('#skin2').val(this.menuForm.skin2);
      return false;
    }
    return true;
  }

  /** 绑定 #tag/#pin/#nick/#skin/#skin2 的 blur 保存。 */
  addEvents() {
    this.$('#tag').blur(() => {
      this.setTag(this.$('#tag').val());
      this.partySync.spectator(true);
    });
    this.$('#pin').blur(() => {
      this.setPin(this.$('#pin').val());
    });
    this.$('#nick').blur(() => {
      this.setNick(this.$('#nick').val());
    });
    this.$('#skin').blur(() => {
      if (this.skinCheck()) {
        this.setSkin(this.$('#skin').val(), this.$('#skin2').val(), 1);
      }
    });
    this.$('#skin2').blur(() => {
      if (this.skinCheck()) {
        this.setSkin(this.$('#skin').val(), this.$('#skin2').val(), 2);
      }
    });
  }

  /** 切换到档案 slot(1..8):读取或建档,同步表单与 MenuForm。 */
  switch(slot) {
    this.selected = ~~slot;
    // 怪癖:落盘的是原始参数而非取整后的值(点击按钮传入本就是数字,故不可观察)。
    this.store.set('profiles', 'selected', slot);
    let profile = this.store.get('profiles', 'profile' + slot);
    if (!profile) {
      profile = {
        nick: 'profile ' + this.selected,
        skin: DEFAULT_SKIN,
        skin2: DEFAULT_SKIN2,
      };
    }
    this.$('#nick').val(profile.nick);
    this.$('#skin').val(profile.skin);
    this.$('#skin2').val(profile.skin2);
    this.menuForm.nick = profile.nick;
    this.menuForm.skin = profile.skin;
    this.menuForm.skin2 = profile.skin2;
    this.store.set('profiles', 'profile' + this.selected, profile);
    this.updateMainSkin(1);
  }

  /** 保存昵称;游戏中且输入值与当前昵称不同则拒绝。 */
  setNick(nick) {
    nick = nick.trim().replace('.', '').replace('[', '').replace(']', '').slice(0, 15);
    if (this.menuForm.isAlive && this.$('#nick').val() !== this.menuForm.nick) {
      this.$('#nick').val(this.menuForm.nick);
      this.chat.alert('', this.i18n.current.notif.nickChangeInGame);
      return;
    }
    let profile = this.store.get('profiles', 'profile' + this.selected);
    const defaults = {
      nick: 'profile ' + this.selected,
      skin: DEFAULT_SKIN,
      skin2: DEFAULT_SKIN2,
    };
    if (!profile) {
      profile = defaults;
    }
    profile.nick = nick;
    this.store.set('profiles', 'profile' + this.selected, profile);
    this.menuForm.nick = nick;
  }

  /** 保存双皮肤并更新预览;which 仅透传给 updateMainSkin(1=皮肤1失焦,2=皮肤2失焦)。 */
  setSkin(skin, skin2, which) {
    let profile = this.store.get('profiles', 'profile' + this.selected);
    const defaults = {
      nick: 'profile ' + this.selected,
      skin: DEFAULT_SKIN,
      skin2: DEFAULT_SKIN2,
    };
    if (!profile) {
      profile = defaults;
    }
    profile.skin = skin;
    profile.skin2 = skin2;
    this.store.set('profiles', 'profile' + this.selected, profile);
    this.updateMainSkin(which);
    this.updatePreviewSkin1(this.selected);
    this.updatePreviewSkin2(this.selected);
    this.menuForm.skin = skin;
    this.menuForm.skin2 = skin2;
  }

  /** 保存 tag;游戏中拒绝(提示为硬编码英文,与 setNick 的 i18n 文案不一致,原样保留)。 */
  setTag(tag) {
    tag = tag.trim().replace('.', '').replace('\u200B', '').replace('[', '').replace(']', '').slice(0, 5);
    if (this.menuForm.isAlive && this.$('#tag').val() !== this.menuForm.tag) {
      this.$('#tag').val(this.menuForm.tag);
      this.chat.alert('', 'You cant change tag while in-game');
      return;
    }
    this.menuForm.tag = tag;
    // 怪癖:this.profile 可能为 false(见 stripLegacyDots);tag 本身另行落盘。
    this.profile.tag = tag;
    this.$('#tag').val(tag);
    this.store.set('profiles', 'tag', tag);
  }

  /** 保存 pin;游戏中拒绝(硬编码英文提示)。 */
  setPin(pin) {
    pin = pin.trim().replace('\u200B', '').replace('[', '').replace(']', '').slice(0, 5);
    if (this.menuForm.isAlive && this.$('#pin').val() !== this.menuForm.pin) {
      this.$('#pin').val(this.menuForm.pin);
      this.chat.alert('', 'You cant change pin while in-game');
      return;
    }
    this.menuForm.pin = pin;
    this.store.set('profiles', 'pin', pin);
  }

  /** 按输入框当前值刷新主预览(参数未使用,原样保留)。 */
  updateMainSkin(which) {
    const skin = this.$('#skin').val();
    const skin2 = this.$('#skin2').val();
    this.$('#skin1-preview').css('background', 'url(' + skin + ')');
    this.$('#skin2-preview').css('background', 'url(' + skin2 + ')');
  }

  /** 刷新皮肤 1 预览(读取指定档案)。 */
  updatePreviewSkin1(slot) {
    const profile = this.store.get('profiles', 'profile' + slot);
    const skin = profile ? profile.skin : DEFAULT_SKIN;
    this.$('#skin1-preview').css('background', 'url(' + skin + ')');
  }

  /** 刷新皮肤 2 预览(读取指定档案)。 */
  updatePreviewSkin2(slot) {
    const profile = this.store.get('profiles', 'profile' + slot);
    const skin2 = profile ? profile.skin2 : DEFAULT_SKIN2;
    this.$('#skin2-preview').css('background', 'url(' + skin2 + ')');
  }
}
