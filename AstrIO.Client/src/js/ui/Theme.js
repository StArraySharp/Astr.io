/**
 * Theme — 主题系统(原 `bj` 单例,面板 #theme)。
 *
 * 行为(与原实现对齐):
 *  - init():从 Store("theme") 载入全部主题键(数值键经 ~~ 取整,
 *    0/缺省回落默认值;backgroundURL 缺省回落
 *    https://i.imgur.com/cx5Pfo9.jpg),注册预设,同步 DOM,绑定事件。
 *  - 控件模型:.theme-options 每项有 type 属性——
 *      range(自定义滑条,span[0]=value 载体/span[1]=进度条/span[2]=数值标签)
 *      input(#backgroundURL 文本框)
 *      options(左右箭头循环切换 <b value>,active 标记当前项)
 *      colorpicker(input.minicolors,jQuery 插件,change 即保存)
 *  - saveTheme():写 this[name] + Store,联动副作用——backgroundColor →
 *    html/body 背景;backgroundURL → Canvas.bg.src;chatFontSize/lbSize/
 *    minimimapSize/cursor → 对应 CSS;mass/nick 字体与颜色 → 清 NameRenderer
 *    缓存;indicatorColor → 重缓存指示器;任何非 preset 修改使 selectedPreset
 *    变为 "custom"。
 *  - selectPreset():应用预设的 theme+settings(后者写入 SettingsPanel 并
 *    持久化到 "settings"),共 11 个预设(Astrio/Agarplus v2/HKG/Ogario v4/
 *    Yin/VNDOT/OZYDOT/HSLO v2/v3/v4/Pastels)。
 *  - 修改背景 URL(input/blur)同样使预设脱离(转为 custom)。
 */

const DEFAULT_BACKGROUND_URL = 'https://i.imgur.com/cx5Pfo9.jpg';

export default class Theme {
  /**
   * @param {object} systems 依赖集合(重写名):
   *   $ — jQuery(原 a7)
   *   Store(core/Store,af)— "theme"/"settings" 持久化
   *   Canvas(render/Canvas,c4)— bg.src、cacheIndicator()
   *   Minimap(ui/Minimap,bt)— initted/size/canvas/setShape()
   *   NameRenderer(render/NameRenderer,bK)— setMassCtxFont/setNickCtxFont/缓存清理
   *   SettingsPanel(ui/SettingsPanel,bc)— 预设中的 settings 键写入与 setDomValues()
   */
  constructor(systems) {
    this.systems = systems;
  }

  init() {
    const { $ } = this.systems;
    this.isOpened = false;
    this.div = $('#theme');
    this.loadStoredValues();
    this.addPresets();
    this.setDomValues();
    this.addEvents();
  }

  reinitializateData() {
    const { canvas } = this.systems;
    // 原实现重复 init() 的载入逻辑(此处同样不重绑事件/不重加预设)
    this.loadStoredValues();
    canvas.bg.src = this.backgroundURL;
    this.setDomValues();
  }

