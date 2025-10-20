const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const Logger = require('../logger');

const logger = new Logger('Config');

class ConfigService {
    constructor() {
        this.config = this.loadConfig();
    }

    loadConfig() {
        // 确保 data 目录存在
        if (!fs.existsSync('data')) {
            fs.mkdirSync('data');
            logger.info('创建 data 目录');
        }

        // 如果配置文件不存在，从默认配置文件复制
        if (!fs.existsSync('data/config.yml')) {
            fs.copyFileSync('default_config.yml', 'data/config.yml');
            logger.info('从默认配置文件创建配置文件');
        }

        // 读取配置文件
        try {
            const config = yaml.load(fs.readFileSync('data/config.yml', 'utf8'));
            logger.info('配置文件加载成功');
            return config;
        } catch (error) {
            logger.error('配置文件加载失败:', error);
            throw error;
        }
    }

    getConfig() {
        return this.config;
    }

    get(path, defaultValue = null) {
        return path.split('.').reduce((obj, key) => {
            return obj && obj[key] !== undefined ? obj[key] : defaultValue;
        }, this.config);
    }

    // 获取服务器端口
    getPort() {
        return this.get('server.port', 8080);
    }

    // 获取 WebSocket 配置
    getWebSocketConfig() {
        return this.get('server.websocket', {});
    }

    // 获取数据库配置
    getDatabaseConfig() {
        return this.get('server.db', {});
    }
}

// 导出单例实例
module.exports = new ConfigService();