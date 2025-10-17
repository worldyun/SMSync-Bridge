const fs = require('fs');
const path = require('path');
const express = require('express');
const yaml = require('js-yaml');
const WebSocketService = require('./websocket');
const DatabaseService = require('./database');
const logger = require('./logger');

// 判断 data 目录是否存在，不存在则创建
if (!fs.existsSync('data')) {
    fs.mkdirSync('data');
}

// 判断 data/config.yml 文件是否存在，不存在则复制 default_config.yml
if (!fs.existsSync('data/config.yml')) {
    fs.copyFileSync('default_config.yml', 'data/config.yml');
}

// todo: 正式发布时请删除此行代码 
fs.copyFileSync('default_config.yml', 'data/config.yml');

// 读取配置文件
const config = yaml.load(fs.readFileSync('data/config.yml', 'utf8'));
const port = config.server.port || 8080;

const app = express();

// 初始化数据库服务
const dbService = new DatabaseService(config);

// API 路由中间件
app.use('/api', (req, res, next) => {
    next();
});

// 静态文件服务中间件
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
        next();
    } else {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
});

// API 路由
app.get('/api/getNewConfig', (req, res) => {
    res.json(dbService.getWsConfig());
});

// 启动服务器后再初始化 WebSocket 服务
const server = app.listen(port, () => {
    logger.info(`服务器启动在端口 ${port}`);
    
    // 初始化 WebSocket 服务，并传入数据库服务
    const wsService = new WebSocketService(server, dbService, config);
});

// todo: 添加Log库, 规范日志输出