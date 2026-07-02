FROM node:20-alpine
WORKDIR /app
COPY server.js .
ENV DATA_DIR=/data PORT=8787
VOLUME ["/data"]
EXPOSE 8787
CMD ["node", "server.js"]
