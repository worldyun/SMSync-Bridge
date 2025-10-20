const WebSocket = require('ws');
const Util = require('./util');
const Logger = require('./logger');
const dbService = require('./database');
const configService = require('./config');

const util = new Util();
const logger = new Logger('WebsocketService');
const wsConfig = configService.getWebSocketConfig();

class WebSocketService {
    constructor(server) {
        // 防止多次实例化
        if (WebSocketService.instance) {
            return WebSocketService.instance;
        }
        
        this.wss = new WebSocket.Server({ server, path: wsConfig.path });
        this.init();
        
        // 缓存实例
        WebSocketService.instance = this;
    }

    init() {
        this.wss.on('connection', (ws, req) => {
            try {
                logger.debug('新客户端连接, 验证中...');

                if (!req.headers[wsConfig.requiredHeaders.authorization]) {
                    logger.debug('验证失败, 缺少授权信息');
                    ws.close();
                    return;
                }
                if (!req.headers[wsConfig.requiredHeaders.salt]) {
                    logger.debug('验证失败, 缺少盐信息');
                    ws.close();
                    return;
                }
                
                logger.debug(
                    req.headers[wsConfig.requiredHeaders.authorization] + ', ' + 
                    req.headers[wsConfig.requiredHeaders.salt] + ', ' + 
                    req.headers[wsConfig.optionalHeaders.smsyncBeaconId]
                );
                
                const accessKey = dbService.verifyAccessKey(
                    req.headers[wsConfig.requiredHeaders.authorization], 
                    req.headers[wsConfig.optionalHeaders.smsyncBeaconId]
                );
                
                if (!accessKey) {
                    logger.error('验证失败, access_key 验证失败');
                    ws.close();
                    return;
                }
                
                if (req.headers[wsConfig.optionalHeaders.smsyncBeaconId]) {
                    ws.smsyncBeaconId = req.headers[wsConfig.optionalHeaders.smsyncBeaconId];
                }
                ws.accessKey = accessKey;

                const wsCryptoKey = util.getWsCryptoKey(
                    req.headers[wsConfig.requiredHeaders.salt], 
                    accessKey, 
                    wsConfig.crypto.keylen, 
                    wsConfig.crypto.iterations
                );
                ws.cryptoKey = wsCryptoKey;
                logger.debug('验证成功, 允许连接: ' + 
                    req.headers[wsConfig.requiredHeaders.authorization] + ', ' + 
                    req.headers[wsConfig.optionalHeaders.smsyncBeaconId] + ', ' + 
                    wsCryptoKey.toString('HEX')
                );

                ws.recvCount = 0;
                ws.sendCount = 0;
                
                if (ws.smsyncBeaconId) {
                    logger.info('Smsync-Beacon连接成功, id: ' + ws.smsyncBeaconId);
                } else {
                    logger.info('Smsync-Hub连接成功');
                }

            } catch (error) {
                logger.error('连接验证失败', error);
                ws.close();
            }

            ws.on('message', (cryptoMessage) => {
                try {
                    const message = util.msgDecrypt(cryptoMessage.toString(), ws.cryptoKey);
                    logger.debug('消息解密:', message);
                    
                    const data = JSON.parse(message);
                    
                    if (Math.abs(
                        data[wsConfig.messageFields.timestamp] - Math.floor(+new Date() / 1000)
                    ) > wsConfig.msgExpire) {
                        logger.debug('时间戳错误, 消息过期, 忽略');
                        return;
                    }

                    switch (data[wsConfig.messageFields.action]) {
                        case wsConfig.messageActions.heartbeat:
                            this.heartbeatProc(ws);
                            break;
                        case wsConfig.messageActions.message:
                            this.messageProc(ws, data);
                            break;
                        case wsConfig.messageActions.getMsgHistory:
                            this.getMsgHistoryProc(ws, data);
                            break;
                        case wsConfig.messageActions.getAllSmsyncBeaco:
                            this.getAllSmsyncBeacoProc(ws);
                            break;
                        default:
                            logger.debug('未知操作:', data[wsConfig.messageFields.action]);
                    }
                } catch (error) {
                    logger.error('WS消息解密失败', error);
                }
            });

            ws.on('close', () => {
                if (ws.smsyncBeaconId) {
                    logger.info('Smsync-Beacon断开连接, id: ' + ws.smsyncBeaconId);
                } else {
                    logger.info('Smsync-Hub断开连接');
                }
            });
        });
    }

    broadcast(message) {
        this.wss.clients.forEach((client) => {
            if (client.readyState === wsConfig.webSocketStates.open) {
                client.send(message);
            }
        });
    }

