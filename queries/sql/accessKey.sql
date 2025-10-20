-- 创建 access_key 表
CREATE TABLE IF NOT EXISTS access_key (
    access_key_id INTEGER PRIMARY KEY AUTOINCREMENT,
    access_key TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建 access_key access_key_id 联合索引
CREATE INDEX IF NOT EXISTS idx_access_key_access_key_id ON access_key (access_key, access_key_id);

-- 查询accessKey数量
SELECT COUNT(*) AS count FROM access_key;

-- 根据access_key查询记录
SELECT * FROM access_key WHERE access_key = ?;

-- 插入新的access_key
INSERT INTO access_key (access_key) VALUES (?);

-- 根据access_key查询access_key_id
SELECT access_key_id FROM access_key WHERE access_key = ?;

-- 根据access_key_id查询access_key
SELECT access_key FROM access_key WHERE access_key_id = ?;

-- 查询所有access_key
SELECT access_key_id, access_key FROM access_key;