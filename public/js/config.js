// Where the live backend is. Empty = same origin as this page (node server.js).
// On static hosting (GitHub Pages) there is no backend, so the app falls back
// to solo mode. To go multiplayer later, put the server's URL here,
// e.g. api: 'https://disco-doodle.onrender.com'
window.DD = {
  api: '',
  url(p) { return (this.api ? this.api.replace(/\/$/, '') + '/' : '') + p; },
  img(d) { return d.img || this.url('img/' + d.id + '.png?v=' + d.v); },
};
