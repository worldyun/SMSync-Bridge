const crypto = require('crypto');

class Util {
    constructor(parameters) {

    }

    // 生成指定长度的随机字符串
    generateBase64String(length) {
        // 生成足够的随机字节以确保输出长度
        const byteLength = Math.ceil(length * 3 / 4);
        return crypto.randomBytes(byteLength)
            .toString('base64')
            .substring(0, length);
    }

    // 使用 HMAC-SHA256 对数据进行签名
    hmacSha256(data, key) {
        const hmac = crypto.createHmac('sha256', key);
        hmac.update(data);
        return hmac.digest('hex');
    }

    // 获取 WebSocket 加密密钥 pbkdf2
    getWsCryptoKey(salt, accessKey, keylen, iterations) {
        return crypto.pbkdf2Sync(accessKey, salt, iterations, keylen, 'sha256').toString('hex');
    }

    // 解密数据
    msgDecrypt(msg, cryptoKey) {
        // base64 解码 解码后的前16Byte作为iv,剩下的为数据
        const buffer = Buffer.from(msg, 'base64');
        const iv = buffer.subarray(0, 16);
        const data = buffer.subarray(16);
        const decipher = crypto.createDecipheriv('aes-256-cbc', cryptoKey, iv);
        return decipher.update(data, 'hex', 'utf8') + decipher.final('utf8');
    }

    // 加密数据
    msgEncrypt(msg, cryptoKey) {
        // 生成16字节的随机iv
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', cryptoKey, iv);
        // base64编码
        return Buffer.concat([iv, cipher.update(msg, 'utf8'), cipher.final()]).toString('base64');
    }
}

module.exports = Util;
