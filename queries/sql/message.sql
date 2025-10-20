-- 创建 message 表
CREATE TABLE IF NOT EXISTS message (
    msg_id INTEGER PRIMARY KEY AUTOINCREMENT,
    res_id TEXT NOT NULL,
    msg TEXT NOT NULL,
    direction TEXT NOT NULL,
    smsync_beaco_id INTEGER NOT NULL,
    created_at DATETIME NOT NULL
);

-- 创建 smsync_beaco_id created_at 联合索引
CREATE INDEX IF NOT EXISTS idx_smsync_beaco_id_created_at ON message (smsync_beaco_id, created_at);

-- 插入消息
INSERT INTO message (res_id, msg, direction, smsync_beaco_id, created_at) VALUES (?, ?, ?, ?, ?);

-- 根据beacon_ids和时间查询消息
SELECT message.res_id, message.msg, message.direction, message.smsync_beaco_id, message.created_at 
FROM message 
WHERE message.smsync_beaco_id IN ({placeholders}) 
AND message.created_at >= ? 
ORDER BY message.created_at ASC;