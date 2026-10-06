FROM node:24-alpine
WORKDIR /app
COPY package.json server.js crm-domain.js ./
COPY index.html app.js crm.js styles.css crm.css seed-data.js ./
COPY assets ./assets
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENV PORT=80 DATA_DIR=/app/data
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:80/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
