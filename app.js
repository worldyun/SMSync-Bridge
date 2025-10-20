const path = require('path');
const express = require('express');
const WebSocketService = require('./websocket');
const dbService = require('./database');
const configService = require('./config');
const Logger = require('./logger');

const logger = new Logger('App');

// 获取配置
const port = configService.getPort();

const app = express();

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
    WebSocketService(server);
});