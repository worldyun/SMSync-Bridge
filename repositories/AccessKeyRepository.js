const BaseRepository = require('./BaseRepository');

class AccessKeyRepository extends BaseRepository {
    constructor(db, queries) {
        super(db);
        this.queries = queries;
    }

    init() {
        this.db.exec(this.queries['创建 access_key 表']);
        this.db.exec(this.queries['创建 access_key access_key_id 联合索引']);
    }

    count() {
        return this.db.prepare(this.queries['查询accessKey数量']).get().count;
    }

    findByAccessKey(accessKey) {
        return this.db.prepare(this.queries['根据access_key查询记录']).get(accessKey);
    }

    insert(accessKey) {
        return this.db.prepare(this.queries['插入新的access_key']).run(accessKey);
    }

    getAccessKeyId(accessKey) {
        return this.db.prepare(this.queries['根据access_key查询access_key_id']).get(accessKey)?.access_key_id;
    }

    getAccessKey(accessKeyId) {
        return this.db.prepare(this.queries['根据access_key_id查询access_key']).get(accessKeyId)?.access_key;
    }

    findAll() {
        return this.db.prepare(this.queries['查询所有access_key']).all();
    }
}

module.exports = AccessKeyRepository;