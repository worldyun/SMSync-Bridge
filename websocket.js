const WebSocket = require('ws');
const Util = require('./util');
const logger = require('./logger');

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
            try {
                logger.info('新客户端连接, 验证中...');

                if (!req.headers['authorization']) {
                    logger.info('验证失败, 缺少授权信息');
                    ws.close();
                    return;
                }
                if (!req.headers['salt']) {
                    logger.info('验证失败, 缺少盐信息');
                    ws.close();
                    return;
                }
                logger.info(req.headers['authorization'] + ', ' + req.headers['salt'] + ', ' + req.headers['smsync-beacon-id']);
                const accessKey = this.dbService.verifyAccessKey(req.headers['authorization'], req.headers['smsync-beacon-id'])
                if (!accessKey) {
                    logger.info('验证失败, access_key 验证失败');
                    ws.close();
                    return;
                }
                if (req.headers['smsync-beacon-id']) {
                    ws.smsyncBeaconId = req.headers['smsync-beacon-id'];
                }
                ws.accessKey = accessKey;

                const wsCryptoKey = util.getWsCryptoKey(req.headers['salt'], accessKey, this.config.server.websocket.crypto.keylen, this.config.server.websocket.crypto.iterations);
                ws.cryptoKey = wsCryptoKey;
                logger.info('验证成功, 允许连接: ' + req.headers['authorization'] + ', ' + req.headers['smsync-beacon-id'] + ', ' + wsCryptoKey.toString('HEX'));

                ws.recvCount = 0;
                ws.sendCount = 0;

            } catch (error) {
                logger.info('连接验证失败', error);
                ws.close();
            }

            ws.on('message', (cryptoMessage) => {
                // logger.debug('收到消息:', cryptoMessage);
                try {
                    // 消息解密
                    // logger.debug('消息解密中...' + ws.cryptoKey.toString('HEX'), cryptoMessage.toString('ascii'));
                    const message = util.msgDecrypt(cryptoMessage.toString(), ws.cryptoKey);
                    logger.debug('消息解密:', message);
                    // 解析消息（假设是JSON格式）
                    const data = JSON.parse(message);
                    // 检验时间戳
                    if (Math.abs(data.timestamp - Math.floor(+new Date() / 1000)) > this.config.server.websocket.msgExpire) {
                        logger.debug('时间戳错误, 消息过期, 忽略');
                        return;
                    }

                    // 如果需要保存消息到数据库
                    switch (data.action) {
                        // 心跳
                        case 'heartbeat':
                            this.heartbeatProc(ws);
                            break;
                        // 消息
                        case 'msg':
                            this.messageProc(ws, data);
                            break;
                        // 获取消息历史
                        case 'get_msg_history':
                            this.getMsgHistoryProc(ws, data);
                            break;
                        // 获取所有设备信息
                        case 'get_all_smsync_beaco':
                            this.getAllSmsyncBeacoProc(ws);
                            break;
                        default:
                            logger.debug('未知操作:', data.action);
                    }
                } catch (error) {
                    logger.info('解密失败', error);
                }
            });

            ws.on('close', () => {
                logger.info('客户端断开连接');
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

    // msg消息处理函数
    // {"res_id":"xxx","msg":"xxx","timestamp":1760867407,"action":"msg","count":1}
    messageProc(ws, data) {
        // 检验recvCount data.count必须大于ws.recvCount
        if (data.count <= ws.recvCount) {
            logger.debug('消息重复, 忽略');
            return;
        }
        ws.recvCount = data.count;
        // 校验res_id与msg是否存在
        if (!data.res_id || !data.msg) {
            logger.debug('消息格式错误, 忽略');
            return;
        }
        data.direction = ws.smsyncBeaconId ? 'up' : 'down';
        if (data.direction === 'down' && !data.smsync_eacon_id) {
            logger.debug('下行消息缺少smsync_eacon_id, 忽略');
            return;
        }
        const currentTime = Math.floor(+new Date() / 1000);
        try {
            // 保存消息到数据库
            this.dbService.saveMessage(data.res_id, data.msg, data.direction, ws.smsyncBeaconId || data.smsync_eacon_id, currentTime);
        } catch (error) {
            logger.error('保存消息失败', error);
            return;
        }

        // 发送消息给所有SMSync-Hub客户端
        this.wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN && client.accessKey === ws.accessKey && !client.smsyncBeaconId) {
                this.message(client, {action: "msg", msg_list: [{ res_id: data.res_id, msg: data.msg, created_at: currentTime, direction: data.direction, smsync_eacon_id: ws.smsyncBeaconId }] })
            }
        });
        if (data.direction === 'down') {
            // 下行消息处理 发送给同access_key,且同smsync_eacon_id的SMSync-Beacon客户端
            // {"res_id":"xxx","msg":"xxx","timestamp":1760867407,"direction":"down","smsync_eacon_id":"xxx"}
            this.wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN && client.accessKey === ws.accessKey && client.smsyncBeaconId === data.smsync_eacon_id) {
                    this.message(client, {action: "msg", res_id: data.res_id, msg: data.msg, timestamp: currentTime })
                }
            })
        }
    }

    sendMessage(ws, message) {
        message.count = ws.sendCount;
        message.timestamp = Math.floor(+new Date() / 1000);
        ws.send(util.msgEncrypt(JSON.stringify(message), ws.cryptoKey));
        ws.sendCount++;
    }

    // 心跳处理
    heartbeatProc(ws) {
        // 发送心跳消息给客户端
        const heartbeatMessage = JSON.stringify({ action: 'heartbeat', timestamp: Math.floor(+new Date() / 1000) });
        logger.debug('发送心跳消息:', heartbeatMessage);
        ws.send(util.msgEncrypt(heartbeatMessage, ws.cryptoKey));
    }

    // 获取消息历史处理
    getMsgHistoryProc(ws, data) { 
        this.dbService.getMsgHistory(ws.accessKey, data).then((result) => {
            this.sendMessage(ws, { action: 'msg', msg_list: result });
        }).catch((error) => {
            logger.error('获取消息历史失败', error);
        });
    }

    // 获取所有设备信息处理
    getAllSmsyncBeacoProc(ws) {
        this.dbService.getAllSmsyncBeaco(ws.accessKey).then((result) => {
            this.sendMessage(ws, { action: 'get_all_smsync_beaco', smsync_beaco_list: result });
        }).catch((error) => {
            logger.error('获取所有设备信息失败', error);
        });
    }
}

module.exports = WebSocketService;
