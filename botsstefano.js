const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// --- CONFIGURACIÓN ---
const HAXBALL_ROOM_URL = process.env.HAXBALL_ROOM_URL;
const BOT_NICKNAME = process.env.JOB_ID || "bot";
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "https://discord.com/api/webhooks/1393006720237961267/lxg_qUjPdnitvXt-aGzAwthMMwNbXyZIbPcgRVfGCSuLldynhFHJdsyC4sSH-Ymli5Xm";
const MENSAJE = process.env.MENSAJE || "Bot activo";
const LLAMAR_ADMIN = process.env.LLAMAR_ADMIN || "Llamando admin";
const DELAY_MENSAJE = parseInt(process.env.DELAYDOWN) || 60000;
const DELAY_ADMIN = parseInt(process.env.DELAYADMIN) || 300000;
const DURACION_BOT = parseInt(process.env.DURACION) || 3600000; // 1 hora por defecto
// ----------------------

// Enviar notificación a Discord
async function notifyDiscord(message) {
    if (!DISCORD_WEBHOOK_URL) return;
    
    try {
        const fetch = (await import('node-fetch')).default;
        await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: message }),
        });
    } catch (e) {
        console.error("Error al enviar notificación a Discord:", e.message);
    }
}

function handleCriticalError(error, context = '') {
    console.error(`❌ ERROR CRÍTICO ${context}:`, error.message);
    notifyDiscord(`🔴 **ERROR CRÍTICO** - Bot ${BOT_NICKNAME} cancelado. ${context}: ${error.message}`);
    process.exit(1);
}

process.on('uncaughtException', (error) => {
    handleCriticalError(error, 'Excepción no capturada');
});

process.on('unhandledRejection', (reason) => {
    handleCriticalError(new Error(String(reason)), 'Promesa rechazada');
});

