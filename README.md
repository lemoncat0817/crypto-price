# Crypto Price Tracker

一個使用 Angular 18 開發的即時加密貨幣價格追蹤應用程式，整合了 Binance WebSocket API 來提供實時價格更新，並使用 ECharts 繪製 K 線圖。

## 功能特點

- 即時價格追蹤：使用 Binance WebSocket API 獲取即時交易數據
- K 線圖顯示：支援 1 小時、24 小時和 7 天 的價格走勢圖表
- 收藏功能：可將常用交易對加入收藏列表
- 搜尋功能：快速篩選和查找特定交易對
- 響應式設計：使用 TailwindCSS 實現良好的跨裝置體驗
- Material Design：整合 Angular Material 組件庫提供現代化的 UI 介面

## 技術棧

- **前端框架**: Angular 18
- **UI 組件**: Angular Material
- **樣式框架**: TailwindCSS
- **圖表庫**: ECharts
- **WebSocket**: rxjs/webSocket
- **API**: Binance API

## 開始使用

### 環境需求

- Node.js (建議使用最新的 LTS 版本)
- npm 或 yarn

### 安裝步驟

1. 克隆專案

```bash
git clone https://github.com/lemoncat0817/crypto-price.git
cd crypto-price
```

2. 安裝依賴

```bash
npm install
```

3. 啟動開發伺服器

```bash
npm start
```

應用程式將會在 `http://localhost:4200` 運行。

## 專案結構

```
src/
  ├── app/
  │   ├── components/
  │   │   ├── chart/               # K線圖元件
  │   │   └── crypto-price-tracker/ # 主要追蹤元件
  │   ├── services/
  │   │   └── binance.service.ts   # Binance API 服務
  │   └── app.component.ts         # 根元件
  ├── assets/                      # 靜態資源
  └── styles.scss                  # 全域樣式
```

## 主要功能說明

### 即時價格追蹤

- 透過 WebSocket 連接獲取實時價格更新
- 支援多個交易對同時追蹤
- 顯示價格變化百分比

### K 線圖功能

- 支援多個時間週期（1h、24h、7d）
- 互動式縮放功能
- 自定義圖表樣式

### 收藏列表

- 本地儲存收藏的交易對
- 即時更新收藏項目的價格
- 快速添加/移除收藏

## 待優化項目

- [ ] 添加更多時間週期選項
- [ ] 實現更多技術指標
- [ ] 優化移動端顯示
- [ ] 添加價格提醒功能
- [ ] 支援更多交易所的數據

## 貢獻指南

歡迎提交 Pull Request 或創建 Issue 來幫助改進這個專案。

## 授權

MIT License
