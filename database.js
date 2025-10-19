const Database = require('better-sqlite3');
const Util = require('./util');
const fs = require('fs');
const logger = require('./logger');

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
            direction TEXT NOT NULL,
            smsync_beaco_id INTEGER NOT NULL,
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
        logger.info('新用户加入, 已生成accessKey');
        return { ws_config: accessKey + "@" + this.config.server.websocket.url, success: true };
    }

    // 保存消息到数据库
    saveMessage(res_id, msg, direction, smsyncBeaconIdString, timestamp) {
        // 查询 smsync_beaco表 获取 smsync_beaco_id
        const smsyncBeacoId = this.db.prepare('SELECT smsync_beaco_id FROM smsync_beaco WHERE smsync_beaco_id_string = ?').get(smsyncBeaconIdString)?.smsync_beaco_id;
        // 判断smsync_beaco_id 是否存在
        if (!smsyncBeacoId) {
            throw new Error('smsync_beaco_id 不存在');
        }
        logger.debug('保存消息到数据库:', res_id, msg, direction, smsyncBeacoId, timestamp);
        // 转换时间戳
        // 插入 message 表 并返回新消息的 msg_id
        const insert = this.db.prepare('INSERT INTO message (res_id, msg, direction, smsync_beaco_id, created_at) VALUES (?, ?, ?, ?, ?)');
        return insert.run(res_id, msg, direction, smsyncBeacoId, timestamp).lastInsertRowid;
    }

    // 验证 access_key  timestamp@hmac_sha256(timestamp, accessKey)
    verifyAccessKey(authorization, smsyncBeacoIdString) {
        if (!authorization) {
            return false;
        }
        const [timestamp, hmac] = authorization.split('@');

        // 验证时间戳
        logger.debug(timestamp + ', ' + new Date().getTime() / 1000 + ', ' + hmac);
        if (Math.abs(new Date().getTime() / 1000 - timestamp) > this.config.server.websocket.authorizationExpire) {
            return false;
        }

        logger.debug('时间戳验证成功');
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
        logger.debug(accessKeys)

        for (const accessKey of accessKeys) {
            logger.debug('hmac:' + util.hmacSha256(timestamp, accessKey.access_key))
            if (util.hmacSha256(timestamp, accessKey.access_key) === hmac) {
                logger.debug('hmac:' + util.hmacSha256(timestamp, accessKey.access_key))
                // 验证成功
                // 插入 smsync_beaco_id_string
                if (smsyncBeacoIdString) {
                    this.db.prepare('INSERT INTO smsync_beaco (smsync_beaco_id_string, access_key_id) VALUES (?, ?)').run(smsyncBeacoIdString, accessKey.access_key_id);
                    logger.info('新Smsync-Beacon加入, id:', smsyncBeacoIdString);
                }
                return accessKey.access_key;
            }
        }
        return false;
    }

    // 获取消息历史
    getMsgHistory(accessKey, data) {
        // 查询accessKey下所有的smsyncBeacoId 与 smsyncBeacoIdString
        const smsyncBeacos = this.db.prepare(`SELECT smsync_beaco_id, smsync_beaco_id_string 
            FROM smsync_beaco 
            WHERE access_key_id = (SELECT access_key_id FROM access_key WHERE access_key = ?)`).all(accessKey);
        if (!smsyncBeacos) {
            return [];
        }
        const smsyncBeacoIds = smsyncBeacos.map(smsyncBeaco => smsyncBeaco.smsync_beaco_id);

        // 获取消息历史
        const messages = this.db.prepare(`SELECT message.res_id, message.msg, message.direction, message.smsync_beaco_id, message.created_at 
            FROM message WHERE message.smsync_beaco_id IN (${smsyncBeacoIds.map(() => '?').join(',')}) 
            AND message.created_at >= ? ORDER BY message.created_at ASC`)
            .all(smsyncBeacoIds, data.startTimestamp || 0).map(message => {
                smsyncBeacos.forEach(smsyncBeaco => {
                    if (message.smsync_beaco_id === smsyncBeaco.smsync_beaco_id) {
                        message.smsync_beaco_id = smsyncBeaco.smsync_beaco_id_string;
                    }
                });
            });
        return messages;
    }

    // 获取所有SMSync-Beacon客户端
    getAllSmsyncBeacoProc(accessKey) {
        // 获取所有SMSync-Beacon客户端
        const smsyncBeacos = this.db.prepare(`SELECT smsync_beaco_id_string as smsync_beaco_id, created_at
            FROM smsync_beaco 
            WHERE access_key_id = (SELECT access_key_id FROM access_key WHERE access_key = ?)`).all(accessKey);
        return smsyncBeacos;
    }

}

module.exports = DatabaseService;
