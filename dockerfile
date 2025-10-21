# 使用官方 Node.js 运行时作为基础镜像
FROM node:24.10-alpine

# 添加条件判断，测试是否能访问 google.com
RUN ping -c 1 google.com >/dev/null 2>&1 && \
    echo "Network access to google.com is available, using default repositories" || \
    (echo "Network access to google.com is not available, switching to Aliyun mirrors" && \
    sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories)

# 安装编译原生模块所需的依赖
RUN apk add --no-cache python3 make g++

# 设置工作目录
WORKDIR /smsync-bridge

# 复制 package.json 和 package-lock.json（如果存在）
COPY package*.json ./

# 添加条件判断，测试是否能访问 google.com 来决定使用哪个 npm registry
RUN ping -c 1 google.com >/dev/null 2>&1 && \
    (echo "Using default npm registry" && npm ci --only=production) || \
    (echo "Using Taobao npm mirror" && npm --registry https://registry.npmmirror.com ci --only=production)

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