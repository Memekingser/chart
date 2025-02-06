import { ethers } from 'ethers';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';

// Firebase 配置
const firebaseConfig = {
    apiKey: "AIzaSyATHLoVO4ZSU9LC-6LUK1rKKbwBiQiUU7k",
    authDomain: "bera-73e50.firebaseapp.com",
    databaseURL: "https://bera-73e50-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "bera-73e50",
    storageBucket: "bera-73e50.firebasestorage.app",
    messagingSenderId: "602581233399",
    appId: "1:602581233399:web:7d39a49a59a0344c14adf2",
    measurementId: "G-JLEKW52TBW"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// 合约地址
const PAIR_ADDRESS = '0x4186aEC56e9C0b09678F96Ed028bf77b33A62E3e';
const BEAR_ADDRESS = '0x77df181B1d3f38fA32f7Ab661Eb71cAA0dAdC620';
const WETH_ADDRESS = '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590';

// ABI
const PAIR_ABI = [
    'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
];

const ERC20_ABI = [
    'function decimals() external view returns (uint8)'
];

// 初始化 provider
const provider = new ethers.providers.JsonRpcProvider('https://berachain.leakedrpc.chipswap.org/', {
    name: 'berachain',
    chainId: 80094
});

// 初始化合约
const pairContract = new ethers.Contract(PAIR_ADDRESS, PAIR_ABI, provider);
const bearContract = new ethers.Contract(BEAR_ADDRESS, ERC20_ABI, provider);
const wethContract = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, provider);

// 获取代币信息
async function getTokenInfo() {
    try {
        const [bearDecimals, wethDecimals] = await Promise.all([
            bearContract.decimals(),
            wethContract.decimals()
        ]);
        console.log('代币信息:', {
            bearDecimals: bearDecimals.toString(),
            wethDecimals: wethDecimals.toString()
        });
        return { bearDecimals, wethDecimals };
    } catch (error) {
        console.error('获取代币信息失败:', error);
        return { bearDecimals: 18, wethDecimals: 18 };
    }
}

// 获取 ETH 价格
async function getEthPrice() {
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
        const data = await response.json();
        return data.ethereum.usd;
    } catch (error) {
        console.error('获取 ETH 价格失败:', error);
        return null;
    }
}

// 重试函数
async function retry(fn, retries = 5, delay = 2000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === retries - 1) throw error;
            console.log(`重试第 ${i + 1} 次...`);
            await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
        }
    }
}

// 获取区块数据
async function getBlockData(blockNumber, tokenInfo) {
    try {
        // 获取区块
        const block = await retry(async () => {
            const b = await provider.getBlock(blockNumber);
            if (!b) throw new Error('区块不存在');
            return b;
        }, 5, 2000);

        // 获取储备数据
        const reserves = await retry(async () => {
            try {
                return await pairContract.getReserves({ blockTag: blockNumber });
            } catch (error) {
                if (error.message.includes('missing trie node') || 
                    error.message.includes('missing revert data')) {
                    return null;
                }
                throw error;
            }
        }, 5, 2000);

        if (!reserves) {
            console.log(`跳过区块 ${blockNumber}: 数据不可用`);
            return null;
        }

        const ethPrice = await getEthPrice();
        if (!ethPrice) {
            console.log(`跳过区块 ${blockNumber}: ETH价格不可用`);
            return null;
        }

        const reserve0 = ethers.utils.formatUnits(reserves[0], tokenInfo.bearDecimals);
        const reserve1 = ethers.utils.formatUnits(reserves[1], tokenInfo.wethDecimals);
        
        // 验证储备数据
        if (parseFloat(reserve0) === 0 || parseFloat(reserve1) === 0) {
            console.log(`跳过区块 ${blockNumber}: 储备为0`);
            return null;
        }

        const priceInEth = parseFloat(reserve0) / parseFloat(reserve1);
        const price = priceInEth * ethPrice;

        return {
            time: block.timestamp * 1000,
            price: price,
            priceInEth: priceInEth,
            reserve0: parseFloat(reserve0),
            reserve1: parseFloat(reserve1),
            blockNumber: blockNumber,
            ethPrice: ethPrice
        };
    } catch (error) {
        console.error(`获取区块 ${blockNumber} 数据失败:`, error);
        return null;
    }
}

// 主函数
async function fetchHistoricalData() {
    try {
        console.log('开始获取历史数据...');
        
        const START_BLOCK = 740000;
        const END_BLOCK = 744020;
        const INTERVAL_BLOCKS = 15; // 每15个区块取一次数据
        const BATCH_SIZE = 20; // 每批保存的数据点数量

        const tokenInfo = await getTokenInfo();
        let batchData = {};
        let batchCount = 0;
        let successCount = 0;
        let failureCount = 0;

        for (let blockNumber = START_BLOCK; blockNumber <= END_BLOCK; blockNumber += INTERVAL_BLOCKS) {
            const progress = ((blockNumber - START_BLOCK) / (END_BLOCK - START_BLOCK) * 100).toFixed(2);
            console.log(`进度: ${progress}% (区块 ${blockNumber}/${END_BLOCK})`);

            const blockData = await getBlockData(blockNumber, tokenInfo);
            
            if (blockData) {
                batchData[blockData.time] = blockData;
                successCount++;
                
                // 每 BATCH_SIZE 个数据点保存一次
                if (Object.keys(batchData).length >= BATCH_SIZE) {
                    batchCount++;
                    console.log(`保存第 ${batchCount} 批数据（${Object.keys(batchData).length} 个数据点）`);
                    try {
                        await set(ref(database, 'prices'), batchData, { merge: true });
                        console.log(`第 ${batchCount} 批数据保存成功`);
                        batchData = {}; // 清空批次数据
                    } catch (error) {
                        console.error(`保存第 ${batchCount} 批数据失败:`, error);
                    }
                }
            } else {
                failureCount++;
            }

            // 添加延迟避免请求过快
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // 保存剩余的数据点
        if (Object.keys(batchData).length > 0) {
            batchCount++;
            console.log(`保存最后一批数据（${Object.keys(batchData).length} 个数据点）`);
            try {
                await set(ref(database, 'prices'), batchData, { merge: true });
                console.log(`最后一批数据保存成功`);
            } catch (error) {
                console.error('保存最后一批数据失败:', error);
            }
        }

        console.log('历史数据获取完成！');
        console.log(`总共处理了 ${batchCount} 批数据`);
        console.log(`成功: ${successCount} 个数据点`);
        console.log(`失败: ${failureCount} 个区块`);
    } catch (error) {
        console.error('获取历史数据失败:', error);
    }
}

// 运行程序
fetchHistoricalData().then(() => {
    console.log('程序执行完成');
    process.exit(0);
}).catch(error => {
    console.error('程序执行失败:', error);
    process.exit(1);
}); 