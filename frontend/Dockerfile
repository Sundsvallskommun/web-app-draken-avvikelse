# =====================
# Build
# =====================
FROM registry.access.redhat.com/ubi9/nodejs-22 AS builder

USER root
RUN mkdir -p /app && chown -R 1001:0 /app
USER 1001
WORKDIR /app

COPY --chown=1001:0 package.json yarn.lock ./
RUN npm install -g yarn \
 && yarn install --frozen-lockfile

COPY --chown=1001:0 . .
COPY --chown=1001:0 .env-cicd .env.local

ENV NEXT_TELEMETRY_DISABLED=1

# Optional deploy info from CI pipeline (Tekton)
ARG DEPLOY_COMMIT=""
ARG DEPLOY_BRANCH=""

RUN if [ -n "$DEPLOY_COMMIT" ]; then \
  printf '{\n  "commit": "%s",\n  "branch": "%s",\n  "updatedAt": "%s"\n}' \
    "$DEPLOY_COMMIT" "$DEPLOY_BRANCH" "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" \
  > public/deploy-info.json && echo "Generated deploy-info.json from build args"; \
fi

RUN yarn build

# =====================
# Runtime
# =====================
FROM registry.access.redhat.com/ubi9/nodejs-22 AS runner

RUN echo "Runtime step"
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy everything as root-owned and read-only
COPY --from=builder --chown=0:0 --chmod=555 /app/next.config.js ./
COPY --from=builder --chown=0:0 --chmod=555 /app/public ./public
COPY --from=builder --chown=0:0 --chmod=444 /app/package.json ./
COPY --from=builder --chown=0:0 --chmod=555 /app/.next/standalone ./
COPY --from=builder --chown=0:0 --chmod=555 /app/.next/static ./.next/static

# Grant write where entrypoint.sh needs to replace placeholders
USER root
RUN chown 1001:0 /app && chown 1001:0 /app/server.js && chmod g+w /app/server.js \
 && chown -R 1001:0 /app/.next && chmod -R g+w /app/.next
USER 1001

# Entrypoint — fix line endings before locking permissions
COPY --chown=0:0 entrypoint.sh ./
RUN sed -i 's/\r$//' ./entrypoint.sh && chmod 0555 ./entrypoint.sh

USER 1001

ENTRYPOINT ["/app/entrypoint.sh"]
