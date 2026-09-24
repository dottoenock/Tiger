const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason 
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const config = require('./config');

// Mfumo wa kuhifadhi ID za status zilizoshapitiwa ili kuzuia kujirudia
const processedStatuses = new Set();

async function startTigerBot() {
    const { state, saveCreds } = await useMultiFileAuthState('tiger_session');

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n Scan QR Code hii ukitumia WhatsApp yako:\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Muunganisho umekatika. Inajaribu kuunganisha tena...');
            if (shouldReconnect) startTigerBot();
        } else if (connection === 'open') {
            console.log(`\n=== ${config.BOT_NAME} IPO ONLINE! ===\n`);
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg || !msg.message) return;

        // Kama ujumbe au action imetoka kwa bot yenyewe, ipotezee
        if (msg.key.fromMe) return;

        const from = msg.key.remoteJid;

        // SEHEMU YA AUTO-READ NA AUTO-LIKE STATUS
        if (from === 'status@broadcast') {
            const statusId = msg.key.id;

            // Kama hii status imeshapitiwa tayari, usiirudie kabisa!
            if (processedStatuses.has(statusId)) return;
            processedStatuses.add(statusId);

            // Punguza ukubwa wa kumbukumbu (memory) ikizidi idadi 500
            if (processedStatuses.size > 500) {
                const firstItem = processedStatuses.values().next().value;
                processedStatuses.delete(firstItem);
            }

            const sender = msg.key.participant || msg.participant;
            if (!sender) return;

            const senderNumber = sender.split('@')[0];

            if (config.AUTO_READ_STATUS) {
                try {
                    await sock.readMessages([
                        {
                            remoteJid: 'status@broadcast',
                            id: statusId,
                            participant: sender
                        }
                    ]);
                    console.log(`[${config.BOT_NAME}] Umeangalia status ya: ${senderNumber}`);
                } catch (err) {
                    console.log(`[Error Read Status]: ${err.message}`);
                }
            }

            if (config.AUTO_LIKE_STATUS) {
                try {
                    await sock.sendMessage(
                        'status@broadcast',
                        {
                            react: {
                                text: config.STATUS_EMOJI || '💚',
                                key: msg.key
                            }
                        },
                        { statusJidList: [sender] }
                    );
                    console.log(`[${config.BOT_NAME}] Ume-like status ya: ${senderNumber}`);
                } catch (err) {
                    console.log(`[Error Like Status]: ${err.message}`);
                }
            }
            return;
        }

        const type = Object.keys(msg.message)[0];
        const body = (type === 'conversation') ? msg.message.conversation : 
                     (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text : '';

        if (!body || !body.startsWith(config.PREFIX)) return;

        const command = body.slice(config.PREFIX.length).trim().split(/ +/).shift().toLowerCase();

        switch (command) {
            case 'ping':
                await sock.sendMessage(from, { text: `*${config.BOT_NAME}* ipo Hewani! 🚀` }, { quoted: msg });
                break;

            case 'menu':
                let menuText = `*━━━＜ ${config.BOT_NAME} ＞━━━*\n\n`;
                menuText += `👑 *Owner:* ${config.OWNER_NAME}\n`;
                menuText += `📌 *Prefix:* [ ${config.PREFIX} ]\n\n`;
                menuText += `*COMMANDS ZILIPO:*\n`;
                menuText += `▸ ${config.PREFIX}ping - Kuangalia kama bot ipo active\n`;
                menuText += `▸ ${config.PREFIX}menu - Kuonyesha orodha hii\n`;
                
                await sock.sendMessage(from, { text: menuText }, { quoted: msg });
                break;
        }
    });
}

startTigerBot();
