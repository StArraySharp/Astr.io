/**
 * Menu — 主菜单(原 `bB` 单例)。
 *
 * 行为(与原实现对齐):
 *  - init():从 Store 读取 region(默认 "europe")/mode(默认 "extreme")并点亮
 *    对应按钮(#europe/#america、#domination/#megasplit/#extreme/#instamerge/
 *    #hypermass/#novirus);构造时区代码表;随后按原顺序引导全部 UI 子系统
 *    (Sfx→Chat→SettingsPanel→HotkeysPanel→ProfilesPanel→ImportExport→
 *    InstantReplay→Theme→FacebookAuth→GoogleAuth→[可选系统]→Leaderboard→
 *    TeamLeaderboard→Minimap→TeamList→ChatHud→StatsHud→TargetingHud);
 *    注入 time.is 时间挂件;绑定皮肤预览/区服/模式/回放控制/菜单按钮;
 *    轮询各模式在线人数;处理 ?join=/?private=/?pw= 私服直连。
 *  - pollServerCounts():每 10s GET <区服主机>/server-info/<mode>,
 *    写入 #count-<mode>("<人数> <i class='fal fa-user'></i>"),失败写 "-"。
 *  - checkPrivateJoin():?private=<port> 直连 private-<port>;
 *    ?join=<id> 先 POST(/api/join/<id>,{password})取主机/端口,需密码时
 *    prompt 并以 &pw= 重载;失败显示 "Connection failed" 等标签。
 *  - updateTime():按 IANA 时区查表生成 _z<代码> span 挂到 #time,并加载
 *    //widget.time.is/t.js 初始化挂件(未知时区回落 _z700 = Europe/Amsterdam)。
 *  - 区服切换会重算模式可用性(美服仅 domination/novirus,其余置灰 0.35)、
 *    刷新人数轮询并立即重连;模式点击写入 Store 并重连。
 *  - 观战按钮:top/mouse/target 三种镜头模式与缩放按钮(0.02~2)、居中锁定。
 */

