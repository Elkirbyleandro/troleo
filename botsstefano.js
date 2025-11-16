const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// --- CONFIGURACIÓN ---
const HAXBALL_ROOM_URL = process.env.HAXBALL_ROOM_URL;
const BOT_NICKNAME = process.env.JOB_ID || "bot";
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1393006720237961267/lxg_qUjPdnitvXt-aGzAwthMMwNbXyZIbPcgRVfGCSuLldynhFHJdsyC4sSH-Ymli5Xm";
// ----------------------

function handleCriticalError(error, context = '') {
    console.error(`❌ ERROR CRÍTICO ${context}:`, error);
    notifyDiscord(`🔴 **ERROR CRÍTICO** - Bot ${BOT_NICKNAME} cancelado. ${context}: ${error.message}`);
    process.exit(1);
}

process.on('uncaughtException', (error) => {
    handleCriticalError(error, 'Excepción no capturada');
});

process.on('unhandledRejection', (reason, promise) => {
    handleCriticalError(new Error(reason), 'Promesa rechazada');
});

async function main() {
    console.log("🤖 Iniciando el bot de Haxball...");
    let browser;
    let page;
    let frame;

    try {
        browser = await Promise.race([
            puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout al lanzar el navegador')), 30000))
        ]);

        page = await browser.newPage();

        var haxballCountryCodes = [
            "uy", "ar", "br", "cn", "ly", "me", "vi", "cl", "cy"
        ];
        var randomCode = haxballCountryCodes[Math.floor(Math.random() * haxballCountryCodes.length)];

        await page.evaluateOnNewDocument((code) => {
            localStorage.setItem("geo", JSON.stringify({
                lat: -34.6504,
                lon: -58.3878,
                code: code || 'ar'
            }));
        }, randomCode);

        await Promise.race([
            page.goto(HAXBALL_ROOM_URL, { waitUntil: 'networkidle2' }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout al cargar la página')), 30000))
        ]);

        await page.waitForSelector('iframe');
        const iframeElement = await page.$('iframe');
        frame = await iframeElement.contentFrame();

        if (!frame) {
            throw new Error('No se pudo acceder al iframe de Haxball');
        }

        // Escribir el nick
        console.log("Escribiendo el nombre de usuario...");
        const nickSelector = 'input[data-hook="input"][maxlength="25"]';
        try {
            await frame.waitForSelector(nickSelector, { timeout: 15000 });
            await frame.type(nickSelector, BOT_NICKNAME);
        } catch (error) {
            throw new Error(`No se pudo escribir el nickname: ${error.message}`);
        }

        // Hacer clic en "Join"
        console.log("Haciendo clic en 'Join'...");
        const joinButtonSelector = 'button[data-hook="ok"]';
        try {
            await frame.waitForSelector(joinButtonSelector, { timeout: 15000 });
            await frame.click(joinButtonSelector);
        } catch (error) {
            throw new Error(`No se pudo hacer clic en Join: ${error.message}`);
        }

        // Esperar que cargue la sala
        console.log("Esperando a que se cargue la sala...");
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Verificar que estamos en la sala
        try {
            const chatSelector = 'input[data-hook="input"][maxlength="140"]';
            await frame.waitForSelector(chatSelector, { timeout: 10000 });
            console.log("✅ ¡Bot dentro de la sala!");
            await notifyDiscord(`🟢 El bot **${BOT_NICKNAME}** ha entrado a la sala.`);
        } catch (error) {
            throw new Error('No se pudo verificar el acceso a la sala');
        }

        // Enviar mensaje inicial
        await sendMessageToChat(frame, process.env.LLAMAR_ADMIN, page);
        
        // IMPORTANTE: Esperar un poco después del primer mensaje
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Mensaje al chat cada X segundos
        const chatInterval = setInterval(async () => {
            try {
                await sendMessageToChat(frame, process.env.MENSAJE, page);
            } catch (error) {
                console.error("⚠️ Error al enviar mensaje al chat:", error.message);
                // Si falla 3 veces consecutivas, probablemente el bot fue kickeado
            }
        }, parseInt(process.env.DELAYDOWN));

        const otrointerval = setInterval(async () => {
            try {
                await sendMessageToChat(frame, process.env.LLAMAR_ADMIN, page);
            } catch (error) {
                console.error("⚠️ Error al enviar mensaje admin:", error.message);
            }
        }, parseInt(process.env.DELAYADMIN));

        // Movimiento anti-AFK
        let moves = ['w', 'a', 's', 'd'];
        let moveIndex = 0;

        const moveInterval = setInterval(async () => {
            try {
                const key = moves[moveIndex % moves.length];
                console.log(`Presionando tecla: ${key}`);
                await page.keyboard.press(key);
                moveIndex++;
            } catch (error) {
                console.error("⚠️ Error al presionar tecla:", error.message);
            }
        }, 5000);

        // Verificar conexión cada 30 segundos
        let failedHealthChecks = 0;
        const healthCheck = setInterval(async () => {
            try {
                const chatSelector = 'input[data-hook="input"][maxlength="140"]';
                const element = await frame.$(chatSelector);
                
                if (!element) {
                    throw new Error('Input del chat no encontrado');
                }
                
                console.log("✅ Conexión activa");
                failedHealthChecks = 0;
            } catch (error) {
                failedHealthChecks++;
                console.error(`❌ Fallo en verificación de conexión (${failedHealthChecks}/3)`);
                
                if (failedHealthChecks >= 3) {
                    clearInterval(healthCheck);
                    clearInterval(chatInterval);
                    clearInterval(otrointerval);
                    clearInterval(moveInterval);
                    await notifyDiscord(`⚠️ Bot **${BOT_NICKNAME}** perdió conexión (posiblemente kickeado)`);
                    throw new Error('Perdida de conexión con el servidor (3 fallos consecutivos)');
                }
            }
        }, 30000);

        // Mantenerlo vivo 1 hora
        await new Promise(resolve => setTimeout(resolve, 3600000));

        // Limpiar intervalos
        clearInterval(chatInterval);
        clearInterval(otrointerval);
        clearInterval(moveInterval);
        clearInterval(healthCheck);

    } catch (error) {
        console.error("❌ Error durante la ejecución del bot:", error);
        await notifyDiscord(`🔴 Error en bot **${BOT_NICKNAME}**. Causa: ${error.message}`);
        
        if (browser) {
            try {
                await browser.close();
            } catch (e) {
                console.error("Error al cerrar el navegador:", e);
            }
        }
        process.exit(1);
    } finally {
        console.log("Cerrando el bot.");
        if (browser) {
            try {
                await browser.close();
            } catch (e) {
                console.error("Error al cerrar el navegador:", e);
            }
        }
        await notifyDiscord(`🟡 El bot **${BOT_NICKNAME}** ha terminado su ejecución.`);
    }
}

// Enviar notificación a Discord
async function notifyDiscord(message) {
    if (!DISCORD_WEBHOOK_URL) return;
    
    try {
        await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: message }),
        });
    } catch (e) {
        console.error("Error al enviar notificación a Discord:", e);
    }
}