// Enviar mensaje al chat con reintentos mejorados
async function sendMessageToChat(frame, message, page) {
    const maxRetries = 3;
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            const chatSelector = 'input[data-hook="input"][maxlength="140"]';
            
            // Verificar si el elemento existe
            const element = await frame.$(chatSelector);
            if (!element) {
                console.warn(`⚠️ Input del chat no encontrado (intento ${i + 1}/${maxRetries})`);
                if (i === maxRetries - 1) {
                    throw new Error('Bot posiblemente fue kickeado o sala cerrada');
                }
                await new Promise(resolve => setTimeout(resolve, 3000));
                continue;
            }

            // Limpiar el input
            await element.click({ clickCount: 3 });
            await new Promise(resolve => setTimeout(resolve, 300));
            await page.keyboard.press('Backspace');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Escribir y enviar mensaje
            await element.type(message, { delay: 50 });
            await new Promise(resolve => setTimeout(resolve, 400));
            await page.keyboard.press('Enter');
            
            console.log(`✉️ Mensaje enviado: ${message}`);
            await new Promise(resolve => setTimeout(resolve, 1500));
            return true;
            
        } catch (error) {
            console.error(`⚠️ Intento ${i + 1}/${maxRetries} falló:`, error.message);
            if (i === maxRetries - 1) {
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    return false;
}

async function main() {
    console.log("🤖 Iniciando el bot de Haxball...");
    
    if (!HAXBALL_ROOM_URL) {
        throw new Error('HAXBALL_ROOM_URL no está definida');
    }

    let browser;
    let page;
    let frame;
    let intervals = [];

    try {
        // Lanzar navegador con timeout
        browser = await Promise.race([
            puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            }),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout al lanzar el navegador')), 30000)
            )
        ]);

        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });

        // Configurar geolocalización aleatoria
        const haxballCountryCodes = ["uy", "ar", "br", "cn", "ly", "me", "vi", "cl", "cy"];
        const randomCode = haxballCountryCodes[Math.floor(Math.random() * haxballCountryCodes.length)];

        await page.evaluateOnNewDocument((code) => {
            localStorage.setItem("geo", JSON.stringify({
                lat: -34.6504,
                lon: -58.3878,
                code: code
            }));
        }, randomCode);

        console.log(`🌍 País seleccionado: ${randomCode.toUpperCase()}`);

        // Navegar a la sala
        await Promise.race([
            page.goto(HAXBALL_ROOM_URL, { waitUntil: 'networkidle2', timeout: 30000 }),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout al cargar la página')), 35000)
            )
        ]);

        // Obtener el iframe
        await page.waitForSelector('iframe', { timeout: 15000 });
        const iframeElement = await page.$('iframe');
        frame = await iframeElement.contentFrame();

        if (!frame) {
            throw new Error('No se pudo acceder al iframe de Haxball');
        }

        // Escribir el nickname
        console.log("✏️ Escribiendo el nombre de usuario...");
        const nickSelector = 'input[data-hook="input"][maxlength="25"]';
        await frame.waitForSelector(nickSelector, { timeout: 15000 });
        await frame.type(nickSelector, BOT_NICKNAME, { delay: 100 });
        await new Promise(resolve => setTimeout(resolve, 500));

        // Hacer clic en "Join"
        console.log("🚪 Haciendo clic en 'Join'...");
        const joinButtonSelector = 'button[data-hook="ok"]';
        await frame.waitForSelector(joinButtonSelector, { timeout: 15000 });
        await frame.click(joinButtonSelector);

        // Esperar que cargue la sala
        console.log("⏳ Esperando a que se cargue la sala...");
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Verificar que estamos en la sala
        const chatSelector = 'input[data-hook="input"][maxlength="140"]';
        await frame.waitForSelector(chatSelector, { timeout: 15000 });
        console.log("✅ ¡Bot dentro de la sala!");
        await notifyDiscord(`🟢 El bot **${BOT_NICKNAME}** ha entrado a la sala.`);

        // Enviar mensaje inicial de admin
        await sendMessageToChat(frame, LLAMAR_ADMIN, page);
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Intervalo: Mensajes regulares al chat
        const chatInterval = setInterval(async () => {
            try {
                await sendMessageToChat(frame, MENSAJE, page);
            } catch (error) {
                console.error("⚠️ Error al enviar mensaje al chat:", error.message);
            }
        }, DELAY_MENSAJE);
        intervals.push(chatInterval);

        // Intervalo: Llamar admin
        const adminInterval = setInterval(async () => {
            try {
                await sendMessageToChat(frame, LLAMAR_ADMIN, page);
            } catch (error) {
                console.error("⚠️ Error al enviar mensaje admin:", error.message);
            }
        }, DELAY_ADMIN);
        intervals.push(adminInterval);

        // Movimiento anti-AFK
        const moves = ['w', 'a', 's', 'd'];
        let moveIndex = 0;

        const moveInterval = setInterval(async () => {
            try {
                const key = moves[moveIndex % moves.length];
                await page.keyboard.press(key);
                moveIndex++;
            } catch (error) {
                console.error("⚠️ Error al presionar tecla:", error.message);
            }
        }, 5000);
        intervals.push(moveInterval);

        // Health check: Verificar conexión
        let failedHealthChecks = 0;
        const healthCheck = setInterval(async () => {
            try {
                const element = await frame.$(chatSelector);
                
                if (!element) {
                    throw new Error('Input del chat no encontrado');
                }
                
                console.log("💚 Conexión activa");
                failedHealthChecks = 0;
            } catch (error) {
                failedHealthChecks++;
                console.error(`❌ Fallo en verificación de conexión (${failedHealthChecks}/3)`);
                
                if (failedHealthChecks >= 3) {
                    intervals.forEach(clearInterval);
                    await notifyDiscord(`⚠️ Bot **${BOT_NICKNAME}** perdió conexión (posiblemente kickeado)`);
                    throw new Error('Perdida de conexión con el servidor (3 fallos consecutivos)');
                }
            }
        }, 30000);
        intervals.push(healthCheck);

        // Mantener el bot vivo por el tiempo configurado
        console.log(`⏰ Bot activo por ${DURACION_BOT / 60000} minutos...`);
        await new Promise(resolve => setTimeout(resolve, DURACION_BOT));

        // Limpiar intervalos
        intervals.forEach(clearInterval);
        console.log("✅ Tiempo de ejecución completado");

    } catch (error) {
        console.error("❌ Error durante la ejecución del bot:", error.message);
        await notifyDiscord(`🔴 Error en bot **${BOT_NICKNAME}**: ${error.message}`);
        throw error;
        
    } finally {
        // Limpiar intervalos si existen
        intervals.forEach(interval => {
            try {
                clearInterval(interval);
            } catch (e) {}
        });

        // Cerrar navegador
        if (browser) {
            try {
                await browser.close();
                console.log("🔒 Navegador cerrado");
            } catch (e) {
                console.error("Error al cerrar el navegador:", e.message);
            }
        }
        
        await notifyDiscord(`🟡 El bot **${BOT_NICKNAME}** ha terminado su ejecución.`);
    }
}

// Función principal con reintentos
let intentos = 0;
const MAX_INTENTOS = 3;

async function iniciarBotConReintentos() {
    while (intentos < MAX_INTENTOS) {
        try {
            intentos++;
            console.log(`\n${'='.repeat(50)}`);
            console.log(`🔁 Intento ${intentos} de ${MAX_INTENTOS}`);
            console.log(`${'='.repeat(50)}\n`);
            
            await main();
            
            console.log("\n✅ Bot finalizado exitosamente");
            break;
            
        } catch (error) {
            console.error(`\n❌ Intento ${intentos} fallido:`, error.message);
            
            if (intentos >= MAX_INTENTOS) {
                console.error("🚫 Máximo de intentos alcanzado. Abortando.");
                await notifyDiscord(`❌ El bot **${BOT_NICKNAME}** falló tras ${MAX_INTENTOS} intentos.`);
                process.exit(1);
            }
            
            const espera = 5000 * intentos; // Espera incremental
            console.log(`⏳ Esperando ${espera / 1000}s antes del próximo intento...\n`);
            await new Promise(resolve => setTimeout(resolve, espera));
        }
    }
}

// Iniciar el bot
console.log(`
╔════════════════════════════════════════╗
║     🤖 BOT DE HAXBALL INICIADO 🤖      ║
╚════════════════════════════════════════╝
`);

iniciarBotConReintentos();
