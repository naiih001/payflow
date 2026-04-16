import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  @Public()
  @Get()
  getStatus() {
    return {
      service: 'payflow',
      status: 'ok',
    };
  }
}
