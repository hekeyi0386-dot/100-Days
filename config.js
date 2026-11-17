// Site settings for "100 Days of Frames". Edit freely; tools/build_garden.py never touches this file.
window.GARDEN_CONFIG = {
  title: "100 Days of Frames",
  subtitle: "Finding unfamiliar compositions in familiar days.",
  line: "A constellation of things I almost walked past.",

  // Day 1 falls on this date; every other day's date is counted from it.
  // (Optional per day: add  date: "2026-11-02"  to an entry in data.js to override.)
  startDate: "2026-10-07",

  // Faint lines between days that rhyme visually. A day can belong to two constellations.
  constellations: [
    { name: "Sky",                  days: [1, 16, 41, 40] },
    { name: "Windows",              days: [3, 7, 9, 26] },
    { name: "Shadow & reflection",  days: [23, 26, 25, 40] },
    { name: "Architecture & lines", days: [4, 15, 23, 13] },
    { name: "Repetition",           days: [5, 8, 10, 37, 39, 44] },
    { name: "Soft rounds",          days: [18, 27, 28, 33] },
    { name: "Texture",              days: [11, 30, 31, 43] },
    { name: "Green things",         days: [19, 20, 32, 25] },
    { name: "Companions",           days: [12, 14, 36, 34] },
    { name: "Gatherings",           days: [21, 22, 24] },
  ],
};