const TIMEZONE_CODES = {
  'Africa/Abidjan': '000',
  'Africa/Accra': '001',
  'Africa/Addis_Ababa': '002',
  'Africa/Algiers': '003',
  'Africa/Asmara': '004',
  'Africa/Bamako': '005',
  'Africa/Bangui': '006',
  'Africa/Banjul': '007',
  'Africa/Bissau': '008',
  'Africa/Blantyre': '009',
  'Africa/Brazzaville': '00a',
  'Africa/Bujumbura': '00b',
  'Africa/Cairo': '00c',
  'Africa/Casablanca': '00d',
  'Africa/Conakry': '00f',
  'Africa/Dakar': '010',
  'Africa/Dar_es_Salaam': '011',
  'Africa/Djibouti': '012',
  'Africa/Douala': '013',
  'Africa/El_Aaiun': '014',
  'Africa/Freetown': '015',
  'Africa/Gaborone': '016',
  'Africa/Harare': '017',
  'Africa/Johannesburg': '018',
  'Africa/Juba': '000',
  'Africa/Kampala': '019',
  'Africa/Khartoum': '01a',
  'Africa/Kigali': '01b',
  'Africa/Kinshasa': '01c',
  'Africa/Lagos': '01d',
  'Africa/Libreville': '01e',
  'Africa/Lome': '01f',
  'Africa/Luanda': '020',
  'Africa/Lubumbashi': '021',
  'Africa/Lusaka': '022',
  'Africa/Malabo': '023',
  'Africa/Maputo': '024',
  'Africa/Maseru': '025',
  'Africa/Mbabane': '026',
  'Africa/Mogadishu': '027',
  'Africa/Monrovia': '028',
  'Africa/Nairobi': '029',
  'Africa/Ndjamena': '02a',
  'Africa/Niamey': '02b',
  'Africa/Nouakchott': '02c',
  'Africa/Ouagadougou': '02d',
  'Africa/Porto-Novo': '02e',
  'Africa/Sao_Tome': '02f',
  'Africa/Tripoli': '030',
  'Africa/Tunis': '031',
  'Africa/Windhoek': '032',
  'America/Anchorage': '101',
  'America/Anguilla': '102',
  'America/Antigua': '103',
  'America/Araguaina': '104',
  'America/Argentina/Buenos_Aires': '105',
  'America/Argentina/Cordoba': '107',
  'America/Aruba': '111',
  'America/Asuncion': '112',
  'America/Bahia': '114',
  'America/Barbados': '116',
  'America/Belem': '117',
  'America/Belize': '118',
  'America/Boa_Vista': '11a',
  'America/Bogota': '11b',
  'America/Boise': '11c',
  'America/Cambridge_Bay': '11d',
  'America/Campo_Grande': '11e',
  'America/Caracas': '120',
  'America/Cayenne': '121',
  'America/Cayman': '122',
  'America/Chicago': '123',
  'America/Chihuahua': '124',
  'America/Costa_Rica': '125',
  'America/Cuiaba': '126',
  'America/Curacao': '127',
  'America/Denver': '12b',
  'America/Detroit': '12c',
  'America/Dominica': '12d',
  'America/Edmonton': '12e',
  'America/Eirunepe': '12f',
  'America/El_Salvador': '130',
  'America/Fortaleza': '131',
  'America/Godthab': '133',
  'America/Grand_Turk': '135',
  'America/Grenada': '136',
  'America/Guadeloupe': '137',
  'America/Guatemala': '138',
  'America/Guayaquil': '139',
  'America/Guyana': '13a',
  'America/Halifax': '13b',
  'America/Havana': '13c',
  'America/Indiana/Indianapolis': '13e',
  'America/Iqaluit': '147',
  'America/Jamaica': '148',
  'America/Juneau': '149',
  'America/La_Paz': '14c',
  'America/Lima': '14d',
  'America/Los_Angeles': '14e',
  'America/Maceio': '14f',
  'America/Managua': '150',
  'America/Manaus': '151',
  'America/Marigot': '152',
  'America/Martinique': '153',
  'America/Mexico_City': '159',
  'America/Miquelon': '15a',
  'America/Moncton': '15b',
  'America/Monterrey': '15c',
  'America/Montevideo': '15d',
  'America/Montserrat': '15f',
  'America/Nassau': '160',
  'America/New_York': '161',
  'America/Ojinaga': '168',
  'America/Panama': '169',
  'America/Paramaribo': '16b',
  'America/Phoenix': '16c',
  'America/Port-au-Prince': '16d',
  'America/Port_of_Spain': '16e',
  'America/Porto_Velho': '16f',
  'America/Puerto_Rico': '170',
  'America/Punta_Arenas': '100',
  'America/Recife': '173',
  'America/Regina': '174',
  'America/Rio_Branco': '176',
  'America/Santiago': '179',
  'America/Santo_Domingo': '17a',
  'America/Sao_Paulo': '17b',
  'America/Scoresbysund': '17c',
  'America/St_Barthelemy': '17f',
  'America/St_Johns': '180',
  'America/St_Kitts': '181',
  'America/St_Lucia': '182',
  'America/St_Thomas': '183',
  'America/St_Vincent': '184',
  'America/Tegucigalpa': '186',
  'America/Thule': '187',
  'America/Tijuana': '189',
  'America/Toronto': '18a',
  'America/Tortola': '18b',
  'America/Vancouver': '18c',
  'America/Whitehorse': '18d',
  'America/Winnipeg': '18e',
  'Asia/Aden': '400',
  'Asia/Almaty': '401',
  'Asia/Amman': '402',
  'Asia/Ashgabat': '406',
  'Asia/Baghdad': '407',
  'Asia/Bahrain': '408',
  'Asia/Baku': '409',
  'Asia/Bangkok': '40a',
  'Asia/Beirut': '40b',
  'Asia/Bishkek': '40c',
  'Asia/Brunei': '40d',
  'Asia/Chita': '400',
  'Asia/Colombo': '410',
  'Asia/Damascus': '411',
  'Asia/Dhaka': '412',
  'Asia/Dili': '413',
  'Asia/Dubai': '414',
  'Asia/Dushanbe': '415',
  'Asia/Gaza': '416',
  'Asia/Ho_Chi_Minh': '418',
  'Asia/Hong_Kong': '419',
  'Asia/Hovd': '41a',
  'Asia/Irkutsk': '41b',
  'Asia/Jakarta': '41c',
  'Asia/Jayapura': '41d',
  'Asia/Jerusalem': '41e',
  'Asia/Kabul': '41f',
  'Asia/Kamchatka': '420',
  'Asia/Karachi': '421',
  'Asia/Kathmandu': '423',
  'Asia/Kolkata': '424',
  'Asia/Krasnoyarsk': '425',
  'Asia/Kuala_Lumpur': '426',
  'Asia/Kuching': '427',
  'Asia/Kuwait': '428',
  'Asia/Macau': '429',
  'Asia/Makassar': '42b',
  'Asia/Manila': '42c',
  'Asia/Muscat': '42d',
  'Asia/Nicosia': '42e',
  'Asia/Novosibirsk': '430',
  'Asia/Omsk': '431',
  'Asia/Phnom_Penh': '433',
  'Asia/Pyongyang': '435',
  'Asia/Qatar': '436',
  'Asia/Rangoon': '438',
  'Asia/Riyadh': '439',
  'Asia/Sakhalin': '43a',
  'Asia/Samarkand': '43b',
  'Asia/Seoul': '43c',
  'Asia/Shanghai': '43d',
  'Asia/Singapore': '43e',
  'Asia/Taipei': '43f',
  'Asia/Tashkent': '440',
  'Asia/Tbilisi': '441',
  'Asia/Tehran': '442',
  'Asia/Thimphu': '443',
  'Asia/Tokyo': '444',
  'Asia/Ulaanbaatar': '445',
  'Asia/Vientiane': '447',
  'Asia/Vladivostok': '448',
  'Asia/Yakutsk': '449',
  'Asia/Yekaterinburg': '44a',
  'Asia/Yerevan': '44b',
  'Atlantic/Azores': '500',
  'Atlantic/Bermuda': '501',
  'Atlantic/Canary': '502',
  'Atlantic/Cape_Verde': '503',
  'Atlantic/Faroe': '504',
  'Atlantic/Reykjavik': '506',
  'Atlantic/South_Georgia': '507',
  'Atlantic/St_Helena': '508',
  'Atlantic/Stanley': '509',
  'Australia/Adelaide': '600',
  'Australia/Brisbane': '601',
  'Australia/Darwin': '604',
  'Australia/Hobart': '606',
  'Australia/Melbourne': '609',
  'Australia/Perth': '60a',
  'Australia/Sydney': '60b',
  'Europe/Amsterdam': '700',
  'Europe/Andorra': '701',
  'Europe/Athens': '702',
  'Europe/Belgrade': '703',
  'Europe/Berlin': '704',
  'Europe/Bratislava': '705',
  'Europe/Brussels': '706',
  'Europe/Bucharest': '707',
  'Europe/Budapest': '708',
  'Europe/Chisinau': '709',
  'Europe/Copenhagen': '70a',
  'Europe/Dublin': '70b',
  'Europe/Gibraltar': '70c',
  'Europe/Guernsey': '70d',
  'Europe/Helsinki': '70e',
  'Europe/Isle_of_Man': '70f',
  'Europe/Istanbul': '710',
  'Europe/Jersey': '711',
  'Europe/Kaliningrad': '712',
  'Europe/Kiev': '713',
  'Europe/Lisbon': '714',
  'Europe/Ljubljana': '715',
  'Europe/London': '716',
  'Europe/Luxembourg': '717',
  'Europe/Madrid': '718',
  'Europe/Malta': '719',
  'Europe/Mariehamn': '71a',
  'Europe/Minsk': '71d',
  'Europe/Monaco': '71c',
  'Europe/Moscow': '71d',
  'Europe/Oslo': '71e',
  'Europe/Paris': '71f',
  'Europe/Podgorica': '720',
  'Europe/Prague': '721',
  'Europe/Riga': '722',
  'Europe/Rome': '723',
  'Europe/Samara': '724',
  'Europe/San_Marino': '725',
  'Europe/Sarajevo': '726',
  'Europe/Skopje': '728',
  'Europe/Sofia': '729',
  'Europe/Stockholm': '72a',
  'Europe/Tallinn': '72b',
  'Europe/Tirane': '72c',
  'Europe/Vaduz': '72e',
  'Europe/Vatican': '72f',
  'Europe/Vienna': '730',
  'Europe/Vilnius': '731',
  'Europe/Volgograd': '732',
  'Europe/Warsaw': '733',
  'Europe/Zagreb': '734',
  'Europe/Zurich': '736',
  'Indian/Antananarivo': '800',
  'Indian/Chagos': '801',
  'Indian/Christmas': '802',
  'Indian/Cocos': '803',
  'Indian/Comoro': '804',
  'Indian/Kerguelen': '805',
  'Indian/Mahe': '806',
  'Indian/Maldives': '807',
  'Indian/Mauritius': '808',
  'Indian/Mayotte': '809',
  'Indian/Reunion': '80a',
  'Pacific/Apia': '900',
  'Pacific/Auckland': '901',
  'Pacific/Chuuk': '903',
  'Pacific/Efate': '905',
  'Pacific/Fakaofo': '907',
  'Pacific/Fiji': '908',
  'Pacific/Funafuti': '909',
  'Pacific/Galapagos': '90a',
  'Pacific/Gambier': '90b',
  'Pacific/Guadalcanal': '90c',
  'Pacific/Guam': '90d',
  'Pacific/Honolulu': '90e',
  'Pacific/Johnston': '90f',
  'Pacific/Kiritimati': '910',
  'Pacific/Kwajalein': '912',
  'Pacific/Majuro': '913',
  'Pacific/Marquesas': '914',
  'Pacific/Midway': '915',
  'Pacific/Nauru': '916',
  'Pacific/Niue': '917',
  'Pacific/Norfolk': '918',
  'Pacific/Noumea': '919',
  'Pacific/Pago_Pago': '91a',
  'Pacific/Palau': '91b',
  'Pacific/Pitcairn': '91c',
  'Pacific/Pohnpei': '91d',
  'Pacific/Port_Moresby': '91e',
  'Pacific/Rarotonga': '91f',
  'Pacific/Saipan': '920',
  'Pacific/Tahiti': '921',
  'Pacific/Tarawa': '922',
  'Pacific/Tongatapu': '923',
  'Pacific/Wallis': '925',
  UTC: 'U-720',
};

  // 人数轮询使用的区服 → 模式列表(注:不含 hypermass,与 regions() 的可用性列表不一致——原实现如此)。
  const POLLED_MODES_BY_REGION = {
    europe: ['domination', 'extreme', 'megasplit', 'novirus', 'instamerge'],
    america: ['domination', 'novirus'],
    // 亚洲服(本地 C# 服):当前仅启用 extreme(模仿美服单/双模式行为)
    asia: ['extreme'],
  };

