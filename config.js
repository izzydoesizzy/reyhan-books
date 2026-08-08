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
};

/* Books' ASINs equal their ISBN-10, and Amazon's cover CDN is
   keyed by ASIN — so the /dp/ segment of the Amazon URL gives a
   cover key even for books with no usable ISBN-10. */
function extractAsin(url) {
  var m = /\/dp\/([A-Z0-9]{10})/i.exec(url || "");
  return m ? m[1] : null;
}

/* Badges shown on the Reading Passport. Each `test` receives the
   built library and returns true when the badge is earned. */
const V2_BADGES = [
  { id: "first-book", icon: "🌱", name: "First Book", desc: "Finished your very first book", test: (lib) => lib.stats.totalBooks >= 1 },
  { id: "ten-books", icon: "🐛", name: "Bookworm", desc: "Read 10 books", test: (lib) => lib.stats.totalBooks >= 10 },
  { id: "twenty-five", icon: "🦉", name: "Wise Owl", desc: "Read 25 books", test: (lib) => lib.stats.totalBooks >= 25 },
  { id: "fifty-books", icon: "🐲", name: "Book Dragon", desc: "Read 50 books", test: (lib) => lib.stats.totalBooks >= 50 },
  { id: "hundred-books", icon: "👑", name: "Century Reader", desc: "Read 100 books", test: (lib) => lib.stats.totalBooks >= 100 },
  { id: "thousand-pages", icon: "⛰️", name: "Page Climber", desc: "Read 1,000 pages", test: (lib) => lib.stats.totalPages >= 1000 },
  { id: "fivek-pages", icon: "🏔️", name: "Page Mountaineer", desc: "Read 5,000 pages", test: (lib) => lib.stats.totalPages >= 5000 },
  { id: "sampler", icon: "🎨", name: "Series Sampler", desc: "Started 5 different series", test: (lib) => lib.stats.seriesStarted >= 5 },
  { id: "explorer", icon: "🧭", name: "Shelf Explorer", desc: "Started 8 different series", test: (lib) => lib.stats.seriesStarted >= 8 },
  { id: "dragon-master", icon: "🔥", name: "Dragon Master", desc: "Read 5 Dragon Masters books", test: (lib) => (lib.seriesCounts["Dragon Masters"] || 0) >= 5 },
  { id: "big-month", icon: "🚀", name: "Rocket Month", desc: "Read 8 books in a single month", test: (lib) => lib.stats.busiestMonthCount >= 8 },
  { id: "streak-3", icon: "🔗", name: "Chain of Months", desc: "Read books 3 months in a row", test: (lib) => lib.stats.streakMonths >= 3 },
  { id: "streak-6", icon: "⚡", name: "Unstoppable", desc: "Read books 6 months in a row", test: (lib) => lib.stats.streakMonths >= 6 },
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

  /* Books-per-month map, e.g. { "2026-03": 9 } */
  var byMonth = {};
  dated.forEach(function (b) {
    var key = b.dateRead.slice(0, 7);
    (byMonth[key] = byMonth[key] || []).push(b);
  });
  var monthKeys = Object.keys(byMonth).sort();

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

  var lib = {
    books: books,
    byId: byId,
    series: series,
    seriesCounts: seriesCounts,
    byMonth: byMonth,
    monthKeys: monthKeys,
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
    },
  };

  lib.badges = V2_BADGES.map(function (def) {
    return { id: def.id, icon: def.icon, name: def.name, desc: def.desc, earned: !!def.test(lib) };
  });

  return lib;
}
