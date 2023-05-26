const { program } = require('commander');
const { WebSocketServer } = require("ws");
const ReconnectingWebSocket = require("./reconnecting-ws");

const WS_PORT = 3300;
const EXPECTED_URI = "/wpilibws";

// Add Filters
const MESSAGE_TYPE_FILTER = new Set();
MESSAGE_TYPE_FILTER.add("DriverStation");
MESSAGE_TYPE_FILTER.add("PWM");
MESSAGE_TYPE_FILTER.add("Encoder");
MESSAGE_TYPE_FILTER.add("DIO");

program
    .version("1.0.0")
    .name("xrp-proxy")
    .description("Proxy for filtering WPILib WS messages for the XRP");

program
    .requiredOption("-h --host <host>", "Host address of the XRP")
    .option("-p --port <port>", "Port to connect to", parseInt)
    .option("--no-cache-xrp", "Do not cache messages from XRP")
    .option("--no-cache-wpilib", "Do not cache messages from WPILib");

program.parse(process.argv);

const options = program.opts();
console.log(options);

const xrpHost = options.host;
const xrpPort = options.port !== undefined ? options.port : WS_PORT;
const cacheXrp = !!options.cacheXrp;
const cacheWpilib = !!options.cacheWpilib;

const filterList = [];
MESSAGE_TYPE_FILTER.forEach((val) => {
    filterList.push(`"${val}"`);
});
console.log("Filters: ", filterList.join(", "));
console.log("Options:");
console.log(`Cache XRP --> WPILib Messages: ${cacheXrp}`);
console.log(`Cache WPILib --> XRP Messages: ${cacheWpilib}`);
console.log("");

console.log(`[CLIENT] Will connect to XRP on ${xrpHost}:${xrpPort}`);

// Start up the listening server
const server = new WebSocketServer({port: WS_PORT});
const xrpSocket = new ReconnectingWebSocket(xrpHost, xrpPort, cacheWpilib);

console.log(`[SERVER] Proxy Server listening on *:${WS_PORT}`);

let currentProxyClient = null;

const proxyClientBuffer = [];

function sendToProxyClient(data) {
    if (currentProxyClient !== null) {
        currentProxyClient.send(data.toString());
    }
    else {
        if (cacheXrp) {
            proxyClientBuffer.push(data);
        }
    }
}

xrpSocket.on("message", (data, isBinary) => {
    sendToProxyClient(data);
});

server.on("connection", (ws, request) => {
    if (currentProxyClient !== null) {
        console.error("[SERVER] Already have a proxy client");
        ws.close();
    }
    else {
        if (!request.url || !request.url.startsWith(EXPECTED_URI)) {
            console.log(`[SERVER] Invalid URI (${request.url}) - Expected "${EXPECTED_URI}"`);
            ws.close();
            return;
        }

        console.log(`[SERVER] Client connected (${request.socket.remoteAddress})`);
        currentProxyClient = ws;
        ws.on("close", (code, reason) => {
            console.log(`[SERVER] Proxy Client Connection Closed (${code}) - ${reason}`);
            ws.removeAllListeners();
            currentProxyClient = null;
        });
        ws.on("error", (err) => {
            console.log(`[SERVER] Proxy Client Error - ${err.message}`);
            ws.removeAllListeners();
            currentProxyClient = null;
        });
        ws.on("message", (data, isBinary) => {
            try {
                const obj = JSON.parse(data.toString());

                if (obj.type && MESSAGE_TYPE_FILTER.has(obj.type)) {
                    xrpSocket.send(data.toString());
                }
            }
            catch (err) {
                // Just drop the message
            }
        });

        if (proxyClientBuffer.length > 0) {
            console.log(`[SERVER] Sending ${proxyClientBuffer.length} buffered messages`);
            for (let msg in proxyClientBuffer) {
                ws.send(msg);
            }
            proxyClientBuffer.length = 0;
        }
    }
});
