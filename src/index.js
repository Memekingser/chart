import { createChart } from 'lightweight-charts';
import { ethers } from 'ethers';
import { database } from './firebase-config';
import { ref, set, onValue, get } from 'firebase/database';

// 合约地址
const PAIR_ADDRESS = '0x4186aEC56e9C0b09678F96Ed028bf77b33A62E3e';
const BEAR_ADDRESS = '0x77df181B1d3f38fA32f7Ab661Eb71cAA0dAdC620';
const WETH_ADDRESS = '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590';

// ABI 片段
const PAIR_ABI = [
    'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function token0() external view returns (address)',
    'function token1() external view returns (address)',
    'function price0CumulativeLast() external view returns (uint)',
    'function price1CumulativeLast() external view returns (uint)'
];

// ERC20 ABI
const ERC20_ABI = [
    'function decimals() external view returns (uint8)',
    'function symbol() external view returns (string)',
    'function name() external view returns (string)'
];

// 初始化 provider
const provider = new ethers.providers.StaticJsonRpcProvider(
    'https://berachain.leakedrpc.chipswap.org/',
    {
        name: 'berachain',
        chainId: 80094,
        ensAddress: null,
        skipFetchSetup: true
    }
);

// 添加网络检测
provider.on("error", (error) => {
    console.error("Provider Error:", error);
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
        console.log('Token Info:', {
            bearDecimals: bearDecimals.toString(),
            wethDecimals: wethDecimals.toString()
        });
        return { bearDecimals, wethDecimals };
    } catch (error) {
        console.error('Failed to get token info:', error);
        return { bearDecimals: 18, wethDecimals: 18 }; // Default values
    }
}

// 初始化图表
const chartContainer = document.getElementById('chart-container');
const chart = createChart(chartContainer, {
    width: chartContainer.clientWidth,
    height: chartContainer.clientHeight,
    layout: {
        background: { type: 'solid', color: 'white' },
        textColor: 'black',
        watermark: {
            visible: true,
            text: 'BERA',
            color: 'rgba(0, 0, 0, 0.7)',
            fontSize: 100,
            fontFamily: 'Arial',
            fontWeight: 'bold',
            horzAlign: 'center',
            vertAlign: 'center',
        }
    },
    grid: {
        vertLines: { color: '#E6E6E6' },
        horzLines: { color: '#E6E6E6' },
    },
    timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#D1D4DC',
        barSpacing: 12,  // 增加K线之间的间距
        minBarSpacing: 8,  // 设置最小间距
        rightOffset: 12,
        fixLeftEdge: true,
        fixRightEdge: true,
    },
    rightPriceScale: {
        precision: 9,
        borderColor: '#D1D4DC',
        scaleMargins: {
            top: 0.1,
            bottom: 0.1,
        },
    },
    crosshair: {
        mode: 1,
        vertLine: {
            width: 1,
            color: '#758696',
            style: 3,
        },
        horzLine: {
            width: 1,
            color: '#758696',
            style: 3,
        },
    },
});

const candleSeries = chart.addCandlestickSeries({
    upColor: '#26a69a',
    downColor: '#ef5350',
    borderVisible: false,
    wickUpColor: '#26a69a',
    wickDownColor: '#ef5350',
    priceFormat: {
        type: 'price',
        precision: 9,
        minMove: 0.000000001,
    },
});

// 获取 ETH 价格
async function getEthPrice() {
    return 2760; // 固定 ETH 价格
}

// 获取价格数据
async function getPrice() {
    try {
        const [reserves, tokenInfo, ethPrice] = await Promise.all([
            pairContract.getReserves(),
            getTokenInfo(),
            getEthPrice()
        ]);

        // Consider token precision
        const reserve0 = ethers.utils.formatUnits(reserves[0], tokenInfo.bearDecimals);
        const reserve1 = ethers.utils.formatUnits(reserves[1], tokenInfo.wethDecimals);
        
        // BEAR/WETH price = reserve0/reserve1
        const bearWethPrice = parseFloat(reserve0) / parseFloat(reserve1);
        
        // BEAR/USD price = BEAR/WETH * ETH/USD
        const bearUsdPrice = bearWethPrice * ethPrice;

        return {
            price: bearUsdPrice,
            priceInEth: bearWethPrice,
            reserve0: parseFloat(reserve0),
            reserve1: parseFloat(reserve1),
            ethPrice: ethPrice
        };
    } catch (error) {
        console.error('Failed to retrieve price:', error);
        return null;
    }
}

