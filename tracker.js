import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason
} from "@whiskeysockets/baileys";

import { performance } from "perf_hooks";
import qrcode from "qrcode-terminal";

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth");

  const sock = makeWASocket({
    auth: state,
    browser: ["Linux", "Firefox", "120"],
    printQRInTerminal: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, qr } = update;

    if (qr) {
      console.log("[+] Scan this QR with WhatsApp");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("[+] Connected to WhatsApp");
      runProbe(sock);
    }

    if (connection === "close") {
      console.log("[-] Connection closed");
    }
  });
}

async function runProbe(sock) {
  // your number goes here
  const targetJid = "994xxxxxxxxx@s.whatsapp.net";

  const probeId = "probe-" + Date.now();
  const startTime = performance.now();

  console.log("[*] Sending text probe...");


  const probePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      sock.ev.off("messages.update", listener);
      reject(new Error("timeout"));
    }, 7000);

    const listener = (updates) => {
      for (const u of updates) {
        if (u.key?.id === probeId) {
          clearTimeout(timeout);
          sock.ev.off("messages.update", listener);
          resolve(u);
        }
      }
    };

    sock.ev.on("messages.update", listener);
  });


  await sock.sendMessage(targetJid, {
    text: "probe",
    messageId: probeId
  });

  try {
    const update = await probePromise;
    const rtt = performance.now() - startTime;

    console.log(`[RTT] ${rtt.toFixed(2)} ms`);
    console.log(`[STATE] ${classify(rtt)}`);
  } catch {
    console.log("[RTT] No ACK within 7s");
    console.log("[STATE] OFFLINE / UNREACHABLE");
  }
}

function classify(rtt) {
  if (rtt < 200) return "ACTIVE (screen on, app foreground)";
  if (rtt < 1000) return "IDLE (background)";
  if (rtt < 4000) return "LOCKED (screen off)";
  return "OFFLINE / DELAYED";
}

start().catch(console.error);
