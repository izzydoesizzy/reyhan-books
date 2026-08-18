/* ============================================================
   Reyhan's Story Shelf (V2) — configuration + data adapter
   ------------------------------------------------------------
   V2 reads the shared library data from data.js (BOOKS,
   SERIES_ORDER, SERIES_META). This file is the only place V1
   field names appear: buildLibrary() normalizes everything into
   the view models the V2 app renders. Add books in data.js
   and both versions of the site pick them up.
   ============================================================ */

/* Fresh V2 "gouache" accent per series (independent of V1's set). */
const V2_SERIES_COLORS = {
  "Frozen": "#6FB7E9",
  "Anna & Elsa": "#9B8CE8",
  "Dragon Masters": "#E4593B",
  "Llama Quest": "#58A55C",
  "Kwame's Magic Quest": "#2E9E8F",
  "Pets Rule!": "#F2A93B",
  "The Last Firehawk": "#E98A2B",
  "Pixie Tricks": "#C77DCA",
  "Coral Keepers": "#35B5AD",
  "Once Upon a Fairy Tale": "#7FA9E0",
};

const V2_FALLBACK_COLOR = "#A97B4F";

/* "Once Upon a Shelf" — the early-reads collection (picture books,
   board books, bilingual and one-off titles from before this log's
   chapter-book chronicle begins). No individual dateRead is tracked
   for these, so they're shown as one approximate-range shelf instead
   of a dated log. See EARLY_BOOKS in data.js. */
const EARLY_READS_LABEL = "Once Upon a Shelf";
const EARLY_READS_RANGE = "2022–2025";

/* Hand-picked cover URLs for books the automatic sources miss
   (see covercheck.html for the per-book source report). Entries
   are probed like any other candidate, so a dead URL simply
   falls through to the rest of the chain — safe to leave in. */
const COVER_OVERRIDES = {
  /* 979-prefix ISBN-13; thin Open Library coverage. Direct
     Google Books image endpoint for volume wad0EQAAQBAJ. */
  "dragon-masters-31": "https://books.google.com/books/content?id=wad0EQAAQBAJ&printsec=frontcover&img=1&zoom=2",
  /* No covers/once-upon-fairy-tale-01.jpg checked in yet. This is
     the full-size Amazon art for the 2019 Branches paperback, so
     the card shows the right edition instead of whatever Open
     Library returns for the ISBN first. */
  "once-upon-fairy-tale-01": "https://m.media-amazon.com/images/I/91mtnir6oaL._AC_UF1000,1000_QL80_AIweblab1381794,T1_.jpg",
};

/* Books' ASINs equal their ISBN-10, and Amazon's cover CDN is
   keyed by ASIN — so the /dp/ segment of the Amazon URL gives a
   cover key even for books with no usable ISBN-10. */
function extractAsin(url) {
  var m = /\/dp\/([A-Z0-9]{10})/i.exec(url || "");
  return m ? m[1] : null;
}

/* Badges shown on the Reading Passport. Each `test` receives the
   built library and returns true when the badge is earned; `metric`
   + `target` drive the progress rings on locked medals (metric
   returns the current count for that badge's goal). */
