const BaseRepository = require('./BaseRepository');

class SmsyncBeaconRepository extends BaseRepository {
    constructor(db, queries) {
        super(db);
        this.queries = queries;
    }
    
    init() {
        this.db.exec(this.queries['创建 beacon_id 表']);
        this.db.exec(this.queries['创建 smsync_beacon_id_string access_key_id 联合索引']);
        this.db.exec(this.queries['创建 access_key_id 索引']);
        this.db.exec(this.queries['创建 access_key_id smsync_beacon_id_string 联合索引']);
    }
    
    findBySmsyncBeaconIdString(smsyncBeaconIdString) {
        return this.db.prepare(this.queries['根据smsync_beacon_id_string查询记录'])
            .get(smsyncBeaconIdString);
    }
    
    getAccessKeyIdBySmsyncBeaconIdString(smsyncBeaconIdString) {
        return this.db.prepare(this.queries['根据smsync_beacon_id_string查询access_key_id'])
            .get(smsyncBeaconIdString)?.access_key_id;
    }
    
    insert(smsyncBeaconIdString, accessKeyId) {
        return this.db.prepare(this.queries['插入新的smsync_beacon记录'])
            .run(smsyncBeaconIdString, accessKeyId);
    }
    
    findByAccessKey(accessKey) {
        return this.db.prepare(this.queries['根据access_key查询所有smsync_beacon记录'])
            .all(accessKey);
    }
    
    findClientsByAccessKey(accessKey) {
        return this.db.prepare(this.queries['根据access_key查询所有smsync_beacon客户端'])
            .all(accessKey);
    }
}

module.exports = SmsyncBeaconRepository;