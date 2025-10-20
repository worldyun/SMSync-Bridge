const Database = require('better-sqlite3');
const Util = require('./util');
const Logger = require('./logger');
const QueryLoader = require('./queries/queryLoader');
const AccessKeyRepository = require('./repositories/AccessKeyRepository');
const MessageRepository = require('./repositories/MessageRepository');
const SmsyncBeacoRepository = require('./repositories/SmsyncBeacoRepository');
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
        this.smsyncBeacoQueries = QueryLoader.loadQueries('smsyncBeaco.sql');
        
        // 初始化Repositories
        this.accessKeyRepo = new AccessKeyRepository(this.db, this.accessKeyQueries);
        this.messageRepo = new MessageRepository(this.db, this.messageQueries);
        this.smsyncBeacoRepo = new SmsyncBeacoRepository(this.db, this.smsyncBeacoQueries);
        
        this.init();
        
        // 缓存实例
        DatabaseService.instance = this;
    }

    init() {
        this.accessKeyRepo.init();
        this.messageRepo.init();
        this.smsyncBeacoRepo.init();
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
        // 查询 smsync_beaco表 获取 smsync_beaco_id
        const smsyncBeacoId = this.smsyncBeacoRepo.findBySmsyncBeacoIdString(smsyncBeaconIdString)?.smsync_beaco_id;
        // 判断smsync_beaco_id 是否存在
        if (!smsyncBeacoId) {
            throw new Error('smsync_beaco_id 不存在');
        }
        logger.debug('保存消息到数据库:', res_id, msg, direction, smsyncBeacoId, timestamp);
        
        // 插入 message 表 并返回新消息的 msg_id
        return this.messageRepo.insert(res_id, msg, direction, smsyncBeacoId, timestamp);
    }

    // 验证 access_key  timestamp@hmac_sha256(timestamp, accessKey)
    verifyAccessKey(authorization, smsyncBeacoIdString) {
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
        if (smsyncBeacoIdString) {
            // 查询smsync_beaco_id_string 获取access_key_id
            const accessKeyId = this.smsyncBeacoRepo.getAccessKeyIdBySmsyncBeacoIdString(smsyncBeacoIdString);
            if (accessKeyId) {
                // smsync_beaco_id_string 已记录
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

        // smsync_beaco_id_string 未记录或验证失败
        // 获取所有的access_key 与 access_key_id
        const accessKeys = this.accessKeyRepo.findAll();
        logger.debug(accessKeys)

        for (const accessKey of accessKeys) {
            logger.debug('hmac:' + util.hmacSha256(timestamp, accessKey.access_key))
            if (util.hmacSha256(timestamp, accessKey.access_key) === hmac) {
                logger.debug('hmac:' + util.hmacSha256(timestamp, accessKey.access_key))
                // 验证成功
                // 插入 smsync_beaco_id_string
                if (smsyncBeacoIdString) {
                    this.smsyncBeacoRepo.insert(smsyncBeacoIdString, accessKey.access_key_id);
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
        const smsyncBeacos = this.smsyncBeacoRepo.findByAccessKey(accessKey);
        if (!smsyncBeacos) {
            return [];
        }
        const smsyncBeacoIds = smsyncBeacos.map(smsyncBeaco => smsyncBeaco.smsync_beaco_id);

        // 获取消息历史
        const messages = this.messageRepo.findByBeaconIdsAndTime(smsyncBeacoIds, data.startTimestamp)
            .map(message => {
                smsyncBeacos.forEach(smsyncBeaco => {
                    if (message.smsync_beaco_id === smsyncBeaco.smsync_beaco_id) {
                        message.smsync_beaco_id = smsyncBeaco.smsync_beaco_id_string;
                    }
                });
                return message;
            });
        return messages;
    }

    // 获取所有SMSync-Beacon客户端
    getAllSmsyncBeacoProc(accessKey) {
        // 获取所有SMSync-Beacon客户端
        return this.smsyncBeacoRepo.findClientsByAccessKey(accessKey);
    }
}

// 创建并导出单例实例
const databaseService = new DatabaseService();
Object.freeze(databaseService); // 冻结实例防止修改

module.exports = databaseService;