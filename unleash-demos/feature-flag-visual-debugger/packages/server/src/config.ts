export const config = {
  port: parseInt(process.env.PORT ?? '3001', 10),
  jaegerQueryUrl: process.env.JAEGER_QUERY_URL ?? 'http://localhost:16686',
};