// 检查历史数据完整性
async function checkHistoricalData() {
    try {
        const currentBlock = await provider.getBlockNumber();
        console.log(`Checking historical data integrity (from current block ${currentBlock})...`);

        const pricesRef = ref(database, 'prices');
        const snapshot = await get(pricesRef);

        if (!snapshot.exists()) {
            console.log('No data in database, will start recording from current block');
            return false;
        }

        const prices = Object.values(snapshot.val());
        const blockNumbers = prices.map(p => p.blockNumber).sort((a, b) => a - b);
        
        if (blockNumbers.length === 0) {
            console.log('No valid block data in database, will start recording from current block');
            return false;
        }

        const lastBlock = blockNumbers[blockNumbers.length - 1];
        console.log(`Last block in database: ${lastBlock}`);

        if (currentBlock - lastBlock > 100) {
            console.log(`Last recorded block ${lastBlock} is too far from current block ${currentBlock}, will restart recording`);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error checking historical data:', error);
        return false;
    }
}

// 更新市场数据显示
function updateMarketInfo(priceData) {
    if (!priceData) return;

    try {
        // Update liquidity pool data
        const bearAmount = document.getElementById('bear-amount');
        const wethAmount = document.getElementById('weth-amount');
        wethAmount.textContent = `WETH: ${Number(priceData.reserve0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;
        bearAmount.textContent = `BEAR: ${Number(priceData.reserve1).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;

        // Update market cap (price * total supply of 1 billion)
        const marketCap = document.getElementById('market-cap');
        const totalSupply = 1000000000; // 1 billion total supply
        const mcapValue = priceData.price * totalSupply;
        marketCap.textContent = `$${mcapValue.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;
    } catch (error) {
        console.error('Failed to update market data:', error);
    }
}

// 更新 Firebase 数据
async function updateFirebaseData() {
    try {
        // Get current block
        const currentBlock = await provider.getBlockNumber();
        console.log(`Current block: ${currentBlock}`);

        // Get last data point block number
        const pricesRef = ref(database, 'prices');
        const snapshot = await get(pricesRef);
        let lastBlockNumber = currentBlock; // Default from current block

        if (snapshot.exists()) {
            const prices = Object.values(snapshot.val());
            // Sort by block number, find last valid block
            const sortedPrices = prices.sort((a, b) => a.blockNumber - b.blockNumber);
            const lastPrice = sortedPrices[sortedPrices.length - 1];
            
            if (lastPrice) {
                lastBlockNumber = lastPrice.blockNumber;
                console.log(`Last block in database: ${lastBlockNumber}`);
            }
        }

        // If there's a new block, get new data
        if (lastBlockNumber < currentBlock) {
            // Get data from latest block
            const block = await provider.getBlock(currentBlock);
            if (!block) {
                console.error('Failed to retrieve latest block data');
                return;
            }

            const priceData = await getPrice();
            if (priceData && priceData.price && !isNaN(priceData.price) && isFinite(priceData.price)) {
                const dataPoint = {
                    time: block.timestamp * 1000,
                    price: priceData.price,
                    priceInEth: priceData.priceInEth,
                    reserve0: priceData.reserve0,
                    reserve1: priceData.reserve1,
                    blockNumber: currentBlock,
                    ethPrice: priceData.ethPrice
                };

                await set(ref(database, `prices/${block.timestamp * 1000}`), dataPoint);
                console.log(`Latest block ${currentBlock} data updated: $${priceData.price.toFixed(9)} (${priceData.priceInEth.toFixed(9)} WETH)`);
                
                // Update market data
                updateMarketInfo(priceData);
                
                // 更新预览图
                updatePreviewImage();
            } else {
                console.error('Invalid price data');
            }
        } else {
            console.log('Already latest data, no update needed');
        }
    } catch (error) {
        console.error('Failed to update Firebase data:', error);
    }
}

// 生成和更新预览图
async function updatePreviewImage() {
    try {
        // 获取图表截图
        const chartCanvas = document.querySelector('#chart-container canvas');
        if (!chartCanvas) return;
        
        const imageUrl = chartCanvas.toDataURL('image/png');
        
        // 更新 meta 标签
        document.getElementById('og-image').setAttribute('content', imageUrl);
        document.getElementById('twitter-image').setAttribute('content', imageUrl);
        
        console.log('Preview image updated successfully');
    } catch (error) {
        console.error('Failed to update preview image:', error);
    }
}

// Listen for Firebase data changes
function listenToFirebase() {
    const pricesRef = ref(database, 'prices');
    onValue(pricesRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const candleData = processDataToCandlesticks(Object.values(data));
            candleSeries.setData(candleData);
            updatePriceInfo(candleData[candleData.length - 1]);
        }
    });
}

// Process data to candlestick format
function processDataToCandlesticks(data) {
    try {
        // Modify to 1 minute interval
        const interval = 60 * 1000; // 1 minute
        
        // Filter out invalid data
        const validData = data.filter(item => 
            item && 
            item.price && 
            !isNaN(item.price) && 
            isFinite(item.price) &&
            item.time &&
            item.reserve0 &&
            item.reserve1 &&
            item.ethPrice &&
            item.priceInEth
        );

        // Sort by time
        validData.sort((a, b) => a.time - b.time);

        if (validData.length === 0) return [];

        // Process data and generate continuous candlesticks
        const result = [];
        let currentCandle = null;

        validData.forEach(item => {
            const timeGroup = Math.floor(item.time / interval) * interval;
            const currentPrice = Number(item.price);
            const currentPriceInEth = Number(item.priceInEth);

            if (!currentCandle) {
                // Create first candlestick
                currentCandle = {
                    time: timeGroup / 1000,
                    open: currentPrice,
                    high: currentPrice,
                    low: currentPrice,
                    close: currentPrice,
                    priceInEth: currentPriceInEth,
                    price: currentPrice,
                    reserve0: Number(item.reserve0),
                    reserve1: Number(item.reserve1),
                    ethPrice: Number(item.ethPrice)
                };
                result.push(currentCandle);
            } else {
                const timeDiff = timeGroup - currentCandle.time * 1000;
                
                // If time interval exceeds 1 minute, fill in the blank candlesticks and create new candlesticks
                if (timeDiff >= interval) {
                    // Calculate number of missing candlesticks
                    const missingIntervals = Math.floor(timeDiff / interval) - 1;
                    
                    // Fill in the blank candlesticks
                    for (let i = 1; i <= missingIntervals; i++) {
                        const fillTime = currentCandle.time + (i * interval / 1000);
                        result.push({
                            time: fillTime,
                            open: currentCandle.close,
                            high: currentCandle.close,
                            low: currentCandle.close,
                            close: currentCandle.close,
                            priceInEth: currentCandle.priceInEth,
                            price: currentCandle.price,
                            reserve0: currentCandle.reserve0,
                            reserve1: currentCandle.reserve1,
                            ethPrice: currentCandle.ethPrice
                        });
                    }

                    // Create new candlesticks
                    currentCandle = {
                        time: timeGroup / 1000,
                        open: currentPrice,
                        high: currentPrice,
                        low: currentPrice,
                        close: currentPrice,
                        priceInEth: currentPriceInEth,
                        price: currentPrice,
                        reserve0: Number(item.reserve0),
                        reserve1: Number(item.reserve1),
                        ethPrice: Number(item.ethPrice)
                    };
                    result.push(currentCandle);
                } else {
                    // Update current candlestick high and low and close price
                    currentCandle.high = Math.max(currentCandle.high, currentPrice);
                    currentCandle.low = Math.min(currentCandle.low, currentPrice);
                    currentCandle.close = currentPrice;
                    currentCandle.priceInEth = currentPriceInEth;
                    currentCandle.price = currentPrice;
                    currentCandle.reserve0 = Number(item.reserve0);
                    currentCandle.reserve1 = Number(item.reserve1);
                    currentCandle.ethPrice = Number(item.ethPrice);
                }
            }
        });

        return result;
    } catch (error) {
        console.error('Failed to process candlestick data:', error);
        return [];
    }
}

// Update price information display
function updatePriceInfo(lastCandle) {
    if (!lastCandle) return;
    
    const currentPriceElement = document.getElementById('current-price');
    const changeElement = document.getElementById('24h-change');
    
    try {
        currentPriceElement.textContent = `Current Price: $${lastCandle.price.toFixed(9)} (${lastCandle.priceInEth.toFixed(9)} WETH)`;
        
        // Calculate 24h change
        const change = ((lastCandle.close - lastCandle.open) / lastCandle.open * 100).toFixed(2);
        const changeColor = change >= 0 ? '#0C8E76' : '#F02F3C';
        changeElement.textContent = `24h Change: ${change}%`;
        changeElement.style.color = changeColor;
    } catch (error) {
        console.error('Failed to update price display:', error, lastCandle);
    }
}

// Window size change adjust chart size
const resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
        if (entry.target === chartContainer) {
            const newRect = entry.contentRect;
            chart.applyOptions({
                width: newRect.width,
                height: newRect.height
            });
        }
    }
});

// Start observing chart container size changes
resizeObserver.observe(chartContainer);

// Stop observing when component unmounts
window.addEventListener('unload', () => {
    resizeObserver.disconnect();
});

// Add retry function
async function retry(fn, retries = 5, delay = 2000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === retries - 1) throw error;
            console.log(`Retrying attempt ${i + 1}...`);
            // Increase delay time
            await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
        }
    }
}

// Get historical price data
async function getHistoricalPrices() {
    try {
        // Get current block
        const currentBlock = await provider.getBlockNumber();
        console.log('Current block:', currentBlock);

        // Start recording from current block
        const START_BLOCK = currentBlock;
        console.log('Starting recording data, from current block:', START_BLOCK);

        const INTERVAL_BLOCKS = 1; // Record every block
        const BATCH_SIZE = 20; // Number of data points to save per batch

        console.log('Starting to retrieve data...');
        console.log(`Will start recording from block ${START_BLOCK}`);
        
        // Initialize data point
        const initialData = await getInitialDataPoint(START_BLOCK);
        if (initialData) {
            console.log('Retrieved initial data point:', {
                ...initialData,
                price: initialData.price.toFixed(9),
                priceInEth: initialData.priceInEth.toFixed(9)
            });
            await set(ref(database, `prices/${initialData.time}`), initialData);
            console.log('Initial data point saved successfully');
        }

        return true;
    } catch (error) {
        console.error('Failed to retrieve initial data:', error);
        return false;
    }
}

// Get initial data point
async function getInitialDataPoint(blockNumber) {
    try {
        // Get block data
        const block = await retry(async () => {
            const b = await provider.getBlock(blockNumber);
            if (!b) throw new Error('Block does not exist');
            return b;
        }, 5, 2000);

        // Get price data
        const priceData = await getPrice();
        if (!priceData || !priceData.price || isNaN(priceData.price) || !isFinite(priceData.price)) {
            throw new Error('Invalid price data');
        }

        return {
            time: block.timestamp * 1000,
            price: priceData.price,
            priceInEth: priceData.priceInEth,
            reserve0: priceData.reserve0,
            reserve1: priceData.reserve1,
            blockNumber: blockNumber,
            ethPrice: priceData.ethPrice
        };
    } catch (error) {
        console.error('Failed to retrieve initial data point:', error);
        return null;
    }
}

// Initialize historical data
async function initializeHistoricalData() {
    try {
        console.log('Starting to retrieve historical data...');
        const success = await getHistoricalPrices();
        if (success) {
            console.log('Historical data initialization successful');
        } else {
            console.error('Historical data initialization failed');
        }
    } catch (error) {
        console.error('Failed to initialize historical data:', error);
    }
}

// Modify start function
async function init() {
    try {
        // Get initial token information
        await getTokenInfo();
        
        // Check historical data integrity
        const hasCompleteHistory = await checkHistoricalData();
        
        if (!hasCompleteHistory) {
            console.log('Starting to record new data...');
            // Get current block
            const currentBlock = await provider.getBlockNumber();
            console.log(`Current block: ${currentBlock}, will start recording data from this block`);
            
            // Initialize data
            await initializeHistoricalData();
            console.log('Initial data recording completed, starting real-time monitoring');
        } else {
            console.log('Data recording normal, continue monitoring new blocks');
        }
        
        // Start listening to Firebase data
        listenToFirebase();
        
        // Immediately execute one update
        await updateFirebaseData();
        
        // Update every 10 seconds
        const updateInterval = setInterval(async () => {
            try {
                await updateFirebaseData();
            } catch (error) {
                console.error('Failed to update:', error);
            }
        }, 10000); // Changed to 10 seconds

        // Error handling
        window.addEventListener('unload', () => {
            clearInterval(updateInterval);
        });
    } catch (error) {
        console.error('Initialization failed:', error);
    }
}

init(); 