# 使用官方 Node.js 运行时作为基础镜像
FROM node:24.10-alpine

# 设置工作目录
WORKDIR /smsync-bridge

# 复制 package.json 和 package-lock.json（如果存在）
COPY package*.json ./

# 安装项目依赖
RUN npm ci --only=production

# 复制应用源代码
COPY . .

# 创建数据目录
RUN mkdir -p data

# 创建用户组和用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# 更改文件所有者
RUN chown -R nodejs:nodejs /smsync-bridge

# 切换到非 root 用户
USER nodejs

# 暴露应用端口
EXPOSE 3000

# 启动应用
CMD [ "npm", "start" ]