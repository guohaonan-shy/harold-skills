function diffKit() {
  return {
    boxOf: async (page, pairs) => {
      const tab = await page.context().newPage();
      try {
        return await tab.evaluate(async (items) => {
          const load = async (b64) => {
            const img = new Image();
            img.src = 'data:image/png;base64,' + b64;
            await img.decode();
            return img;
          };
          let x0 = Infinity;
          let y0 = Infinity;
          let x1 = -1;
          let y1 = -1;
          for (const it of items) {
            const [ia, ib] = [await load(it.a), await load(it.b)];
            const w = Math.max(ia.width, ib.width);
            const h = Math.max(ia.height, ib.height);
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            const g = c.getContext('2d', { willReadFrequently: true });
            g.drawImage(ia, 0, 0);
            const da = g.getImageData(0, 0, w, h).data;
            g.clearRect(0, 0, w, h);
            g.drawImage(ib, 0, 0);
            const db = g.getImageData(0, 0, w, h).data;
            for (let y = 0; y < h; y += 1) {
              for (let x = 0; x < w; x += 1) {
                const o = (y * w + x) * 4;
                if (da[o] !== db[o] || da[o + 1] !== db[o + 1] || da[o + 2] !== db[o + 2] || da[o + 3] !== db[o + 3]) {
                  if (x < x0) x0 = x;
                  if (x > x1) x1 = x;
                  if (it.y + y < y0) y0 = it.y + y;
                  if (it.y + y > y1) y1 = it.y + y;
                }
              }
            }
          }
          return x1 < 0 ? 'same' : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
        }, pairs.map((x) => ({ a: x.a.toString('base64'), b: x.b.toString('base64'), y: x.y })));
      } catch (e) {
        return undefined;
      } finally {
        await tab.close();
      }
    },
  };
}