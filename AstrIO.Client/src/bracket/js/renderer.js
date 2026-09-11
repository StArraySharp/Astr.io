/* eslint-env browser */
/* global BracketGenerator, openScoreModal, currentBracket */

/**
 * BracketRenderer - renders bracket as HTML match cards with SVG connectors.
 * Supports pan (drag) and zoom (wheel) on the bracket canvas.
 */
var BracketRenderer = (function () {
  var MW = BracketGenerator.MATCH_W; // 230
  var MH = BracketGenerator.MATCH_H; // 66
  var PAD = 28;
  var HEADER_H = 38; // reserved at top for round column labels

  // ---- Round name helpers ----

  function getRoundName(idx, total) {
    var fromEnd = total - 1 - idx;
    if (fromEnd === 0) return "Final";
    if (fromEnd === 1) return "Semifinal";
    if (fromEnd === 2) return "Quarterfinal";
    if (fromEnd === 3) return "Ro16";
    if (fromEnd === 4) return "Ro32";
    if (fromEnd === 5) return "Ro64";
    return "Round " + (idx + 1);
  }

  // ---- Main render ----

  function render(layout, matches, pMap, isManager) {
    var positions = layout.positions;

    var canvasW = layout.width + PAD * 2;
    var canvasH = layout.height + PAD * 2 + HEADER_H;

    // Viewport — the visible window, handles overflow
    var viewport = document.createElement("div");
    viewport.className = "bk-viewport";

    // Canvas — absolute, transform target for pan/zoom
    var canvas = document.createElement("div");
    canvas.className = "bk-canvas";
    canvas.style.width = canvasW + "px";
    canvas.style.height = canvasH + "px";

    // SVG connector layer (pointer-events: none)
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "bk-connectors-svg");
    svg.setAttribute("width", canvasW);
    svg.setAttribute("height", canvasH);

    for (var ci = 0; ci < layout.connectors.length; ci++) {
      var c = layout.connectors[ci];
      renderConnector(
        svg,
        c.x1 + PAD, c.y1 + PAD + HEADER_H,
        c.x2 + PAD, c.y2 + PAD + HEADER_H,
        c.type
      );
    }
    canvas.appendChild(svg);

    // ---- Analyse layout sections/rounds ----

    var sections = {};
    for (var pid in positions) {
      var p = positions[pid];
      if (!sections[p.section]) sections[p.section] = {};
      if (!sections[p.section][p.round]) sections[p.section][p.round] = p.x;
      // keep minimum x per round (multiple matches, same x)
    }

    var hasLosers    = !!sections.losers;
    var hasThirdPlace = !!sections.third_place;

    // ---- Column headers ----

    if (sections.winners) {
      var wRounds = sortedKeys(sections.winners);
      var totalWR  = wRounds.length;
      for (var wi = 0; wi < wRounds.length; wi++) {
        var rn  = wRounds[wi];
        var rx  = sections.winners[rn];
        var lbl = hasLosers
          ? (wi === totalWR - 1 ? "WB Final" : "WB R" + (wi + 1))
          : getRoundName(wi, totalWR);
        addColumnHeader(canvas, rx + PAD, lbl, "winners");
      }
    }

    if (sections.losers) {
      var lRounds = sortedKeys(sections.losers);
      for (var li = 0; li < lRounds.length; li++) {
        var lrn  = lRounds[li];
        var lx   = sections.losers[lrn];
        var llbl = li === lRounds.length - 1 ? "LB Final" : "LB R" + (li + 1);
        addColumnHeader(canvas, lx + PAD, llbl, "losers");
      }
    }

    if (sections.grand_final) {
      var gfRounds = sortedKeys(sections.grand_final);
      addColumnHeader(canvas, sections.grand_final[gfRounds[0]] + PAD, "Grand Final", "grand_final");
    }

    // ---- Section banners (WB / LB / 3rd Place) ----

    if (hasLosers) {
      var lbMinY = 9e9;
      for (var mid in positions) {
        if (positions[mid].section === "losers" && positions[mid].y < lbMinY)
          lbMinY = positions[mid].y;
      }
      addSectionBanner(canvas, PAD, HEADER_H + PAD - 18, "WINNERS BRACKET");
      addSectionBanner(canvas, PAD, lbMinY + PAD + HEADER_H - 18, "LOSERS BRACKET");
    }

    if (hasThirdPlace) {
      var tpMinY = 9e9;
      for (var mid2 in positions) {
        if (positions[mid2].section === "third_place" && positions[mid2].y < tpMinY)
          tpMinY = positions[mid2].y;
      }
      addSectionBanner(canvas, PAD, tpMinY + PAD + HEADER_H - 18, "3RD PLACE");
    }

    // ---- Match cards ----

    for (var mi = 0; mi < matches.length; mi++) {
      var match = matches[mi];
      var mPos  = positions[match.id];
      if (!mPos) continue;

      var card = buildMatchCard(match, pMap, isManager);
      card.style.left = (mPos.x + PAD) + "px";
      card.style.top  = (mPos.y + PAD + HEADER_H) + "px";
      canvas.appendChild(card);
    }

    viewport.appendChild(canvas);
    setupPanZoom(viewport, canvas);
    return viewport;
  }

  // ---- Column header ----

  function addColumnHeader(canvas, x, label, section) {
    var h = document.createElement("div");
    h.className = "bk-col-header";
    if (section === "losers")     h.classList.add("bk-col-header-lb");
    if (section === "grand_final") h.classList.add("bk-col-header-gf");
    h.style.left  = x + "px";
    h.style.width = MW + "px";
    h.style.top   = Math.round(HEADER_H * 0.18) + "px";
    h.textContent = label;
    canvas.appendChild(h);
  }

  // ---- Section banner ----

  function addSectionBanner(canvas, x, y, label) {
    var d = document.createElement("div");
    d.className = "bk-section-banner";
    d.style.left = x + "px";
    d.style.top  = y + "px";
    d.textContent = label;
    canvas.appendChild(d);
  }

  // ---- Match card ----

  function buildMatchCard(match, pMap, isManager) {
    var p1 = pMap[match.participant1_id] || null;
    var p2 = pMap[match.participant2_id] || null;

    var isBye       = match.status === "bye";
    var isCompleted = match.status === "completed";
    var isReady     = match.status === "ready";
    var p1Win = isCompleted && match.winner_id === match.participant1_id;
    var p2Win = isCompleted && match.winner_id === match.participant2_id;

    var clickable = isManager && (isReady || isCompleted) &&
      (match.participant1_id || match.participant2_id);

    var card = document.createElement("div");
    card.className = "bk-match";
    if (isCompleted) card.dataset.status = "completed";
    else if (isReady) card.dataset.status = "ready";
    else if (isBye)   card.dataset.status = "bye";
    if (clickable)    card.classList.add("bk-match-clickable");

    // Match number pill (top-right)
    if (match.match_number) {
      var num = document.createElement("div");
      num.className = "bk-match-num";
      num.textContent = "M" + match.match_number;
      card.appendChild(num);
    }

    // Player rows
    var p1Label = isBye ? "BYE" : null;
    var p2Label = isBye ? ""    : null;

    card.appendChild(buildPlayerRow(p1, p1Label, match.score1, p1Win, isCompleted, p1 ? p1.seed : null));

    var divider = document.createElement("div");
    divider.className = "bk-divider";
    card.appendChild(divider);

    card.appendChild(buildPlayerRow(p2, p2Label, match.score2, p2Win, isCompleted, p2 ? p2.seed : null));

    // Click to report score
    if (clickable) {
      card.addEventListener("click", function (e) {
        e.stopPropagation();
        if (typeof openScoreModal === "function" &&
            typeof currentBracket !== "undefined" && currentBracket) {
          openScoreModal(currentBracket.id, match, pMap);
        }
      });
    }

    return card;
  }

  function buildPlayerRow(participant, forceLabel, score, isWinner, showScore, seed) {
    var row = document.createElement("div");
    row.className = "bk-player" + (isWinner ? " winner" : "");

    // Seed bubble
    if (seed != null) {
      var seedEl = document.createElement("span");
      seedEl.className = "bk-seed";
      seedEl.textContent = seed;
      row.appendChild(seedEl);
    }

    // Name
    var nameEl = document.createElement("span");
    nameEl.className = "bk-name";

    if (forceLabel !== null) {
      // Explicit label (BYE or empty)
      if (forceLabel) {
        nameEl.classList.add("bk-bye");
        nameEl.textContent = forceLabel;
      } else {
        nameEl.classList.add("bk-tbd");
        nameEl.textContent = "\u00a0";
      }
    } else if (!participant) {
      nameEl.classList.add("bk-tbd");
      nameEl.textContent = "TBD";
    } else {
      nameEl.textContent = participant.name;
      if (participant.team_tag) {
        var tag = document.createElement("span");
        tag.className = "bk-tag";
        tag.textContent = " [" + participant.team_tag + "]";
        nameEl.appendChild(tag);
      }
    }
    row.appendChild(nameEl);

    // Score
    if (showScore && score != null && forceLabel === null) {
      var scoreEl = document.createElement("span");
      scoreEl.className = "bk-score" + (isWinner ? " bk-score-win" : "");
      scoreEl.textContent = score;
      row.appendChild(scoreEl);
    }

    return row;
  }

  // ---- SVG connector ----

  function renderConnector(svg, x1, y1, x2, y2, type) {
    var midX = Math.round(x1 + (x2 - x1) / 2);
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute(
      "d",
      "M" + x1 + "," + y1 + " H" + midX + " V" + y2 + " H" + x2
    );
    path.setAttribute("class", type === "loser" ? "bk-connector bk-connector-loser" : "bk-connector");
    svg.appendChild(path);
  }

  // ---- Pan / Zoom ----

  function setupPanZoom(viewport, canvas) {
    var scale    = 1;
    var MIN      = 0.25;
    var MAX      = 2.5;
    var tx       = 0;
    var ty       = 0;
    var dragging = false;
    var ox, oy, stx, sty;

    function applyTransform() {
      canvas.style.transform =
        "translate(" + tx + "px," + ty + "px) scale(" + scale + ")";
    }

    viewport.addEventListener("mousedown", function (e) {
      if (e.button !== 0) return;
      // Don't hijack clicks on match cards
      var t = e.target;
      while (t && t !== viewport) {
        if (t.classList && t.classList.contains("bk-match")) return;
        t = t.parentElement;
      }
      dragging = true;
      ox = e.clientX; oy = e.clientY;
      stx = tx; sty = ty;
      viewport.style.cursor = "grabbing";
      e.preventDefault();
    });

    window.addEventListener("mousemove", function (e) {
      if (!dragging) return;
      tx = stx + (e.clientX - ox);
      ty = sty + (e.clientY - oy);
      applyTransform();
    });

    window.addEventListener("mouseup", function () {
      if (!dragging) return;
      dragging = false;
      viewport.style.cursor = "grab";
    });

    viewport.addEventListener(
      "wheel",
      function (e) {
        e.preventDefault();
        var next = scale * (e.deltaY < 0 ? 1.1 : 0.9);
        next = Math.max(MIN, Math.min(MAX, next));
        if (next === scale) return;

        var rect = viewport.getBoundingClientRect();
        var mx = e.clientX - rect.left;
        var my = e.clientY - rect.top;

        // Scale around the mouse cursor
        tx = mx - (mx - tx) * (next / scale);
        ty = my - (my - ty) * (next / scale);
        scale = next;
        applyTransform();
      },
      { passive: false }
    );

    // Touch pan support
    var lastTouchX, lastTouchY;
    viewport.addEventListener("touchstart", function (e) {
      if (e.touches.length === 1) {
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
      }
    }, { passive: true });

    viewport.addEventListener("touchmove", function (e) {
      if (e.touches.length === 1) {
        tx += e.touches[0].clientX - lastTouchX;
        ty += e.touches[0].clientY - lastTouchY;
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
        applyTransform();
        e.preventDefault();
      }
    }, { passive: false });
  }

  // ---- Utility ----

  function sortedKeys(obj) {
    return Object.keys(obj).map(Number).sort(function (a, b) { return a - b; });
  }

  return { render: render };
})();
