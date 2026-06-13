# ── Stage 1: builder ─────────────────────────────────────────────────────────
# 安裝全部依賴、編譯 shared 套件、產生 Prisma client、編譯 API TypeScript
FROM node:24-alpine AS builder

ENV HUSKY=0
WORKDIR /app

# 先複製 package 清單以最大化 layer 快取效益
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json         ./apps/api/

RUN npm ci

# 複製原始碼（.dockerignore 已排除 node_modules、dist、.env）
COPY tsconfig.base.json ./
COPY packages/shared    ./packages/shared
COPY apps/api           ./apps/api

# 編譯 packages/shared 為 JavaScript
# （production stage 的 node 無法直接 import .ts，需要編譯後的 dist/）
RUN cd /app/packages/shared && npx tsc -p tsconfig.build.json

# 產生 Prisma client（不需要真實 DB；DATABASE_URL 僅需存在）
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
WORKDIR /app/apps/api
RUN npx prisma generate

# 編譯 API TypeScript → dist/
RUN npx tsc -p tsconfig.json

# ── Stage 2: production ───────────────────────────────────────────────────────
# 只保留執行所需檔案，映像盡量精簡
FROM node:24-alpine AS production

ENV NODE_ENV=production
ENV HUSKY=0
WORKDIR /app

# 安裝 production 依賴（--omit=dev 跳過 TypeScript、Jest、tsx 等開發工具）
COPY package.json package-lock.json ./
COPY packages/shared/package.json  ./packages/shared/
COPY apps/api/package.json         ./apps/api/

RUN npm ci --omit=dev --ignore-scripts

# 以 production 版 package.json 覆蓋 shared，指向編譯後的 dist/
# （必須在 npm ci 之後執行，npm ci 依賴原始 package.json 中的 zod 宣告安裝依賴）
RUN printf '{"name":"@vms/shared","version":"0.1.0","type":"module","main":"./dist/index.js","exports":{".":{"default":"./dist/index.js"}}}' \
    > packages/shared/package.json

# 從 builder 複製編譯產出
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/api/dist        ./apps/api/dist

WORKDIR /app/apps/api

EXPOSE 8090

CMD ["node", "dist/index.js"]
