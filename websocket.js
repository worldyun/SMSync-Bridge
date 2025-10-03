const WebSocket = require('ws');

class WebSocketService {
    constructor(server, dbService, config) {
        this.config = config;
        this.wss = new WebSocket.Server({ server, path: config.server.websocket.path });
        this.dbService = dbService; // 保存数据库服务实例
        this.init();
    }

    init() {
        this.wss.on('connection', (ws) => {
            console.log('客户端连接成功');

            ws.on('message', (message) => {
                console.log('收到消息:', message.toString());
                
                try {
                    // 解析消息（假设是JSON格式）
                    const data = JSON.parse(message.toString());
                    
                    // 如果需要保存消息到数据库
                    if (data.type === 'message' && data.content) {
                        this.saveMessage(data);
                    }
                } catch (error) {
                    console.log('消息不是有效的JSON格式');
                }
                
                // 广播消息给所有客户端
                this.broadcast(message.toString());
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