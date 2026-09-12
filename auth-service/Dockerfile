FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY core ./core
COPY auth-service ./auth-service
ENV AUTH_BIND=0.0.0.0
ENV PORT=8787
USER node
EXPOSE 8787
CMD ["node", "auth-service/server.cjs"]
