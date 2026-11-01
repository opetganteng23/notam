import { Controller, Get, Query } from '@nestjs/common';
import { getModel } from './suggest';

// Saran lanjutan narasi saat mengetik (semua role yang login).
@Controller('suggest')
export class SuggestController {
  @Get()
  get(@Query('text') text = '') {
    return { suggestions: getModel().suggest(String(text).slice(-300)) };
  }
}
