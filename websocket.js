const WebSocket = require('ws');
const Util = require('./util');

const util = new Util();

class WebSocketService {
    constructor(server, dbService, config) {
        this.config = config;
        this.wss = new WebSocket.Server({ server, path: config.server.websocket.path });
        this.dbService = dbService; // 保存数据库服务实例
        this.init();
    }

    init() {
        this.wss.on('connection', (ws, req) => {
            console.log('新客户端连接, 验证中...');

            if (!req.headers.Authorization) {
                console.log('验证失败, 缺少授权信息');
                ws.close();
                return;
            }
            if (!req.headers.Salt) {
                console.log('验证失败, 缺少盐信息');
                ws.close();
                return;
            }
            const accessKey = this.dbService.verifyAccessKey(req.headers.Authorization, req.headers.SMSYNC_BEACO_ID)
            if (!accessKey) {
                console.log('验证失败, access_key 验证失败');
                ws.close();
                return;
            }
            if (req.headers.SMSYNC_BEACO_ID) {
                ws.SMSYNC_BEACO_ID = req.headers.SMSYNC_BEACO_ID;
            }
            ws.SMSYNC_BEACO_ACCESS_KEY = accessKey;

            const wsCryptoKey = util.getWsCryptoKey(req.headers.Salt, accessKey, this.config.server.websocket.crypto.keylen, this.config.server.websocket.crypto.iterations);
            ws.cryptoKey = wsCryptoKey;
            console.log('验证成功, 允许连接: ' + req.headers.Authorization + ', ' + req.headers.SMSYNC_BEACO_ID);

            ws.on('message', (cryptoMessage) => {
                console.log('收到消息:', cryptoMessage.toString());
                // 消息解密
                const message = util.msgDecrypt(cryptoMessage.toString(), wsCryptoKey);
                onsole.log('消息解密:', message);
                try {
                    // 解析消息（假设是JSON格式）
                    const data = JSON.parse(message.toString());
                    
                    // 如果需要保存消息到数据库
                    if (data.type === 'message' && data.content) {
                        // this.saveMessage(data);
                    }
                } catch (error) {
                    console.log('消息不是有效的JSON格式');
                }
                
                // 广播消息给所有客户端
                // this.broadcast(message.toString());
            });

            ws.on('close', () => {
                console.log('客户端断开连接');
            });
        });
    }

    broadcast(message) {
        this.wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }

    // 保存消息到数据库的示例方法
    saveMessage(messageData) {
        if (this.dbService && this.dbService.saveMessage) {
            this.dbService.saveMessage(messageData);
        }
    }

    // 可以添加更多使用数据库的方法
}

module.exports = WebSocketService;