  /** 从 Store 读取全部主题键(原实现将该段在 init/reinitializateData 中重复内联)。 */
  loadStoredValues() {
    const { store } = this.systems;
    this.selectedPreset = store.get('theme', 'selectedPreset') || 'custom';
    const storedBackgroundURL = store.get('theme', 'backgroundURL');
    // 原实现:存储值 !== false 时使用之(Store 缺省返回 false)
    this.backgroundURL = storedBackgroundURL !== false ? storedBackgroundURL : DEFAULT_BACKGROUND_URL;
    this.skinBorder = ~~store.get('theme', 'skinBorder') || 100;
    this.lbSize = ~~store.get('theme', 'lbSize') || 100;
    this.minimapSize = ~~store.get('theme', 'minimapSize') || 180;
    this.chatFontSize = ~~store.get('theme', 'chatFontSize') || 14;
    this.cellTransparency = ~~store.get('theme', 'cellTransparency') || 100;
    this.lightenCellColor = ~~store.get('theme', 'lightenCellColor') || 100;
    this.borderWidth = ~~store.get('theme', 'borderWidth') || 20;
    this.borderColor = store.get('theme', 'borderColor') || '#666666';
    this.team1color = store.get('theme', 'team1color') || '#aeaeae';
    this.team2color = store.get('theme', 'team2color') || '#ff171f';
    this.multiboxActive = store.get('theme', 'multiboxActive') || '#ff61f8';
    this.multiboxInactive = store.get('theme', 'multiboxInactive') || '#fff';
    this.nickColor = store.get('theme', 'nickColor') || '#fff';
    this.nickStrokeColor = store.get('theme', 'nickStrokeColor') || '#000';
    this.cellNickSize = ~~store.get('theme', 'cellNickSize') || 110;
    this.nickFont = store.get('theme', 'nickFont') || 'Geogrotesque Rg';
    this.massColor = store.get('theme', 'massColor') || '#fff';
    this.massStrokeColor = store.get('theme', 'massStrokeColor') || '#000';
    this.cellMassSize = ~~store.get('theme', 'cellMassSize') || 140;
    this.massFont = store.get('theme', 'massFont') || 'Geogrotesque Rg';
    this.gridWidth = ~~store.get('theme', 'gridWidth') || 100;
    this.gridColor = store.get('theme', 'gridColor') || '#222222';
    this.gridTextColor = store.get('theme', 'gridTextColor') || '#222222';
    // 怪癖:gridTextSize 是唯一未做 ~~ 取整的数值键
    this.gridTextSize = store.get('theme', 'gridTextSize') || 1400;
    this.gridTextFont = store.get('theme', 'gridTextFont') || 'Geogrotesque Rg';
    this.foodSize = ~~store.get('theme', 'foodSize') || 1;
    this.foodColor = store.get('theme', 'foodColor') || '#ffffff';
    this.virusColor = store.get('theme', 'virusColor') || '#616161';
    this.virusBorderColor = store.get('theme', 'virusBorderColor') || '#828282';
    this.virusBorderWidth = ~~store.get('theme', 'virusBorderWidth') || 14;
    this.commanderColor = store.get('theme', 'commanderColor') || '#fff';
    this.backgroundColor = store.get('theme', 'backgroundColor') || '#000000';
    this.indicatorSize = ~~store.get('theme', 'indicatorSize') || 100;
    this.cellBorderSize = ~~store.get('theme', 'cellBorderSize') || 1;
    this.indicatorColor = store.get('theme', 'indicatorColor') || '#ffffff';
    this.cursor = store.get('theme', 'cursor') || 1;
  }

  setDomValues() {
    const { $ } = this.systems;
    const theme = this;
    $('.theme-options').each(function () {
      const type = $(this).attr('type');
      if (type === 'range') {
        theme.handleRange(this, 2);
      } else if (type === 'input') {
        theme.handleInput(this);
      } else if (type === 'options') {
        theme.handleOptions(this, 2);
      } else if (type === 'colorpicker') {
        theme.initColorpicker(this);
      }
    });
    this.setChatFontSize(this.chatFontSize);
    this.setBackground(this.backgroundColor);
    this.setLeaderboard(this.lbSize);
    this.setMinimap(this.minimapSize);
    this.setCursor(this.cursor);
  }