    messageProc(ws, data) {
        if (data[wsConfig.messageFields.count] <= ws.recvCount) {
            logger.debug('消息重复, 忽略');
            return;
        }
        ws.recvCount = data[wsConfig.messageFields.count];
        
        if (!data[wsConfig.messageFields.resId] || !data[wsConfig.messageFields.msg]) {
            logger.debug('消息格式错误, 忽略');
            return;
        }
        
        data[wsConfig.messageFields.direction] = ws.smsyncBeaconId ? 
            wsConfig.messageDirections.up : 
            wsConfig.messageDirections.down;
            
        if (data[wsConfig.messageFields.direction] === wsConfig.messageDirections.down && 
            !data[wsConfig.messageFields.smsyncBeaconId]) {
            logger.debug('下行消息缺少smsync_eacon_id, 忽略');
            return;
        }
        
        const currentTime = Math.floor(+new Date() / 1000);
        try {
            dbService.saveMessage(
                data[wsConfig.messageFields.resId], 
                data[wsConfig.messageFields.msg], 
                data[wsConfig.messageFields.direction], 
                ws.smsyncBeaconId || data[wsConfig.messageFields.smsyncBeaconId], 
                currentTime
            );
        } catch (error) {
            logger.error('保存消息失败', error);
            return;
        }

        this.wss.clients.forEach((client) => {
            if (client.readyState === wsConfig.webSocketStates.open && 
                client.accessKey === ws.accessKey && 
                !client.smsyncBeaconId) {
                this.message(client, {
                    [wsConfig.messageFields.action]: wsConfig.messageActions.message, 
                    [wsConfig.messageFields.messageList]: [{
                        [wsConfig.messageFields.resId]: data[wsConfig.messageFields.resId], 
                        [wsConfig.messageFields.msg]: data[wsConfig.messageFields.msg], 
                        created_at: currentTime, 
                        [wsConfig.messageFields.direction]: data[wsConfig.messageFields.direction], 
                        [wsConfig.messageFields.smsyncBeaconId]: ws.smsyncBeaconId
                    }]
                });
            }
        });
        
        if (data[wsConfig.messageFields.direction] === wsConfig.messageDirections.down) {
            this.wss.clients.forEach((client) => {
                if (client.readyState === wsConfig.webSocketStates.open && 
                    client.accessKey === ws.accessKey && 
                    client.smsyncBeaconId === data[wsConfig.messageFields.smsyncBeaconId]) {
                    this.message(client, {
                        [wsConfig.messageFields.action]: wsConfig.messageActions.message, 
                        [wsConfig.messageFields.resId]: data[wsConfig.messageFields.resId], 
                        [wsConfig.messageFields.msg]: data[wsConfig.messageFields.msg], 
                        [wsConfig.messageFields.timestamp]: currentTime
                    });
                }
            });
        }
    }

    message(ws, message) { // 修复了原代码中的方法名错误
        message[wsConfig.messageFields.count] = ws.sendCount;
        message[wsConfig.messageFields.timestamp] = Math.floor(+new Date() / 1000);
        ws.send(util.msgEncrypt(JSON.stringify(message), ws.cryptoKey));
        ws.sendCount++;
    }

    heartbeatProc(ws) {
        const heartbeatMessage = JSON.stringify({
            [wsConfig.messageFields.action]: wsConfig.messageActions.heartbeat, 
            [wsConfig.messageFields.timestamp]: Math.floor(+new Date() / 1000)
        });
        logger.debug('发送心跳消息:', heartbeatMessage);
        ws.send(util.msgEncrypt(heartbeatMessage, ws.cryptoKey));
    }

    getMsgHistoryProc(ws, data) { 
        dbService.getMsgHistory(ws.accessKey, data).then((result) => {
            this.message(ws, { // 修复了原代码中的方法名错误
                [wsConfig.messageFields.action]: wsConfig.messageActions.message, 
                [wsConfig.messageFields.messageList]: result
            });
        }).catch((error) => {
            logger.error('获取消息历史失败', error);
        });
    }

    getAllSmsyncBeacoProc(ws) {
        dbService.getAllSmsyncBeacoProc(ws.accessKey).then((result) => {
            this.message(ws, { // 修复了原代码中的方法名错误
                [wsConfig.messageFields.action]: wsConfig.messageActions.getAllSmsyncBeaco, 
                [wsConfig.messageFields.smsyncBeaconList]: result
            });
        }).catch((error) => {
            logger.error('获取所有设备信息失败', error);
        });
    }
}

// 创建并导出单例实例
const websocketService = (...args) => {
    if (!WebSocketService.instance) {
        WebSocketService.instance = new WebSocketService(...args);
    }
    return WebSocketService.instance;
};

module.exports = websocketService;