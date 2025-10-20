-- 创建 beaco_id 表
CREATE TABLE IF NOT EXISTS smsync_beaco (
    smsync_beaco_id INTEGER PRIMARY KEY AUTOINCREMENT,
    smsync_beaco_id_string TEXT NOT NULL,
    description TEXT,
    access_key_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建 smsync_beaco_id_string access_key_id 联合索引
CREATE INDEX IF NOT EXISTS idx_smsync_beaco_id_string_access_key_id ON smsync_beaco (smsync_beaco_id_string, access_key_id);

-- 创建 access_key_id 索引
CREATE INDEX IF NOT EXISTS idx_access_key_id ON smsync_beaco (access_key_id);

-- 创建 access_key_id smsync_beaco_id_string 联合索引
CREATE INDEX IF NOT EXISTS idx_access_key_id_smsync_beaco_id_string ON smsync_beaco (access_key_id, smsync_beaco_id_string);

-- 根据smsync_beaco_id_string查询access_key_id
SELECT access_key_id FROM smsync_beaco WHERE smsync_beaco_id_string = ?;

-- 根据smsync_beaco_id_string查询记录
SELECT smsync_beaco_id FROM smsync_beaco WHERE smsync_beaco_id_string = ?;

-- 插入新的smsync_beaco记录
INSERT INTO smsync_beaco (smsync_beaco_id_string, access_key_id) VALUES (?, ?);

-- 根据access_key查询所有smsync_beaco记录
SELECT smsync_beaco_id, smsync_beaco_id_string 
FROM smsync_beaco 
WHERE access_key_id = (SELECT access_key_id FROM access_key WHERE access_key = ?);

-- 根据access_key查询所有smsync_beaco客户端
SELECT smsync_beaco_id_string as smsync_beaco_id, created_at
FROM smsync_beaco 
WHERE access_key_id = (SELECT access_key_id FROM access_key WHERE access_key = ?);