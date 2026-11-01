import { Controller, Get, Query } from '@nestjs/common';
import { getModel } from './suggest';
import { detectAirports } from '../master/airports';

// Saran lanjutan narasi saat mengetik (semua role yang login).
@Controller('suggest')
export class SuggestController {
  @Get()
  get(@Query('text') text = '') {
    return { suggestions: getModel().suggest(String(text).slice(-300)) };
  }

  // Bandara yang terdeteksi dari narasi, untuk ditampilkan ke pengguna sebelum mengajukan.
  @Get('airport')
  airport(@Query('text') text = '') {
    return { airports: detectAirports(String(text).slice(0, 2000)).map((a) => ({ locId: a.locId, name: a.name, city: a.city })) };
  }
}
