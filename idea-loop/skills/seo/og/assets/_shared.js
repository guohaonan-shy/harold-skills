(function () {
  // Seeded noise, so the same card renders to the same bytes. Canvas, not feTurbulence: it screenshots reliably.
  var c = document.getElementById('grain');
  if (c) {
    var ctx = c.getContext('2d'), img = ctx.createImageData(c.width, c.height), s = 1234567;
    for (var i = 0; i < img.data.length; i += 4) {
      s = (s * 1664525 + 1013904223) >>> 0;
      var v = (s >>> 24) & 128 ? 255 : 0; // two levels: the card stays a small PNG (full-range noise does not compress)
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  // Every [data-fit="max:min"] text block shrinks from max to min px until it fits the box it sits in; a bare
  // number means "must fit as is". Nothing is clipped silently: whatever still overflows is reported.
  function name(el, n) { return el.className.split(' ')[0] || 'el' + n; }
  function over(el) {
    var box = el.parentElement;
    return el.scrollWidth > el.clientWidth + 1 || el.offsetHeight > box.clientHeight + 1 || el.offsetWidth > box.clientWidth + 1;
  }
  function fit() {
    var bad = [], sizes = {};
    document.querySelectorAll('[data-fit]').forEach(function (el, n) {
      var p = el.getAttribute('data-fit').split(':'), max = +p[0], min = +(p[1] || p[0]), size = max;
      el.style.fontSize = size + 'px';
      while (over(el) && size > min) { size = Math.max(size - 2, min); el.style.fontSize = size + 'px'; }
      sizes[name(el, n)] = size;
      if (over(el)) bad.push(name(el, n));
    });
    var root = document.documentElement;
    root.setAttribute('data-sizes', JSON.stringify(sizes));
    root.setAttribute('data-overflow', bad.join(','));
    root.setAttribute('data-fit', bad.length ? 'overflow' : 'ok');
  }
  var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  ready.then(function () { requestAnimationFrame(fit); });
})();
