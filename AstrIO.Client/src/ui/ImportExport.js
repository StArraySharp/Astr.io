/**
 * ImportExport — 设置导入/导出/重置(原 `bk` 单例,面板 #import-export)。
 *
 * 行为(与原实现对齐):
 *  - 配置文件格式:纯文本,段间以 U+2800(盲文空格)分隔——
 *      [ {"length":N}, {"hasProfiles":…,"hasSettings":…,…},
 *        profiles?, settings?, hotkeys?, commands?, theme? ]
 *    每段是 JSON.stringify 后的字符串(逐段再 stringify 一次,导入侧逐段
 *    JSON.parse 后直接写入 localStorage)。
 *  - import():文件名必须匹配 *.astr.config;按 has* 标志取段写入
 *    localStorage 的 astrio-<key>(直接绕过 Store,原实现如此),写入
 *    "null" 字符串的键随后移除;成功后依次调用 KeyBindings/Theme/
 *    SettingsPanel/ProfilesPanel 的 reinitializateData()。
 *  - export():profiles 段导出前抹掉 mode/pin;activeItems 使用 "theming"
 *    作为标志键但对应存储键 "theme"(原实现的命名不一致,保持原样);
 *    下载 data-<Date.now()>.astr.config(text/plain)。
 *  - reset():按 activeItems 移除对应 localStorage 键并重新初始化。
 *  - 消息经 ChatService.chat(null, 2, text, "Client") 显示(文案保留原文,
 *    包括 "atleast" 拼写错误)。
 */

const SECTION_SEPARATOR = '\u2800'; // U+2800 盲文空格(原实现的段分隔符)

export default class ImportExport {
  /**
   * @param {object} systems 依赖集合(重写名):
   *   window — 全局 window(原 a6,File/FileReader/FileList/Blob 检测)
   *   document — 文档对象(原 a8,下载用 <a>)
   *   $ — jQuery(原 a7)
   *   Store(core/Store,af)— prefix(localStorage 键前缀)
   *   ChatService(net/ChatService,c1)— chat() 系统消息
   *   KeyBindings(input/KeyBindings,bf)— reinitializateData()
   *   Theme(ui/Theme,bj)— reinitializateData()
   *   SettingsPanel(ui/SettingsPanel,bc)— reinitializateData()
   *   ProfilesPanel(ui/ProfilesPanel,be)— reinitializateData()
   *   注:localStorage 为浏览器全局,原实现直接访问(不经 Store)
   */
  constructor(systems) {
    this.systems = systems;
  }

  init() {
    const { $ } = this.systems;
    this.isOpened = false;
    this.div = $('#import-export');
    this.inputDiv = $('.row>input[type="file"]')[0];
    this.addEvents();
    this.activeItems = new Set();
  }

  addEvents() {
    const { $ } = this.systems;
    const panel = this;
    $('.import-export-close').click(() => this.close());
    $('.import-export-container').perfectScrollbar();
    $('.import-export-container .fa-chevron-left').each(function () {
      $(this).click(() => {
        const optionRow = $(this).parent();
        const type = $(optionRow).attr('type');
        if (type === 'options') {
          panel.handleOptions(optionRow, 0);
        }
      });
    });
    $('.import-export-container .fa-chevron-right').each(function () {
      $(this).click(() => {
        const optionRow = $(this).parent();
        const type = $(optionRow).attr('type');
        if (type === 'options') {
          panel.handleOptions(optionRow, 1);
        }
      });
    });
  }

  import(event) {
    const { window: view, store, chatService, keyBindings, theme, settingsPanel, profilesPanel } =
      this.systems;
    const notify = text => chatService.chat(null, 2, text, 'Client');
    if (view.File && view.FileReader && view.FileList && view.Blob) {
      const file = event.target.files[0];
      if (!file) {
        return notify("You didn't select any file!");
      }
      const nameParts = file.name.split('.');
      const extension = nameParts[1] + '.' + nameParts[2];
      if (extension !== 'astr.config') {
        notify('Invalid file!');
        return;
      }
      const reader = new view.FileReader();
      reader.onload = loadEvent => {
        try {
          let index = 0;
          const sections = loadEvent.target.result.split(SECTION_SEPARATOR);
          const lengthHeader = JSON.parse(sections[index++]); // 怪癖:读出后未使用
          const flags = JSON.parse(sections[index++]);
          const knownKeys = ['profiles', 'settings', 'hotkeys', 'commands', 'theme'];
          if (flags.hasProfiles && knownKeys.includes('profiles')) {
            localStorage.setItem(store.prefix + 'profiles', JSON.parse(sections[index++]));
          }
          if (flags.hasSettings && knownKeys.includes('settings')) {
            localStorage.setItem(store.prefix + 'settings', JSON.parse(sections[index++]));
          }
          if (flags.hasHotkeys && knownKeys.includes('hotkeys')) {
            localStorage.setItem(store.prefix + 'hotkeys', JSON.parse(sections[index++]));
          }
          if (flags.hasCommands && knownKeys.includes('commands')) {
            localStorage.setItem(store.prefix + 'commands', JSON.parse(sections[index++]));
          }
          if (flags.hasTheming && knownKeys.includes('theme')) {
            localStorage.setItem(store.prefix + 'theme', JSON.parse(sections[index++]));
          }
          for (const key of knownKeys) {
            if (localStorage.getItem(store.prefix + key) === 'null') {
              localStorage.removeItem(store.prefix + key);
            }
          }
          keyBindings.reinitializateData();
          theme.reinitializateData();
          settingsPanel.reinitializateData();
          profilesPanel.reinitializateData();
          this.inputDiv.value = '';
        } catch (err) {
          notify('Invalid or corrupted config file!');
          this.inputDiv.value = '';
        }
      };
      reader.readAsText(file);
    } else {
      notify("The File API isn't supported in this browser!");
    }
  }

