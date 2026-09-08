/* eslint-env browser */
/* global BracketGenerator, BracketRenderer */

// ========== AUTH ==========

var TOKEN_KEY = "astrio_bracket_token";
var currentUser = null;
var currentView = "official";
var currentBracket = null;
var listOffset = 0;
var LIST_LIMIT = 20;

function authHeaders() {
  return { Authorization: "Bearer " + localStorage.getItem(TOKEN_KEY) };
}

async function api(method, path, body) {
  var opts = {
    method: method,
    headers: { "Content-Type": "application/json", ...authHeaders() },
  };
  if (body) opts.body = JSON.stringify(body);
  var res = await fetch("api/" + path, opts);
  var data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function escapeHtml(s) {
  var d = document.createElement("div");
  d.appendChild(document.createTextNode(s || ""));
  return d.innerHTML;
}

function showNotification(msg, type) {
  var el = document.createElement("div");
  el.className = "notification " + (type || "success");
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(function () {
    el.remove();
  }, 3000);
}

async function initAuth() {
  var token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    try {
      var data = await api("GET", "me");
      if (data && data.username) {
        currentUser = data;
        applyUser();
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    } catch (e) {
      localStorage.removeItem(TOKEN_KEY);
    }
  }
  if (!currentUser) applyGuest();
  document.body.style.visibility = "visible";
  loadDashboard();
}

function applyGuest() {
  var el = document.getElementById("header-user");
  el.innerHTML = '<a href="login.html" class="btn-primary btn-sm" style="text-decoration:none"><i class="fab fa-discord"></i> Login</a>';
  // Hide "My Brackets" tab and Create button for guests
  var mineBtn = document.querySelector('#main-nav button[data-view="mine"]');
  if (mineBtn) mineBtn.classList.add("hidden");
  var btnCreate = document.getElementById("btn-create");
  if (btnCreate) btnCreate.classList.add("hidden");
}

function applyUser() {
  document.body.style.visibility = "visible";
  var el = document.getElementById("header-user");
  var avatar = currentUser.avatar
    ? "https://cdn.discordapp.com/avatars/" +
      currentUser.discordId +
      "/" +
      currentUser.avatar +
      ".png?size=64"
    : "";
  el.innerHTML =
    (avatar ? '<img src="' + avatar + '" alt="" />' : "") +
    "<span>" +
    escapeHtml(currentUser.username) +
    "</span>";

  // Hide official option if no permission
  var optOff = document.getElementById("opt-official");
  if (
    optOff &&
    !currentUser.isRoot &&
    !(
      currentUser.permissions &&
      currentUser.permissions.create_official_tournament
    )
  ) {
    optOff.style.display = "none";
  }

  // Hide create button if no permission
  var btnCreate = document.getElementById("btn-create");
  if (
    !currentUser.isRoot &&
    !(currentUser.permissions && currentUser.permissions.create_bracket)
  ) {
    btnCreate.classList.add("hidden");
  }
}

// ========== NAVIGATION ==========

function showView(name) {
  document
    .getElementById("view-dashboard")
    .classList.toggle("hidden", name !== "dashboard");
  document
    .getElementById("view-create")
    .classList.toggle("hidden", name !== "create");
  document
    .getElementById("view-bracket")
    .classList.toggle("hidden", name !== "bracket");
}

// Nav tabs
document.querySelectorAll("#main-nav button").forEach(function (btn) {
  btn.addEventListener("click", function () {
    if (btn.dataset.view === "mine" && !currentUser) {
      window.location.href = "login.html";
      return;
    }
    document.querySelectorAll("#main-nav button").forEach(function (b) {
      b.classList.remove("active");
    });
    btn.classList.add("active");
    currentView = btn.dataset.view;
    listOffset = 0;
    showView("dashboard");
    loadDashboard();
    updateDashboardTitle();
  });
});

document.getElementById("nav-home").addEventListener("click", function () {
  showView("dashboard");
  document.querySelectorAll("#main-nav button").forEach(function (b) {
    b.classList.remove("active");
  });
  document
    .querySelector('#main-nav button[data-view="official"]')
    .classList.add("active");
  currentView = "official";
  listOffset = 0;
  loadDashboard();
  updateDashboardTitle();
});

function updateDashboardTitle() {
  var titles = {
    official: "Official Tournaments",
    public: "Public Brackets",
    mine: "My Brackets",
  };
  document.getElementById("dashboard-title").textContent =
    titles[currentView] || "Brackets";
}

// Create button
document.getElementById("btn-create").addEventListener("click", function () {
  showView("create");
});
document.getElementById("create-back").addEventListener("click", function () {
  showView("dashboard");
});
document.getElementById("create-cancel").addEventListener("click", function () {
  showView("dashboard");
});

// Search + filter
var searchTimeout = null;
document.getElementById("search-input").addEventListener("input", function () {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(function () {
    listOffset = 0;
    loadDashboard();
  }, 300);
});
document
  .getElementById("filter-format")
  .addEventListener("change", function () {
    listOffset = 0;
    loadDashboard();
  });

// ========== DASHBOARD ==========

async function loadDashboard() {
  var listEl = document.getElementById("bracket-list");
  var emptyEl = document.getElementById("bracket-list-empty");
  var loadingEl = document.getElementById("bracket-list-loading");
  var pagEl = document.getElementById("pagination");

  listEl.innerHTML = "";
  emptyEl.classList.add("hidden");
  loadingEl.classList.remove("hidden");
  pagEl.innerHTML = "";

  var search = document.getElementById("search-input").value;
  var format = document.getElementById("filter-format").value;
  var url =
    "brackets?view=" +
    currentView +
    "&limit=" +
    LIST_LIMIT +
    "&offset=" +
    listOffset;
  if (search) url += "&search=" + encodeURIComponent(search);
  if (format) url += "&format=" + encodeURIComponent(format);

  try {
    var data = await api("GET", url);
    loadingEl.classList.add("hidden");

    var brackets = data.brackets || [];
    if (!brackets.length) {
      emptyEl.classList.remove("hidden");
      return;
    }

    for (var i = 0; i < brackets.length; i++)
      renderBracketCard(brackets[i], listEl);

    // Pagination
    if (listOffset > 0) {
      var prev = document.createElement("button");
      prev.className = "btn-secondary btn-sm";
      prev.textContent = "Previous";
      prev.addEventListener("click", function () {
        listOffset -= LIST_LIMIT;
        loadDashboard();
      });
      pagEl.appendChild(prev);
    }
    if (listOffset + LIST_LIMIT < (data.total || 0)) {
      var next = document.createElement("button");
      next.className = "btn-secondary btn-sm";
      next.textContent = "Next";
      next.addEventListener("click", function () {
        listOffset += LIST_LIMIT;
        loadDashboard();
      });
      pagEl.appendChild(next);
    }
  } catch (e) {
    loadingEl.classList.add("hidden");
    if (!currentUser && currentView === "mine") {
      window.location.href = "login.html";
      return;
    }
    emptyEl.classList.remove("hidden");
  }
}

var FORMAT_LABELS = {
  single_elim: "Single Elim",
  double_elim: "Double Elim",
  round_robin: "Round Robin",
  swiss: "Swiss",
  ffa: "FFA",
};

function renderBracketCard(b, container) {
  var card = document.createElement("div");
  card.className = "bracket-card";
  card.addEventListener("click", function () {
    openBracket(b.id);
  });

  var date = b.created_at ? new Date(b.created_at).toLocaleDateString() : "";
  card.innerHTML =
    '<div class="bracket-card-header">' +
    '<div class="bracket-card-title">' +
    escapeHtml(b.name) +
    "</div>" +
    "</div>" +
    '<div class="bracket-card-meta">' +
    '<span class="tag tag-format">' +
    (FORMAT_LABELS[b.format] || b.format) +
    "</span>" +
    '<span class="tag tag-' +
    b.visibility +
    '">' +
    b.visibility +
    "</span>" +
    '<span class="tag tag-' +
    b.status +
    '">' +
    b.status +
    "</span>" +
    "</div>" +
    '<div class="bracket-card-footer">' +
    '<div class="participants"><i class="fas fa-users"></i> ' +
    (b.participant_count || 0) +
    "</div>" +
    "<div>" +
    escapeHtml(b.creator_name || "") +
    " &middot; " +
    date +
    "</div>" +
    "</div>";
  container.appendChild(card);
}

// ========== CREATE BRACKET ==========

var selectedFormat = "single_elim";

document.querySelectorAll(".format-card").forEach(function (card) {
  card.addEventListener("click", function () {
    document.querySelectorAll(".format-card").forEach(function (c) {
      c.classList.remove("selected");
    });
    card.classList.add("selected");
    selectedFormat = card.dataset.format;
    updateFormatOptions();
  });
});

function updateFormatOptions() {
  document
    .getElementById("create-elim-opts")
    .classList.toggle("hidden", selectedFormat !== "single_elim");
  document
    .getElementById("create-double-opts")
    .classList.toggle("hidden", selectedFormat !== "double_elim");
  document
    .getElementById("create-swiss-opts")
    .classList.toggle("hidden", selectedFormat !== "swiss");
}

document
  .getElementById("create-submit")
  .addEventListener("click", async function () {
    var name = document.getElementById("create-name").value.trim();
    if (!name) {
      showNotification("Name is required", "error");
      return;
    }

    var settings = {};
    if (selectedFormat === "single_elim") {
      settings.thirdPlaceMatch =
        document.getElementById("create-third-place").checked;
    } else if (selectedFormat === "double_elim") {
      settings.grandFinalsReset =
        document.getElementById("create-gf-reset").checked;
    } else if (selectedFormat === "swiss") {
      var sr = parseInt(document.getElementById("create-swiss-rounds").value);
      if (sr > 0) settings.swissRounds = sr;
    }

    settings.bestOf =
      parseInt(document.getElementById("create-best-of").value) || 1;

    try {
      var data = await api("POST", "brackets", {
        name: name,
        description: document.getElementById("create-desc").value.trim(),
        format: selectedFormat,
        gameMode: document.getElementById("create-game-mode").value || null,
        maxParticipants:
          parseInt(document.getElementById("create-max").value) || null,
        visibility: document.getElementById("create-visibility").value,
        settings: settings,
      });
      showNotification("Bracket created!");
      openBracket(data.id);
    } catch (e) {
      showNotification(e.message, "error");
    }
  });

// ========== BRACKET DETAIL ==========

async function openBracket(id) {
  showView("bracket");
  currentBracket = null;

  var content = document.getElementById("bracket-content");
  content.innerHTML =
    '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading...</p></div>';
  document.getElementById("bracket-title").textContent = "";
  document.getElementById("bracket-meta").innerHTML = "";
  document.getElementById("bracket-actions").innerHTML = "";
  document.getElementById("participant-list").innerHTML = "";
  document.getElementById("participant-count").textContent = "0";

  try {
    var b = await api("GET", "brackets/" + id);
    currentBracket = b;
    renderBracketDetail(b);
  } catch (e) {
    content.innerHTML =
      '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>' +
      escapeHtml(e.message) +
      "</p></div>";
  }
}

document.getElementById("bracket-back").addEventListener("click", function () {
  showView("dashboard");
  loadDashboard();
});

function renderBracketDetail(b) {
  document.getElementById("bracket-title").textContent = b.name;

  var meta = document.getElementById("bracket-meta");
  meta.innerHTML =
    '<span class="tag tag-format">' +
    (FORMAT_LABELS[b.format] || b.format) +
    "</span>" +
    '<span class="tag tag-' +
    b.visibility +
    '">' +
    b.visibility +
    "</span>" +
    '<span class="tag tag-' +
    b.status +
    '">' +
    b.status +
    "</span>" +
    (b.game_mode
      ? '<span class="tag tag-format">' + escapeHtml(b.game_mode) + "</span>"
      : "");

  // Actions
  var actions = document.getElementById("bracket-actions");
  actions.innerHTML = "";
  if (b.isManager) {
    if (b.status === "draft" || b.status === "registration") {
      var startBtn = document.createElement("button");
      startBtn.className = "btn-success btn-sm";
      startBtn.innerHTML = '<i class="fas fa-play"></i> Start';
      startBtn.addEventListener("click", function () {
        startBracket(b.id);
      });
      actions.appendChild(startBtn);

      var shuffleBtn = document.createElement("button");
      shuffleBtn.className = "btn-secondary btn-sm";
      shuffleBtn.innerHTML = '<i class="fas fa-shuffle"></i> Shuffle';
      shuffleBtn.addEventListener("click", function () {
        shuffleParticipants(b.id);
      });
      actions.appendChild(shuffleBtn);
    }
    if (b.status === "draft") {
      var openBtn = document.createElement("button");
      openBtn.className = "btn-secondary btn-sm";
      openBtn.innerHTML = '<i class="fas fa-door-open"></i> Open Registration';
      openBtn.addEventListener("click", function () {
        openRegistration(b.id);
      });
      actions.appendChild(openBtn);
    }
    if (b.status === "live" && b.format === "swiss") {
      var nrBtn = document.createElement("button");
      nrBtn.className = "btn-primary btn-sm";
      nrBtn.innerHTML = '<i class="fas fa-forward"></i> Next Round';
      nrBtn.addEventListener("click", function () {
        swissNextRound(b.id);
      });
      actions.appendChild(nrBtn);
    }
    if (b.isCreator && b.status === "live") {
      var resetBtn = document.createElement("button");
      resetBtn.className = "btn-danger btn-sm";
      resetBtn.innerHTML = '<i class="fas fa-undo"></i> Reset';
      resetBtn.addEventListener("click", function () {
        confirmAction(
          "Reset this bracket?",
          "This will delete all matches.",
          function () {
            resetBracket(b.id);
          },
        );
      });
      actions.appendChild(resetBtn);
    }
    if (b.status === "live") {
      var finalBtn = document.createElement("button");
      finalBtn.className = "btn-secondary btn-sm";
      finalBtn.innerHTML = '<i class="fas fa-flag-checkered"></i> Finalize';
      finalBtn.addEventListener("click", function () {
        finalizeBracket(b.id);
      });
      actions.appendChild(finalBtn);
    }
  }

  // Participants
  renderParticipants(b);

  // Managers
  renderManagers(b);

  // Show/hide add participant controls
  var addWrap = document.getElementById("add-participant-wrap");
  addWrap.classList.toggle(
    "hidden",
    !b.isManager || (b.status !== "draft" && b.status !== "registration"),
  );

  // Show/hide add manager controls
  var addMWrap = document.getElementById("add-manager-wrap");
  addMWrap.classList.toggle("hidden", !b.isCreator);

  // Standings panel (RR/Swiss)
  var standingsPanel = document.getElementById("standings-panel");
  if (
    (b.format === "round_robin" || b.format === "swiss") &&
    b.status === "live"
  ) {
    standingsPanel.classList.remove("hidden");
    loadStandings(b.id);
  } else {
    standingsPanel.classList.add("hidden");
  }

  // Bracket content
  renderBracketContent(b);
}

function renderParticipants(b) {
  var list = document.getElementById("participant-list");
  list.innerHTML = "";
  document.getElementById("participant-count").textContent = (
    b.participants || []
  ).length;

  var ps = b.participants || [];
  for (var i = 0; i < ps.length; i++) {
    (function (p) {
      var li = document.createElement("li");
      li.innerHTML =
        '<span class="seed">' +
        (p.seed || "-") +
        "</span>" +
        '<span class="p-name">' +
        escapeHtml(p.name) +
        "</span>" +
        (p.team_tag
          ? '<span class="p-tag">[' + escapeHtml(p.team_tag) + "]</span>"
          : "") +
        (p.status === "eliminated"
          ? '<span style="color:var(--red);font-size:10px;margin-left:6px">OUT</span>'
          : "") +
        (p.status === "winner"
          ? '<span style="color:var(--gold);font-size:10px;margin-left:6px"><i class="fas fa-crown"></i></span>'
          : "");
      if (
        b.isManager &&
        (b.status === "draft" || b.status === "registration")
      ) {
        var acts = document.createElement("span");
        acts.className = "p-actions";
        var del = document.createElement("button");
        del.innerHTML = '<i class="fas fa-times"></i>';
        del.title = "Remove";
        del.addEventListener("click", function (e) {
          e.stopPropagation();
          removeParticipant(b.id, p.id);
        });
        acts.appendChild(del);
        li.appendChild(acts);
      }
      list.appendChild(li);
    })(ps[i]);
  }
}

function renderManagers(b) {
  var list = document.getElementById("manager-list");
  list.innerHTML = "";
  var ms = b.managers || [];
  for (var i = 0; i < ms.length; i++) {
    (function (m) {
      var li = document.createElement("li");
      li.innerHTML =
        '<span class="p-name">' +
        escapeHtml(m.username || "Unknown") +
        "</span>" +
        '<span class="tag tag-format" style="margin-left:6px">' +
        m.role +
        "</span>";
      if (b.isCreator && m.role !== "creator") {
        var acts = document.createElement("span");
        acts.className = "p-actions";
        var del = document.createElement("button");
        del.innerHTML = '<i class="fas fa-times"></i>';
        del.addEventListener("click", function (e) {
          e.stopPropagation();
          removeManager(b.id, m.user_id);
        });
        acts.appendChild(del);
        li.appendChild(acts);
      }
      list.appendChild(li);
    })(ms[i]);
  }
}

// ========== BRACKET CONTENT RENDERING ==========

function renderBracketContent(b) {
  var container = document.getElementById("bracket-content");

  // Reset inline styles — each renderer sets what it needs
  container.style.height = "";
  container.style.overflow = "";
  container.style.display = "";
  container.style.flexDirection = "";
  container.innerHTML = "";

  if (!b.matches || (!b.matches.length && b.format !== "ffa")) {
    if (b.status === "draft" || b.status === "registration") {
      container.innerHTML =
        '<div class="empty-state"><i class="fas fa-sitemap"></i><p>Add participants and start the bracket to generate matches</p></div>';
    } else {
      container.innerHTML =
        '<div class="empty-state"><i class="fas fa-sitemap"></i><p>No matches yet</p></div>';
    }
    return;
  }

  if (b.format === "ffa") {
    renderFFAView(b, container);
  } else if (b.format === "round_robin") {
    renderRoundRobinView(b, container);
  } else if (b.format === "swiss") {
    renderSwissView(b, container);
  } else {
    renderEliminationBracket(b, container);
  }
}

function renderEliminationBracket(b, container) {
  var pMap = {};
  (b.participants || []).forEach(function (p) {
    pMap[p.id] = p;
  });

  var layout = BracketGenerator.computeLayout(b.matches, b.format);
  container.innerHTML = "";
  container.style.height = "100%";
  container.style.overflow = "hidden";
  container.style.display = "flex";
  container.style.flexDirection = "column";

  var viewport = BracketRenderer.render(layout, b.matches, pMap, b.isManager);
  container.appendChild(viewport);
}

function renderRoundRobinView(b, container) {
  var pMap = {};
  var pList = b.participants || [];
  pList.forEach(function (p) {
    pMap[p.id] = p;
  });

  // Build match lookup: "p1id-p2id" -> match
  var matchLookup = {};
  (b.matches || []).forEach(function (m) {
    if (m.participant1_id && m.participant2_id) {
      matchLookup[m.participant1_id + "-" + m.participant2_id] = m;
      matchLookup[m.participant2_id + "-" + m.participant1_id] = m;
    }
  });

  var html =
    '<div style="overflow-x:auto"><table class="rr-table"><thead><tr><th></th>';
  for (var i = 0; i < pList.length; i++) {
    html +=
      '<th title="' +
      escapeHtml(pList[i].name) +
      '">' +
      escapeHtml(pList[i].name).slice(0, 8) +
      "</th>";
  }
  html += "</tr></thead><tbody>";

  for (var r = 0; r < pList.length; r++) {
    html +=
      '<tr><th style="text-align:left">' + escapeHtml(pList[r].name) + "</th>";
    for (var c = 0; c < pList.length; c++) {
      if (r === c) {
        html += '<td class="rr-self">-</td>';
      } else {
        var match = matchLookup[pList[r].id + "-" + pList[c].id];
        if (match && match.status === "completed") {
          var isP1 = match.participant1_id === pList[r].id;
          var won = match.winner_id === pList[r].id;
          var score = isP1
            ? match.score1 + "-" + match.score2
            : match.score2 + "-" + match.score1;
          html +=
            '<td class="rr-' + (won ? "win" : "loss") + '">' + score + "</td>";
        } else if (match && match.status === "ready" && b.isManager) {
          html +=
            '<td class="rr-pending" data-mid="' +
            match.id +
            '"><i class="fas fa-edit" style="font-size:10px"></i></td>';
        } else {
          html += '<td style="color:var(--text-3)">-</td>';
        }
      }
    }
    html += "</tr>";
  }
  html += "</tbody></table></div>";
  container.innerHTML = html;

  // Click handlers for pending cells
  container.querySelectorAll("td.rr-pending").forEach(function (td) {
    td.addEventListener("click", function () {
      var mid = parseInt(td.dataset.mid);
      var match = (b.matches || []).find(function (m) {
        return m.id === mid;
      });
      if (match) openScoreModal(b.id, match, pMap);
    });
  });
}

function renderSwissView(b, container) {
  var pMap = {};
  (b.participants || []).forEach(function (p) {
    pMap[p.id] = p;
  });

  var matches = b.matches || [];
  // Group by round
  var rounds = {};
  for (var i = 0; i < matches.length; i++) {
    var r = matches[i].round;
    if (!rounds[r]) rounds[r] = [];
    rounds[r].push(matches[i]);
  }

  var html = "";
  var roundNums = Object.keys(rounds).sort(function (a, b) {
    return a - b;
  });
  for (var ri = 0; ri < roundNums.length; ri++) {
    var rn = roundNums[ri];
    var rMatches = rounds[rn];
    html +=
      '<div style="margin-bottom:16px"><div class="section-label">Round ' +
      rn +
      "</div>";
    html += '<div class="panel"><div class="panel-body" style="padding:0">';

    for (var mi = 0; mi < rMatches.length; mi++) {
      var m = rMatches[mi];
      var p1 = pMap[m.participant1_id];
      var p2 = pMap[m.participant2_id];
      var isBye = m.status === "bye";
      var isComplete = m.status === "completed";

      html +=
        '<div style="display:flex;align-items:center;padding:8px 14px;border-bottom:1px solid var(--border);gap:10px" ';
      if (m.status === "ready" && b.isManager) {
        html +=
          'class="swiss-match" data-mid="' +
          m.id +
          '" style="display:flex;align-items:center;padding:8px 14px;border-bottom:1px solid var(--border);gap:10px;cursor:pointer"';
      }
      html += ">";

      html +=
        '<span style="width:24px;text-align:center;color:var(--text-2);font-size:11px">' +
        m.match_number +
        "</span>";

      // P1
      var p1Style =
        isComplete && m.winner_id === m.participant1_id
          ? "color:var(--text-0);font-weight:700"
          : "color:var(--text-1)";
      html +=
        '<span style="flex:1;font-size:13px;' +
        p1Style +
        '">' +
        escapeHtml(p1 ? p1.name : "TBD") +
        "</span>";

      if (isBye) {
        html += '<span style="font-size:10px;color:var(--text-2)">BYE</span>';
      } else if (isComplete) {
        html +=
          '<span style="color:var(--text-2);font-size:12px">' +
          m.score1 +
          " - " +
          m.score2 +
          "</span>";
      } else if (m.status === "ready" && b.isManager) {
        html +=
          '<span style="color:var(--accent);font-size:11px"><i class="fas fa-edit"></i></span>';
      } else {
        html += '<span style="color:var(--text-3);font-size:11px">vs</span>';
      }

      // P2
      var p2Style =
        isComplete && m.winner_id === m.participant2_id
          ? "color:var(--text-0);font-weight:700"
          : "color:var(--text-1)";
      html +=
        '<span style="flex:1;text-align:right;font-size:13px;' +
        p2Style +
        '">' +
        escapeHtml(p2 ? p2.name : isBye ? "" : "TBD") +
        "</span>";

      html += "</div>";
    }
    html += "</div></div></div>";
  }

  container.innerHTML = html;

  // Click handlers
  container.querySelectorAll(".swiss-match").forEach(function (el) {
    el.addEventListener("click", function () {
      var mid = parseInt(el.dataset.mid);
      var match = matches.find(function (m) {
        return m.id === mid;
      });
      if (match) openScoreModal(b.id, match, pMap);
    });
  });
}

// ========== FFA VIEW ==========

function renderFFAView(b, container) {
  var participants = (b.participants || []).slice().sort(function (a, b) {
    var sa = a.misc && a.misc.ffa_score != null ? parseInt(a.misc.ffa_score) : 0;
    var sb = b.misc && b.misc.ffa_score != null ? parseInt(b.misc.ffa_score) : 0;
    return sb - sa;
  });

  var pMap = {};
  (b.participants || []).forEach(function (p) { pMap[p.id] = p; });

  var wrap = document.createElement("div");
  wrap.className = "ffa-wrap";

  var table = document.createElement("table");
  table.className = "ffa-table";

  var thead = document.createElement("thead");
  thead.innerHTML =
    "<tr>" +
    "<th class='ffa-rank-col'>#</th>" +
    "<th>Player</th>" +
    "<th class='ffa-pts-col'>Points</th>" +
    (b.isManager && b.status === "live" ? "<th></th>" : "") +
    "</tr>";
  table.appendChild(thead);

  var tbody = document.createElement("tbody");

  for (var i = 0; i < participants.length; i++) {
    (function (p, rank) {
      var score = p.misc && p.misc.ffa_score != null ? parseInt(p.misc.ffa_score) : 0;
      var tr = document.createElement("tr");
      if (rank === 1) tr.className = "ffa-rank-1";
      else if (rank === 2) tr.className = "ffa-rank-2";
      else if (rank === 3) tr.className = "ffa-rank-3";

      // Rank cell
      var tdRank = document.createElement("td");
      tdRank.className = "ffa-rank-col";
      if (rank === 1) tdRank.innerHTML = '<i class="fas fa-crown ffa-medal" style="color:var(--gold)"></i>';
      else if (rank === 2) tdRank.innerHTML = '<i class="fas fa-medal ffa-medal" style="color:var(--silver)"></i>';
      else if (rank === 3) tdRank.innerHTML = '<i class="fas fa-medal ffa-medal" style="color:var(--bronze)"></i>';
      else tdRank.textContent = rank;
      tr.appendChild(tdRank);

      // Name cell
      var tdName = document.createElement("td");
      tdName.className = "ffa-name";
      tdName.textContent = p.name;
      if (p.team_tag) {
        var tag = document.createElement("span");
        tag.className = "p-tag";
        tag.textContent = " [" + escapeHtml(p.team_tag) + "]";
        tdName.appendChild(tag);
      }
      tr.appendChild(tdName);

      // Score cell
      var tdScore = document.createElement("td");
      tdScore.className = "ffa-pts-col";
      tdScore.textContent = score.toLocaleString();
      tr.appendChild(tdScore);

      // Edit button (manager only, live only)
      if (b.isManager && b.status === "live") {
        var tdAction = document.createElement("td");
        tdAction.className = "ffa-action-col";
        var btn = document.createElement("button");
        btn.className = "icon-btn btn-sm";
        btn.title = "Edit score";
        btn.innerHTML = '<i class="fas fa-pen-to-square"></i>';
        btn.addEventListener("click", function () {
          openFFAModal(b.id, p.id, p.name, score);
        });
        tdAction.appendChild(btn);
        tr.appendChild(tdAction);
      }

      tbody.appendChild(tr);
    })(participants[i], i + 1);
  }

  if (!participants.length) {
    var empty = document.createElement("tr");
    empty.innerHTML = '<td colspan="4" style="text-align:center;color:var(--text-3);padding:20px">No participants</td>';
    tbody.appendChild(empty);
  }

  table.appendChild(tbody);
  wrap.appendChild(table);
  container.appendChild(wrap);
}

// ========== SCORE MODAL ==========

var _scoreModalBracketId = null;
var _scoreModalMatchId = null;

function openScoreModal(bracketId, match, pMap) {
  _scoreModalBracketId = bracketId;
  _scoreModalMatchId = match.id;

  var p1 = pMap[match.participant1_id];
  var p2 = pMap[match.participant2_id];

  var inputs = document.getElementById("score-inputs");
  inputs.innerHTML =
    '<div class="score-row">' +
    '<span class="player-name">' +
    escapeHtml(p1 ? p1.name : "TBD") +
    "</span>" +
    '<input type="number" id="score-p1" min="0" value="' +
    (match.score1 || 0) +
    '" />' +
    "</div>" +
    '<div style="text-align:center;color:var(--text-2);font-size:12px;font-weight:700">vs</div>' +
    '<div class="score-row">' +
    '<span class="player-name">' +
    escapeHtml(p2 ? p2.name : "TBD") +
    "</span>" +
    '<input type="number" id="score-p2" min="0" value="' +
    (match.score2 || 0) +
    '" />' +
    "</div>";

  document.getElementById("score-modal").classList.remove("hidden");
  document.getElementById("score-p1").focus();
}

document
  .getElementById("score-modal-close")
  .addEventListener("click", closeScoreModal);
document
  .getElementById("score-cancel-btn")
  .addEventListener("click", closeScoreModal);

function closeScoreModal() {
  document.getElementById("score-modal").classList.add("hidden");
  _scoreModalBracketId = null;
  _scoreModalMatchId = null;
}

document
  .getElementById("score-save-btn")
  .addEventListener("click", async function () {
    var s1 = parseInt(document.getElementById("score-p1").value) || 0;
    var s2 = parseInt(document.getElementById("score-p2").value) || 0;
    if (s1 === s2) {
      showNotification("Scores cannot be tied", "error");
      return;
    }

    try {
      await api(
        "PUT",
        "brackets/" + _scoreModalBracketId + "/matches/" + _scoreModalMatchId,
        {
          score1: s1,
          score2: s2,
        },
      );
      closeScoreModal();
      showNotification("Score saved!");
      openBracket(_scoreModalBracketId || currentBracket.id);
    } catch (e) {
      showNotification(e.message, "error");
    }
  });

document
  .getElementById("score-reset-btn")
  .addEventListener("click", async function () {
    if (!_scoreModalBracketId || !_scoreModalMatchId) return;
    var bid = _scoreModalBracketId;
    var mid = _scoreModalMatchId;
    confirmAction(
      "Reset this match?",
      "This will also reset all dependent matches.",
      async function () {
        try {
          await api("POST", "brackets/" + bid + "/matches/" + mid + "/reset");
          closeScoreModal();
          showNotification("Match reset!");
          openBracket(bid);
        } catch (e) {
          showNotification(e.message, "error");
        }
      },
    );
  });

// ========== BRACKET ACTIONS ==========

async function startBracket(id) {
  try {
    await api("POST", "brackets/" + id + "/start");
    showNotification("Bracket started!");
    openBracket(id);
  } catch (e) {
    showNotification(e.message, "error");
  }
}

async function resetBracket(id) {
  try {
    await api("POST", "brackets/" + id + "/reset");
    showNotification("Bracket reset!");
    openBracket(id);
  } catch (e) {
    showNotification(e.message, "error");
  }
}

async function finalizeBracket(id) {
  try {
    await api("POST", "brackets/" + id + "/finalize");
    showNotification("Bracket finalized!");
    openBracket(id);
  } catch (e) {
    showNotification(e.message, "error");
  }
}

async function openRegistration(id) {
  try {
    await api("POST", "brackets/" + id + "/open");
    showNotification("Registration opened!");
    openBracket(id);
  } catch (e) {
    showNotification(e.message, "error");
  }
}

async function shuffleParticipants(id) {
  try {
    await api("POST", "brackets/" + id + "/shuffle");
    showNotification("Seeds shuffled!");
    openBracket(id);
  } catch (e) {
    showNotification(e.message, "error");
  }
}

async function swissNextRound(id) {
  try {
    await api("POST", "brackets/" + id + "/swiss/next-round");
    showNotification("Next round generated!");
    openBracket(id);
  } catch (e) {
    showNotification(e.message, "error");
  }
}

// ========== PARTICIPANTS ==========

document
  .getElementById("add-p-btn")
  .addEventListener("click", async function () {
    if (!currentBracket) return;
    var name = document.getElementById("add-p-name").value.trim();
    if (!name) return;
    var tag = document.getElementById("add-p-tag").value.trim();
    try {
      await api("POST", "brackets/" + currentBracket.id + "/participants", {
        name: name,
        teamTag: tag || null,
      });
      document.getElementById("add-p-name").value = "";
      document.getElementById("add-p-tag").value = "";
      openBracket(currentBracket.id);
    } catch (e) {
      showNotification(e.message, "error");
    }
  });

document.getElementById("add-p-name").addEventListener("keydown", function (e) {
  if (e.key === "Enter") document.getElementById("add-p-btn").click();
});

async function removeParticipant(bracketId, pid) {
  try {
    await api("DELETE", "brackets/" + bracketId + "/participants/" + pid);
    openBracket(bracketId);
  } catch (e) {
    showNotification(e.message, "error");
  }
}

// ========== MANAGERS ==========

document
  .getElementById("add-m-btn")
  .addEventListener("click", async function () {
    if (!currentBracket) return;
    var username = document.getElementById("add-m-username").value.trim();
    if (!username) return;
    try {
      await api("POST", "brackets/" + currentBracket.id + "/managers", {
        username: username,
      });
      document.getElementById("add-m-username").value = "";
      showNotification("Manager added!");
      openBracket(currentBracket.id);
    } catch (e) {
      showNotification(e.message, "error");
    }
  });

async function removeManager(bracketId, uid) {
  try {
    await api("DELETE", "brackets/" + bracketId + "/managers/" + uid);
    showNotification("Manager removed!");
    openBracket(bracketId);
  } catch (e) {
    showNotification(e.message, "error");
  }
}

// ========== STANDINGS ==========

async function loadStandings(bracketId) {
  try {
    var data = await api("GET", "brackets/" + bracketId + "/standings");
    var standings = data.standings || [];
    var tbody = document.getElementById("standings-body");
    tbody.innerHTML = "";
    for (var i = 0; i < standings.length; i++) {
      var s = standings[i];
      var rankClass = i < 3 ? " rank-" + (i + 1) : "";
      var tr = document.createElement("tr");
      tr.className = rankClass;
      tr.innerHTML =
        "<td>" +
        (i + 1) +
        "</td>" +
        "<td>" +
        escapeHtml(s.name) +
        "</td>" +
        '<td style="color:var(--green)">' +
        s.wins +
        "</td>" +
        '<td style="color:var(--red)">' +
        s.losses +
        "</td>" +
        "<td>" +
        (s.buchholz || 0) +
        "</td>";
      tbody.appendChild(tr);
    }
  } catch (e) {
    /* ignore */
  }
}

// ========== FFA MODAL ==========

var _ffaBracketId = null;
var _ffaParticipantId = null;

function openFFAModal(bracketId, pid, name, currentScore) {
  _ffaBracketId = bracketId;
  _ffaParticipantId = pid;
  document.getElementById("ffa-modal-title").textContent =
    "Set Score — " + escapeHtml(name);
  var input = document.getElementById("ffa-score-input");
  input.value = currentScore != null ? currentScore : 0;
  document.getElementById("ffa-modal").classList.remove("hidden");
  input.focus();
  input.select();
}

function closeFFAModal() {
  document.getElementById("ffa-modal").classList.add("hidden");
  _ffaBracketId = null;
  _ffaParticipantId = null;
}

document.getElementById("ffa-modal-close").addEventListener("click", closeFFAModal);
document.getElementById("ffa-modal-cancel").addEventListener("click", closeFFAModal);

document
  .getElementById("ffa-modal-save")
  .addEventListener("click", async function () {
    if (!_ffaBracketId || !_ffaParticipantId) return;
    var score = parseInt(document.getElementById("ffa-score-input").value);
    if (isNaN(score) || score < 0) {
      showNotification("Score must be a non-negative number", "error");
      return;
    }
    var bid = _ffaBracketId;
    try {
      await api(
        "PUT",
        "brackets/" + bid + "/participants/" + _ffaParticipantId + "/score",
        { score: score },
      );
      closeFFAModal();
      showNotification("Score updated!");
      openBracket(bid);
    } catch (e) {
      showNotification(e.message, "error");
    }
  });

document.getElementById("ffa-score-input").addEventListener("keydown", function (e) {
  if (e.key === "Enter") document.getElementById("ffa-modal-save").click();
  if (e.key === "Escape") closeFFAModal();
});

// ========== CONFIRM MODAL ==========

var _confirmCallback = null;

function confirmAction(title, text, callback) {
  document.getElementById("confirm-title").textContent = title;
  document.getElementById("confirm-text").textContent = text;
  _confirmCallback = callback;
  document.getElementById("confirm-modal").classList.remove("hidden");
}

document.getElementById("confirm-close").addEventListener("click", function () {
  document.getElementById("confirm-modal").classList.add("hidden");
});
document.getElementById("confirm-no").addEventListener("click", function () {
  document.getElementById("confirm-modal").classList.add("hidden");
});
document.getElementById("confirm-yes").addEventListener("click", function () {
  document.getElementById("confirm-modal").classList.add("hidden");
  if (_confirmCallback) _confirmCallback();
  _confirmCallback = null;
});

// ========== INIT ==========

initAuth();
