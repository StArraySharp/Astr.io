/**
 * MenuForm — 菜单表单与本地玩家状态(原 `bF` 单例)。
 *
 * 行为(与原实现对齐):
 *  - init():从 #nick/#skin/#skin2/#tag/#pin 读入初值,镜像 Menu 的
 *    region/mode,初始化位置/质量/分数/死亡位置等本地玩家状态。
 *  - update():每帧调用——有细胞 → playing()(首次存活时抓取颜色),
 *    无细胞 → dead()(打开菜单/恢复透明度);随后 updateData() 聚合
 *    bD.myCells 的质心/总质量/最大块质量,累计速度,并按
 *    (64/Σradius)^0.4 × max(w/1920, h/1080) 计算 SpectatorTab.autoZoomViewport。
 *  - nick/tag/pin setter:去 [ ]、截断(15/5/5 字符)并同步
 *    PartySync(c3)与 Keyboard(bZ);仅未存活时允许修改。
 *  - skin/skin2 setter:仅接受空串或 https:// URL,写入后从
 *    Canvas.downloadedSkins 缓存中失效。
 *  - tab setter:仅接受 1/2(否则回落 1),写 PacketWriter
 *    (uint16 200 + uint8 tab)推送回放流并触发 multiboxSwitch。
 *  - 死亡分支中 #countdown-box 倒计时代码在原构建中不可达
 *    (常量 false),按原样保留(见 dead())。
 */

export default class MenuForm {
  /**
   * @param {object} systems 依赖集合(重写名):
   *   window — 全局 window(原 a6)
   *   $ — jQuery(原 a7)
   *   Menu(ui/Menu,bB)— region/mode/open()
   *   World(game/World,bD)— myCells(细胞集合)
   *   SpectatorTab(ui/SpectatorTab,bJ)— autoZoomViewport/serverZoomOverride
   *   Player(replay/Player,bH)— startedReplay/lastPacketTime/started/pushBytes
   *   Grid(render/Grid,bI)— getLocation()
   *   PartySync(net/PartySync,c3)— nick/room/color/aliveStatus
   *   Keyboard(input/Keyboard,bZ)— nick/room/skin/multiboxSwitch
   *   Canvas(render/Canvas,c4)— downloadedSkins
   *   App(core/App,c5)— time(毫秒时钟)
   *   PacketWriter(原 bW,未列入架构表)— init/writeUInt16/writeUInt8/buffer
   */
  constructor(systems) {
    this.systems = systems;
  }

  init() {
    const { $, menu } = this.systems;
    this._nick = $('#nick').val() || '';
    this._skin = $('#skin').val() || '';
    this._skin2 = $('#skin2').val() || '';
    this._tag = $('#tag').val() || '';
    this._pin = $('#pin').val() || '';
    this._region = menu.region;
    this._mode = menu.mode;
    this._colorObject = { r: 0, g: 0, b: 0 };
    this.colorHex = '#000';
    this._isAlive = false;
    this.isRGB = false;
    this.x = 0;
    this.y = 0;
    this.speed = 0;
    this.animSpeed = 0;
    this.mass = 0;
    this.biggestPieceMass = 0;
    this.score = 0;
    this.movementPaused = false;
    this.deathLocation = { x: 100, y: 100 };
    this._tab = 1;
    this.bannerDisabled = false;
    // 注:hash 无初始化,由 Menu 在切换区服/模式时动态赋值为 null
  }

  update() {
    if (this.pieceCount > 0) {
      this.playing();
    } else {
      this.dead();
    }
    this.updateData();
  }

  playing() {
    const { world } = this.systems;
    if (!this.isAlive) {
      this.isAlive = true; // setter → PartySync.aliveStatus()
      for (const cell of world.myCells.values()) {
        this.colorObject = cell.colorObject; // setter → PartySync.color()
        this.colorHex = cell.colorHex;
        break;
      }
    }
  }

  updateData() {
    const { window: view, world, app, spectatorTab } = this.systems;
    if (!this.isAlive && world.myCells.size === 0) {
      return;
    }
    let centerX = 0;
    let centerY = 0;
    let radiusSum = 0;
    this.mass = 0;
    this.biggestPieceMass = 0;
    if (world.myCells.size > 0) {
      for (const cell of world.myCells.values()) {
        cell.animate();
        centerX += cell.x / this.totalPieceCount;
        centerY += cell.y / this.totalPieceCount;
        radiusSum += cell.radius;
        this.mass += cell.staticMass;
        if (this.biggestPieceMass < cell.staticMass) {
          this.biggestPieceMass = cell.staticMass;
        }
      }
    }
    const deltaX = this.x - centerX;
    const deltaY = this.y - centerY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    this.speed += distance;
    this.x = centerX;
    this.y = centerY;
    this.score = this.mass;
    const radiusZoom = Math.pow(Math.min(64 / radiusSum, 1), 0.4);
    const screenScale = Math.max(view.innerWidth / 1920, view.innerHeight / 1080);
    const autoZoom = radiusZoom * screenScale;
    // 服务端 zoom 覆盖在 200ms 后失效,回落到本地自动缩放
    if (!spectatorTab.serverZoomOverride || app.time - spectatorTab.serverZoomTime > 200) {
      spectatorTab.serverZoomOverride = false;
      spectatorTab.autoZoomViewport = autoZoom;
    }
  }

