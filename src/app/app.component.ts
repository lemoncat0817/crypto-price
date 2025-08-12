import { Component } from '@angular/core';
import { CryptoPriceTrackerComponent } from './components/crypto-price-tracker/crypto-price-tracker.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CryptoPriceTrackerComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  title = 'crypto-price';
}