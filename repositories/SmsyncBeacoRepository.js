const BaseRepository = require('./BaseRepository');

class SmsyncBeacoRepository extends BaseRepository {
    constructor(db, queries) {
        super(db);
        this.queries = queries;
    }
    
    init() {
        this.db.exec(this.queries['创建 beaco_id 表']);
        this.db.exec(this.queries['创建 smsync_beaco_id_string access_key_id 联合索引']);
        this.db.exec(this.queries['创建 access_key_id 索引']);
        this.db.exec(this.queries['创建 access_key_id smsync_beaco_id_string 联合索引']);
    }
    
    findBySmsyncBeacoIdString(smsyncBeacoIdString) {
        return this.db.prepare(this.queries['根据smsync_beaco_id_string查询记录'])
            .get(smsyncBeacoIdString);
    }
    
    getAccessKeyIdBySmsyncBeacoIdString(smsyncBeacoIdString) {
        return this.db.prepare(this.queries['根据smsync_beaco_id_string查询access_key_id'])
            .get(smsyncBeacoIdString)?.access_key_id;
    }
    
    insert(smsyncBeacoIdString, accessKeyId) {
        return this.db.prepare(this.queries['插入新的smsync_beaco记录'])
            .run(smsyncBeacoIdString, accessKeyId);
    }
    
    findByAccessKey(accessKey) {
        return this.db.prepare(this.queries['根据access_key查询所有smsync_beaco记录'])
            .all(accessKey);
    }
    
    findClientsByAccessKey(accessKey) {
        return this.db.prepare(this.queries['根据access_key查询所有smsync_beaco客户端'])
            .all(accessKey);
    }
}

module.exports = SmsyncBeacoRepository;