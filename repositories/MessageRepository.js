const BaseRepository = require('./BaseRepository');

class MessageRepository extends BaseRepository {
    constructor(db, queries) {
        super(db);
        this.queries = queries;
    }
    
    init() {
        this.db.exec(this.queries['创建 message 表']);
        this.db.exec(this.queries['创建 smsync_beacon_id created_at 联合索引']);
    }
    
    insert(res_id, msg, direction, smsync_beacon_id, created_at) {
        return this.db.prepare(this.queries['插入消息'])
            .run(res_id, msg, direction, smsync_beacon_id, created_at)
            .lastInsertRowid;
    }
    
    findByBeaconIdsAndTime(beaconIds, startTimestamp) {
        const placeholders = beaconIds.map(() => '?').join(',');
        const query = this.queries['根据beacon_ids和时间查询消息']
            .replace('{placeholders}', placeholders);
        return this.db.prepare(query).all([...beaconIds, startTimestamp || 0]);
    }
}

module.exports = MessageRepository;