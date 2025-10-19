const log4js = require('log4js');

// 配置 log4js
log4js.configure({
  appenders: {
    console: {
      type: 'console',
      layout: {
        type: 'pattern',
        pattern: '%[[%d{yyyy-MM-dd hh:mm:ss.SSS}] [%p] [%c]%] - %m'
      }
    }
  },
  categories: {
    default: { 
      appenders: ['console'], 
      level: process.env.LOG_LEVEL || 'info'  // 可从环境变量读取
    }
  }
});

const logger = log4js.getLogger();

// 导出 logger 实例
module.exports = logger;