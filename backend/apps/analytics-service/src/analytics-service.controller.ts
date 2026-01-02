import { Controller, Get } from '@nestjs/common';
import { AnalyticsServiceService } from './analytics-service.service';

@Controller()
export class AnalyticsServiceController {
  constructor(private readonly analyticsServiceService: AnalyticsServiceService) {}

  @Get('/health')
  health() {
    return { status: 'ok', service: 'analytics-service' };
  }

  @Get('/analytics')
  getAnalytics() {
    return this.analyticsServiceService.getAnalytics();
  }
}
