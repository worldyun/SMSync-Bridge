const crypto = require('crypto');
const Logger = require('./logger');

const logger = new Logger('Util');

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
        return hmac.digest('hex').toUpperCase();
    }

    // 获取 WebSocket 加密密钥 pbkdf2
    getWsCryptoKey(salt, accessKey, keylen, iterations) {
        logger.debug('salt', salt, Buffer.from(salt, 'base64'));
        logger.debug('accessKey', accessKey);
        return crypto.pbkdf2Sync(Buffer.from(accessKey), Buffer.from(salt, 'base64'), iterations, keylen, 'sha256');
    }

    // 解密数据
    msgDecrypt(encryptedMsg, cryptoKey) {
        try {
            // Base64解码
            const buffer = Buffer.from(encryptedMsg, 'base64');

            // 检查是否是有效的Base64
            if (buffer.toString('base64') !== encryptedMsg) {
                throw new Error('Invalid Base64 string');
            }

            // 检查数据长度是否足够包含IV
            if (buffer.length < 16) {
                throw new Error('Data too short to contain IV');
            }

            logger.debug('debase64:', buffer.toString('hex'));

            // 前16字节作为IV，剩余部分作为加密数据
            const iv = buffer.subarray(0, 16);
            const data = buffer.subarray(16);
            logger.debug(iv.toString('hex'), data.toString('hex'));

            // 创建解密器，使用AES-128-CBC算法和PKCS7填充
            const decipher = crypto.createDecipheriv('aes-128-cbc', cryptoKey, iv);

            // 执行解密
            const decrypted = Buffer.concat([
                decipher.update(data),
                decipher.final()
            ]);

            // 返回解密后的字符串
            return decrypted.toString('utf8');
        } catch (error) {
            console.error('Decryption failed:', error.message);
            throw error;
        }
    }

    // 加密数据
    msgEncrypt(msg, cryptoKey) {
        // 生成16字节的随机iv
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-128-cbc', cryptoKey, iv);

        // 加密数据
        const encrypted = Buffer.concat([
            cipher.update(Buffer.from(msg)),
            cipher.final()
        ]);

        // 将iv和加密数据合并后base64编码
        return Buffer.concat([iv, encrypted]).toString('base64');
    }
}

module.exports = Util;
