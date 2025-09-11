// proxy.middleware.ts
import { createProxyMiddleware } from 'http-proxy-middleware';

export const ProxyMiddleware = (target: string) =>
  createProxyMiddleware({
    target,
    changeOrigin: true
  });
