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

        // 创建 beaco_id 表
        this.db.exec(`CREATE TABLE IF NOT EXISTS smsync_beaco (
            smsync_beaco_id INTEGER PRIMARY KEY AUTOINCREMENT,
            smsync_beaco_id_string TEXT NOT NULL,
            access_key_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

    // 验证 access_key  timestamp@hmac_sha256(timestamp, accessKey)
    verifyAccessKey(authorization, smsyncBeacoIdString) {
        if (!authorization) {
            return false;
        }
        const [timestamp, hmac] = authorization.split('@');

        // 验证时间戳
        if (Math.abs(new Date().getTime() / 1000 - timestamp) > this.config.server.websocket.authorizationExpire) {
            return false;
        }

        if (smsyncBeacoIdString) {
            // 查询smsync_beaco_id_string 获取access_key_id
            const accessKeyId = this.db.prepare('SELECT access_key_id FROM smsync_beaco WHERE smsync_beaco_id_string = ?').get(smsyncBeacoIdString)?.access_key_id;
            if (accessKeyId) {
                // smsync_beaco_id_string 已记录
                //获取access_key
                const accessKey = this.db.prepare('SELECT access_key FROM access_key WHERE access_key_id = ?').get(accessKeyId)?.access_key;
                if (!accessKey) {
                    return false;
                }
                if (util.hmacSha256(timestamp, accessKey) === hmac) {
                    return accessKey;
                }
                // access_key 验证失败 删除 smsync_beaco_id_string
                this.db.prepare('DELETE FROM smsync_beaco WHERE smsync_beaco_id_string = ?').run(smsyncBeacoIdString);
            }
        }

        // smsync_beaco_id_string 未记录或验证失败
        // 获取所有的access_key 与 access_key_id
        const accessKeys = this.db.prepare('SELECT access_key_id, access_key FROM access_key').all();
        for (const accessKey of accessKeys) {
            if (util.hmacSha256(timestamp, accessKey.access_key) === hmac) {
                // 验证成功
                // 插入 smsync_beaco_id_string
                if (smsyncBeacoIdString) {
                    this.db.prepare('INSERT INTO smsync_beaco (smsync_beaco_id_string, access_key_id) VALUES (?, ?)').run(smsyncBeacoIdString, accessKey.access_key_id);
                }
                return accessKey.access_key;
            }
        }
        return false;
    }

}

module.exports = DatabaseService;