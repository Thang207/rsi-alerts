const axios = require("axios");
const pairs = []
function fetchPairs() {
  const apiUrl = "https://contract.mexc.com/api/v1/contract/ticker";
  return axios
    .get(apiUrl)
    .then((response) => {
      const data = response.data;
      if (data.success && data.code === 0) {
        const contracts = data.data;
        if (contracts.length > 0) {
          contracts.forEach((contract) => {
            if (contract.amount24 > 10000000)
              pairs.push(contract.symbol)
          });
          return pairs
        } else {
          console.log("No valid contracts found in the response.");
        }
      } else {
        console.log("API query error.");
      }
    })
    .catch((error) => {
      console.log("API connection error:", error.message);
    });
}

fetchPairs();
module.exports = fetchPairs;