// Enviar mensaje al chat con reintentos mejorados
async function sendMessageToChat(frame, message, page) {
    const maxRetries = 3;
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            const chatSelector = 'input[data-hook="input"][maxlength="140"]';
            
            // Verificar si el elemento existe antes de esperar
            const element = await frame.$(chatSelector);
            if (!element) {
                console.warn(`⚠️ Input del chat no encontrado (intento ${i + 1}/${maxRetries})`);
                if (i === maxRetries - 1) {
                    throw new Error('Bot posiblemente fue kickeado o sala cerrada');
                }
                await new Promise(resolve => setTimeout(resolve, 3000));
                continue;
            }

            // Hacer triple clic para seleccionar todo el texto
            await element.click({ clickCount: 3 });
            await new Promise(resolve => setTimeout(resolve, 300));

            // Borrar todo con Delete
            await page.keyboard.press('Delete');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Verificar que está limpio y hacer clic nuevamente
            await element.click();
            await new Promise(resolve => setTimeout(resolve, 200));

            // Escribir mensaje
            await page.keyboard.type(message, { delay: 50 });
            await new Promise(resolve => setTimeout(resolve, 400));

            // Enviar
            await page.keyboard.press('Enter');
            console.log(`✉️ Mensaje enviado: ${message}`);

            // Esperar antes de retornar
            await new Promise(resolve => setTimeout(resolve, 1500));
            return;
            
        } catch (error) {
            console.error(`⚠️ Intento ${i + 1}/${maxRetries} falló:`, error.message);
            if (i === maxRetries - 1) {
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

let intentos = 0;
const MAX_INTENTOS = 1000;

async function iniciarBotConReintentos() {
    while (intentos < MAX_INTENTOS) {
        try {
            intentos++;
            console.log(`🔁 Intento ${intentos} de ${MAX_INTENTOS}`);
            await main();
            break;
        } catch (error) {
            console.error(`❌ Intento ${intentos} fallido:`, error.message);
            
            if (intentos >= MAX_INTENTOS) {
                console.error("🚫 Máximo de intentos alcanzado. Abortando.");
                await notifyDiscord(`❌ El bot **${BOT_NICKNAME}** falló tras ${MAX_INTENTOS} intentos.`);
                process.exit(1);
            }
            
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

// Iniciar con reintentos
iniciarBotConReintentos();
