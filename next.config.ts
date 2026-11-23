import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      /**
       * O padrao e 1 MB, e a movimentacao envia ate 4 documentos de ate 2 MB
       * (`movimentacoes/arquivos.ts`) no mesmo POST. 9 MB cobre os 8 MB mais o
       * que o `multipart` acrescenta, e fica abaixo dos 10 MB que o `proxy.ts`
       * bufferiza (`proxyClientMaxBodySize`) — acima disso o corpo chegaria
       * truncado na action.
       */
      bodySizeLimit: "9mb",
    },
  },
};

export default nextConfig;
