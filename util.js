const crypto = require('crypto');

class Util {
    constructor(parameters) {

    }

    generateBase64String(length) {
        // 生成足够的随机字节以确保输出长度
        const byteLength = Math.ceil(length * 3 / 4);
        return crypto.randomBytes(byteLength)
            .toString('base64')
            .substring(0, length);
    }
}

module.exports = Util;
