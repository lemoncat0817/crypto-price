import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import {
  Observable,
  BehaviorSubject,
  timer,
  retry,
  catchError,
  map,
  tap,
  shareReplay,
  Subject,
  filter,
  takeUntil,
  distinctUntilChanged,
  forkJoin,
} from 'rxjs';

export interface TradeData {
  e: string; // Event type
  E: number; // Event time
  s: string; // Symbol
  t: number; // Trade ID
  p: string; // Price
  q: string; // Quantity
  b: number; // Buyer order ID
  a: number; // Seller order ID
  T: number; // Trade time
  m: boolean; // Is the buyer the market maker?
  M: boolean; // Ignore
}

export interface KLineData {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
  quoteAssetVolume: string;
  numberOfTrades: number;
  takerBuyBaseAssetVolume: string;
  takerBuyQuoteAssetVolume: string;
  ignore: string;
}

export interface ExchangeInfo {
  timezone: string;
  serverTime: number;
  rateLimits: any[];
  exchangeFilters: any[];
  symbols: ExchangeSymbol[];
}

export interface ExchangeSymbol {
  symbol: string;
  status: string;
  baseAsset: string;
  baseAssetPrecision: number;
  quoteAsset: string;
  quotePrecision: number;
  quoteAssetPrecision: number;
  baseCommissionPrecision: number;
  quoteCommissionPrecision: number;
  orderTypes: string[];
  icebergAllowed: boolean;
  ocoAllowed: boolean;
  quoteOrderQtyMarketAllowed: boolean;
  isSpotTradingAllowed: boolean;
  isMarginTradingAllowed: boolean;
  filters: any[];
  permissions: string[];
  defaultSelfTradePreventionMode: string;
  allowedSelfTradePreventionModes: string[];
}

@Injectable({
  providedIn: 'root',
})
export class BinanceService {
  private readonly WS_BASE_URL = 'wss://stream.binance.com:9443/ws';
  private readonly REST_BASE_URL = 'https://api.binance.com/api/v3';

  private _websocketSubject: WebSocketSubject<any> | null = null;
  private _tradeDataStream = new Subject<TradeData>(); // Subject to emit all incoming trade data
  public tradeData$: Observable<TradeData> =
    this._tradeDataStream.asObservable();

  private _exchangeInfoSubject = new BehaviorSubject<ExchangeSymbol[]>([]);
  public exchangeInfo$: Observable<ExchangeSymbol[]> =
    this._exchangeInfoSubject.asObservable();

  private _subscribedSymbols = new Set<string>(); // Keep track of currently subscribed symbols
  private _destroy$ = new Subject<void>(); // For managing subscriptions within the service

  constructor(private http: HttpClient) {
    this.getExchangeInfo().subscribe(); // Fetch exchange info on service init
    this._connect(); // Establish initial WebSocket connection
  }

  private _connect(): void {
    if (this._websocketSubject && !this._websocketSubject.closed) {
      return; // Already connected
    }

    const url = `${this.WS_BASE_URL}`;
    this._websocketSubject = webSocket<any>({
      url,
      openObserver: {
        next: () => {
          console.log(
            'WebSocket connection established. URL:',
            url,
            '. Resubscribing to symbols...'
          );
          if (this._subscribedSymbols.size > 0) {
            this._sendSubscriptionMessage(
              'SUBSCRIBE',
              Array.from(this._subscribedSymbols)
            );
          }
        },
      },
      closeObserver: {
        next: () => {
          console.log(
            'WebSocket connection closed. Attempting to reconnect...'
          );
          this._websocketSubject = null;
          // Use a timer for reconnection to avoid rapid-fire attempts
          timer(3000).subscribe(() => this._connect());
        },
      },
    });

    this._websocketSubject
      .pipe(
        retry({
          delay: (error, retryCount) => {
            console.error(
              `WebSocket error: ${error}. Retrying in ${
                Math.min(retryCount, 5) * 1000
              }ms...`
            );
            return timer(Math.min(retryCount, 5) * 1000);
          },
        }),
        tap({
          error: (err) => console.error('WebSocket stream error:', err),
          complete: () => console.log('WebSocket stream completed'),
        }),
        takeUntil(this._destroy$)
      )
      .subscribe({
        next: (message) => {
          if (message && message.e === 'trade') {
            this._tradeDataStream.next(message as TradeData);
          } else if (message && message.result !== undefined) {
            console.log('WebSocket subscription result:', message);
          }
        },
        error: (err) => console.error('WebSocket connection error:', err),
      });

    console.log('Attempting to connect to WebSocket.');
  }

