# BERA/WETH 价格图表

这是一个使用 lightweight-charts 显示 BERA/WETH 交易对实时价格的网页应用。

## 功能特点

- 实时显示 BERA/WETH 价格
- K线图表展示
- Firebase 实时数据同步
- 响应式设计
- 24小时价格变化显示

## 安装步骤

1. 克隆仓库：
```bash
git clone [your-repository-url]
cd bera-chart
```

2. 安装依赖：
```bash
npm install
```

3. 配置 Firebase：
- 在 Firebase Console 创建新项目
- 获取项目配置信息
- 将配置信息填入 `src/firebase-config.js` 文件

4. 启动开发服务器：
```bash
npm start
```

5. 构建生产版本：
```bash
npm run build
```

## Firebase 设置

1. 创建 Firebase 项目
2. 在 "实时数据库" 中创建新的数据库
3. 设置数据库规则：
```json
{
  "rules": {
    "prices": {
      ".read": true,
      ".write": true
    }
  }
}
```

## 技术栈

- lightweight-charts
- Firebase Realtime Database
- ethers.js
- Parcel bundler

## 注意事项

- 确保有足够的 RPC 调用限额
- Firebase 免费套餐可能有使用限制
- 建议在生产环境中添加适当的安全措施

## 许可证

MIT 