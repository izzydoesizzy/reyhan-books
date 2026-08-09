/* ============================================================
   Reyhan's Story Shelf (V2) — Share Studio
   ------------------------------------------------------------
   Draws downloadable 1200×630 social cards on a <canvas> and
   hosts the Share Studio modal (live preview, card type +
   subject pickers, Download / native Share).

   Canvas-taint rule: only same-origin images are ever drawn —
   the checked-in covers at covers/<id>.jpg. Remote cover URLs
   (which covers.js may use for the on-page <img>s) would taint
   the canvas and break toBlob(), so a book with no local file
   gets the "cloth cover" design drawn with canvas primitives
   instead. No dependencies, no build step.
   ============================================================ */

var ShareCards = (function () {
  "use strict";

  var W = 1200, H = 630;
  var lib = null;

  /* Mirrors the styles.css tokens (canvas can't read CSS vars
     without layout trickery, and these never change). */
  var PAPER = "#FBF5EA", EDGE = "#E5D6BC", INK = "#43342A",
      INK_SOFT = "#7A6A5C", POPPY = "#E4593B", POPPY_DEEP = "#C74228",
      HONEY = "#F2A93B", HONEY_DEEP = "#D98E1B";

  var FR = 'Fraunces, Georgia, serif';
  var NU = 'Nunito, system-ui, sans-serif';
  var CA = 'Caveat, "Comic Sans MS", cursive';

  function esc(s) {
    return String(s == null ? "" : s).replace(/[<>&"]/g, function (c) {
      return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c];
    });
  }

  function fmt(n) { return n.toLocaleString("en-US"); }

  function monthName(key) {
    var names = ["January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"];
    return names[+key.slice(5, 7) - 1];
  }

  /* ---------- fonts ---------- */

  var fontsReady = null;

  /* Load the webfont weights the cards use before drawing; if the
     fonts are slow or blocked, give up after 2s and draw with the
     fallback families baked into every ctx.font string. */
  function ensureFonts() {
    if (fontsReady) return fontsReady;
    var wanted = [
      "900 72px Fraunces", "700 44px Fraunces",
      "800 30px Nunito", "700 30px Nunito", "700 52px Caveat",
    ];
    var load = Promise.all(wanted.map(function (f) {
      return document.fonts.load(f);
    })).catch(function () { /* fall back silently */ });
    var timer = new Promise(function (resolve) { setTimeout(resolve, 2000); });
    fontsReady = Promise.race([load, timer]);
    return fontsReady;
  }

  /* ---------- same-origin cover probing ---------- */

  var coverCache = {};

  function loadLocalCover(book) {
    if (book.id in coverCache) return Promise.resolve(coverCache[book.id]);
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        coverCache[book.id] = img.naturalWidth > 10 ? img : null;
        resolve(coverCache[book.id]);
      };
      img.onerror = function () {
        coverCache[book.id] = null;
        resolve(null);
      };
      img.src = "covers/" + encodeURIComponent(book.id) + ".jpg";
    });
  }

  /* ---------- drawing primitives ---------- */

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function starPath(ctx, cx, cy, rOuter, rInner) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var r = i % 2 === 0 ? rOuter : rInner;
      var a = -Math.PI / 2 + i * Math.PI / 5;
      var x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function drawStars(ctx, x, y, rating) {
    var full = Math.round(rating);
    for (var i = 0; i < 5; i++) {
      var cx = x + 17 + i * 46;
      starPath(ctx, cx, y, 17, 7);
      if (i < full) { ctx.fillStyle = HONEY; ctx.fill(); }
      ctx.strokeStyle = HONEY_DEEP;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  /* The brand book mark, same paths as the header SVG. */
  var BRAND_FULL = "M24 12 C18 7, 8 7, 5 10 L5 36 C8 33, 18 33, 24 38 C30 33, 40 33, 43 36 L43 10 C40 7, 30 7, 24 12 Z";
  var BRAND_LEFT = "M24 12 C18 7, 8 7, 5 10 L5 36 C8 33, 18 33, 24 38 Z";

  function drawBrandMark(ctx, x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = POPPY;
    ctx.fill(new Path2D(BRAND_FULL));
    ctx.fillStyle = HONEY;
    ctx.fill(new Path2D(BRAND_LEFT));
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.stroke(new Path2D("M24 12 L24 38"));
    ctx.restore();
  }

  /* Paper background, honey glow, double frame, brand footer. */
  function drawCardBase(ctx, accent) {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    var glow = ctx.createRadialGradient(W / 2, -120, 60, W / 2, -120, 720);
    glow.addColorStop(0, "rgba(242, 169, 59, .20)");
    glow.addColorStop(1, "rgba(242, 169, 59, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = EDGE;
    ctx.lineWidth = 3;
    rr(ctx, 24, 24, W - 48, H - 48, 22);
    ctx.stroke();
    ctx.strokeStyle = accent || HONEY;
    ctx.lineWidth = 2;
    rr(ctx, 36, 36, W - 72, H - 72, 16);
    ctx.stroke();

    drawBrandMark(ctx, 62, H - 96, 1.05);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = INK;
    ctx.font = "900 26px " + FR;
    ctx.fillText("Reyhan’s Story Shelf", 122, H - 62);
    ctx.textAlign = "right";
    ctx.fillStyle = INK_SOFT;
    ctx.font = "700 20px " + NU;
    ctx.fillText("izzydoesizzy.github.io/reyhan-books", W - 62, H - 62);
    ctx.textAlign = "left";
  }

  /* ---------- text helpers ---------- */

  function ellipsize(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    while (text.length && ctx.measureText(text + "…").width > maxW) {
      text = text.slice(0, -1);
    }
    return text.replace(/\s+$/, "") + "…";
  }

  function wrapLines(ctx, text, maxW, maxLines) {
    var words = String(text).split(/\s+/), lines = [], line = "";
    words.forEach(function (w) {
      var probe = line ? line + " " + w : w;
      if (ctx.measureText(probe).width > maxW && line) {
        lines.push(line);
        line = w;
      } else {
        line = probe;
      }
    });
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = ellipsize(ctx, lines[maxLines - 1] + " …", maxW);
    }
    return lines;
  }

  /* Handwritten one-liner: shrink the Caveat size until the text
     fits, ellipsizing only as a last resort. */
  function caveatLine(ctx, text, x, y, maxW, sizePx) {
    var size = sizePx;
    ctx.font = "700 " + size + "px " + CA;
    while (size > sizePx * .7 && ctx.measureText(text).width > maxW) {
      size -= 2;
      ctx.font = "700 " + size + "px " + CA;
    }
    ctx.fillText(ellipsize(ctx, text, maxW), x, y);
  }

  /* Shrink-to-fit title: tries each size until it wraps within
     maxLines, draws, and returns the baseline of the last line. */
  function drawTitle(ctx, text, x, y, maxW, maxLines) {
    var sizes = [64, 56, 48, 42], lines, size;
    for (var i = 0; i < sizes.length; i++) {
      size = sizes[i];
      ctx.font = "900 " + size + "px " + FR;
      lines = wrapLines(ctx, text, maxW, 99);
      if (lines.length <= maxLines) break;
    }
    lines = wrapLines(ctx, text, maxW, maxLines);
    var lh = Math.round(size * 1.12);
    lines.forEach(function (l, j) { ctx.fillText(l, x, y + j * lh); });
    return y + (lines.length - 1) * lh;
  }

  /* ---------- cloth-cover fallback (canvas port of
     Covers.placeholder — same 220×330 design space) ---------- */

  function clothTitleLines(title) {
    var words = title.split(/\s+/), lines = [], line = "";
    words.forEach(function (w) {
      if ((line + " " + w).trim().length > 12 && line) { lines.push(line); line = w; }
      else line = (line + " " + w).trim();
    });
    if (line) lines.push(line);
    if (lines.length > 4) { lines = lines.slice(0, 4); lines[3] += "…"; }
    return lines;
  }

  function drawClothCover(ctx, x, y, w, h, book) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(w / 220, h / 330);

    ctx.fillStyle = book.color || "#A97B4F";
    ctx.fillRect(0, 0, 220, 330);
    ctx.fillStyle = "rgba(0, 0, 0, .12)";
    ctx.fillRect(0, 0, 220, 330);
    ctx.fillStyle = "rgba(0, 0, 0, .22)";
    ctx.fillRect(0, 0, 18, 330);

    ctx.strokeStyle = HONEY;
    ctx.lineWidth = 2;
    rr(ctx, 30, 24, 178, 282, 6);
    ctx.stroke();
    ctx.strokeStyle = "rgba(242, 169, 59, .55)";
    ctx.lineWidth = 1;
    rr(ctx, 37, 31, 164, 268, 4);
    ctx.stroke();

    ctx.strokeStyle = HONEY;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(119, 72, 17, 0, Math.PI * 2);
    ctx.stroke();
    starPath(ctx, 119, 72, 9, 4);
    ctx.fillStyle = HONEY;
    ctx.fill();

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#FFF8EC";
    ctx.font = "700 26px Georgia, serif";
    var lines = clothTitleLines(book.title);
    lines.forEach(function (l, i) {
      ctx.fillText(l, 119, 150 + i * 34 - (lines.length - 1) * 17);
    });
    ctx.fillStyle = "rgba(255, 248, 236, .85)";
    ctx.font = "15px Georgia, serif";
    ctx.fillText(ellipsize(ctx, book.author || "", 180), 119, 290);
    ctx.restore();
    ctx.textAlign = "left";
  }

  /* Cover art (local image or cloth fallback) with shadow + clip.
     Returns the box it drew into. */
  function drawCoverArt(ctx, img, book) {
    var maxW = 350, maxH = 420, boxX = 90, boxY = 92;
    var ratio = img ? img.naturalWidth / img.naturalHeight : 220 / 330;
    var h = maxH, w = h * ratio;
    if (w > maxW) { w = maxW; h = w / ratio; }
    var x = boxX + (maxW - w) / 2, y = boxY + (maxH - h) / 2;

    ctx.save();
    ctx.shadowColor = "rgba(67, 52, 42, .35)";
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 14;
    rr(ctx, x, y, w, h, 10);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.restore();

    ctx.save();
    rr(ctx, x, y, w, h, 10);
    ctx.clip();
    if (img) ctx.drawImage(img, x, y, w, h);
    else drawClothCover(ctx, x, y, w, h, book);
    ctx.restore();
    return { x: x, y: y, w: w, h: h };
  }

  function miniStat(ctx, x, y, value, label) {
    ctx.textAlign = "left";
    ctx.fillStyle = INK;
    ctx.font = "900 46px " + FR;
    ctx.fillText(value, x, y);
    ctx.fillStyle = INK_SOFT;
    ctx.font = "800 17px " + NU;
    ctx.fillText(label.toUpperCase(), x, y + 28);
  }

  function kicker(ctx, text, x, y) {
    ctx.textAlign = "left";
    ctx.fillStyle = HONEY_DEEP;
    ctx.font = "800 22px " + NU;
    try { ctx.letterSpacing = "5px"; } catch (e) { /* older browsers */ }
    ctx.fillText(text.toUpperCase(), x, y);
    try { ctx.letterSpacing = "0px"; } catch (e) { /* older browsers */ }
  }

  /* Gold medallion disc shared by the passport + medal cards. */
  function drawMedallion(ctx, cx, cy, r) {
    var g = ctx.createRadialGradient(cx - r * .35, cy - r * .4, r * .15, cx, cy, r);
    g.addColorStop(0, "#FFE9B8");
    g.addColorStop(.55, HONEY);
    g.addColorStop(1, HONEY_DEEP);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = HONEY_DEEP;
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r - 15, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 248, 236, .55)";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  /* ---------- the four cards ---------- */

  function drawPassportCard(ctx) {
    drawCardBase(ctx, POPPY);
    var s = lib.stats;

    drawMedallion(ctx, 238, 268, 128);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = POPPY_DEEP;
    ctx.font = "900 128px " + FR;
    ctx.fillText("R", 238, 278);
    ctx.textBaseline = "alphabetic";

    kicker(ctx, "Storyland Reading Passport", 430, 152);
    ctx.fillStyle = INK;
    ctx.font = "900 92px " + FR;
    ctx.fillText("Reyhan", 424, 246);
    if (lib.firstDate) {
      ctx.fillStyle = INK_SOFT;
      caveatLine(ctx, "keeping this log since " + monthName(lib.firstDate.slice(0, 7)) + " " + lib.firstDate.slice(0, 4), 430, 306, 720, 42);
    }

    ctx.font = "800 26px " + NU;
    var rankText = "★ " + s.readerRank.toUpperCase() + " ★";
    var chipW = ctx.measureText(rankText).width + 56;
    rr(ctx, 430, 336, chipW, 56, 28);
    ctx.fillStyle = HONEY;
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.fillText(rankText, 458, 373);

    var earnedCount = lib.badges.filter(function (b) { return b.earned; }).length;
    miniStat(ctx, 430, 478, fmt(s.totalBooks), "books");
    miniStat(ctx, 620, 478, fmt(s.totalPages), "pages");
    miniStat(ctx, 810, 478, String(s.seriesStarted), "series");
    miniStat(ctx, 968, 478, earnedCount + " of " + lib.badges.length, "medals");
  }

  var STAT_SUBJECTS = {
    "books": function (s) {
      return { value: fmt(s.totalBooks), caption: "books finished, and counting!" };
    },
    "pages": function (s) {
      return { value: fmt(s.totalPages), caption: "pages turned, one story at a time" };
    },
    "streak": function (s) {
      return { value: String(s.streakMonths), caption: "months of reading in a row" };
    },
    "best-month": function (s) {
      return { value: String(s.busiestMonthCount), caption: "books in " + monthName(s.busiestMonthKey) + ", her best month yet!" };
    },
  };

  function drawStatsCard(ctx, id) {
    drawCardBase(ctx, HONEY);
    var s = lib.stats;
    var hero = (STAT_SUBJECTS[id] || STAT_SUBJECTS.books)(s);

    kicker(ctx, "Reyhan’s reading milestone", 90, 152);
    ctx.fillStyle = INK;
    ctx.font = "900 188px " + FR;
    ctx.fillText(hero.value, 82, 340);
    ctx.fillStyle = HONEY_DEEP;
    ctx.font = "700 56px " + CA;
    ctx.fillText(hero.caption, 90, 420);

    [[1004, 168, 26], [1084, 250, 15], [1006, 320, 11]].forEach(function (p) {
      starPath(ctx, p[0], p[1], p[2], p[2] * .42);
      ctx.fillStyle = HONEY;
      ctx.fill();
    });

    var minis = [];
    if (id !== "books") minis.push([fmt(s.totalBooks), "books"]);
    if (id !== "pages") minis.push([fmt(s.totalPages), "pages"]);
    if (id !== "streak" && s.streakMonths > 1) minis.push([s.streakMonths + " mo", "streak"]);
    if (id !== "best-month" && s.busiestMonthKey) minis.push([String(s.busiestMonthCount), "best month"]);
    minis.slice(0, 3).forEach(function (m, i) {
      miniStat(ctx, 90 + i * 210, 490, m[0], m[1]);
    });
  }

  function drawBadgeCard(ctx, badge) {
    drawCardBase(ctx, HONEY);

    /* Ribbon tails behind the medallion. */
    var cx = 250, cy = 262, r = 132;
    ctx.fillStyle = POPPY;
    ctx.beginPath();
    ctx.moveTo(cx - 54, cy + 40);
    ctx.lineTo(cx + 54, cy + 40);
    ctx.lineTo(cx + 54, cy + 218);
    ctx.lineTo(cx, cy + 182);
    ctx.lineTo(cx - 54, cy + 218);
    ctx.closePath();
    ctx.fill();
    drawMedallion(ctx, cx, cy, r);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "128px system-ui, sans-serif";
    ctx.fillText(badge.icon, cx, cy + 8);
    ctx.textBaseline = "alphabetic";

    kicker(ctx, "Medal earned ★", 470, 170);
    ctx.fillStyle = INK;
    drawTitle(ctx, badge.name, 466, 248, 640, 2);
    ctx.fillStyle = INK_SOFT;
    ctx.font = "700 32px " + NU;
    var descLines = wrapLines(ctx, badge.desc, 620, 2);
    descLines.forEach(function (l, i) { ctx.fillText(l, 470, 310 + i * 42); });
    ctx.fillStyle = HONEY_DEEP;
    caveatLine(ctx, "earned by Reyhan · " + fmt(lib.stats.totalBooks) + " books read", 470, 430, 680, 46);
  }

  function drawBookCard(ctx, book, img) {
    drawCardBase(ctx, book.color);
    drawCoverArt(ctx, img, book);
    var x = 520;

    ctx.font = "800 24px " + NU;
    var chipText = book.series + (book.seriesNumber ? " · Book " + book.seriesNumber : "");
    chipText = ellipsize(ctx, chipText, 540);
    var chipW = ctx.measureText(chipText).width + 44;
    rr(ctx, x, 108, chipW, 46, 23);
    ctx.fillStyle = book.color;
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText(chipText, x + 22, 139);

    ctx.fillStyle = INK;
    var lastBaseline = drawTitle(ctx, book.title, x - 4, 226, 600, 3);
    ctx.fillStyle = INK_SOFT;
    ctx.font = "700 30px " + NU;
    ctx.fillText(ellipsize(ctx, "by " + book.author, 600), x, lastBaseline + 52);

    if (book.rating) {
      drawStars(ctx, x, lastBaseline + 106, book.rating);
      ctx.fillStyle = INK_SOFT;
      ctx.font = "800 26px " + NU;
      ctx.fillText(book.rating.toFixed(2), x + 5 * 46 + 14, lastBaseline + 115);
    }

    ctx.fillStyle = HONEY_DEEP;
    caveatLine(ctx,
      book.displayDateRead ? "Reyhan finished this " + book.displayDateRead : "on Reyhan’s shelf",
      x, 484, 620, 44);
  }

  /* ---------- card registry ---------- */

  var CARDS = {
    passport: {
      label: "Passport",
      subjects: function () { return null; },
      prepare: function () { return Promise.resolve(null); },
      draw: function (ctx) { drawPassportCard(ctx); },
    },
    stats: {
      label: "Milestone",
      subjects: function () {
        var s = lib.stats;
        var list = [
          { id: "books", label: fmt(s.totalBooks) + " books finished" },
          { id: "pages", label: fmt(s.totalPages) + " pages read" },
        ];
        if (s.streakMonths > 1) list.push({ id: "streak", label: s.streakMonths + "-month reading streak" });
        if (s.busiestMonthKey) list.push({ id: "best-month", label: "Best month: " + s.busiestMonthCount + " books in " + monthName(s.busiestMonthKey) });
        return list;
      },
      prepare: function () { return Promise.resolve(null); },
      draw: function (ctx, id) { drawStatsCard(ctx, id); },
    },
    badge: {
      label: "Medal",
      subjects: function () {
        return lib.badges.filter(function (b) { return b.earned; })
          .map(function (b) { return { id: b.id, label: b.icon + " " + b.name }; });
      },
      prepare: function () { return Promise.resolve(null); },
      draw: function (ctx, id) {
        var badge = lib.badges.filter(function (b) { return b.id === id; })[0];
        if (badge) drawBadgeCard(ctx, badge);
      },
    },
    book: {
      label: "Book",
      subjects: function () {
        var seen = {}, list = [];
        lib.favorites.forEach(function (b) {
          seen[b.id] = 1;
          list.push({ id: b.id, label: "⭐ " + b.title });
        });
        lib.books
          .filter(function (b) { return b.dateRead && !seen[b.id]; })
          .sort(function (a, z) { return z.dateRead.localeCompare(a.dateRead); })
          .forEach(function (b) { seen[b.id] = 1; list.push({ id: b.id, label: b.title }); });
        lib.earlyBooks.forEach(function (b) {
          if (!seen[b.id]) list.push({ id: b.id, label: b.title });
        });
        return list;
      },
      prepare: function (id) {
        var book = lib.byId[id];
        return book ? loadLocalCover(book) : Promise.resolve(null);
      },
      draw: function (ctx, id, img) {
        var book = lib.byId[id];
        if (book) drawBookCard(ctx, book, img);
      },
    },
  };

  /* ---------- studio modal ---------- */

  var overlay = null, canvas = null, ctx2d = null, segWrap = null,
      subjectSel = null, downloadBtn = null, shareBtn = null,
      noteEl = null, lastFocus = null;
  var state = { type: "passport", id: null };
  var renderSeq = 0;

  var NOTE_DEFAULT = "A landscape 1200 × 630 image, made for social posts.";

  function setNote(text, isError) {
    noteEl.textContent = text;
    noteEl.classList.toggle("is-error", !!isError);
  }

  function fileName() {
    return "reyhans-story-shelf-" + state.type + (state.id ? "-" + state.id : "") + ".png";
  }

  function buildStudio() {
    if (overlay) return;
    var segs = Object.keys(CARDS).map(function (k) {
      return '<button type="button" data-type="' + k + '">' + CARDS[k].label + "</button>";
    }).join("");

    document.body.insertAdjacentHTML("beforeend",
      '<div class="studio-overlay" id="studio-overlay" hidden>' +
        '<div class="studio-panel" role="dialog" aria-modal="true" aria-label="Share card studio">' +
          '<div class="studio-head">' +
            '<h2 class="studio-title">Make a share card</h2>' +
            '<button type="button" class="icon-btn" id="studio-close" aria-label="Close">✕</button>' +
          "</div>" +
          '<div class="studio-canvas-wrap"><canvas width="' + W + '" height="' + H + '"></canvas></div>' +
          '<div class="studio-controls">' +
            '<div class="studio-seg" id="studio-seg" role="group" aria-label="Card type">' + segs + "</div>" +
            '<select class="studio-subject" id="studio-subject" aria-label="Card subject"></select>' +
          "</div>" +
          '<div class="studio-actions">' +
            '<button type="button" class="btn btn-primary" id="studio-download">Download image</button>' +
            '<button type="button" class="btn btn-ghost" id="studio-share" hidden>Share…</button>' +
          "</div>" +
          '<p class="studio-note" id="studio-note">' + NOTE_DEFAULT + "</p>" +
        "</div>" +
      "</div>");

    overlay = document.getElementById("studio-overlay");
    canvas = overlay.querySelector("canvas");
    ctx2d = canvas.getContext("2d");
    segWrap = document.getElementById("studio-seg");
    subjectSel = document.getElementById("studio-subject");
    downloadBtn = document.getElementById("studio-download");
    shareBtn = document.getElementById("studio-share");
    noteEl = document.getElementById("studio-note");

    segWrap.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-type]");
      if (btn) setType(btn.getAttribute("data-type"), null);
    });
    subjectSel.addEventListener("change", function () {
      state.id = subjectSel.value;
      renderPreview();
    });
    downloadBtn.addEventListener("click", download);
    shareBtn.addEventListener("click", share);
    document.getElementById("studio-close").addEventListener("click", closeStudio);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeStudio();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !overlay.hidden) closeStudio();
    });

    /* Native share only where files can actually be shared
       (iOS/Android — desktop browsers mostly can't). */
    try {
      var probe = new File([""], "probe.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [probe] })) {
        shareBtn.hidden = false;
      }
    } catch (e) { /* File constructor or canShare missing: keep hidden */ }
  }

  function setType(type, id) {
    state.type = CARDS[type] ? type : "passport";
    segWrap.querySelectorAll("button[data-type]").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-type") === state.type);
    });

    var subs = CARDS[state.type].subjects();
    if (subs === null) {
      subjectSel.hidden = true;
      subjectSel.disabled = true;
      downloadBtn.disabled = false;
      state.id = null;
    } else if (!subs.length) {
      subjectSel.hidden = false;
      subjectSel.disabled = true;
      subjectSel.innerHTML = "<option>Nothing to show yet</option>";
      downloadBtn.disabled = true;
      state.id = null;
    } else {
      subjectSel.hidden = false;
      subjectSel.disabled = false;
      downloadBtn.disabled = false;
      subjectSel.innerHTML = subs.map(function (o) {
        return '<option value="' + esc(o.id) + '">' + esc(o.label) + "</option>";
      }).join("");
      state.id = (id && subs.some(function (o) { return o.id === id; })) ? id : subs[0].id;
      subjectSel.value = state.id;
    }
    setNote(NOTE_DEFAULT, false);
    renderPreview();
  }

  function renderPreview() {
    var seq = ++renderSeq;
    var card = CARDS[state.type];
    if (downloadBtn.disabled) {
      ctx2d.clearRect(0, 0, W, H);
      drawCardBase(ctx2d, HONEY);
      return;
    }
    canvas.style.opacity = ".55";
    ensureFonts()
      .then(function () { return card.prepare(state.id); })
      .then(function (asset) {
        if (seq !== renderSeq) return;
        ctx2d.clearRect(0, 0, W, H);
        card.draw(ctx2d, state.id, asset);
        canvas.style.opacity = "1";
      });
  }

  function toBlob(cb) {
    try {
      canvas.toBlob(function (blob) {
        if (!blob) {
          setNote("Couldn’t export the image. If you opened this page as a file, serve it over http (python3 -m http.server) and retry.", true);
          return;
        }
        cb(blob);
      }, "image/png");
    } catch (e) {
      setNote("Couldn’t export the image. If you opened this page as a file, serve it over http (python3 -m http.server) and retry.", true);
    }
  }

  function download() {
    toBlob(function (blob) {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      setNote("Saved! Check your downloads.", false);
    });
  }

  function share() {
    toBlob(function (blob) {
      var file = new File([blob], fileName(), { type: "image/png" });
      navigator.share({ files: [file], title: "Reyhan’s Story Shelf" })
        .catch(function (err) {
          /* Cancelling the sheet is fine; real failures fall back
             to a plain download. */
          if (err && err.name !== "AbortError") download();
        });
    });
  }

  /* ---------- public API ---------- */

  function init(builtLib) {
    lib = builtLib;
  }

  function openStudio(opts) {
    if (!lib) return;
    buildStudio();
    lastFocus = document.activeElement;
    overlay.hidden = false;
    setType((opts && opts.type) || "passport", (opts && opts.id) || null);
    document.getElementById("studio-close").focus();
  }

  function closeStudio() {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    if (lastFocus) lastFocus.focus();
  }

  return { init: init, openStudio: openStudio, closeStudio: closeStudio };
})();