const ALL_POLLED_MODES = ['domination', 'extreme', 'megasplit', 'novirus', 'instamerge'];

/** 区服切换时的模式可用性列表(欧服含 hypermass,美服仅前两项)。 */
const AMERICAN_MODES = ['domination', 'novirus'];
const EUROPEAN_MODES = ['domination', 'extreme', 'megasplit', 'hypermass', 'novirus', 'instamerge'];
// 亚洲服:当前仅启用 extreme(其余模式置灰禁用,模仿美服行为)
const ASIAN_MODES = ['extreme'];

/** 模式按钮 id(点击处理按此顺序绑定)。 */
const MODE_IDS = ['domination', 'megasplit', 'extreme', 'instamerge', 'hypermass', 'novirus'];

export default class Menu {
  /**
   * @param {object} systems 依赖集合(重写名):
   *   window — 全局 window(原 a6)
   *   document — 文档对象(原 a8)
   *   $ — jQuery(原 a7)
   *   Store(core/Store,af)— profiles 持久化
   *   GameConnection(net/GameConnection,bX)— region/host/regionHosts/privateHost、connect()、resetData()
   *   MenuForm(ui/MenuForm,bF)— mode/region/hash/isAlive 镜像
   *   SpectatorTab(ui/SpectatorTab,bJ)— 观战状态与视口
   *   Sfx(audio/Sfx,bn)、Chat(ui/Chat,bm)、SettingsPanel(ui/SettingsPanel,bc)、
   *   HotkeysPanel(ui/HotkeysPanel,bd)、ProfilesPanel(ui/ProfilesPanel,be)、
   *   ImportExport(ui/ImportExport,bk)、InstantReplay(replay/InstantReplay,bl)、
   *   Theme(ui/Theme,bj)、FacebookAuth(auth/*,bo)、GoogleAuth(auth/*,bp)
   *   optionalSystem — 原 bq(未知可选系统,存在且有 init() 时才引导)
   *   Leaderboard(ui/Leaderboard,br)、TeamLeaderboard(ui/TeamLeaderboard,bs)、
   *   Minimap(ui/Minimap,bt)、TeamList(ui/TeamList,bu)、ChatHud(ui/ChatHud,bv)、
   *   StatsHud(ui/StatsHud,bw)、TargetingHud(ui/TargetingHud,bA)
   *   Player(replay/Player,bH)— 回放控件(readFile/stopRendering/startedReplay 等)
   *   Keyboard(input/Keyboard,bZ)— spawn/spectate/freeSpectate
   *   Grid(render/Grid,bI)— center
   *   Targeting(game/Targeting,bS)— target1/target2/isTurnedOn
   */
  constructor(systems) {
    this.systems = systems;
  }

