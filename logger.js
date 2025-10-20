const log4js = require('log4js');

// 配置log4js
log4js.configure({
  appenders: {
    console: {
      type: 'console',
      layout: {
        type: 'pattern',
        pattern: '%[[%d{yyyy-MM-dd hh:mm:ss.SSS}] [%p] [%c]%] - %m'
      }
    },
    // 添加文件输出支持
    file: {
      type: 'file',
      filename: process.env.LOG_FILE || 'SMSync-Bridge.log',
      maxLogSize: 10485760, // 10MB
      backups: 3,
      layout: {
        type: 'pattern',
        pattern: '[%d{yyyy-MM-dd hh:mm:ss.SSS}] [%p] [%c] - %m'
      }
    }
  },
  categories: {
    default: {
      appenders: process.env.LOG_FILE ? ['console', 'file'] : ['console'],
      level: process.env.LOG_LEVEL || 'info'
    }
  }
});

class Logger {
  constructor(category = 'default') {
    this.logger = log4js.getLogger(category);
  }

  info(message, ...args) {
    this.logger.info(message, ...args);
  }

  error(message, ...args) {
    this.logger.error(message, ...args);
  }

  warn(message, ...args) {
    this.logger.warn(message, ...args);
  }

  debug(message, ...args) {
    this.logger.debug(message, ...args);
  }
  
  trace(message, ...args) {
    this.logger.trace(message, ...args);
  }
  
  fatal(message, ...args) {
    this.logger.fatal(message, ...args);
  }
  
  // 支持格式化日志
  infof(format, ...args) {
    this.logger.info(format, ...args);
  }
  
  errorf(format, ...args) {
    this.logger.error(format, ...args);
  }
  
  warnf(format, ...args) {
    this.logger.warn(format, ...args);
  }
  
  debugf(format, ...args) {
    this.logger.debug(format, ...args);
  }
}

// 导出Logger类和已经实例化的默认logger
module.exports = Logger;
module.exports.logger = new Logger('default');