const V2_BADGES = [
  { id: "first-book", icon: "🌱", name: "First Book", desc: "Finished your very first book", target: 1, metric: (lib) => lib.stats.totalBooks, test: (lib) => lib.stats.totalBooks >= 1 },
  { id: "ten-books", icon: "🐛", name: "Bookworm", desc: "Read 10 books", target: 10, metric: (lib) => lib.stats.totalBooks, test: (lib) => lib.stats.totalBooks >= 10 },
  { id: "twenty-five", icon: "🦉", name: "Wise Owl", desc: "Read 25 books", target: 25, metric: (lib) => lib.stats.totalBooks, test: (lib) => lib.stats.totalBooks >= 25 },
  { id: "fifty-books", icon: "🐲", name: "Book Dragon", desc: "Read 50 books", target: 50, metric: (lib) => lib.stats.totalBooks, test: (lib) => lib.stats.totalBooks >= 50 },
  { id: "hundred-books", icon: "👑", name: "Century Reader", desc: "Read 100 books", target: 100, metric: (lib) => lib.stats.totalBooks, test: (lib) => lib.stats.totalBooks >= 100 },
  { id: "one-fifty", icon: "🌟", name: "Sky-High Stack", desc: "Read 150 books", target: 150, metric: (lib) => lib.stats.totalBooks, test: (lib) => lib.stats.totalBooks >= 150 },
  { id: "two-hundred", icon: "🏰", name: "Story Castle", desc: "Read 200 books", target: 200, metric: (lib) => lib.stats.totalBooks, test: (lib) => lib.stats.totalBooks >= 200 },
  { id: "thousand-pages", icon: "⛰️", name: "Page Climber", desc: "Read 1,000 pages", target: 1000, metric: (lib) => lib.stats.totalPages, test: (lib) => lib.stats.totalPages >= 1000 },
  { id: "fivek-pages", icon: "🏔️", name: "Page Mountaineer", desc: "Read 5,000 pages", target: 5000, metric: (lib) => lib.stats.totalPages, test: (lib) => lib.stats.totalPages >= 5000 },
  { id: "tenk-pages", icon: "🌕", name: "Page Moonwalker", desc: "Read 10,000 pages", target: 10000, metric: (lib) => lib.stats.totalPages, test: (lib) => lib.stats.totalPages >= 10000 },
  { id: "sampler", icon: "🎨", name: "Series Sampler", desc: "Started 5 different series", target: 5, metric: (lib) => lib.stats.seriesStarted, test: (lib) => lib.stats.seriesStarted >= 5 },
  { id: "explorer", icon: "🧭", name: "Shelf Explorer", desc: "Started 8 different series", target: 8, metric: (lib) => lib.stats.seriesStarted, test: (lib) => lib.stats.seriesStarted >= 8 },
  { id: "dragon-master", icon: "🔥", name: "Dragon Master", desc: "Read 5 Dragon Masters books", target: 5, metric: (lib) => lib.seriesCounts["Dragon Masters"] || 0, test: (lib) => (lib.seriesCounts["Dragon Masters"] || 0) >= 5 },
  { id: "big-month", icon: "🚀", name: "Rocket Month", desc: "Read 8 books in a single month", target: 8, metric: (lib) => lib.stats.busiestMonthCount, test: (lib) => lib.stats.busiestMonthCount >= 8 },
  { id: "month-15", icon: "☄️", name: "Comet Month", desc: "Read 15 books in a single month", target: 15, metric: (lib) => lib.stats.busiestMonthCount, test: (lib) => lib.stats.busiestMonthCount >= 15 },
  { id: "streak-3", icon: "🔗", name: "Chain of Months", desc: "Read books 3 months in a row", target: 3, metric: (lib) => lib.stats.streakMonths, test: (lib) => lib.stats.streakMonths >= 3 },
  { id: "streak-6", icon: "⚡", name: "Unstoppable", desc: "Read books 6 months in a row", target: 6, metric: (lib) => lib.stats.streakMonths, test: (lib) => lib.stats.streakMonths >= 6 },
  { id: "streak-12", icon: "🗓️", name: "Year of Stories", desc: "Read books 12 months in a row", target: 12, metric: (lib) => lib.stats.streakMonths, test: (lib) => lib.stats.streakMonths >= 12 },
];

/* Reader rank ladder shown on the passport ID page. The last entry
   whose `min` is at or under the total book count is the current
   rank; the one after it is the next rank to chase. */
const V2_READER_RANKS = [
  { min: 0, name: "Story Sprout" },
  { min: 10, name: "Page Turner" },
  { min: 25, name: "Chapter Champion" },
  { min: 60, name: "Story Voyager" },
  { min: 100, name: "Book Dragon" },
  { min: 150, name: "Legendary Librarian" },
];

