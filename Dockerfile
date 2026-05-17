#Builder
FROM node:22-alpine AS builder

#tạo thư mục và di chuyển vào vào container trước 
WORKDIR /app 

#copy file cấu hình vào container 
COPY package.json .

#Copy thư mục prisma trước khi install 
COPY prisma ./prisma

#cài đặt các thư viện cần thiết cho việc build 
RUN npm install 
RUN npx prisma generate

#Copy toàn bộ mã nguồn vào container 
COPY . .

#Build dự án với việc tăng bộ nhớ RAM cho tiến trình Node để tránh lỗi Heap Out of Memory
RUN NODE_OPTIONS="--max-old-space-size=4096" npm run build 


#Runtime
FROM node:22-alpine AS runtime

#tạo thư mục và di chuyển vào vào container trước 
WORKDIR /app

# Đặt biến môi trường là production để tối ưu hiệu năng cho Node.js
ENV NODE_ENV=production
ENV PORT=8386
# Copy lại file package.json
COPY package*.json ./
# Ở giai đoạn này, CHỈ cài các thư viện thật sự cần thiết để chạy ứng dụng
RUN npm install --omit=dev
# Copy thư mục prisma và Prisma Client đã được tạo từ Giai đoạn 1 sang
COPY --from=builder --chown=node:node /app/prisma ./prisma
# Copy mã nguồn đã được biên dịch xong (thư mục dist) từ Giai đoạn 1
COPY --from=builder --chown=node:node /app/dist ./dist

#User node để tăng cường bảo mật 
USER node

# Khai báo cổng mà ứng dụng NestJS của bạn đang chạy 
EXPOSE 8386
# Lệnh khởi chạy ứng dụng khi container bắt đầu hoạt động
CMD ["node", "dist/src/main.js"]