  init() {
    const { $, store, gameConnection } = this.systems;
    this.region = store.get('profiles', 'region') || 'europe';
    this.mode = store.get('profiles', 'mode') || 'extreme';
    if (this.region === 'europe') {
      $('#europe').addClass('is-active');
    } else if (this.region === 'america') {
      $('#america').addClass('is-active');
    } else if (this.region === 'asia') {
      $('#asia').addClass('is-active');
    } else {
      // 未知区服回落 europe 并写回存储
      this.region = 'europe';
      store.set('profiles', 'region', this.region);
      $('#europe').addClass('is-active');
    }
    gameConnection.region = this.region;
    for (const mode of MODE_IDS) {
      if (this.mode === mode) {
        $('#' + mode).addClass('is-active');
      }
    }
    this.zones = TIMEZONE_CODES;
    // 怪癖:主菜单 init 同时充当全部 UI 子系统的组合根(按原顺序引导)
    this.bootSubsystems();
    this.updateTime();
    this.isOpened = true;
    this.div = $('#menu-overlay');
    this.buttons();
    this.skins();
    this.regions();
    this.modes();
    this.recordHandlers();
    this.pollServerCounts();
    this.checkPrivateJoin();
  }

  /** 按原实现顺序依次引导各 UI 子系统(原散落在 init() 中部)。 */
  bootSubsystems() {
    const s = this.systems;
    s.sfx.init();
    s.chat.init();
    s.settingsPanel.init();
    s.hotkeysPanel.init();
    s.profilesPanel.init();
    s.importExport.init();
    s.instantReplay.init();
    s.theme.init();
    s.facebookAuth.init();
    s.googleAuth.init();
    // 原实现:bq 为可选系统,typeof bq !== "undefined" && bq && bq.init 时才调用
    if (s.optionalSystem && s.optionalSystem.init) {
      s.optionalSystem.init();
    }
    s.leaderboard.init();
    s.teamLeaderboard.init();
    s.minimap.init();
    s.teamList.init();
    s.chatHud.init();
    s.statsHud.init();
    s.targetingHud.init();
  }