/* Reyhan's favourite books — shown as a starred shelf on the
   passport, and offered first in the Share Studio's book picker.
   Edit freely: any id from BOOKS or EARLY_BOOKS in data.js works,
   and unknown ids are simply skipped. */
const REYHAN_FAVORITES = [
  "kwames-magic-quest-04",
  "last-firehawk-06",
  "dragon-masters-30",
  "last-firehawk-04",
  "dragon-masters-06",
];

/* Shared view-model mapper for both BOOKS and EARLY_BOOKS entries. */
function toViewModel(b) {
  var meta = SERIES_META[b.series] || {};
  return {
    id: b.id,
    title: b.title,
    series: b.series,
    seriesNumber: b.seriesNumber,
    author: b.author || "Unknown",
    illustrator: meta.illustrator || null,
    ageRange: meta.ageRange || null,
    gradeLevel: meta.gradeLevel || null,
    lexile: meta.lexile || null,
    tags: meta.tags || [],
    dateRead: b.dateRead || null,
    displayDateRead: b.displayDateRead || null,
    rating: b.goodreadsRating || null,
    ratingUrl: b.goodreadsUrl || null,
    synopsis: b.synopsis || "",
    pages: b.pages || null,
    isbn: b.coverIsbn || null,
    asin: extractAsin(b.amazonUsUrl),
    override: COVER_OVERRIDES[b.id] || null,
    amazonUs: b.amazonUsUrl || null,
    amazonCa: b.amazonCaUrl || null,
    color: V2_SERIES_COLORS[b.series] || V2_FALLBACK_COLOR,
  };
}