  addEvents() {
    const { $, canvas, store } = this.systems;
    const theme = this;
    const applyBackgroundURL = () => {
      const url = $('#backgroundURL').val().trim();
      this.backgroundURL = url;
      canvas.bg.src = url;
      store.set('theme', 'backgroundURL', url);
      if (this.selectedPreset !== 'custom') {
        this.selectedPreset = 'custom';
        store.set('theme', 'selectedPreset', 'custom');
      }
    };
    $('#backgroundURL').on('input', applyBackgroundURL);
    $('#backgroundURL').on('blur', applyBackgroundURL);
    $('.theme-container').perfectScrollbar();
    $('.theme-container .fa-chevron-left').each(function () {
      $(this).click(() => {
        const optionRow = $(this).parent();
        const type = $(optionRow).attr('type');
        if (type === 'options') {
          theme.handleOptions(optionRow, 0);
        } else if (type === 'range') {
          theme.handleRange(optionRow, 0);
        }
      });
    });
    $('.theme-container span.outer').each(function () {
      $(this).click(event => {
        const optionRow = $(this).parent();
        theme.handleRange(optionRow, 3, event.offsetX);
      });
    });
    $('.theme-container .fa-chevron-right').each(function () {
      $(this).click(() => {
        const optionRow = $(this).parent();
        const type = $(optionRow).attr('type');
        if (type === 'options') {
          theme.handleOptions(optionRow, 1);
        } else if (type === 'range') {
          theme.handleRange(optionRow, 1);
        }
      });
    });
    $('.theme-close').click(() => this.close());
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

  /**
   * options 控件:action 1 = 下一项,0 = 上一项,2 = 按 this[name] 同步 active。
   * @param {HTMLElement|jQuery} optionRow 控件元素
   * @param {number} action
   */
  handleOptions(optionRow, action) {
    const { $ } = this.systems;
    const name = $(optionRow).attr('name');
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
      this.saveTheme(name, $(items[next]).attr('value'));
    } else if (action === 0) {
      const prev = active > 0 ? active - 1 : count - 1;
      $(items[active]).removeAttr('class');
      $(items[prev]).attr('class', 'active');
      this.saveTheme(name, $(items[prev]).attr('value'));
    } else if (action === 2) {
      $(items[active]).removeAttr('class');
      let j = count;
      while (j--) {
        if ($(items[j]).attr('value') === this[name]) {
          $(items[j]).attr('class', 'active');
          break;
        }
      }
    }
  }

  /**
   * range 控件:action 1 = +step,0 = -step,2 = 按 this[name] 同步,
   * 3 = 点击轨道按 offsetX 取值(对齐 step)。
   */
  handleRange(optionRow, action, offsetX = 0) {
    const { $ } = this.systems;
    const name = $(optionRow).attr('name');
    const spans = $(optionRow).find('span');
    const sliderEl = spans[0];
    const progressEl = spans[1];
    const valueEl = $(spans[2]);
    const min = ~~$(sliderEl).attr('min');
    const max = ~~$(sliderEl).attr('max');
    const step = ~~$(sliderEl).attr('step');
    const value = ~~$(sliderEl).attr('value');
    if (action === 1 && value + step <= max) {
      const nextValue = value + step;
      const width = ((nextValue - min) * 100) / (max - min);
      $(sliderEl).attr('value', nextValue);
      $(progressEl).css('width', ~~width + 'px');
      valueEl.text('' + nextValue);
      this.saveTheme(name, ~~nextValue);
    } else if (action === 0 && value - step >= min) {
      const prevValue = value - step;
      const width = ((prevValue - min) * 100) / (max - min);
      $(sliderEl).attr('value', prevValue);
      $(progressEl).css('width', ~~width + 'px');
      valueEl.text('' + prevValue);
      this.saveTheme(name, ~~prevValue);
    } else if (action === 2) {
      const currentValue = this[name];
      const width = ((currentValue - min) * 100) / (max - min);
      $(sliderEl).attr('value', currentValue);
      $(progressEl).css('width', ~~width + 'px');
      valueEl.text('' + currentValue);
    } else if (action === 3) {
      let snappedValue = (offsetX / 100) * (max - min) | 0;
      snappedValue = Math.round(snappedValue / step) * step;
      snappedValue += min;
      const width = ((snappedValue - min) * 100) / (max - min);
      $(sliderEl).attr('value', snappedValue);
      $(progressEl).css('width', ~~width + 'px');
      valueEl.text('' + snappedValue);
      this.saveTheme(name, ~~snappedValue);
    }
  }

  handleInput(optionRow) {
    const { $ } = this.systems;
    // 怪癖:name 读出后未使用,仅将输入框值设为当前背景 URL
    const name = $(optionRow).attr('name');
    const input = $(optionRow).find('input').val(this.backgroundURL);
  }

