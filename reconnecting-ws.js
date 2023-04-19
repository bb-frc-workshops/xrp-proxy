const { WebSocket } = require("ws");
const EventEmitter = require("events");

const BUFFER_PRINT_TIME_MS = 10000;

class ReconnectingWebSocket extends EventEmitter {
    constructor(host, port, cacheMessages) {
        super();
        this._host = host;
        this._port = port;
        this._shouldCache = cacheMessages;

        this._connectionUrl = `ws://${host}:${port}/wpilibws`;

        this._connected = false;
        this._ws = null;

        this._bufferedMessages = [];

        this._lastBufferPrintTime = Date.now(); // When we last printed buffered state (if we are not connected);
        this.setupWebsocket();
    }

    setupWebsocket() {
        const ws = new WebSocket(this._connectionUrl);

        ws.on("open", () => {
            if (connTimeout) {
                clearTimeout(connTimeout);
            }
            this._connected = true;
            console.log(`[CLIENT] WS Client connected to ${this._connectionUrl}`);

            if (this._bufferedMessages.length > 0) {
                console.log(`[CLIENT] Forwarding ${this._bufferedMessages.length} messages`);
                for (let msg in this._bufferedMessages) {
                    ws.send(msg);
                }
                this._bufferedMessages = [];
            }
        });
        ws.on("close", (code, reason) => {
            this._connected = false;
            console.log(`[CLIENT] WS Client Connection Closed (${code}) - ${reason.toString()}`);
            this.cleanupWS(ws);
        });
        ws.on("error", (err) => {
            this._connected = false;
            console.log(`[CLIENT] WS Client Connection Error - ${err.message}`);
            this.cleanupWS(ws);
        });
        ws.on("message", (data, isBinary) => {
            this.emit("message", data, isBinary);
        });

        this._ws = ws;
    }

    cleanupWS(ws) {
        ws.removeAllListeners();
        ws = undefined;
        console.log("[CLIENT] Cleaning up");
        setTimeout(() => {
            console.log("[CLIENT] Reattempting Connection");
            this.setupWebsocket();
        }, 1000);
    }

    send(data) {
        if (this._connected) {
            this._ws.send(data);
        }
        else {
            if (!this._shouldCache) {
                return;
            }
            this._bufferedMessages.push(data);
            const currTime = Date.now();
            if (currTime - this._lastBufferPrintTime > BUFFER_PRINT_TIME_MS) {
                console.log(`[CLIENT] Now buffering ${this._bufferedMessages.length} messages`);
                this._lastBufferPrintTime = currTime;
            }
        }
    }
}

module.exports = ReconnectingWebSocket;