  pollServerCounts() {
    const { document } = this.systems;
    const modes = POLLED_MODES_BY_REGION[this.region] || ALL_POLLED_MODES;
    const setCount = (mode, count) => {
      const el = document.getElementById('count-' + mode);
      if (el) {
        el.innerHTML = count + ' <i class="fal fa-user"></i>';
      }
    };
    // 本区服不提供的模式:清空计数
    for (const mode of ALL_POLLED_MODES) {
      if (!modes.includes(mode)) {
        setCount(mode, '');
      }
    }
    const { gameConnection } = this.systems;
    if (!gameConnection.host && !gameConnection.regionHosts[this.region]) {
      for (const mode of modes) {
        setCount(mode, 0);
      }
      return;
    }
    const poll = async () => {
      const regionHost = gameConnection.regionHosts[this.region];
      // 亚洲服:本地 C# 服的 server-info 挂在 HTTP 控制端口 4002(游戏端口只收 WS)
      // 亚洲服:本地/自建 C# 服的 server-info 挂在 HTTP 控制端口 4002(游戏端口只收 WS)。
      // 自定义地址支持 host 或 host:port:含端口则沿用,否则补 4002;协议恒为 http(无 TLS)。
      // 欧美服为线上 HTTPS 服务,直接 https://<域名>。
      let base;
      if (this.region === 'asia') {
        base = (!regionHost || regionHost === 'localhost')
          ? 'http://localhost:4002'
          : 'http://' + (regionHost.indexOf(':') >= 0 ? regionHost : regionHost + ':4002');
      } else {
        base = regionHost ? 'https://' + regionHost : '';
      }
      for (const mode of modes) {
        try {
          const response = await fetch(base + '/server-info/' + mode);
          const info = await response.json();
          setCount(mode, info.players || 0);
        } catch (err) {
          setCount(mode, '-');
        }
      }
    };
    poll();
    this._pollInterval = setInterval(poll, 10000);
  }