/* Normalize the V1 globals into the shapes V2 renders. */
function buildLibrary() {
  var mainRaw = BOOKS.filter(function (b) { return b.status !== "upNext"; });

  /* Once Upon a Shelf: skip anything whose title already exists in
     the main chapter-book log, and stamp the rest into one shared
     "series" so they group as a single shelf instead of scattering
     as ungrouped standalones. */
  var mainTitles = {};
  mainRaw.forEach(function (b) { mainTitles[b.title.trim().toLowerCase()] = true; });
  var earlyRaw = (typeof EARLY_BOOKS !== "undefined" ? EARLY_BOOKS : [])
    .filter(function (b) { return !mainTitles[b.title.trim().toLowerCase()]; })
    .map(function (b) {
      return Object.assign({}, b, { series: EARLY_READS_LABEL, seriesNumber: null });
    });

  var books = mainRaw.concat(earlyRaw).map(toViewModel);

  var byId = {};
  books.forEach(function (b) { byId[b.id] = b; });

  var seriesCounts = {};
  books.forEach(function (b) {
    seriesCounts[b.series] = (seriesCounts[b.series] || 0) + 1;
  });

  var series = SERIES_ORDER.map(function (name) {
    var meta = SERIES_META[name] || {};
    var shelf = books
      .filter(function (b) { return b.series === name; })
      .sort(function (a, z) { return (z.dateRead || "").localeCompare(a.dateRead || ""); });
    return {
      name: name,
      color: V2_SERIES_COLORS[name] || V2_FALLBACK_COLOR,
      count: shelf.length,
      books: shelf,
      tags: meta.tags || [],
      suggestions: (meta.suggestions || []).map(function (s) {
        return { title: s.title, author: s.author, blurb: s.blurb, amazonUs: s.amazonUsUrl, amazonCa: s.amazonCaUrl };
      }),
    };
  }).filter(function (s) { return s.count > 0; });

  var dated = books
    .filter(function (b) { return b.dateRead; })
    .sort(function (a, z) { return a.dateRead.localeCompare(z.dateRead); });

  /* First read per series ("first visit" on the visa stamps).
     `dated` is ascending, so the first book seen per series wins.
     Series with only undated books simply have no entry. */
  var seriesFirstDate = {};
  dated.forEach(function (b) {
    if (!seriesFirstDate[b.series]) seriesFirstDate[b.series] = b.dateRead;
  });

  /* Books-per-month map, e.g. { "2026-03": 9 } */
  var byMonth = {};
  dated.forEach(function (b) {
    var key = b.dateRead.slice(0, 7);
    (byMonth[key] = byMonth[key] || []).push(b);
  });
  var monthKeys = Object.keys(byMonth).sort();

  /* Books-per-year map, e.g. { "2026": 58 } */
  var byYear = {};
  dated.forEach(function (b) {
    var key = b.dateRead.slice(0, 4);
    byYear[key] = (byYear[key] || 0) + 1;
  });
  var yearKeys = Object.keys(byYear).sort();

  var busiestKey = null, busiestCount = 0;
  monthKeys.forEach(function (k) {
    if (byMonth[k].length > busiestCount) { busiestCount = byMonth[k].length; busiestKey = k; }
  });

  /* Longest run of consecutive calendar months containing reads. */
  var bestStreak = 0, run = 0, prev = null;
  monthKeys.forEach(function (k) {
    var y = +k.slice(0, 4), m = +k.slice(5, 7);
    var serial = y * 12 + m;
    run = (prev !== null && serial === prev + 1) ? run + 1 : 1;
    if (run > bestStreak) bestStreak = run;
    prev = serial;
  });

  var totalPages = books.reduce(function (sum, b) { return sum + (b.pages || 0); }, 0);
  var rated = books.filter(function (b) { return b.rating; });
  var avgRating = rated.length
    ? rated.reduce(function (sum, b) { return sum + b.rating; }, 0) / rated.length
    : null;

  /* Once Upon a Shelf books have no dateRead, so they never enter
     `dated`/`byMonth` and can never become `latest` — alphabetical
     is the only ordering that makes sense without dates. */
  var earlyBooks = books
    .filter(function (b) { return b.series === EARLY_READS_LABEL; })
    .sort(function (a, z) { return a.title.localeCompare(z.title); });

  /* Current + next reader rank from the total book count. */
  var rank = V2_READER_RANKS[0], nextRank = null;
  V2_READER_RANKS.forEach(function (r, i) {
    if (books.length >= r.min) {
      rank = r;
      nextRank = V2_READER_RANKS[i + 1] || null;
    }
  });

  var lib = {
    books: books,
    byId: byId,
    series: series,
    seriesCounts: seriesCounts,
    seriesFirstDate: seriesFirstDate,
    byMonth: byMonth,
    monthKeys: monthKeys,
    byYear: byYear,
    yearKeys: yearKeys,
    latest: dated.length ? dated[dated.length - 1] : books[0],
    firstDate: dated.length ? dated[0].dateRead : null,
    lastDate: dated.length ? dated[dated.length - 1].dateRead : null,
    earlyBooks: earlyBooks,
    earlyReadsLabel: EARLY_READS_LABEL,
    earlyReadsRange: EARLY_READS_RANGE,
    stats: {
      totalBooks: books.length,
      totalPages: totalPages,
      avgRating: avgRating,
      seriesStarted: series.length + (earlyBooks.length ? 1 : 0),
      busiestMonthKey: busiestKey,
      busiestMonthCount: busiestCount,
      streakMonths: bestStreak,
      readerRank: rank.name,
      nextRank: nextRank ? nextRank.name : null,
      nextRankAt: nextRank ? nextRank.min : null,
    },
  };

  lib.badges = V2_BADGES.map(function (def) {
    var current = def.metric(lib), earned = !!def.test(lib);
    return {
      id: def.id, icon: def.icon, name: def.name, desc: def.desc,
      earned: earned,
      current: Math.min(current, def.target),
      target: def.target,
      pct: Math.min(1, current / def.target),
    };
  });

  /* The closest unearned badge powers the "next milestone" tracker
     (null once every badge is earned). */
  lib.nextMilestone = lib.badges
    .filter(function (b) { return !b.earned; })
    .sort(function (a, z) { return z.pct - a.pct; })[0] || null;

  lib.favorites = REYHAN_FAVORITES
    .map(function (id) { return byId[id]; })
    .filter(Boolean);

  return lib;
}
