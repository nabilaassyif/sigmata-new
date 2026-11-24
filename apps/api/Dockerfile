FROM golang:1.27.4-alpine3.24 AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/server

FROM alpine:3.24 AS runner
RUN apk add --no-cache ca-certificates && addgroup -S app && adduser -S -G app app
USER app
COPY --from=builder /out/api /usr/local/bin/api
COPY migrations/001Workflow.sql /app/migrations/001Workflow.sql
WORKDIR /app
EXPOSE 8080
ENTRYPOINT ["api"]
