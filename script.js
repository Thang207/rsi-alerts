const axios = require("axios");
const moment = require("moment-timezone");
const express = require("express");
const fetchPairs = require("./pairs"); // Import fetchPairs from pairs.js
const app = express();

const PORT = process.env.PORT || 3000; // Sử dụng cổng được cung cấp bởi Heroku hoặc mặc định là 3000

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

const discordWebhookURL =
  "https://discord.com/api/webhooks/1131181858298802206/0U-KE9V6KNjyOPZh78hlA3cqr0_2jeLJ38qGJ94VuTPi_lP7OwWSckVIWB0nPVXQkTjy";
let pairs = [];
fetchPairs().then((updatedPairs) => {
  pairs = updatedPairs;
  const intervals = ["Min1", "Min5", "Min15", "Min30", "Min60", "Hour4"];
  const timeFrames = ["M1", "M5", "M15", "M30", "H1", "H4"];
  const candleIntervals = [
    1 * 60,
    5 * 60,
    15 * 60,
    30 * 60,
    60 * 60,
    4 * 60 * 60,
  ]; // Khoảng thời gian của từng cây nến
  const candleCount = 1500; // number of candles to take
  const timePeriods = 14;
  // RSI calculation
  function calculateRSI(prices, timePeriods) {
    const deltas = [];
    const gains = [];
    const losses = [];

    for (let i = 1; i < prices.length; i++) {
      const delta = prices[i] - prices[i - 1];
      deltas.push(delta);

      if (delta > 0) {
        gains.push(delta);
        losses.push(0);
      } else {
        gains.push(0);
        losses.push(-delta);
      }
    }
    let avgGain = 0;
    let avgLoss = 0;

    if (gains.length > 0) {
      avgGain =
        gains.slice(0, timePeriods).reduce((a, b) => a + b, 0) / timePeriods;
    }
    if (losses.length > 0) {
      avgLoss =
        losses.slice(0, timePeriods).reduce((a, b) => a + b, 0) / timePeriods;
    }
    for (let i = timePeriods; i < prices.length; i++) {
      avgGain = (avgGain * (timePeriods - 1) + gains[i - 1]) / timePeriods;
      avgLoss = (avgLoss * (timePeriods - 1) + losses[i - 1]) / timePeriods;
    }
    const rs = avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);

    return rsi;
  }
  function sendDiscordMessage(embed) {
    axios
      .post(discordWebhookURL, { embeds: [embed] })
      .then(() => {
        console.log("Tín hiệu đã được thông báo thành công !");
      })
      .catch((error) => {
        console.error("Lỗi khi gửi thông báo lên Discord:", error.message);
      });
  }
  let rsiOver70 = {};
  let rsiUnder30 = {};
  function fetchKLineData(
    pair,
    interval,
    candleCount,
    candleInterval,
    timeFrame
  ) {
    const apiUrl = `https://contract.mexc.com/api/v1/contract/kline/${pair}`;
    const currentTime = Math.floor(Date.now() / 1000);
    const startTime = currentTime - candleCount * candleInterval;
    const endTime = currentTime;
    const params = {
      interval: interval,
      start: startTime,
      end: endTime,
    };
    return axios
      .get(apiUrl, { params })
      .then((response) => {
        const data = response.data;
        if (data.code === 0) {
          const klineData = data.data;
          const closePrices = klineData.close;
          const rsi = calculateRSI(closePrices, timePeriods);
          // const rsiMessage = `RSI for ${pair}: ${rsi} ở khung ${interval}!`;
          const currentTime = moment()
            .tz("Asia/Ho_Chi_Minh")
            .format("HH:mm DD-MM-YYYY");
          const overboughtMessage = {
            title: `:green_circle: ${pair} :loudspeaker: [ RSI quá mua ${timeFrame} lúc ${currentTime} ]`,
            url: `https://futures.mexc.com/exchange/${pair}?timeframe=${timeFrame}`,
            color: 0x00ff00, // Green color
          };

          const oversoldMessage = {
            title: `:red_circle: ${pair} :loudspeaker: [ RSI quá bán ${timeFrame} lúc ${currentTime} ]`,
            url: `https://futures.mexc.com/exchange/${pair}?timeframe=${timeFrame}`,
            color: 0xff0000, // Red color
          };
          // console.log(`RSI for ${pair}: ${rsi} ở khung ${interval}!`);
          if (rsi >= 70) {
            if (!rsiOver70[pair] || !rsiOver70[pair][interval]) {
              if (!rsiOver70[pair]) rsiOver70[pair] = {};
              rsiOver70[pair][interval] = true;
              sendDiscordMessage(overboughtMessage);
            }
          } else {
            if (rsiOver70[pair] && rsiOver70[pair][interval]) {
              rsiOver70[pair][interval] = false;
            }
          }
          if (rsi <= 30) {
            if (!rsiUnder30[pair] || !rsiUnder30[pair][interval]) {
              if (!rsiUnder30[pair]) rsiUnder30[pair] = {};
              rsiUnder30[pair][interval] = true;
              sendDiscordMessage(oversoldMessage);
            }
          } else {
            if (rsiUnder30[pair] && rsiUnder30[pair][interval]) {
              rsiUnder30[pair][interval] = false;
            }
          }
        } else {
          console.log(`API query error for ${pair} - ${interval}: ${data.msg}`);
        }
      })
      .catch((error) => {
        console.log(
          `API connection error for ${pair} - ${interval}: ${error.message}`
        );
      });
  }

  function fetchKLineDataForMultiplePairsAndIntervals(
    pairIndex = 0,
    intervalIndex = 0
  ) {
    const pair = pairs[pairIndex];
    const interval = intervals[intervalIndex];
    const candleInterval = candleIntervals[intervalIndex];
    const timeFrame = timeFrames[intervalIndex];

    fetchKLineData(pair, interval, candleCount, candleInterval, timeFrame)
      .then(() => {
        // Tăng chỉ số intervalIndex lên 1
        intervalIndex++;

        if (intervalIndex >= intervals.length) {
          // Nếu đã xử lý hết tất cả các khung thời gian, tăng chỉ số pairIndex lên 1 và đặt lại intervalIndex về 0
          pairIndex++;
          if (pairIndex >= pairs.length) {
            pairIndex = 0;
            intervalIndex = 0;
          } else intervalIndex = 0;
        }

        // Đặt thời gian chờ giữa các yêu cầu (khoảng thời gian chờ giữa các cặp và khung thời gian)
        const delayBetweenRequests = 5; // Khoảng thời gian chờ giữa các yêu cầu là 2 giây (2000ms)
        setTimeout(() => {
          fetchKLineDataForMultiplePairsAndIntervals(pairIndex, intervalIndex);
        }, delayBetweenRequests);
      })
      .catch((error) => {
        console.log(`Error: ${error}`);
      });
  }
  fetchKLineDataForMultiplePairsAndIntervals();

  setInterval(() => {
    fetchPairs().then((updatedPairs) => {
      pairs = updatedPairs;
      console.log("Pairs updated successfully!");
    });
  }, 6 * 60 * 60 * 1000); // 6 hours in milliseconds
});
