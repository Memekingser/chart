import express from 'express';
import cors from 'cors';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();

// 启用 CORS
app.use(cors());

// 添加 body-parser 中间件
app.use(express.json());

// 添加错误处理中间件
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).send('Proxy Error');
});

// 代理配置
const proxy = createProxyMiddleware({
    target: 'https://80094.rpc.thirdweb.com/',
    changeOrigin: true,
    pathRewrite: {
        '^/api': '/'
    },
    onError: (err, req, res) => {
        console.error('Proxy Error:', err);
        res.status(500).send('Proxy Error');
    },
    onProxyReq: (proxyReq, req, res) => {
        if (req.body) {
            const bodyData = JSON.stringify(req.body);
            proxyReq.setHeader('Content-Type', 'application/json');
            proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
            proxyReq.write(bodyData);
        }
    },
    onProxyRes: (proxyRes, req, res) => {
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
        proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type';
    }
});

// 处理 OPTIONS 请求
app.options('/api', cors());

// 使用代理中间件
app.use('/api', proxy);

// 添加健康检查端点
app.get('/health', (req, res) => {
    res.send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`代理服务器运行在端口 ${PORT}`);
}); 