  initColorpicker(optionRow) {
    const { $ } = this.systems;
    const input = $(optionRow).find('input');
    const id = input.attr('id');
    const currentValue = this[id];
    input.val(currentValue);
    const withOpacity = !!~~input.attr('opacity');
    $('#' + id).minicolors({
      opacity: withOpacity,
      position: 'bottom right',
      change: (value, opacity) => {
        this.saveTheme(id, value);
      },
    });
  }

  saveTheme(name, value) {
    const { $, store, canvas, nameRenderer, settingsPanel } = this.systems;
    this[name] = value;
    if (name === 'selectedPreset') {
      this.selectPreset(value);
    } else if (this.selectedPreset !== 'custom') {
      // 修改任一主题项都会脱离预设
      this.selectedPreset = 'custom';
      store.set('theme', 'selectedPreset', 'custom');
      this.setDomValues();
    }
    if (name === 'backgroundColor') {
      this.setBackground(value);
    }
    if (name === 'backgroundURL') {
      canvas.bg.src = value;
    }
    if (name === 'chatFontSize') {
      this.setChatFontSize(value);
    }
    if (name === 'lbSize') {
      this.setLeaderboard(value);
    }
    if (name === 'minimapSize') {
      this.setMinimap(value);
    }
    if (name === 'cursor') {
      this.setCursor(value);
    }
    if (name === 'massFont') {
      nameRenderer.setMassCtxFont();
    }
    if (name === 'nickFont') {
      nameRenderer.setNickCtxFont();
    }
    if (name === 'massStrokeColor') {
      nameRenderer.massCaches.clear();
    }
    if (name === 'nickStrokeColor') {
      nameRenderer.nickCaches.clear();
    }
    if (name === 'massColor') {
      nameRenderer.massCaches.clear();
    }
    if (name === 'nickColor') {
      nameRenderer.nickCaches.clear();
    }
    if (name === 'indicatorColor') {
      this.cacheIndicator();
    }
    store.set('theme', name, value);
  }

  setBackground(color) {
    const { $ } = this.systems;
    $('html').css('background', color);
    $('body').css('background', color);
  }

  setChatFontSize(size) {
    const { $ } = this.systems;
    $('#notifications').css('font-size', size + 'px');
  }

  setLeaderboard(size) {
    const { $ } = this.systems;
    const scale = size / 100;
    $('#leaderboard-head').css('font-size', (24 * scale | 0) + 'px');
    $('#leaderboard-positions').css('font-size', (13 * scale | 0) + 'px');
  }

  setMinimap(size) {
    const { $, minimap } = this.systems;
    if (minimap.initted) {
      minimap.size = size;
      minimap.canvas.width = size;
      minimap.canvas.height = size;
      minimap.setShape();
    }
    $('#minimap-hud, .minimap-grid').css({
      width: size + 'px',
      height: size + 'px',
    });
    $('.minimap-row').css({
      width: size + 'px',
      height: (size / 5 | 0) + 'px',
    });
    $('.minimap-sector').css({
      width: Math.round(size / 5) + 'px',
      height: (size / 5 | 0) + 'px',
      'font-size': (15 * size / 200 | 0) + 'px',
      'padding-top': Math.max(11 * size / 200, 0) + 'px',
    });
    $('#time').css({
      bottom: size + 8 + 'px', // 原 PiWoj(c6,8) = c6+c7 加法(212748 行 setMinimap(minimapSize));时钟在地图上方 8px
      'font-size': (12 * size / 180 + 0.5 | 0) + 'px',
    });
  }

  setCursor(cursor) {
    const { $ } = this.systems;
    if (cursor === 1) {
      // 1 = 系统默认光标(隐藏预览)
      $('body').css('cursor', 'url(),auto');
      $('#cursorOff').show();
      $('#cursorDisplay').hide();
      return;
    }
    $('body').css('cursor', 'url(/resources/cursors/' + cursor + '.cur),auto');
    $('#cursorDisplay').attr('src', '/resources/cursors/' + cursor + '.cur');
    $('#cursorDisplay').show();
    $('#cursorOff').hide();
  }

