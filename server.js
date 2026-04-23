const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = 3000;

function formatNumber(value, decimals = 2) {
  const num = Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(num)) return value;
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed request ${response.status} for ${url}`);
  }

  return await response.text();
}

function extractKSE100Closing(html) {
  const patterns = [
    /Indices Statistics[\s\S]*?KSE100\s+([0-9,]+\.\d{1,2})\s+[0-9,]+\.\d{1,2}\s+[0-9,]+\.\d{1,2}/i,
    /KSE100[\s\S]{0,400}?([0-9,]+\.\d{1,2})/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return formatNumber(match[1], 2);
    }
  }

  throw new Error('Could not extract KSE100 closing');
}

function extractSymbolClose(html, symbol) {
  const safeSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`\\b${safeSymbol}\\b[\\s\\S]{0,1400}?Rs\\.\\s*([0-9,]+\\.\\d{1,2})`, 'i'),
    /Rs\.\s*([0-9,]+\.\d{1,2})/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return formatNumber(match[1], 2);
    }
  }

  throw new Error(`Could not extract close for ${symbol}`);
}

async function fetchKSE100Close() {
  const html = await fetchHtml('https://dps.psx.com.pk/trading-panel');
  return extractKSE100Closing(html);
}

async function fetchSymbolClose(symbol) {
  const html = await fetchHtml(`https://dps.psx.com.pk/company/${encodeURIComponent(symbol)}`);
  return extractSymbolClose(html, symbol);
}

app.get('/api/psx/kse100', async (req, res) => {
  try {
    const close = await fetchKSE100Close();
    res.json({ close });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/psx/prices', async (req, res) => {
  try {
    const symbolsParam = String(req.query.symbols || '');
    const symbols = symbolsParam
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);

    const kse100Close = await fetchKSE100Close();

    const results = {};
    const failed = [];

    for (const symbol of symbols) {
      try {
        results[symbol] = await fetchSymbolClose(symbol);
      } catch (error) {
        failed.push(symbol);
      }
    }

    res.json({
      kse100Close,
      symbols: results,
      failed,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`PSX proxy server running on http://localhost:${PORT}`);
});