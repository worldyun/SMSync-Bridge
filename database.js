const Database = require('better-sqlite3');
const Util = require('./util');
const Logger = require('./logger');
const QueryLoader = require('./queries/queryLoader');
const AccessKeyRepository = require('./repositories/AccessKeyRepository');
const MessageRepository = require('./repositories/MessageRepository');
const SmsyncBeaconRepository = require('./repositories/SmsyncBeaconRepository');
const configService = require('./config');

const util = new Util();
const logger = new Logger('DatabaseService');
const config = configService.getConfig();
const wsConfig = configService.getWebSocketConfig();
const dbConfig = configService.getDatabaseConfig();

class DatabaseService {
    constructor() {
        // 防止多次实例化
        if (DatabaseService.instance) {
            return DatabaseService.instance;
        }
        
        this.db = new Database(dbConfig.dbFilePath);
        
        // 加载查询语句
        this.accessKeyQueries = QueryLoader.loadQueries('accessKey.sql');
        this.messageQueries = QueryLoader.loadQueries('message.sql');
        this.smsyncBeaconQueries = QueryLoader.loadQueries('smsyncBeacon.sql');
        
        // 初始化Repositories
        this.accessKeyRepo = new AccessKeyRepository(this.db, this.accessKeyQueries);
        this.messageRepo = new MessageRepository(this.db, this.messageQueries);
        this.smsyncBeaconRepo = new SmsyncBeaconRepository(this.db, this.smsyncBeaconQueries);
        
        this.init();
        
        // 缓存实例
        DatabaseService.instance = this;
    }

    init() {
        this.accessKeyRepo.init();
        this.messageRepo.init();
        this.smsyncBeaconRepo.init();
    }

    // 获取新配置
    getWsConfig() {
        const maxAccessKeyNum = wsConfig.maxAccessKeyNum;
        if (maxAccessKeyNum > 0 && this.accessKeyRepo.count() >= maxAccessKeyNum) {
            return { ws_config: '', success: false, message: '已超出最大访问密钥数量' };
        }
        
        // 生成一个随机的 access_key 长12位字符串
        let accessKey = util.generateBase64String(wsConfig.accessKeyLength);
        // 判断access_key 是否已存在 循环生成新的 access_key
        while (this.accessKeyRepo.findByAccessKey(accessKey)) {
            accessKey = util.generateBase64String(wsConfig.accessKeyLength);
        }
        
        // 插入 access_key 到数据库
        this.accessKeyRepo.insert(accessKey);
        logger.info('新用户加入, 已生成accessKey');
        return { ws_config: accessKey + "@" + wsConfig.url, success: true };
    }

    // 保存消息到数据库
    saveMessage(res_id, msg, direction, smsyncBeaconIdString, timestamp) {
        // 查询 smsync_beacon表 获取 smsync_beacon_id
        const smsyncBeaconId = this.smsyncBeaconRepo.findBySmsyncBeaconIdString(smsyncBeaconIdString)?.smsync_beacon_id;
        // 判断smsync_beacon_id 是否存在
        if (!smsyncBeaconId) {
            throw new Error('smsync_beacon_id 不存在');
        }
        logger.debug('保存消息到数据库:', res_id, msg, direction, smsyncBeaconId, timestamp);
        
        // 插入 message 表 并返回新消息的 msg_id
        return this.messageRepo.insert(res_id, msg, direction, smsyncBeaconId, timestamp);
    }

    // 验证 access_key  timestamp@hmac_sha256(timestamp, accessKey)
    verifyAccessKey(authorization, smsyncBeaconIdString) {
        if (!authorization) {
            return false;
        }
        const [timestamp, hmac] = authorization.split('@');

        // 验证时间戳
        logger.debug(timestamp + ', ' + new Date().getTime() / 1000 + ', ' + hmac);
        if (Math.abs(new Date().getTime() / 1000 - timestamp) > wsConfig.authorizationExpire) {
            return false;
        }

        logger.debug('时间戳验证成功');
        if (smsyncBeaconIdString) {
            // 查询smsync_beacon_id_string 获取access_key_id
            const accessKeyId = this.smsyncBeaconRepo.getAccessKeyIdBySmsyncBeaconIdString(smsyncBeaconIdString);
            if (accessKeyId) {
                // smsync_beacon_id_string 已记录
                //获取access_key
                const accessKey = this.accessKeyRepo.getAccessKey(accessKeyId);
                if (!accessKey) {
                    return false;
                }
                if (util.hmacSha256(timestamp, accessKey) === hmac) {
                    return accessKey;
                }
            }
        }

        // smsync_beacon_id_string 未记录或验证失败
        // 获取所有的access_key 与 access_key_id
        const accessKeys = this.accessKeyRepo.findAll();
        logger.debug(accessKeys)

        for (const accessKey of accessKeys) {
            logger.debug('hmac:' + util.hmacSha256(timestamp, accessKey.access_key))
            if (util.hmacSha256(timestamp, accessKey.access_key) === hmac) {
                logger.debug('hmac:' + util.hmacSha256(timestamp, accessKey.access_key))
                // 验证成功
                // 插入 smsync_beacon_id_string
                if (smsyncBeaconIdString) {
                    this.smsyncBeaconRepo.insert(smsyncBeaconIdString, accessKey.access_key_id);
                    logger.info('新Smsync-Beacon加入, id:', smsyncBeaconIdString);
                }
                return accessKey.access_key;
            }
        }
        return false;
    }

    // 获取消息历史
    getMsgHistory(accessKey, data) {
        // 查询accessKey下所有的smsyncBeaconId 与 smsyncBeaconIdString
        const smsyncBeacons = this.smsyncBeaconRepo.findByAccessKey(accessKey);
        if (!smsyncBeacons) {
            return [];
        }
        const smsyncBeaconIds = smsyncBeacons.map(smsyncBeacon => smsyncBeacon.smsync_beacon_id);

        // 获取消息历史
        const messages = this.messageRepo.findByBeaconIdsAndTime(smsyncBeaconIds, data.startTimestamp)
            .map(message => {
                smsyncBeacons.forEach(smsyncBeacon => {
                    if (message.smsync_beacon_id === smsyncBeacon.smsync_beacon_id) {
                        message.smsync_beacon_id = smsyncBeacon.smsync_beacon_id_string;
                    }
                });
                return message;
            });
        return messages;
    }

    // 获取所有SMSync-Beacon客户端
    getAllSmsyncBeaconProc(accessKey) {
        // 获取所有SMSync-Beacon客户端
        return this.smsyncBeaconRepo.findClientsByAccessKey(accessKey);
    }
}

// 创建并导出单例实例
const databaseService = new DatabaseService();
Object.freeze(databaseService); // 冻结实例防止修改

module.exports = databaseService;