  selectPreset(presetName) {
    const { store, settingsPanel } = this.systems;
    const preset = this.presets[presetName];
    if (presetName === 'custom' || !preset) {
      return;
    }
    for (const themeKey in preset.theme) {
      if (!preset.theme.hasOwnProperty(themeKey) || this[themeKey] === undefined) {
        continue;
      }
      this[themeKey] = preset.theme[themeKey];
      store.set('theme', themeKey, this[themeKey]);
    }
    this.setDomValues();
    for (const settingsKey in preset.settings) {
      if (!preset.settings.hasOwnProperty(settingsKey) || settingsPanel[settingsKey] === undefined) {
        continue;
      }
      settingsPanel[settingsKey] = preset.settings[settingsKey];
      store.set('settings', settingsKey, settingsPanel[settingsKey]);
    }
    settingsPanel.setDomValues();
  }

  cacheIndicator() {
    const { canvas } = this.systems;
    canvas.indicator = canvas.cacheIndicator();
  }

  addPresets() {
    this.presets = {
      Astrio: {
        author: '2coolife',
        theme: {
          skinBorder: 100,
          lbSize: 100,
          minimapSize: 180,
          chatFontSize: 14,
          cellTransparency: 100,
          lightenCellColor: 100,
          borderWidth: 20,
          borderColor: '#666666',
          team1color: '#aeaeae',
          team2color: '#fff700',
          nickColor: '#fff',
          nickStrokeColor: '#000',
          cellNickSize: 110,
          nickFont: 'Geogrotesque Rg',
          massColor: '#fff',
          massStrokeColor: '#444',
          cellMassSize: 140,
          massFont: 'Geogrotesque Rg',
          gridWidth: 100,
          gridColor: '#222222',
          gridTextColor: '#222222',
          gridTextSize: 1400,
          gridTextFont: 'Geogrotesque Rg',
          foodSize: 1,
          foodColor: '#ffffff',
          virusColor: '#616161',
          virusBorderColor: '#828282',
          virusBorderWidth: 14,
          commanderColor: '#ffffff',
          backgroundColor: '#000000',
          indicatorSize: 100,
          cellBorderSize: 1,
          cursor: 1,
        },
        settings: {
          CellAnimation: 120,
          cellMass: 'full',
          food: 'monoColored',
          bgSectors: 'normal',
          vanillaGrid: 'off',
        },
      },
      'Agarplus v2': {
        author: 'Acydwarp',
        theme: {
          skinBorder: 100,
          lbSize: 110,
          minimapSize: 200,
          chatFontSize: 18,
          cellTransparency: 100,
          lightenCellColor: 100,
          borderWidth: 40,
          borderColor: '#ffffff',
          team1color: '#aeaeae',
          team2color: '#fff700',
          nickColor: '#fff',
          nickStrokeColor: '#000',
          cellNickSize: 140,
          nickFont: 'Geogrotesque Rg',
          massColor: '#fff',
          massStrokeColor: '#000',
          cellMassSize: 140,
          massFont: 'Geogrotesque Rg',
          gridWidth: 100,
          gridColor: '#1a1a1a',
          gridTextColor: '#1a1a1a',
          gridTextSize: 1700,
          gridTextFont: 'Geogrotesque Rg',
          foodSize: 5,
          foodColor: '#0849d4',
          virusColor: '#808080',
          virusBorderColor: '#9e9e9e',
          virusBorderWidth: 10,
          commanderColor: '#0849d4',
          backgroundColor: '#000000',
          indicatorSize: 100,
          cellBorderSize: 1,
          cursor: 1,
        },
        settings: {
          CellAnimation: 120,
          cellMass: 'full',
          food: 'monoColored',
          bgSectors: 'normal',
          vanillaGrid: 'off',
        },
      },
      HKG: {
        author: 'Num Jai',
        theme: {
          skinBorder: 100,
          lbSize: 110,
          minimapSize: 200,
          chatFontSize: 18,
          cellTransparency: 100,
          lightenCellColor: 100,
          borderWidth: 60,
          borderColor: '#ffffff',
          team1color: '#aeaeae',
          team2color: '#fff700',
          nickColor: '#fff',
          nickStrokeColor: '#000',
          cellNickSize: 130,
          nickFont: 'sans-serif',
          massColor: '#fff',
          massStrokeColor: '#000',
          cellMassSize: 130,
          massFont: 'sans-serif',
          gridWidth: 100,
          gridColor: '#1a1a1a',
          gridTextColor: '#1a1a1a',
          gridTextSize: 1700,
          gridTextFont: 'Geogrotesque Rg',
          foodSize: 5,
          foodColor: '#6111ff',
          virusColor: '#808080',
          virusBorderColor: '#9e9e9e',
          virusBorderWidth: 10,
          commanderColor: '#0849d4',
          backgroundColor: '#000000',
          indicatorSize: 100,
          cellBorderSize: 1,
          cursor: 1,
        },
        settings: {
          CellAnimation: 120,
          cellMass: 'full',
          food: 'monoColored',
          bgSectors: 'off',
          vanillaGrid: 'off',
        },
      },
      'Ogario v4': {
        author: 'Szymy',
        theme: {
          skinBorder: 100,
          lbSize: 100,
          minimapSize: 240,
          chatFontSize: 18,
          cellTransparency: 100,
          lightenCellColor: 90,
          borderWidth: 40,
          borderColor: '#01d9cc',
          team1color: '#aeaeae',
          team2color: '#fff700',
          nickColor: '#fff',
          nickStrokeColor: '#000',
          cellNickSize: 120,
          nickFont: 'Geogrotesque Rg',
          massColor: '#fff',
          massStrokeColor: '#000',
          cellMassSize: 160,
          massFont: 'Geogrotesque Rg',
          gridWidth: 40,
          gridColor: '#00243e',
          gridTextColor: '#00243e',
          gridTextSize: 1200,
          gridTextFont: 'Geogrotesque Rg',
          foodSize: 5,
          foodColor: '#5000ff',
          virusColor: '#002f52',
          virusBorderColor: '#00b9e8',
          virusBorderWidth: 14,
          commanderColor: '#0849d4',
          backgroundColor: '#000a11',
          indicatorSize: 100,
          cellBorderSize: 1,
          cursor: 1,
        },
        settings: {
          CellAnimation: 140,
          cellMass: 'shortened',
          food: 'monoColored',
          bgSectors: 'normal',
          vanillaGrid: 'off',
        },
      },
      Yin: {
        author: 'DaChong',
        theme: {
          skinBorder: 100,
          lbSize: 130,
          minimapSize: 200,
          chatFontSize: 18,
          cellTransparency: 100,
          lightenCellColor: 100,
          borderWidth: 10,
          borderColor: '#116111',
          team1color: '#aeaeae',
          team2color: '#fff700',
          nickColor: '#fff',
          nickStrokeColor: '#000',
          cellNickSize: 100,
          nickFont: 'Geogrotesque Rg',
          massColor: '#fff',
          massStrokeColor: '#000',
          cellMassSize: 100,
          massFont: 'Geogrotesque Rg',
          gridWidth: 10,
          gridColor: '#333333',
          gridTextColor: '#333333',
          gridTextSize: 1700,
          gridTextFont: 'Geogrotesque Rg',
          foodSize: 1,
          foodColor: '#555',
          virusColor: '#6fff00',
          virusBorderColor: '#55b304',
          virusBorderWidth: 14,
          commanderColor: '#00fff7',
          backgroundColor: '#000000',
          indicatorSize: 100,
          cellBorderSize: 1,
          cursor: 1,
        },
        settings: {
          CellAnimation: 120,
          cellMass: 'full',
          food: 'rainbow',
          bgSectors: 'normal',
          vanillaGrid: 'off',
        },
      },
      VNDOT: {
        author: 'KSCC',
        theme: {
          skinBorder: 100,
          lbSize: 100,
          minimapSize: 200,
          chatFontSize: 18,
          cellTransparency: 100,
          lightenCellColor: 100,
          borderWidth: 10,
          borderColor: '#333333',
          team1color: '#aeaeae',
          team2color: '#fff700',
          nickColor: '#fff',
          nickStrokeColor: '#000',
          cellNickSize: 110,
          nickFont: 'Geogrotesque Rg',
          massColor: '#fff',
          massStrokeColor: '#000',
          cellMassSize: 110,
          massFont: 'Geogrotesque Rg',
          gridWidth: 10,
          gridColor: '#333333',
          gridTextColor: '#444444',
          gridTextSize: 1200,
          gridTextFont: 'Geogrotesque Rg',
          foodSize: 1,
          foodColor: '#4b6efa',
          virusColor: '#6fff00',
          virusBorderColor: '#55b304',
          virusBorderWidth: 14,
          commanderColor: '#00fff7',
          backgroundColor: '#111',
          indicatorSize: 100,
          cellBorderSize: 1,
          cursor: 1,
        },
        settings: {
          CellAnimation: 120,
          cellMass: 'shortened',
          food: 'monoColored',
          bgSectors: 'normal',
          vanillaGrid: 'off',
        },
      },
      OZYDOT: {
        author: 'Eric',
        theme: {
          skinBorder: 100,
          lbSize: 100,
          minimapSize: 200,
          chatFontSize: 14,
          cellTransparency: 100,
          lightenCellColor: 100,
          borderWidth: 20,
          borderColor: '#666666',
          team1color: '#aeaeae',
          team2color: '#fff700',
          nickColor: '#fff',
          nickStrokeColor: '#000',
          cellNickSize: 110,
          nickFont: 'Geogrotesque Rg',
          massColor: '#fff',
          massStrokeColor: '#444',
          cellMassSize: 140,
          massFont: 'oswald',
          gridWidth: 100,
          gridColor: '#222222',
          gridTextColor: '#222222',
          gridTextSize: 1400,
          gridTextFont: 'sans-serif',
          foodSize: 1,
          foodColor: '#c9d3f5',
          virusColor: '#e0e0e0',
          virusBorderColor: '#9c9c9c',
          virusBorderWidth: 10,
          commanderColor: '#ffffff',
          backgroundColor: '#000000',
          indicatorSize: 100,
          cellBorderSize: 1,
          cursor: 1,
        },
        settings: {
          CellAnimation: 120,
          cellMass: 'full',
          food: 'monoColored',
          bgSectors: 'normal',
          vanillaGrid: 'off',
        },
      },
      'HSLO v2': {
        author: '2coolife',
        theme: {
          skinBorder: 100,
          lbSize: 110,
          minimapSize: 180,
          chatFontSize: 16,
          cellTransparency: 100,
          lightenCellColor: 90,
          borderWidth: 20,
          borderColor: '#ffffff',
          team1color: '#aeaeae',
          team2color: '#fff700',
          nickColor: '#fff',
          nickStrokeColor: '#000',
          cellNickSize: 120,
          nickFont: 'Geogrotesque Rg',
          massColor: '#fff',
          massStrokeColor: '#000000',
          cellMassSize: 120,
          massFont: 'Geogrotesque Rg',
          gridWidth: 10,
          gridColor: '#007777',
          gridTextColor: '#333333',
          gridTextSize: 1600,
          gridTextFont: 'oswald',
          foodSize: 5,
          foodColor: '#666666',
          virusColor: '#444444',
          virusBorderColor: '#007777',
          virusBorderWidth: 14,
          commanderColor: '#ffffff',
          backgroundColor: '#222',
          indicatorSize: 100,
          cellBorderSize: 1,
          cursor: 1,
        },
        settings: {
          CellAnimation: 140,
          cellMass: 'shortened',
          food: 'monoColored',
          bgSectors: 'normal',
          vanillaGrid: 'off',
        },
      },
      'HSLO v3': {
        author: '2coolife',
        theme: {
          skinBorder: 90,
          lbSize: 100,
          minimapSize: 180,
          chatFontSize: 14,
          cellTransparency: 100,
          lightenCellColor: 100,
          borderWidth: 40,
          borderColor: '#ff006f',
          team1color: '#aeaeae',
          team2color: '#ff006f',
          nickColor: '#fff',
          nickStrokeColor: '#000000',
          cellNickSize: 110,
          nickFont: 'Geogrotesque Rg',
          massColor: '#fff',
          massStrokeColor: '#000000',
          cellMassSize: 110,
          massFont: 'Geogrotesque Rg',
          gridWidth: 10,
          gridColor: '#121212',
          gridTextColor: '#121212',
          gridTextSize: 1400,
          gridTextFont: 'oswald',
          foodSize: 1,
          foodColor: '#555555',
          virusColor: '#444444',
          virusBorderColor: '#ff006f',
          virusBorderWidth: 10,
          commanderColor: '#ff006f',
          backgroundColor: '#000000',
          indicatorSize: 100,
          cellBorderSize: 1,
          cursor: 1,
        },
        settings: {
          CellAnimation: 140,
          cellMass: 'shortened',
          food: 'monoColored',
          bgSectors: 'snowflakes',
          vanillaGrid: 'off',
        },
      },
      'HSLO v4': {
        author: '2coolife',
        theme: {
          skinBorder: 90,
          lbSize: 100,
          minimapSize: 180,
          chatFontSize: 14,
          cellTransparency: 100,
          lightenCellColor: 100,
          borderWidth: 20,
          borderColor: '#ff9900',
          team1color: '#aeaeae',
          team2color: '#ff006f',
          nickColor: '#fff',
          nickStrokeColor: '#000000',
          cellNickSize: 110,
          nickFont: 'Geogrotesque Rg',
          massColor: '#fff',
          massStrokeColor: '#000000',
          cellMassSize: 120,
          massFont: 'Geogrotesque Rg',
          gridWidth: 10,
          gridColor: '#ff9900',
          gridTextColor: '#333333',
          gridTextSize: 1300,
          gridTextFont: 'Geogrotesque Rg',
          foodSize: 1,
          foodColor: '#555555',
          virusColor: '#444444',
          virusBorderColor: '#ff9900',
          virusBorderWidth: 10,
          commanderColor: '#ff006f',
          backgroundColor: '#222222',
          indicatorSize: 100,
          cellBorderSize: 1,
          cursor: 1,
        },
        settings: {
          CellAnimation: 140,
          cellMass: 'shortened',
          food: 'monoColored',
          bgSectors: 'normal',
          vanillaGrid: 'off',
        },
      },
      Pastels: {
        author: '2coolife',
        theme: {
          skinBorder: 90,
          lbSize: 100,
          minimapSize: 180,
          chatFontSize: 14,
          cellTransparency: 100,
          lightenCellColor: 100,
          borderWidth: 40,
          borderColor: '#f5d25f',
          team1color: '#aeaeae',
          team2color: '#ff006f',
          nickColor: '#fff',
          nickStrokeColor: '#000000',
          cellNickSize: 110,
          nickFont: 'Geogrotesque Rg',
          massColor: '#fff',
          massStrokeColor: '#000000',
          cellMassSize: 120,
          massFont: 'Geogrotesque Rg',
          gridWidth: 10,
          gridColor: '#fa676c',
          gridTextColor: '#333333',
          gridTextSize: 1300,
          gridTextFont: 'oswald',
          foodSize: 1,
          foodColor: '#555555',
          virusColor: '#7a4ba3',
          virusBorderColor: '#ead2fa',
          virusBorderWidth: 14,
          commanderColor: '#ff006f',
          backgroundColor: '#222222',
          indicatorSize: 100,
          cellBorderSize: 1,
          cursor: 1,
        },
        settings: {
          CellAnimation: 140,
          cellMass: 'shortened',
          food: 'monoColored',
          bgSectors: 'normal',
          vanillaGrid: 'off',
        },
      },
    };
  }
}
