/* eslint-env browser */

/**
 * BracketGenerator - computes layout positions for bracket matches.
 */
var BracketGenerator = (function () {
  var MATCH_W = 230;
  var MATCH_H = 66; // 33px per player row
  var H_GAP = 80;
  var V_GAP = 24;
  var SECTION_GAP = 60;

  function computeLayout(matches, format) {
    if (format === "double_elim") return layoutDoubleElim(matches);
    return layoutSingleElim(matches);
  }

  function layoutSingleElim(matches) {
    var winners = matches.filter(function (m) {
      return m.bracket_section === "winners";
    });
    var thirdPlace = matches.filter(function (m) {
      return m.bracket_section === "third_place";
    });

    var rounds = groupByRound(winners);
    var roundNums = Object.keys(rounds)
      .map(Number)
      .sort(function (a, b) { return a - b; });
    if (!roundNums.length)
      return { positions: {}, connectors: [], width: 0, height: 0 };

    var positions = {};
    var connectors = [];

    var maxR1Matches = rounds[roundNums[0]] ? rounds[roundNums[0]].length : 0;
    var totalH = maxR1Matches * (MATCH_H + V_GAP) - V_GAP;

    for (var ri = 0; ri < roundNums.length; ri++) {
      var rn = roundNums[ri];
      var rMatches = rounds[rn] || [];
      var x = ri * (MATCH_W + H_GAP);
      var matchSpacing = totalH / rMatches.length;
      var startY = (matchSpacing - MATCH_H) / 2;

      for (var mi = 0; mi < rMatches.length; mi++) {
        var y = startY + mi * matchSpacing;
        positions[rMatches[mi].id] = { x: x, y: y, section: "winners", round: rn };
      }
    }

    if (thirdPlace.length) {
      var lastX = (roundNums.length - 1) * (MATCH_W + H_GAP);
      positions[thirdPlace[0].id] = {
        x: lastX,
        y: totalH + SECTION_GAP,
        section: "third_place",
        round: thirdPlace[0].round,
      };
    }

    for (var i = 0; i < matches.length; i++) {
      var match = matches[i];
      var pos = positions[match.id];
      if (!pos) continue;
      if (match.next_winner_match_id && positions[match.next_winner_match_id]) {
        var nextPos = positions[match.next_winner_match_id];
        connectors.push({
          x1: pos.x + MATCH_W, y1: pos.y + MATCH_H / 2,
          x2: nextPos.x,       y2: nextPos.y + MATCH_H / 2,
          type: "winner",
        });
      }
      if (match.next_loser_match_id && positions[match.next_loser_match_id]) {
        var lPos = positions[match.next_loser_match_id];
        connectors.push({
          x1: pos.x + MATCH_W, y1: pos.y + MATCH_H / 2,
          x2: lPos.x,          y2: lPos.y + MATCH_H / 2,
          type: "loser",
        });
      }
    }

    var width = roundNums.length * (MATCH_W + H_GAP);
    var height = totalH + (thirdPlace.length ? SECTION_GAP + MATCH_H + 20 : 20);
    return { positions: positions, connectors: connectors, width: width, height: height };
  }

  function layoutDoubleElim(matches) {
    var winners = matches.filter(function (m) { return m.bracket_section === "winners"; });
    var losers = matches.filter(function (m) { return m.bracket_section === "losers"; });
    var grandFinal = matches.filter(function (m) { return m.bracket_section === "grand_final"; });

    var wbRounds = groupByRound(winners);
    var lbRounds = groupByRound(losers);
    var wbRoundNums = Object.keys(wbRounds).map(Number).sort(function (a, b) { return a - b; });
    var lbRoundNums = Object.keys(lbRounds).map(Number).sort(function (a, b) { return a - b; });

    var positions = {};
    var connectors = [];

    var wbR1Count = wbRounds[wbRoundNums[0]] ? wbRounds[wbRoundNums[0]].length : 0;
    var wbTotalH = wbR1Count * (MATCH_H + V_GAP) - V_GAP;

    for (var ri = 0; ri < wbRoundNums.length; ri++) {
      var rn = wbRoundNums[ri];
      var rMatches = wbRounds[rn] || [];
      var x = ri * (MATCH_W + H_GAP);
      var matchSpacing = wbTotalH / Math.max(rMatches.length, 1);
      var startY = (matchSpacing - MATCH_H) / 2;
      for (var mi = 0; mi < rMatches.length; mi++) {
        positions[rMatches[mi].id] = { x: x, y: startY + mi * matchSpacing, section: "winners", round: rn };
      }
    }

    var lbTop = wbTotalH + SECTION_GAP;
    var lbR1Count = lbRounds[lbRoundNums[0]] ? lbRounds[lbRoundNums[0]].length : 0;
    var lbTotalH = Math.max(lbR1Count * (MATCH_H + V_GAP), MATCH_H);

    for (var lri = 0; lri < lbRoundNums.length; lri++) {
      var lrn = lbRoundNums[lri];
      var lrMatches = lbRounds[lrn] || [];
      var lx = Math.floor(lri / 2) * (MATCH_W + H_GAP) + (lri % 2 === 1 ? (MATCH_W + H_GAP) / 2 : 0);
      var lMatchSpacing = lbTotalH / Math.max(lrMatches.length, 1);
      var lStartY = lbTop + (lMatchSpacing - MATCH_H) / 2;
      for (var lmi = 0; lmi < lrMatches.length; lmi++) {
        positions[lrMatches[lmi].id] = { x: lx, y: lStartY + lmi * lMatchSpacing, section: "losers", round: lrn };
      }
    }

    var gfX = wbRoundNums.length * (MATCH_W + H_GAP);
    var gfY = wbTotalH / 2 - MATCH_H / 2;
    for (var gi = 0; gi < grandFinal.length; gi++) {
      positions[grandFinal[gi].id] = {
        x: gfX, y: gfY + gi * (MATCH_H + V_GAP),
        section: "grand_final", round: grandFinal[gi].round,
      };
    }

    for (var i = 0; i < matches.length; i++) {
      var match = matches[i];
      var pos = positions[match.id];
      if (!pos) continue;
      if (match.next_winner_match_id && positions[match.next_winner_match_id]) {
        var nextPos = positions[match.next_winner_match_id];
        connectors.push({ x1: pos.x + MATCH_W, y1: pos.y + MATCH_H / 2, x2: nextPos.x, y2: nextPos.y + MATCH_H / 2, type: "winner" });
      }
      if (match.next_loser_match_id && positions[match.next_loser_match_id]) {
        var lPos = positions[match.next_loser_match_id];
        connectors.push({ x1: pos.x + MATCH_W, y1: pos.y + MATCH_H / 2, x2: lPos.x, y2: lPos.y + MATCH_H / 2, type: "loser" });
      }
    }

    var totalW = (wbRoundNums.length + 1) * (MATCH_W + H_GAP) + MATCH_W;
    var totalH = lbTop + lbTotalH + 40;
    if (grandFinal.length > 1) totalH = Math.max(totalH, gfY + grandFinal.length * (MATCH_H + V_GAP) + 40);

    return { positions: positions, connectors: connectors, width: totalW, height: totalH };
  }

  function groupByRound(matches) {
    var groups = {};
    for (var i = 0; i < matches.length; i++) {
      var r = matches[i].round;
      if (!groups[r]) groups[r] = [];
      groups[r].push(matches[i]);
    }
    for (var key in groups) {
      groups[key].sort(function (a, b) { return a.match_number - b.match_number; });
    }
    return groups;
  }

  return { computeLayout: computeLayout, MATCH_W: MATCH_W, MATCH_H: MATCH_H };
})();