  private _sendSubscriptionMessage(
    method: 'SUBSCRIBE' | 'UNSUBSCRIBE',
    symbols: string[]
  ): void {
    if (!this._websocketSubject || this._websocketSubject.closed) {
      console.warn(
        'WebSocket not connected or closed. Cannot send subscription message.'
      );
      return;
    }

    const streams = symbols.map((s) => `${s.toLowerCase()}@trade`);
    const message = {
      method: method,
      params: streams,
      id: Date.now(), // Use a unique ID for each request
    };
    this._websocketSubject.next(message);
    console.log(`${method} message sent for:`, symbols);
  }

  /**
   * Subscribes to trade streams for a given list of symbols.
   * Manages adding/removing subscriptions to the single WebSocket connection.
   * @param symbols The list of trading pairs (e.g., ['btcusdt', 'ethusdt']).
   */
  public subscribeToTradeStream(symbols: string[]): void {
    const newSymbols = new Set(symbols.map((s) => s.toLowerCase()));
    const symbolsToSubscribe = Array.from(newSymbols).filter(
      (s) => !this._subscribedSymbols.has(s)
    );
    const symbolsToUnsubscribe = Array.from(this._subscribedSymbols).filter(
      (s) => !newSymbols.has(s)
    );

    if (symbolsToUnsubscribe.length > 0) {
      this._sendSubscriptionMessage('UNSUBSCRIBE', symbolsToUnsubscribe);
      symbolsToUnsubscribe.forEach((s) => this._subscribedSymbols.delete(s));
    }

    if (symbolsToSubscribe.length > 0) {
      this._sendSubscriptionMessage('SUBSCRIBE', symbolsToSubscribe);
      symbolsToSubscribe.forEach((s) => this._subscribedSymbols.add(s));
    }
  }

  /**
   * Fetches historical K-line data for a given symbol and interval.
   * @param symbol The trading pair (e.g., 'btcusdt').
   * @param interval The time interval (e.g., '1m', '1h', '1d').
   * @param limit Maximum number of data points (default: 500, max: 1000).
   * @param startTime Optional: Start time in milliseconds.
   * @param endTime Optional: End time in milliseconds.
   * @returns An Observable of KLineData array.
   */
  public getKlines(
    symbol: string,
    interval: string,
    limit: number = 500,
    startTime?: number,
    endTime?: number
  ): Observable<KLineData[]> {
    let params: any = {
      symbol: symbol.toUpperCase(),
      interval: interval,
      limit: limit,
    };
    if (startTime) {
      params.startTime = startTime;
    }
    if (endTime) {
      params.endTime = endTime;
    }

    return this.http
      .get<any[]>(`${this.REST_BASE_URL}/klines`, { params })
      .pipe(
        retry(3), // Retry up to 3 times on failure
        catchError((error) => {
          console.error('Error fetching klines:', error);
          throw error; // Re-throw to propagate the error
        }),
        map((data) =>
          data.map((item) => ({
            openTime: item[0],
            open: item[1],
            high: item[2],
            low: item[3],
            close: item[4],
            volume: item[5],
            closeTime: item[6],
            quoteAssetVolume: item[7],
            numberOfTrades: item[8],
            takerBuyBaseAssetVolume: item[9],
            takerBuyQuoteAssetVolume: item[10],
            ignore: item[11],
          }))
        ),
        shareReplay(1) // Cache the last result
      );
  }

  /**
   * Fetches historical price data for common time intervals (1h, 24h, 7d).
   * @param symbol The trading pair.
   * @returns An Observable of an object containing price data for different intervals.
   */
  public getHistoricalPrices(symbol: string): Observable<{
    '1h': KLineData[];
    '24h': KLineData[];
    '7d': KLineData[];
  }> {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    const oneHourData$ = this.getKlines(symbol, '1m', 60, oneHourAgo, now);
    const twentyFourHourData$ = this.getKlines(
      symbol,
      '1h',
      24,
      twentyFourHoursAgo,
      now
    );
    const sevenDayData$ = this.getKlines(symbol, '1d', 7, sevenDaysAgo, now);

    return forkJoin({
      '1h': oneHourData$,
      '24h': twentyFourHourData$,
      '7d': sevenDayData$,
    }).pipe(
      catchError((error) => {
        console.error('Error fetching historical prices:', error);
        throw error;
      }),
      shareReplay(1)
    );
  }

  /**
   * Fetches the list of all exchange symbols (trading pairs).
   * @returns An Observable of ExchangeSymbol array.
   */
  public getExchangeInfo(): Observable<ExchangeSymbol[]> {
    return this.http
      .get<ExchangeInfo>(`${this.REST_BASE_URL}/exchangeInfo`)
      .pipe(
        retry(3),
        catchError((error) => {
          console.error('Error fetching exchange info:', error);
          throw error;
        }),
        map((info) => info.symbols.filter((s) => s.status === 'TRADING')), // Filter for tradable symbols
        tap((symbols) => this._exchangeInfoSubject.next(symbols)),
        shareReplay(1) // Cache the result
      );
  }
}
