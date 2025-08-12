import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { EChartsOption } from 'echarts';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { BinanceService, TradeData } from '../../services/binance.service';
import { ChartComponent } from '../chart/chart.component';

interface Favorite {
  symbol: string;
  price: string;
  change: number;
}

@Component({
  selector: 'app-crypto-price-tracker',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonToggleModule,
    MatIconModule,
    MatListModule,
    MatInputModule,
    MatButtonModule,
    ChartComponent,
  ],
  templateUrl: './crypto-price-tracker.component.html',
  styleUrls: ['./crypto-price-tracker.component.scss'],
})
export class CryptoPriceTrackerComponent implements OnInit, OnDestroy {
  // --- Properties ---
  public availablePairs: string[] = [];
  public filteredAvailablePairs: string[] = [];
  public coinSearchTerm: string = '';

  public selectedPair = 'BTCUSDT';
  public selectedInterval = '1h';
  public intervals = ['1h', '24h', '7d'];
  public intervalMap: { [key: string]: string } = { '24h': '1d', '7d': '1w' };

  public currentPrice: string | null = null;
  public currentVolume: string | null = null;
  public priceChangePercent: number = 0;
  private lastPrice: number | null = null;

  public chartOptions: EChartsOption | null = null;
  public favorites: Favorite[] = [];

  private destroy$ = new Subject<void>();
  private readonly FAVORITES_STORAGE_KEY = 'crypto-favorites';

  // --- Lifecycle Hooks ---
  constructor(
    private binanceService: BinanceService,
    private cdr: ChangeDetectorRef,
    private zone: NgZone
  ) {}

  ngOnInit(): void {
    this.loadFavorites();
    // Subscribing to exchangeInfo$ to populate availablePairs
    this.binanceService.exchangeInfo$.pipe(takeUntil(this.destroy$)).subscribe(symbols => {
      this.availablePairs = symbols.map(s => s.symbol);
      this.filterCoins(); // Initialize filtered list
      if (this.availablePairs.length > 0 && !this.availablePairs.includes(this.selectedPair)) {
        this.selectedPair = this.availablePairs[0]; // Set default if current is not available
      }
      this.selectPair(this.selectedPair); // This will trigger initial subscription
    });
    this.subscribeToTrades();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    // No explicit disconnect needed for multi-stream, service handles it
  }

  // --- Public Methods ---
  public selectPair(pair: string): void {
    this.selectedPair = pair;
    this.currentPrice = null; // Reset price on change
    this.lastPrice = null;
    this.priceChangePercent = 0;
    this.updateWebSocketSubscriptions(); // Update subscriptions for selected pair and favorites
    this.fetchKlines();
  }

  public selectInterval(interval: string): void {
    this.selectedInterval = interval;
    this.fetchKlines();
  }

  public filterCoins(): void {
    if (!this.coinSearchTerm) {
      this.filteredAvailablePairs = [...this.availablePairs];
    } else {
      this.filteredAvailablePairs = this.availablePairs.filter(pair =>
        pair.toLowerCase().includes(this.coinSearchTerm.toLowerCase())
      );
    }
  }

  public addFavorite(): void {
    const symbolToAdd = this.selectedPair;
    if (!this.favorites.some(fav => fav.symbol === symbolToAdd)) {
      this.favorites.push({
        symbol: symbolToAdd,
        price: this.currentPrice || '0', // Use current price or default to '0'
        change: this.priceChangePercent,
      });
      this.saveFavorites();
      this.updateWebSocketSubscriptions(); // Update subscriptions after adding favorite
    }
  }

  public removeFavorite(symbolToRemove: string): void {
    this.favorites = this.favorites.filter(fav => fav.symbol !== symbolToRemove);
    this.saveFavorites();
    this.updateWebSocketSubscriptions(); // Update subscriptions after removing favorite
  }

  private saveFavorites(): void {
    localStorage.setItem(this.FAVORITES_STORAGE_KEY, JSON.stringify(this.favorites));
  }

