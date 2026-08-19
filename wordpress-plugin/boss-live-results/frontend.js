/**
 * BOSS Live Results — frontend renderer.
 *
 * Polls the WP REST API every 15s and fills any [data-boss] container on
 * the page with the matching view. Multiple containers and multiple
 * tournament IDs on one page are all supported — the script groups by tid
 * and fans out one network request per unique id.
 *
 * Vanilla JS, no jQuery / no React. Assumes BOSS_LIVE is provided by
 * wp_localize_script with { rest_base, interval }.
 */
(function () {
  "use strict";

  const cfg = window.BOSS_LIVE || {};
  if (!cfg.rest_base) return;
  const POLL_MS = cfg.interval || 15000;

  // ---------- helpers --------------------------------------------------------

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === "class") node.className = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else node.setAttribute(k, attrs[k]);
      }
    }
    if (children) {
      for (const c of children) node.appendChild(c);
    }
    return node;
  }

  function clear(container) {
    while (container.firstChild) container.removeChild(container.firstChild);
  }

  function playerName(p) {
    if (!p) return "?";
    return p.last_name ? p.first_name + " " + p.last_name : p.first_name;
  }

  function teamLabel(match, players) {
    const t1 = playerName(players[match.team1_p1]);
    const t1b = match.team1_p2 ? " / " + playerName(players[match.team1_p2]) : "";
    const t2 = playerName(players[match.team2_p1]);
    const t2b = match.team2_p2 ? " / " + playerName(players[match.team2_p2]) : "";
    return { team1: t1 + t1b, team2: t2 + t2b };
  }

  // Returns { wonSummary: "2:1", detail: "21:18, 18:21, 21:15", any: bool }.
  // wonSummary counts how many sets each team won (one team strictly higher
  // score in that set). Sets where neither team is ahead (e.g. 0:0 pending)
  // don't contribute. detail lists every per-set score in chronological
  // order. `any` is true when at least one set has any points entered.
  function setsScore(matchId, allSets) {
    const mine = allSets.filter((s) => s.match_id === matchId);
    mine.sort((a, b) => a.set_number - b.set_number);
    if (mine.length === 0) return { wonSummary: "", detail: "", any: false };
    let s1 = 0, s2 = 0, any = false;
    for (const s of mine) {
      if (s.team1_score > s.team2_score) s1++;
      else if (s.team2_score > s.team1_score) s2++;
      if (s.team1_score > 0 || s.team2_score > 0) any = true;
    }
    const detail = mine.map((s) => s.team1_score + ":" + s.team2_score).join(", ");
    return { wonSummary: s1 + ":" + s2, detail, any };
  }

  // ---------- renderers ------------------------------------------------------

  function renderStatus(container, data) {
    clear(container);
    const status = (data.tournament && data.tournament.status) || "";
    // `final` is a sticky marker the desktop app sets on the closing push —
    // even if the tournament status flickers, "Final" wins once the close
    // snapshot has been received.
    const isFinal = data.final === true || status === "completed" || status === "archived";
    const isLive = !isFinal && status === "active";
    const label = isLive ? "Live" : isFinal ? "Final" : status;
    const badge = el("span", {
      class: "boss-badge boss-badge-" + (isLive ? "live" : "final"),
      text: label,
    });
    container.appendChild(badge);
    if (data.pushed_at) {
      const time = new Date(data.pushed_at);
      const t = el("span", {
        class: "boss-time",
        text: " — last update: " + time.toLocaleTimeString(),
      });
      container.appendChild(t);
    }
  }

  // Renders ALL matches across ALL rounds, segmented one section per round.
  // Each round is labeled with a human-friendly heading ("Group 1 — Round 2",
  // "Final", "🥉 Third Place", "Winners — Round 1", …). Earlier versions of
  // this plugin only showed the current round, hiding completed history; the
  // new layout makes the whole tournament log visible without requiring a
  // separate shortcode.
  function renderMatches(container, data) {
    clear(container);
    if (!data.matches || data.matches.length === 0) {
      container.appendChild(el("div", { class: "boss-empty", text: "No matches yet." }));
      return;
    }

    const allRounds = data.rounds || [];
    const matchesByRound = new Map();
    for (const m of data.matches) {
      if (!matchesByRound.has(m.round_id)) matchesByRound.set(m.round_id, []);
      matchesByRound.get(m.round_id).push(m);
    }

    // Per-group round-index lookup: group rounds in our schema have global
    // round_numbers (e.g. group 1 uses 1-3, group 2 uses 4-6). We re-index
    // them locally so labels read "Group 2 — Round 1/2/3" rather than 4/5/6.
    const groupRoundIdx = {};
    const byGroup = {};
    for (const r of allRounds) {
      if (r.phase === "group" && r.group_number != null) {
        if (!byGroup[r.group_number]) byGroup[r.group_number] = [];
        byGroup[r.group_number].push(r);
      }
    }
    Object.keys(byGroup).forEach((g) => {
      const list = byGroup[g];
      list.sort((a, b) => a.round_number - b.round_number);
      list.forEach((r, i) => (groupRoundIdx[r.id] = i + 1));
    });

    // KO-stage labels (Final / Semifinal / Quarterfinal / Round of 16) are
    // computed from how many KO rounds remain after this one — same logic
    // the desktop BracketView uses.
    const format = data.tournament && data.tournament.format;
    const elimRounds = format === "elimination"
      ? allRounds.filter((r) => r.phase !== "third_place")
      : allRounds.filter((r) => r.phase === "ko");
    const winnersRounds = allRounds.filter((r) => r.phase === "winners");
    const losersRounds = allRounds.filter((r) => r.phase === "losers");

    function koStageLabel(r, koList) {
      const idx = koList.findIndex((x) => x.id === r.id);
      if (idx < 0) return "Round " + r.round_number;
      const firstRound = koList[0];
      const firstMatchCount = (matchesByRound.get(firstRound.id) || []).length || 1;
      const expectedTotal = Math.ceil(Math.log2(firstMatchCount * 2));
      const remaining = expectedTotal - idx;
      if (remaining === 1) return "Final";
      if (remaining === 2) return "Semifinal";
      if (remaining === 3) return "Quarterfinal";
      if (remaining === 4) return "Round of 16";
      return "Round " + (idx + 1);
    }

    function roundLabel(r) {
      if (r.phase === "third_place") return "🥉 Third Place";
      if (r.phase === "group" && r.group_number != null) {
        return "Group " + r.group_number + " — Round " + (groupRoundIdx[r.id] || r.round_number);
      }
      if (r.phase === "ko") return koStageLabel(r, elimRounds);
      if (r.phase === "winners") {
        const i = winnersRounds.findIndex((x) => x.id === r.id);
        return "Winners — Round " + (i + 1);
      }
      if (r.phase === "losers") {
        const i = losersRounds.findIndex((x) => x.id === r.id);
        return "Losers — Round " + (i + 1);
      }
      if (format === "elimination") return koStageLabel(r, elimRounds);
      return "Round " + r.round_number;
    }

    function statusOrder(s) {
      // active (live) first → most relevant for spectators
      if (s === "active") return 0;
      if (s === "pending") return 1;
      if (s === "completed") return 2;
      return 99;
    }

    // Render one section per round, using the round order as stored in
    // data.rounds (which mirrors DB insertion order — chronological).
    for (const r of allRounds) {
      const list = matchesByRound.get(r.id) || [];
      if (list.length === 0) continue;

      container.appendChild(el("h3", { class: "boss-h3", text: roundLabel(r) }));

      const table = el("table", { class: "boss-table boss-table-fixed" });
      // Per-round tables share identical widths so team names line up
      // vertically across rounds — same trick as the standings tables.
      const colgroup = el("colgroup");
      // Court widened from 7% so the "COURT" header isn't truncated by the
      // .boss-table-fixed ellipsis rule. Trade comes from Team 1/Team 2/Detail.
      [10, 24, 9, 24, 19, 14].forEach((w) => {
        const c = document.createElement("col");
        c.style.width = w + "%";
        colgroup.appendChild(c);
      });
      table.appendChild(colgroup);
      const thead = el("thead");
      const trh = el("tr");
      ["Court", "Team 1", "Sets", "Team 2", "Detail", "Status"].forEach((h) =>
        trh.appendChild(el("th", { text: h })),
      );
      thead.appendChild(trh);
      table.appendChild(thead);

      const tbody = el("tbody");
      const sorted = list.slice().sort((a, b) => {
        const sa = statusOrder(a.status);
        const sb = statusOrder(b.status);
        if (sa !== sb) return sa - sb;
        const ca = a.court || 99;
        const cb = b.court || 99;
        if (ca !== cb) return ca - cb;
        return a.id - b.id;
      });

      for (const m of sorted) {
        const tr = el("tr", { class: "boss-row-" + m.status });
        const labels = teamLabel(m, data.players || {});
        const score = setsScore(m.id, data.sets || []);
        tr.appendChild(el("td", { text: m.court ? String(m.court) : "—" }));
        tr.appendChild(
          el("td", {
            class: "boss-team" + (m.winner_team === 1 ? " boss-winner" : ""),
            text: labels.team1,
          }),
        );
        // Sets won column ("2:0", "1:1", etc.) — bold for completed matches.
        const setsCell = el("td", {
          class: "boss-score" + (m.status === "completed" ? " boss-winner" : ""),
          text: score.any ? score.wonSummary : "–",
        });
        tr.appendChild(setsCell);
        tr.appendChild(
          el("td", {
            class: "boss-team" + (m.winner_team === 2 ? " boss-winner" : ""),
            text: labels.team2,
          }),
        );
        // Detail column ("21:18, 21:15") — per-set point breakdown.
        tr.appendChild(
          el("td", {
            class: "boss-score boss-set-detail",
            text: score.detail || "",
          }),
        );
        let statusLabel = m.status;
        if (m.status === "active") statusLabel = "Live";
        else if (m.status === "completed") statusLabel = "Done";
        else if (m.status === "pending") statusLabel = "—";
        tr.appendChild(el("td", { text: statusLabel }));
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      container.appendChild(table);
    }
  }

  function renderStandingsTable(rows, isTeam) {
    const table = el("table", { class: "boss-table boss-table-fixed" });

    // Explicit colgroup so all standings tables (one per group) align
    // column-by-column regardless of the longest player/team name in
    // each group. Widths sum to 100%.
    const colgroup = el("colgroup");
    const widths = isTeam
      ? [6, 50, 8, 8, 14, 14]   // # | Team (longer for "X / Y") | W | L | Sets | Pts
      : [6, 40, 9, 9, 18, 18];  // # | Player                   | W | L | Sets | Pts
    widths.forEach((w) => {
      const c = document.createElement("col");
      c.style.width = w + "%";
      colgroup.appendChild(c);
    });
    table.appendChild(colgroup);

    const thead = el("thead");
    const trh = el("tr");
    const cols = isTeam
      ? ["#", "Team", "W", "L", "Sets", "Pts"]
      : ["#", "Player", "W", "L", "Sets", "Pts"];
    cols.forEach((h) => trh.appendChild(el("th", { text: h })));
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = el("tbody");
    rows.forEach((r, i) => {
      const tr = el("tr");
      tr.appendChild(el("td", { text: String(i + 1) }));
      const name = isTeam
        ? playerName(r.player1) + " / " + playerName(r.player2)
        : playerName(r.player);
      tr.appendChild(el("td", { text: name }));
      tr.appendChild(el("td", { text: String(r.wins) }));
      tr.appendChild(el("td", { text: String(r.losses) }));
      tr.appendChild(el("td", { text: r.setsWon + ":" + r.setsLost }));
      tr.appendChild(el("td", { text: r.pointsWon + ":" + r.pointsLost }));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  function renderStandings(container, data) {
    clear(container);
    const isTeam = data.tournament && data.tournament.mode !== "singles";

    // For group_ko show per-group sub-tables; otherwise the flat list.
    if (data.groups && data.groups.length > 0) {
      data.groups.forEach((g) => {
        container.appendChild(el("h3", { class: "boss-h3", text: "Group " + g.number }));
        container.appendChild(renderStandingsTable(g.standings || [], false));
      });
      return;
    }

    if (!data.standings || data.standings.length === 0) {
      container.appendChild(el("div", { class: "boss-empty", text: "No standings yet." }));
      return;
    }
    container.appendChild(renderStandingsTable(data.standings, isTeam));
  }

  function renderBracket(container, data) {
    clear(container);
    const format = data.tournament && data.tournament.format;
    if (format !== "elimination" && format !== "group_ko" && format !== "double_elimination") {
      container.appendChild(
        el("div", { class: "boss-empty", text: "No bracket for this tournament format." }),
      );
      return;
    }

    // Group KO matches by round_number.
    const roundsById = {};
    for (const r of data.rounds || []) {
      if (r.phase === "ko" || r.phase === "winners" || r.phase === "losers") {
        roundsById[r.id] = r;
      }
    }
    const byRound = {};
    for (const m of data.matches || []) {
      const r = roundsById[m.round_id];
      if (!r) continue;
      (byRound[r.round_number] = byRound[r.round_number] || []).push(m);
    }
    const rNums = Object.keys(byRound).map(Number).sort((a, b) => a - b);
    if (rNums.length === 0) {
      container.appendChild(
        el("div", { class: "boss-empty", text: "KO bracket not started yet." }),
      );
      return;
    }

    const wrap = el("div", { class: "boss-bracket" });
    rNums.forEach((rn) => {
      const col = el("div", { class: "boss-bracket-round" });
      col.appendChild(el("h4", { class: "boss-h4", text: "Round " + rn }));
      byRound[rn].forEach((m) => {
        const card = el("div", { class: "boss-match-card" });
        const labels = teamLabel(m, data.players || {});
        const score = setsScore(m.id, data.sets || []);
        const t1Class = "boss-team" + (m.winner_team === 1 ? " boss-winner" : "");
        const t2Class = "boss-team" + (m.winner_team === 2 ? " boss-winner" : "");
        card.appendChild(el("div", { class: t1Class, text: labels.team1 }));
        if (score.any) {
          // Bracket cards stay compact: sets-won summary + detail on one line.
          const text = score.detail
            ? score.wonSummary + " (" + score.detail + ")"
            : score.wonSummary;
          card.appendChild(el("div", { class: "boss-score", text: text }));
        }
        card.appendChild(el("div", { class: t2Class, text: labels.team2 }));
        col.appendChild(card);
      });
      wrap.appendChild(col);
    });
    container.appendChild(wrap);
  }

  function renderList(container, list) {
    clear(container);
    if (!list || list.length === 0) {
      container.appendChild(el("div", { class: "boss-empty", text: "No live tournaments." }));
      return;
    }
    const ul = el("ul", { class: "boss-tournament-list" });
    list.forEach((t) => {
      const li = el("li");
      const status = el("span", {
        class: "boss-badge boss-badge-" + (t.status === "active" ? "live" : "final"),
        text: t.status === "active" ? "Live" : t.status === "completed" ? "Final" : t.status,
      });
      const link = el("a", {
        href: "?tid=" + t.id,
        class: "boss-tournament-link",
        text: t.name,
      });
      li.appendChild(status);
      li.appendChild(document.createTextNode(" "));
      li.appendChild(link);
      if (t.pushed_at) {
        const time = new Date(t.pushed_at);
        li.appendChild(el("span", { class: "boss-time", text: " — " + time.toLocaleString() }));
      }
      ul.appendChild(li);
    });
    container.appendChild(ul);
  }

  // ---------- polling --------------------------------------------------------

  function collectByTid() {
    const map = new Map();
    document.querySelectorAll("[data-boss][data-tid]").forEach((node) => {
      const tid = node.dataset.tid;
      if (!tid || tid === "0") return; // 0 = unresolved, list-only flow handles this
      if (!map.has(tid)) map.set(tid, []);
      map.get(tid).push(node);
    });
    return map;
  }

  function collectListNodes() {
    return document.querySelectorAll('[data-boss="tournaments"]');
  }

  function collectAutoNodes() {
    // Nodes with data-tid="0" want to auto-pick from the latest list.
    return document.querySelectorAll('[data-boss][data-tid="0"]');
  }

  async function fetchSnapshot(tid) {
    const r = await fetch(cfg.rest_base + "/snapshot/" + encodeURIComponent(tid), {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  async function fetchList() {
    // The endpoint pages at 50 by default; asking explicitly keeps the
    // number visible here rather than hidden in the server default.
    const r = await fetch(cfg.rest_base + "/tournaments?per_page=50", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  function applySnapshot(node, data) {
    const kind = node.dataset.boss;
    if (!data || data.empty) {
      clear(node);
      node.appendChild(el("div", { class: "boss-empty", text: "No data yet." }));
      return;
    }
    if (kind === "matches") renderMatches(node, data);
    else if (kind === "standings") renderStandings(node, data);
    else if (kind === "bracket") renderBracket(node, data);
    else if (kind === "status") renderStatus(node, data);
  }

  async function tick() {
    const listNodes = collectListNodes();
    let liveList = null;
    if (listNodes.length > 0) {
      try {
        liveList = await fetchList();
        listNodes.forEach((n) => renderList(n, liveList));
      } catch (e) {
        console.warn("[boss-live] list fetch failed", e);
      }
    }

    // Auto-pick: nodes with tid=0 take the first active or first listed tournament.
    const autoNodes = collectAutoNodes();
    if (autoNodes.length > 0) {
      try {
        const list = liveList || (await fetchList());
        const pick = list.find((t) => t.status === "active") || list[0];
        if (pick) {
          autoNodes.forEach((n) => n.setAttribute("data-tid", String(pick.id)));
        }
      } catch (e) {
        console.warn("[boss-live] auto-pick failed", e);
      }
    }

    const byTid = collectByTid();
    const requests = [];
    byTid.forEach((nodes, tid) => {
      requests.push(
        fetchSnapshot(tid)
          .then((data) => nodes.forEach((n) => applySnapshot(n, data)))
          .catch((e) => console.warn("[boss-live] snapshot fetch failed for", tid, e)),
      );
    });
    await Promise.all(requests);
  }

  function start() {
    tick();
    setInterval(tick, POLL_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
