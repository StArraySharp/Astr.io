/**
 * TournamentOverlay — 锦标赛横幅与结算面板(原名 `bx`,const 对象字面量)。
 *
 * 行为:
 *  - showCheckpoint(data):data = {num, total, entries[{position, name,
 *    roundPoints, totalPoints, mass}]}。移除旧 #tournament-checkpoint-banner
 *    并清掉未触发的隐藏定时器;拼 tcp-header("Checkpoint <num>/<total>")
 *    + tcp-table(最多前 5 名,前三名附加 tcp-gold/silver/bronze;
 *    名字经 escapeHtml,质量经 formatMass;Round 列以 "+<pts>" 呈现);
 *    无人得分时显示 tcp-empty("No players scored")。挂到 body 后 10ms
 *    加 .visible,6s 后移除 .visible 再 500ms 后 remove。
 *  - showFinalResults(data):data = {mode, entries[{position, name,
 *    totalPoints, checkpoints[]}], checkpointCount}。先 Chat.serverTimer(0)
 *    停服务器计时(怪癖:原以 typeof bm !== "undefined" 守卫声明顺序,
 *    此处等价为可选注入);#tournament-results-overlay 缺失时直接返回。
 *    mode === 1 → "Clan Tournament Results",否则 "Tournament Results",
 *    标题后缀 " - End of Round (EOR)"。领奖台按 [1,0,2] 顺序(2nd-1st-3rd)
 *    渲染,空位补 tr-podium-empty;积分表逐检查点列出(最后一列 EOR,
 *    其余 "CP<n>";得分 ≥8 的单元格加 tr-high;第 1 名行 tr-winner,
 *    前 3 名行 tr-top3)。
 *  - hide():移除 #tournament-results-overlay 的 .visible。
 *
 * 消费方:协议 176 号包 tournamentData()(0=checkpoint,1=final)。
 */

export default class TournamentOverlay {
  /**
   * @param {Object} systems
   * @param {Document} systems.document — 原 a8
   * @param {(text: string) => string} systems.escapeHtml — 原 by(util/format)
   * @param {(mass: number) => string} systems.formatMass — 原 bz(util/format)
   * @param {Object} [systems.Chat] — serverTimer(0)(原 bm;可选,对应 typeof 守卫)
   */
  constructor(systems) {
    this.doc = systems.document;
    this.escapeHtml = systems.escapeHtml;
    this.formatMass = systems.formatMass;
    this.chat = systems.Chat;
    this._bannerTimer = null;
  }

  /** 检查点横幅:data = {num, total, entries[]}(见文件头)。 */
  showCheckpoint(data) {
    const existing = this.doc.getElementById('tournament-checkpoint-banner');
    if (existing) {
      existing.remove();
    }
    if (this._bannerTimer) {
      clearTimeout(this._bannerTimer);
    }
    let html =
      '<div class="tcp-header"><i class="fas fa-flag-checkered"></i> Checkpoint ' + data.num + '/' + data.total + '</div>';
    if (data.entries.length > 0) {
      html += '<table class="tcp-table"><thead><tr><th>#</th><th>Name</th><th>Round</th><th>Total</th><th>Mass</th></tr></thead><tbody>';
      const rows = Math.min(data.entries.length, 5);
      for (let i = 0; i < rows; i++) {
        const entry = data.entries[i];
        const medal = i === 0 ? ' tcp-gold' : i === 1 ? ' tcp-silver' : i === 2 ? ' tcp-bronze' : '';
        html +=
          '<tr class="' + medal + '"><td>' + entry.position + '</td><td>' + this.escapeHtml(entry.name) +
          '</td><td>+' + entry.roundPoints + '</td><td>' + entry.totalPoints + '</td><td>' +
          this.formatMass(entry.mass) + '</td></tr>';
      }
      html += '</tbody></table>';
    } else {
      html += '<div class="tcp-empty">No players scored</div>';
    }
    const banner = this.doc.createElement('div');
    banner.id = 'tournament-checkpoint-banner';
    banner.innerHTML = html;
    this.doc.body.appendChild(banner);
    setTimeout(function () {
      banner.classList.add('visible');
    }, 10);
    this._bannerTimer = setTimeout(function () {
      banner.classList.remove('visible');
      setTimeout(function () {
        banner.remove();
      }, 500);
    }, 6000);
  }

  /** 结算面板:data = {mode, entries[], checkpointCount}(见文件头)。 */
  showFinalResults(data) {
    if (this.chat) {
      this.chat.serverTimer(0);
    }
    const overlay = this.doc.getElementById('tournament-results-overlay');
    if (!overlay) {
      return;
    }
    const headerText = data.mode === 1 ? 'Clan Tournament Results' : 'Tournament Results';
    const headerEl = this.doc.getElementById('tournament-results-header');
    headerEl.innerHTML = '<i class="fas fa-trophy"></i> ' + headerText + ' - End of Round (EOR)';
    const podiumEl = this.doc.getElementById('tournament-results-podium');
    let podium = '<div class="tr-podium">';
    const medalIcons = [
      '<i class="fas fa-medal tr-gold"></i>',
      '<i class="fas fa-medal tr-silver"></i>',
      '<i class="fas fa-medal tr-bronze"></i>',
    ];
    // 渲染顺序:亚军、冠军、季军。
    const displayOrder = [1, 0, 2];
    for (let i = 0; i < displayOrder.length; i++) {
      const rank = displayOrder[i];
      const cls = rank === 0 ? 'tr-podium-1st' : rank === 1 ? 'tr-podium-2nd' : 'tr-podium-3rd';
      if (rank < data.entries.length) {
        const entry = data.entries[rank];
        podium +=
          '<div class="tr-podium-entry ' + cls + '">' + medalIcons[rank] + '<div class="tr-podium-name">' +
          this.escapeHtml(entry.name) + '</div><div class="tr-podium-pts">' + entry.totalPoints + ' pts</div></div>';
      } else {
        podium += '<div class="tr-podium-entry ' + cls + ' tr-podium-empty"></div>';
      }
    }
    podium += '</div>';
    podiumEl.innerHTML = podium;
    const tableEl = this.doc.getElementById('tournament-results-table');
    let table = '<table class="tr-table"><thead><tr><th>#</th><th>Name</th>';
    for (let cp = 1; cp <= data.checkpointCount; cp++) {
      table += '<th>' + (cp === data.checkpointCount ? 'EOR' : 'CP' + cp) + '</th>';
    }
    table += '<th>Total</th></tr></thead><tbody>';
    for (let i = 0; i < data.entries.length; i++) {
      const entry = data.entries[i];
      const rowCls = i === 0 ? ' tr-winner' : i < 3 ? ' tr-top3' : '';
      table += '<tr class="' + rowCls + '"><td>' + entry.position + '</td><td>' + this.escapeHtml(entry.name) + '</td>';
      for (let cp = 0; cp < data.checkpointCount; cp++) {
        const points = entry.checkpoints[cp] || 0;
        table += '<td' + (points >= 8 ? ' class="tr-high"' : '') + '>' + points + '</td>';
      }
      table += '<td class="tr-total">' + entry.totalPoints + '</td></tr>';
    }
    table += '</tbody></table>';
    tableEl.innerHTML = table;
    overlay.classList.add('visible');
  }

  hide() {
    const overlay = this.doc.getElementById('tournament-results-overlay');
    if (overlay) {
      overlay.classList.remove('visible');
    }
  }
}