  private loadFavorites(): void {
    const storedFavorites = localStorage.getItem(this.FAVORITES_STORAGE_KEY);
    if (storedFavorites) {
      this.favorites = JSON.parse(storedFavorites);
    } else {
      // Default favorites if nothing is in storage
      this.favorites = [
        { symbol: 'BTCUSDT', price: '0', change: 0 },
        { symbol: 'ETHUSDT', price: '0', change: 0 },
      ];
    }
  }

  private updateWebSocketSubscriptions(): void {
    const symbolsToSubscribe = new Set<string>();
    symbolsToSubscribe.add(this.selectedPair.toLowerCase()); // Always subscribe to the selected pair

    this.favorites.forEach(fav => symbolsToSubscribe.add(fav.symbol.toLowerCase())); // Also subscribe to all favorites

    this.binanceService.subscribeToTradeStream(Array.from(symbolsToSubscribe));
  }

  // --- Private Methods ---
  private subscribeToTrades(): void {
    this.binanceService.tradeData$
      .pipe(takeUntil(this.destroy$))
      .subscribe((trade: TradeData) => {
        this.zone.run(() => {
          // Update current price for the selected pair
          if (trade.s.toUpperCase() === this.selectedPair.toUpperCase()) {
            const price = parseFloat(trade.p);
            this.currentPrice = trade.p;
            this.currentVolume = trade.q;

            if (this.lastPrice !== null) {
              this.priceChangePercent =
                ((price - this.lastPrice) / this.lastPrice) * 100;
            }
            this.lastPrice = price;
          }

          // Update favorite list using an immutable approach
          const favIndex = this.favorites.findIndex(
            (f) => f.symbol.toUpperCase() === trade.s.toUpperCase()
          );

          if (favIndex > -1) {
            const fav = this.favorites[favIndex];
            const oldPrice = parseFloat(fav.price);
            let newChange = fav.change;
            if (oldPrice !== 0) {
              newChange =
                ((parseFloat(trade.p) - oldPrice) / oldPrice) * 100;
            }

            // Create a new favorite object and a new array to trigger change detection
            const newFav = { ...fav, price: trade.p, change: newChange };
            this.favorites = [
              ...this.favorites.slice(0, favIndex),
              newFav,
              ...this.favorites.slice(favIndex + 1),
            ];
          }
        });
      });
  }

  private fetchKlines(): void {
    const apiInterval =
      this.intervalMap[this.selectedInterval] || this.selectedInterval;
    this.binanceService
      .getKlines(this.selectedPair, apiInterval, 100)
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.updateChart(data);
        this.cdr.detectChanges(); // Trigger change detection
      });
  }

  private updateChart(data: any[]): void {
    if (!data || data.length === 0) {
      this.chartOptions = null;
      return;
    }

    const klineData = data.map((item) => ({
      timestamp: item.openTime,
      open: parseFloat(item.open),
      high: parseFloat(item.high),
      low: parseFloat(item.low),
      close: parseFloat(item.close),
    }));

    const dates = klineData.map((item) =>
      this.selectedInterval === '1h'
        ? new Date(item.timestamp).toLocaleString()
        : new Date(item.timestamp).toLocaleDateString()
    );
    const values = klineData.map((item) => [
      item.open,
      item.close,
      item.low,
      item.high,
    ]);

    this.chartOptions = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
      },
      xAxis: {
        type: 'category',
        data: dates,
      },
      yAxis: {
        scale: true,
        splitArea: { show: true },
      },
      dataZoom: [
        { type: 'inside', start: 50, end: 100 },
        { show: true, type: 'slider', bottom: 10, start: 50, end: 100 },
      ],
      series: [
        {
          name: this.selectedPair,
          type: 'candlestick',
          itemStyle: {
            color: '#03a66d',
            color0: '#cf304a',
            borderColor: '#03a66d',
            borderColor0: '#cf304a',
          },
          data: values,
        },
      ],
    };
  }
}