  refreshServerCounts() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
    }
    this.pollServerCounts();
  }

  checkPrivateJoin() {
    const { window: view, gameConnection } = this.systems;
    const params = new URLSearchParams(view.location.search);
    const joinId = params.get('join');
    const privatePort = params.get('private');
    const password = params.get('pw') || '';
    if (!joinId && !privatePort) {
      return;
    }
    if (privatePort && !joinId) {
      this.enterPrivateMode('Private Server');
      gameConnection.connect('private-' + privatePort);
      return;
    }
    const isLocal =
      view.location.hostname === 'localhost' || view.location.hostname === '127.0.0.1';
    const apiBase = isLocal ? 'http://localhost:4001' : '';
    this.enterPrivateMode('Connecting...');
    fetch(apiBase + '/api/join/' + joinId, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
      .then(res => res.json())
      .then(info => {
        if (info.error) {
          if (info.needsPassword) {
            const entered = prompt('This server requires a password:');
            if (entered) {
              view.location.href =
                view.location.pathname + '?join=' + joinId + '&pw=' + encodeURIComponent(entered);
            }
            return;
          }
          this.privateServerLabel('Server not found');
          return;
        }
        this.privateServerLabel(info.name || 'Private Server');
        if (info.host) {
          gameConnection.privateHost = info.host;
        }
        gameConnection.connect('private-' + info.port);
      })
      .catch(() => {
        this.privateServerLabel('Connection failed');
      });
  }

  enterPrivateMode(label) {
    const { $, menuForm } = this.systems;
    this.mode = 'private';
    menuForm.mode = 'private';
    $('.menu-select').hide();
    this.privateServerLabel(label);
  }

  privateServerLabel(text) {
    const { document } = this.systems;
    let labelEl = document.getElementById('private-server-label');
    if (!labelEl) {
      labelEl = document.createElement('div');
      labelEl.id = 'private-server-label';
      labelEl.style.cssText =
        'text-align:center;padding:8px 16px;background:#292c3d;color:#8590a6;font-size:13px;margin-bottom:10px;letter-spacing:0.5px;text-transform:uppercase;';
      const playBox = document.querySelector('.menu-play');
      if (playBox) {
        playBox.prepend(labelEl);
      }
    }
    labelEl.innerHTML = '<i class="fas fa-server" style="color:#3366ff;margin-right:6px;"></i>';
    labelEl.appendChild(document.createTextNode(text));
  }

  updateTime() {
    const { document } = this.systems;
    let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timeZone === null || timeZone === '') {
      timeZone = 'Europe/Amsterdam';
    }
    let zoneId = '_z' + this.zones[timeZone];
    if (this.zones[timeZone] === undefined) {
      zoneId = '_z700';
    }
    const timeEl = document.getElementById('time');
    const span = document.createElement('span');
    span.setAttribute('id', zoneId);
    timeEl.appendChild(span);
    const script = document.createElement('script');
    script.src = '//widget.time.is/t.js';
    const body = document.getElementsByTagName('body')[0];
    body.appendChild(script);
    script.onload = () => {
      const config = {};
      config[zoneId] = {};
      time_is_widget.init(config); // 由 //widget.time.is/t.js 提供的全局
    };
  }

  skins() {
    const { $ } = this.systems;
    // 点击皮肤输入框以外区域时,收起输入框并显示预览
    $(document).on('click', event => {
      if (event.target.id !== 'skin' && event.target.id !== 'skin1-preview') {
        $('#skin').hide();
        $('#skin1-preview').show();
      }
      if (event.target.id !== 'skin2' && event.target.id !== 'skin2-preview') {
        $('#skin2').hide();
        $('#skin2-preview').show();
      }
    });
    $('#skin1-preview').on('click', () => {
      $('#skin1-preview').hide();
      $('#skin').show();
    });
    $('#skin2-preview').on('click', () => {
      $('#skin2-preview').hide();
      $('#skin2').show();
    });
  }

  regions() {
    const { $, store, menuForm, gameConnection } = this.systems;
    const applyModeAvailability = region => {
      const available = region === 'america' ? AMERICAN_MODES
        : region === 'asia' ? ASIAN_MODES : EUROPEAN_MODES;
      // 怪癖:始终遍历完整欧服列表(而非当前区服列表)
      EUROPEAN_MODES.forEach(mode => {
        const el = document.getElementById(mode);
        if (!el) {
          return;
        }
        if (available.includes(mode)) {
          el.style.opacity = '';
          el.style.pointerEvents = '';
        } else {
          el.style.opacity = '0.35';
          el.style.pointerEvents = 'none';
          // 当前模式不可用时回落 domination
          if (this.mode === mode) {
            this.mode = 'domination';
            menuForm.mode = 'domination';
            store.set('profiles', 'mode', 'domination');
            $('.menu-list > li > a').removeClass('is-active');
            $('#domination').addClass('is-active');
          }
        }
      });
    };
    const selectRegion = (region, selector) => {
      menuForm.hash = null;
      this.region = region;
      gameConnection.region = region;
      $('.button-group .button').removeClass('is-active');
      $(selector).addClass('is-active');
      store.set('profiles', 'region', region);
      menuForm.region = region;
      applyModeAvailability(region);
      this.refreshServerCounts();
      gameConnection.connect(this.mode);
    };
    applyModeAvailability(this.region);
    $('#europe').on('click', () => selectRegion('europe', '#europe'));
    $('#america').on('click', () => selectRegion('america', '#america'));
    // 亚洲服(本地 C# 服):AS 按钮原版为禁用占位,本地解锁接入
    $('#asia').on('click', () => selectRegion('asia', '#asia'));
  }

  modes() {
    const { $, store, menuForm, gameConnection } = this.systems;
    // 任意模式链接点击:先移除所有 active,再由具体处理器点亮
    $('.menu-list > li > a').on('click', function () {
      $('.menu-list > li > a').each(function () {
        $(this).removeClass('is-active');
      });
    });
    for (const mode of MODE_IDS) {
      $('#' + mode).on('click', () => {
        menuForm.hash = null;
        this.mode = mode;
        $('#' + mode).addClass('is-active');
        gameConnection.connect(this.mode);
        menuForm.mode = this.mode;
        store.set('profiles', 'mode', this.mode);
      });
    }
  }

  recordHandlers() {
    const { $, gameConnection, player, menu } = this.systems;
    $('.field>input[type="file"]').change(event => {
      player.readFile(event);
    });
    $('#replay-stop').click(() => {
      player.stopRendering();
      this.open();
      player.divManager.style.display = 'none';
      player.startedReplay = false;
    });
    $('#replay-restart').click(() => {
      if (player.replayInterval) {
        clearInterval(player.replayInterval);
        gameConnection.resetData();
        player.setCustomInterval();
      }
    });
    $('#replay-play').click(() => {
      player.isPaused = false;
    });
    $('#replay-pause').click(() => {
      player.isPaused = true;
    });
  }

  buttons() {
    const {
      $,
      menuForm,
      spectatorTab,
      settingsPanel,
      hotkeysPanel,
      theme,
      importExport,
      instantReplay,
      minimap,
      targetingHud,
      keyboard,
      grid,
      player,
    } = this.systems;
    $('#button-settings').click(() => {
      this.closeSubMenus();
      settingsPanel.toggle();
    });
    $('#button-play').click(() => {
      if ($('#button-play').attr('disabled')) {
        return;
      }
      this.play();
    });
    $('#button-spectate').click(() => {
      this.close();
      if (!menuForm.isAlive) {
        spectatorTab.isSpectating = true;
        spectatorTab.targetViewport = 0.1;
        // 怪癖:直接读取 SpectatorTab 的 _lastFreeSpectate 私有字段(原实现如此)
        keyboard.spectate(spectatorTab._lastFreeSpectate);
      }
    });
    $('#button-inputs').click(() => {
      this.closeSubMenus();
      hotkeysPanel.toggle();
    });
    $('#button-theme').click(() => {
      this.closeSubMenus();
      theme.toggle();
    });
    $('#button-import-export').click(() => {
      this.closeSubMenus();
      importExport.toggle();
    });
    $('#button-instant-replay').click(() => {
      this.closeSubMenus();
      instantReplay.toggle();
    });
    $('.import-export-container>.row>input[type="file"]').change(event => {
      importExport.import(event);
    });
    $('#export').click(() => {
      importExport.export();
    });
    $('#reset').click(() => {
      importExport.reset();
    });
    $('#minimap-show-1').click(() => {
      $('#minimap-show-' + minimap.selector).removeClass('active');
      $('#minimap-show-1').addClass('active');
      minimap.selector = 1;
    });
    $('#minimap-show-2').click(() => {
      $('#minimap-show-' + minimap.selector).removeClass('active');
      $('#minimap-show-2').addClass('active');
      minimap.selector = 2;
    });
    $('#minimap-show-0').click(() => {
      $('#minimap-show-' + minimap.selector).removeClass('active');
      $('#minimap-show-0').addClass('active');
      minimap.selector = 0;
    });
    $('#spectate-mode-top').click(() => {
      this.spectateModeTop();
    });
    $('#spectate-mode-mouse').click(() => {
      this.spectateModeMouse();
    });
    $('#spectate-mode-target').click(() => {
      this.spectateModeTarget();
    });
    $('#spectate-zoom-in').click(() => {
      spectatorTab.targetViewport /= 0.92;
      if (spectatorTab.targetViewport > 2) {
        spectatorTab.targetViewport = 2;
      }
    });
    $('#spectate-zoom-out').click(() => {
      spectatorTab.targetViewport *= 0.92;
      if (spectatorTab.targetViewport < 0.02) {
        spectatorTab.targetViewport = 0.02;
      }
    });
    $('#spectate-center').click(() => {
      if (!spectatorTab.isSpectating) {
        return;
      }
      spectatorTab.centerLock = true;
      spectatorTab.spectatePoint.x = grid.center.x;
      spectatorTab.spectatePoint.y = grid.center.y;
      targetingHud.centerViewport();
    });
  }

  play() {
    const { keyboard } = this.systems;
    this.close();
    keyboard.spawn();
  }

  closeSubMenus() {
    const { hotkeysPanel, settingsPanel, theme, importExport, instantReplay } = this.systems;
    hotkeysPanel.close();
    settingsPanel.close();
    theme.close();
    importExport.close();
    instantReplay.close();
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
    if (this.div && this.div.fadeOut) {
      this.div.fadeOut(250);
    }
  }

  open() {
    this.isOpened = true;
    if (this.div && this.div.fadeIn) {
      this.div.fadeIn(250);
    }
  }

  spectateModeTop() {
    const { menuForm, spectatorTab, player, targetingHud, keyboard } = this.systems;
    if (menuForm.isAlive || !spectatorTab.isSpectating) {
      return;
    }
    spectatorTab.centerLock = false;
    if (player.startedReplay) {
      player.setReplaySpectateMode('top');
      return;
    }
    // 怪癖:仅当已处于自由观战时才动作(原实现条件即 !freeSpectate → return)
    if (!spectatorTab.freeSpectate) {
      return;
    }
    targetingHud.topViewport();
    keyboard.freeSpectate();
  }

  spectateModeMouse() {
    const { menuForm, spectatorTab, player, targeting, targetingHud, keyboard } = this.systems;
    if (menuForm.isAlive || !spectatorTab.isSpectating) {
      return;
    }
    spectatorTab.centerLock = false;
    if (player.startedReplay) {
      player.setReplaySpectateMode('mouse');
      return;
    }
    if (spectatorTab.freeSpectate && !targeting.isTurnedOn) {
      return;
    }
    if (targeting.isTurnedOn) {
      targeting.target1.turnedOn = false;
      targeting.target2.turnedOn = false;
      targetingHud.mouseViewport();
    } else {
      keyboard.freeSpectate();
      targetingHud.mouseViewport();
    }
  }

  spectateModeTarget() {
    const { menuForm, spectatorTab, player, keyboard, targetingHud } = this.systems;
    if (menuForm.isAlive || !spectatorTab.isSpectating) {
      return;
    }
    spectatorTab.centerLock = false;
    if (player.startedReplay) {
      player.setReplaySpectateMode('target');
      return;
    }
    if (!spectatorTab.freeSpectate) {
      keyboard.freeSpectate();
    }
    targetingHud.targetMode();
  }
}