  dead() {
    const { $, menu, spectatorTab, player } = this.systems;
    if (this.isAlive) {
      this.isAlive = false; // setter → PartySync.aliveStatus()
      spectatorTab.serverZoomOverride = false;
      player.lastPacketTime = 0;
      this.score = 0;
      this.mass = 0;
      this.biggestPieceMass = 0;
      this.movementPaused = false;
      this.deathLocation.x = this.x;
      this.deathLocation.y = this.y;
      if (!player.startedReplay) {
        menu.open();
      }
      if (player.startedReplay) {
        spectatorTab.isSpectating = true;
      }
      if (!player.startedReplay) {
        $('#menu-overlay').show();
      }
      $('#main-menu').css({
        opacity: '0.0',
      });
      // 怪癖:原实现的死亡倒计时横幅分支恒不可达(useDeathBanner 为字面量 false),
      // 实际仅执行 else 分支;按原样保留以备对照
      const useDeathBanner = false;
      if (useDeathBanner) {
        this.bannerDisabled = true;
        let secondsLeft = 9;
        $('#countdown-box').fadeIn(250);
        const originalTimerHtml = $('#button-timer').html();
        const countdownInterval = setInterval(() => {
          $('#button-timer').html('<i class="fas fa-clock fa-fw"></i> ' + secondsLeft);
          secondsLeft = secondsLeft - 1;
        }, 950);
        setTimeout(
          () => {
            this.bannerDisabled = false;
            clearInterval(countdownInterval);
            $('#countdown-box').hide();
            if (!player.startedReplay) {
              menu.open();
            }
            $('#main-menu').animate({
              opacity: '1.0',
            });
            $('#button-timer').html('' + originalTimerHtml);
          },
          secondsLeft * 1000
        );
      } else {
        if (!player.startedReplay) {
          menu.open();
        }
        $('#main-menu').animate({
          opacity: '1.0',
        });
      }
    }
  }

  set nick(value) {
    const { $, partySync, keyboard } = this.systems;
    if (!this.isAlive) {
      this._nick = value
        .trim()
        .replace('[', '')
        .replace(']', '')
        .slice(0, 15);
      $('#nick').val(this._nick);
      partySync.nick();
      keyboard.nick();
    }
  }

  get nick() {
    return this._nick;
  }

  set tag(value) {
    if (!this.isAlive) {
      const { partySync, keyboard } = this.systems;
      this._tag = value
        .trim()
        .replace('[', '')
        .replace(']', '')
        .slice(0, 5);
      partySync.room();
      keyboard.room();
      partySync.nick();
      keyboard.nick();
    }
  }

  get tag() {
    return this._tag;
  }

  set pin(value) {
    if (!this.isAlive) {
      const { partySync, keyboard } = this.systems;
      this._pin = value
        .trim()
        .replace('[', '')
        .replace(']', '')
        .slice(0, 5);
      partySync.room();
      keyboard.room();
    }
  }

  get pin() {
    return this._pin;
  }

  set region(value) {
    const { partySync, keyboard } = this.systems;
    this._region = value;
    partySync.room();
    keyboard.room();
  }

  get region() {
    return this._region;
  }

  set mode(value) {
    const { partySync, keyboard } = this.systems;
    this._mode = value;
    partySync.room();
    keyboard.room();
  }

  get mode() {
    return this._mode;
  }

  set skin(value) {
    const { canvas, keyboard } = this.systems;
    const url = value.trim();
    if (url !== '' && !url.match(/^https:\/\//i)) {
      return;
    }
    this._skin = url;
    if (url && canvas.downloadedSkins) {
      canvas.downloadedSkins.delete(url);
    }
    keyboard.skin();
  }

  get skin() {
    return this._skin;
  }

  set skin2(value) {
    const { canvas, keyboard } = this.systems;
    const url = value.trim();
    if (url !== '' && !url.match(/^https:\/\//i)) {
      return;
    }
    this._skin2 = url;
    if (url && canvas.downloadedSkins) {
      canvas.downloadedSkins.delete(url);
    }
    keyboard.skin();
  }

  get skin2() {
    return this._skin2;
  }

  set colorObject(value) {
    const { partySync } = this.systems;
    this._colorObject.r = value.r;
    this._colorObject.g = value.g;
    this._colorObject.b = value.b;
    partySync.color();
  }

  get colorObject() {
    return this._colorObject;
  }

  get isAlive() {
    return this._isAlive;
  }

  set isAlive(value) {
    const { partySync } = this.systems;
    this._isAlive = value;
    partySync.aliveStatus();
  }

  get tab() {
    return this._tab;
  }

  set tab(value) {
    const { packetWriter, player, keyboard } = this.systems;
    // 原实现:a9.NScNB(value, 1) 推断为 value === 1
    this._tab = value === 1 || value === 2 ? value : 1;
    packetWriter.init();
    packetWriter.writeUInt16(200);
    packetWriter.writeUInt8(this._tab);
    if (player.started) {
      player.pushBytes(packetWriter.buffer);
    }
    keyboard.multiboxSwitch();
  }

  get worldID() {
    // 原实现 a9.scUpt(a, b) 推断为字符串拼接
    return this.nick + this.colorHex;
  }

  get location() {
    const { grid } = this.systems;
    return grid.getLocation(this.x, this.y);
  }

  get pieceCount() {
    const { world } = this.systems;
    return world.myCells.size;
  }

  get totalPieceCount() {
    return this.pieceCount;
  }
}