  export() {
    const { store, chatService } = this.systems;
    let data = '';
    if (this.activeItems.size < 1) {
      return chatService.chat(null, 2, 'Please select atleast one item you want to export!', 'Client');
    }
    data += JSON.stringify({ length: this.activeItems.size });
    data += SECTION_SEPARATOR;
    data += JSON.stringify({
      hasProfiles: this.activeItems.has('profiles'),
      hasSettings: this.activeItems.has('settings'),
      hasHotkeys: this.activeItems.has('hotkeys'),
      hasCommands: this.activeItems.has('commands'),
      // 怪癖:标志键名是 "theming",而对应 localStorage 键是 "theme"
      hasTheming: this.activeItems.has('theming'),
    });
    data += SECTION_SEPARATOR;
    if (this.activeItems.has('profiles')) {
      // 导出前抹掉 mode/pin;结果被双重 stringify(原实现如此)
      let profiles = JSON.parse(localStorage.getItem(store.prefix + 'profiles'));
      profiles.mode = '';
      profiles.pin = '';
      profiles = JSON.stringify(profiles);
      data += JSON.stringify(profiles);
      data += SECTION_SEPARATOR;
    }
    if (this.activeItems.has('settings')) {
      data += JSON.stringify(localStorage.getItem(store.prefix + 'settings'));
      data += SECTION_SEPARATOR;
    }
    if (this.activeItems.has('hotkeys')) {
      data += JSON.stringify(localStorage.getItem(store.prefix + 'hotkeys'));
      data += SECTION_SEPARATOR;
    }
    if (this.activeItems.has('commands')) {
      data += JSON.stringify(localStorage.getItem(store.prefix + 'commands'));
      data += SECTION_SEPARATOR;
    }
    if (this.activeItems.has('theming')) {
      data += JSON.stringify(localStorage.getItem(store.prefix + 'theme'));
      data += SECTION_SEPARATOR;
    }
    const text = data.slice(0, data.length - 1);
    const blob = new Blob([text], { type: 'text/plain' });
    this.download('data-' + Date.now() + '.astr.config', blob);
  }

  reset() {
    const { store, chatService, keyBindings, theme, settingsPanel, profilesPanel } = this.systems;
    if (this.activeItems.size < 1) {
      return chatService.chat(null, 2, 'Please select atleast one item you want to reset!', 'Client');
    }
    if (this.activeItems.has('profiles')) {
      localStorage.removeItem(store.prefix + 'profiles');
    }
    if (this.activeItems.has('settings')) {
      localStorage.removeItem(store.prefix + 'settings');
    }
    if (this.activeItems.has('hotkeys')) {
      localStorage.removeItem(store.prefix + 'hotkeys');
    }
    if (this.activeItems.has('commands')) {
      localStorage.removeItem(store.prefix + 'commands');
    }
    if (this.activeItems.has('theming')) {
      localStorage.removeItem(store.prefix + 'theme');
    }
    keyBindings.reinitializateData();
    theme.reinitializateData();
    settingsPanel.reinitializateData();
    profilesPanel.reinitializateData();
  }

  download(filename, blob) {
    const { document } = this.systems;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * options 控件(on/off 二态):action 1 = 下一项,0 = 上一项;
   * value 为 "on"/"off" 时把控件 name 加入/移出 activeItems。
   */
  handleOptions(optionRow, action) {
    const { $ } = this.systems;
    const items = $(optionRow).find('b');
    const count = items.length;
    let i = count;
    let active = 0;
    while (i--) {
      if ($(items[i]).attr('class') === 'active') {
        active = i;
      }
    }
    if (action === 1) {
      const next = active + 1 < count ? active + 1 : 0;
      $(items[active]).removeAttr('class');
      $(items[next]).attr('class', 'active');
      const value = $(items[next]).attr('value');
      if (value === 'on') {
        // 怪癖:直接读 DOM attribute 而非已取的 jQuery attr(等值)
        this.activeItems.add(optionRow[0].attributes.name.value);
      } else if (value === 'off') {
        this.activeItems.delete(optionRow[0].attributes.name.value);
      }
    } else if (action === 0) {
      const prev = active > 0 ? active - 1 : count - 1;
      $(items[active]).removeAttr('class');
      $(items[prev]).attr('class', 'active');
      const value = $(items[prev]).attr('value');
      if (value === 'on') {
        this.activeItems.add(optionRow[0].attributes.name.value);
      } else if (value === 'off') {
        this.activeItems.delete(optionRow[0].attributes.name.value);
      }
    }
  }

  toggle() {
    if (this.isOpened) {
      this.close();
    } else {
      this.open();
    }
  }

  close() {
    this.isOpened = false;
    this.div.fadeOut(250);
  }

  open() {
    this.isOpened = true;
    this.div.fadeIn(250);
  }
}
