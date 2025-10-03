const Database = require('better-sqlite3');
const Util = require('./util');
const fs = require('fs');

const util = new Util();

class DatabaseService {
    constructor(config) {
        this.config = config;
        this.db = new Database(config.server.db.dbFilePath);
        this.init();
    }

    init() {
        // 创建 access_key 表
        this.db.exec(`CREATE TABLE IF NOT EXISTS access_key (
            access_key_id INTEGER PRIMARY KEY AUTOINCREMENT,
            access_key TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // 创建 message 表
        this.db.exec(`CREATE TABLE IF NOT EXISTS message (
            msg_id INTEGER PRIMARY KEY AUTOINCREMENT,
            res_id TEXT NOT NULL,
            msg TEXT NOT NULL,
            access_key_id INTEGER NOT NULL,
            created_at DATETIME NOT NULL
        )`);
    }

    // 获取新配置
    getWsConfig() {
        const maxAccessKeyNum = this.config.server.websocket.maxAccessKeyNum;
        if (maxAccessKeyNum > 0 && this.db.prepare('SELECT COUNT(*) AS count FROM access_key').get().count >= maxAccessKeyNum) {
            return { ws_config: '', success: false, message: '已超出最大访问密钥数量' };
        }
        // 生成一个随机的 access_key 长12位字符串
        let accessKey = util.generateBase64String(this.config.server.websocket.accessKeyLength);
        // 判断access_key 是否已存在 循环生成新的 access_key
        while (this.db.prepare('SELECT * FROM access_key WHERE access_key = ?').get(accessKey)) {
            accessKey = util.generateBase64String(this.config.server.websocket.accessKeyLength);
        }
        // 插入 access_key 到数据库
        const insert = this.db.prepare('INSERT INTO access_key (access_key) VALUES (?)');
        insert.run(accessKey);
        return { ws_config: accessKey + "@" + this.config.server.websocket.url, success: true };
    }

    // 保存消息到数据库
    saveMessage(messageData) {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO message (res_id, msg, access_key_id, created_at)
                VALUES (?, ?, ?, ?)
            `);

            const result = stmt.run(
                messageData.resId || '',
                messageData.content || messageData.msg || '',
                messageData.accessKeyId || 1,
                new Date().toISOString()
            );

            console.log('消息已保存到数据库，ID:', result.lastInsertRowid);
            return result.lastInsertRowid;
        } catch (error) {
            console.error('保存消息到数据库失败:', error);
        }
    }

    // 可以在这里添加更多数据库操作方法
}

module.exports = DatabaseService;